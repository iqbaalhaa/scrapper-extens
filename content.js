/**
 * content.js — berjalan di https://www.google.com/maps/*
 *
 * Alur: halaman dimuat ulang setiap ganti kata kunci, jadi script ini memproses
 * SATU kata kunci (scroll → ambil data → simpan), lalu mengirim "keywordDone"
 * ke background yang akan membuka URL kata kunci berikutnya.
 * Selector & pola teks ada di selectors.js (dimuat sebelum file ini).
 */
const LOG = '[MapsScraper]';
let stopRequested = false;

class StopError extends Error {}

// ---------- Utilitas ----------

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function checkStop() {
  if (stopRequested) throw new StopError('Dihentikan oleh pengguna');
}

async function sleep(ms) {
  checkStop();
  await delay(ms);
  checkStop();
}

// Jeda acak 1,5–4 detik antar aksi agar tidak terlalu agresif
const randomPause = () => sleep(1500 + Math.random() * 2500);

// Tunggu sampai fn() mengembalikan nilai truthy, atau null jika timeout
async function waitFor(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

// Coba selector satu per satu dari SELECTORS[key]
function q(root, key) {
  return qa(root, key)[0] || null;
}

function qa(root, key) {
  if (!root) return [];
  for (const sel of SELECTORS[key]) {
    try {
      const found = root.querySelectorAll(sel);
      if (found.length) return [...found];
    } catch (e) {
      console.warn(LOG, `Selector tidak valid (${key}):`, sel, e);
    }
  }
  return [];
}

const clean = (s) => (s || '').replace(PATTERNS.junk, '').replace(/\s+/g, ' ').trim();
const stripLabel = (s) => clean(s).replace(PATTERNS.labelPrefix, '');

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------- Parser ----------

function placeIdFrom(url) {
  const m = (url || '').match(PATTERNS.placeId);
  return m ? m[1].replace(/%3A/i, ':').toLowerCase() : '';
}

// "4,5 bintang 1.234 Ulasan" -> { rating: 4.5, ulasan: 1234 }
function parseRatingLabel(label) {
  const nums = (label || '').match(/\d+(?:[.,]\d+)*/g) || [];
  return {
    rating: nums[0] ? parseFloat(nums[0].replace(',', '.')) : '',
    ulasan: nums[1] ? parseInt(nums[1].replace(/\D/g, ''), 10) : '',
  };
}

// Field dari kartu di daftar hasil (mode cepat, best effort)
const CARD_FIELDS = {
  nama: (a, card) => clean(a.getAttribute('aria-label')) || clean(card?.innerText.split('\n')[0]),
  kategori: (a, card) => cardInfo(a, card)[0] || '',
  rating: (a, card) => parseRatingLabel(q(card, 'cardRating')?.getAttribute('aria-label')).rating,
  ulasan: (a, card) => parseRatingLabel(q(card, 'cardRating')?.getAttribute('aria-label')).ulasan,
  alamat: (a, card) => {
    const info = cardInfo(a, card);
    return info.length > 1 ? info[info.length - 1] : '';
  },
  telepon: (a, card) => ((card?.innerText || '').match(PATTERNS.phone) || [''])[0].trim(),
};

// Baris kartu pertama yang dipisah "·": [kategori, ..., alamat]
function cardInfo(a, card) {
  const name = clean(a.getAttribute('aria-label'));
  const line = (card?.innerText || '')
    .split('\n')
    .map(clean)
    .find((l) => l && l !== name && l.includes('·') && !/^\d[.,]\d/.test(l));
  return line ? line.split('·').map(clean).filter(Boolean) : [];
}

// Field dari panel detail (mode "Ambil detail lengkap")
const DETAIL_FIELDS = {
  nama: (p) => clean(q(p, 'detailName')?.textContent) || clean(p.getAttribute('aria-label')),
  kategori: (p) => clean(q(p, 'category')?.textContent),
  rating: (p) => parseRatingLabel(q(p, 'rating')?.getAttribute('aria-label')).rating,
  ulasan: (p) => {
    // Angka terakhir: "18 ulasan" maupun "4,3 bintang 18 Ulasan" -> 18
    const nums = qa(p, 'reviews').map((e) => e.getAttribute('aria-label').match(/\d+(?:[.,]\d+)*/g)).find(Boolean);
    return nums ? parseInt(nums[nums.length - 1].replace(/\D/g, ''), 10) : '';
  },
  alamat: (p) => stripLabel(q(p, 'address')?.getAttribute('aria-label')),
  telepon: (p) => {
    const btn = q(p, 'phone');
    return stripLabel(btn?.getAttribute('aria-label')) || (btn?.dataset.itemId || '').replace('phone:tel:', '');
  },
  website: (p) => {
    const href = q(p, 'website')?.href || '';
    return /^https?:\/\//i.test(href) ? href : '';
  },
};

// Jalankan tiap field terpisah: jika satu gagal, isi kosong dan lanjut
function extract(fields, ...args) {
  const out = {};
  for (const [key, fn] of Object.entries(fields)) {
    try {
      out[key] = fn(...args) ?? '';
    } catch (e) {
      out[key] = '';
      console.warn(LOG, `Gagal mengambil field "${key}":`, e);
    }
  }
  return out;
}

const filled = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));

