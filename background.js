/**
 * background.js — service worker.
 * Mengatur antrean kata kunci: membuka URL pencarian di tab Google Maps,
 * lalu pindah ke kata kunci berikutnya saat content script melapor selesai.
 * Semua state disimpan di chrome.storage.local, karena service worker
 * bisa dimatikan Chrome kapan saja saat idle.
 */
const LOG = '[MapsScraper:bg]';
const MAPS_MATCH = 'https://www.google.com/maps/*';
// hl=id memaksa tampilan Bahasa Indonesia agar pola teks di selectors.js konsisten
const searchUrl = (kw) => `https://www.google.com/maps/search/${encodeURIComponent(kw)}?hl=id`;

const getJob = async () => (await chrome.storage.local.get('job')).job;

const HANDLERS = {
  // Dari popup: mulai tugas baru
  async start({ keywords, max, detail }) {
    if (!Array.isArray(keywords) || !keywords.length) throw new Error('Kata kunci kosong');
    const [existing] = await chrome.tabs.query({ url: MAPS_MATCH });
    const tab = existing || (await chrome.tabs.create({ active: true }));
    const job = { running: true, finished: false, keywords, max, detail: !!detail, index: 0, tabId: tab.id };
    await chrome.storage.local.set({ job, progress: { status: 'Memulai...', kwDone: 0, kwTotal: 0 } });
    await chrome.tabs.update(tab.id, { url: searchUrl(keywords[0]), active: true });
    console.log(LOG, 'Tugas dimulai', job);
    return { ok: true };
  },

  // Dari popup: hentikan. Content script mendengar perubahan job.running lewat storage.
  async stop() {
    const job = await getJob();
    if (!job?.running) return { ok: true };
    await chrome.storage.local.set({
      job: { ...job, running: false },
      progress: { status: 'Dihentikan. Data yang sudah terkumpul tetap tersimpan.', kwDone: 0, kwTotal: 0 },
    });
    console.log(LOG, 'Tugas dihentikan pengguna');
    return { ok: true };
  },

  // Dari content script: apakah tab ini sedang ditugaskan?
  async getJob(msg, sender) {
    const job = await getJob();
    return job?.running && sender.tab?.id === job.tabId ? job : null;
  },

  // Dari content script: satu kata kunci selesai
  async keywordDone(msg, sender) {
    const job = await getJob();
    if (!job?.running || sender.tab?.id !== job.tabId) return { ok: false };
    job.index++;
    if (job.index >= job.keywords.length) {
      job.running = false;
      job.finished = true;
      await chrome.storage.local.set({ job, progress: { status: 'Selesai', kwDone: 1, kwTotal: 1 } });
      console.log(LOG, 'Semua kata kunci selesai');
    } else {
      await chrome.storage.local.set({ job, progress: { status: 'Membuka kata kunci berikutnya...', kwDone: 0, kwTotal: 0 } });
      await chrome.tabs.update(job.tabId, { url: searchUrl(job.keywords[job.index]) });
      console.log(LOG, `Lanjut ke kata kunci ${job.index + 1}/${job.keywords.length}`);
    }
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = HANDLERS[msg?.type];
  if (!handler) return false;
  handler(msg, sender).then(sendResponse, (err) => {
    console.error(LOG, `Gagal menangani "${msg.type}":`, err);
    sendResponse({ error: err.message });
  });
  return true; // respons dikirim secara async
});

// Tab tugas ditutup: hentikan agar status tidak macet di "berjalan"
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const job = await getJob();
  if (job?.running && job.tabId === tabId) {
    await chrome.storage.local.set({
      job: { ...job, running: false },
      progress: { status: 'Tab Google Maps ditutup, proses dihentikan.', kwDone: 0, kwTotal: 0 },
    });
    console.warn(LOG, 'Tab tugas ditutup');
  }
});