function buildRecord({ link, keyword, a, card, panel }) {
  return {
    id: placeIdFrom(link),
    nama: '', kategori: '', rating: '', ulasan: '', alamat: '', telepon: '', website: '',
    ...(a ? extract(CARD_FIELDS, a, card) : {}),
    ...(panel ? filled(extract(DETAIL_FIELDS, panel)) : {}),
    link, // tidak diekspor, dipakai untuk deduplikasi
    kataKunci: keyword,
    detail: !!panel,
  };
}

// ---------- Penyimpanan & deduplikasi ----------

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Sama jika ID tempat / link sama, atau nama + alamat sama
function samePlace(a, b) {
  if (a.id && b.id) return a.id === b.id;
  if (a.link && a.link === b.link) return true;
  return !!(a.alamat && b.alamat && norm(a.nama) === norm(b.nama) && norm(a.alamat) === norm(b.alamat));
}

// Simpan langsung tiap data agar tombol Berhenti tidak menghilangkan apa pun
async function saveRecord(rec) {
  const { places = [] } = await chrome.storage.local.get('places');
  const dup = places.find((p) => samePlace(p, rec));
  if (!dup) {
    places.push(rec);
  } else {
    // Data detail menimpa data kartu; selain itu hanya isi field yang masih kosong
    const upgrade = rec.detail && !dup.detail;
    for (const [k, v] of Object.entries(rec)) {
      if (k !== 'kataKunci' && v !== '' && (upgrade || dup[k] === '' || dup[k] == null)) dup[k] = v;
    }
    console.log(LOG, 'Duplikat digabung:', rec.nama);
  }
  await chrome.storage.local.set({ places });
}

async function setProgress(status, kwDone = 0, kwTotal = 0) {
  if (stopRequested) return;
  console.log(LOG, status);
  await chrome.storage.local.set({ progress: { status, kwDone, kwTotal } });
}

// ---------- Alur scraping ----------

const listingLinks = (feed) => [...new Map(qa(feed, 'listingLink').map((a) => [a.href, a])).values()];
const closestCard = (a) => SELECTORS.listingCard.map((s) => a.closest(s)).find(Boolean) || a.parentElement;
const anyPanel = () => qa(document, 'detailPanel').find((p) => q(p, 'detailName'));

function findPanel(name) {
  return (
    qa(document, 'detailPanel').find((p) => clean(p.getAttribute('aria-label')) === name) ||
    qa(document, 'detailName').find((h) => clean(h.textContent) === name)?.closest('[role="main"]') ||
    null
  );
}

async function scrollFeed(feed, max) {
  let last = -1;
  let stall = 0;
  while (true) {
    const n = listingLinks(feed).length;
    await setProgress(`Menggulir daftar: ${n} listing ditemukan`);
    if (n >= max) break;
    if (PATTERNS.endOfList.test(feed.innerText)) {
      console.log(LOG, 'Akhir daftar tercapai');
      break;
    }
    stall = n === last ? stall + 1 : 0;
    if (stall >= 5) {
      console.warn(LOG, 'Daftar tidak bertambah setelah beberapa kali scroll, lanjut ke pengambilan data');
      break;
    }
    last = n;
    feed.lastElementChild?.scrollIntoView({ block: 'end' });
    feed.scrollTop = feed.scrollHeight;
    await randomPause();
  }
}

async function scrapeKeyword(job) {
  const keyword = job.keywords[job.index];
  console.log(LOG, `Kata kunci ${job.index + 1}/${job.keywords.length}: "${keyword}"`);
  await setProgress(`Memuat hasil "${keyword}"...`);

  const feed = await waitFor(() => q(document, 'feed') || (location.pathname.includes('/place/') && anyPanel()), 20000);
  if (!feed) {
    console.warn(LOG, `Tidak ada hasil untuk "${keyword}" (feed tidak ditemukan)`);
    return;
  }
  // Google langsung membuka satu tempat jika hasilnya hanya satu
  if (!feed.matches(SELECTORS.feed.join(','))) {
    await saveRecord(buildRecord({ link: location.href, keyword, panel: feed }));
    await setProgress(`1 tempat langsung terbuka untuk "${keyword}"`, 1, 1);
    return;
  }

  await scrollFeed(feed, job.max);

  // Lewati tempat yang sudah ada (Kerinci & Sungai Penuh sering tumpang tindih)
  const { places = [] } = await chrome.storage.local.get('places');
  const known = new Map(places.filter((p) => p.id).map((p) => [p.id, p.detail]));
  const hrefs = listingLinks(feed).slice(0, job.max).map((a) => a.href);
  let detail = job.detail;
  let lastName = '';
  let failStreak = 0;

  for (let i = 0; i < hrefs.length; i++) {
    checkStop();
    const link = hrefs[i];
    const a = listingLinks(feed).find((x) => x.href === link);
    if (!a) continue;
    const id = placeIdFrom(link);
    if (known.has(id) && (known.get(id) || !detail)) continue;

    const card = closestCard(a);
    let panel = null;
    if (detail) {
      const name = clean(a.getAttribute('aria-label'));
      await setProgress(`Detail ${i + 1}/${hrefs.length}: ${name}`, i, hrefs.length);
      try {
        // Klik pertama kadang tidak tercatat Maps; klik ulang hanya jika URL belum pindah ke tempat ini
        // (klik ulang saat panel sedang dimuat justru mengulang proses muatnya)
        for (const timeout of [8000, 12000, 20000]) {
          if (!id || !safeDecode(location.href).includes(id)) a.click();
          // Nama sama dengan tempat sebelumnya (cabang)? Pastikan URL sudah pindah ke ID tempat ini
          panel = await waitFor(() => {
            const p = findPanel(name);
            if (p && name === lastName && id && !safeDecode(location.href).includes(id)) return null;
            return p;
          }, timeout);
          if (panel) break;
        }
        if (panel) {
          await waitFor(() => q(panel, 'address') || q(panel, 'phone') || q(panel, 'website'), 3000);
          lastName = name;
          failStreak = 0;
        } else {
          console.warn(LOG, `Panel detail tidak muncul untuk "${name}", pakai data kartu saja`);
          if (++failStreak >= 5) {
            detail = false;
            console.error(LOG, 'Panel detail gagal 5x berturut-turut — selector detailPanel/detailName di selectors.js mungkin perlu diperbarui. Lanjut tanpa detail.');
          }
        }
      } catch (e) {
        if (e instanceof StopError) throw e;
        console.warn(LOG, `Gagal membuka detail "${name}":`, e);
      }
    }

    await saveRecord(buildRecord({ link, keyword, a, card, panel }));
    await setProgress(`Diproses ${i + 1}/${hrefs.length} untuk "${keyword}"`, i + 1, hrefs.length);
    if (detail) await randomPause();
  }
}

async function main() {
  let job;
  try {
    job = await chrome.runtime.sendMessage({ type: 'getJob' });
  } catch (e) {
    console.warn(LOG, 'Background tidak merespons:', e);
    return;
  }
  if (!job) return; // tab ini bukan tab tugas scraping

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.job && !changes.job.newValue?.running) stopRequested = true;
  });

  try {
    await scrapeKeyword(job);
    await randomPause();
  } catch (e) {
    if (e instanceof StopError) {
      console.log(LOG, 'Proses dihentikan. Data yang sudah terkumpul tetap tersimpan.');
      return;
    }
    console.error(LOG, `Error pada kata kunci "${job.keywords[job.index]}", lanjut ke kata kunci berikutnya:`, e);
  }
  chrome.runtime.sendMessage({ type: 'keywordDone' }).catch((e) => console.error(LOG, 'Gagal lapor ke background:', e));
}

// Hanya jalan di dalam extension (file ini juga dimuat oleh tes di Node)
if (globalThis.chrome?.runtime?.id) main();
