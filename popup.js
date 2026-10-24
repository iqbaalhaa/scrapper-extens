/**
 * popup.js — form, progress, preview, dan export.
 * Proses scraping tetap berjalan walau popup ditutup; popup hanya membaca
 * chrome.storage.local dan ikut diperbarui lewat storage.onChanged.
 */

// Urutan & judul kolom untuk semua export
const COLUMNS = [
  ['nama', 'Nama Usaha'],
  ['kategori', 'Kategori'],
  ['rating', 'Rating'],
  ['ulasan', 'Jumlah Ulasan'],
  ['alamat', 'Alamat'],
  ['telepon', 'Telepon'],
  ['website', 'Website'],
  ['statusWeb', 'Status Website'],
  ['kataKunci', 'Kata Kunci'],
];

// Rating & ulasan hanya diekspor jika checkbox "Sertakan rating & jumlah ulasan" aktif
const columns = () => COLUMNS.filter(([k]) => state.withRating || (k !== 'rating' && k !== 'ulasan'));

const $ = (id) => document.getElementById(id);
const state = { job: null, progress: null, places: [], noWebOnly: false };
let rendered = { list: null, noWebOnly: null, rows: [] };

// Label status website. "Belum dicek" = panel detail tidak dibuka, jadi website-nya tidak diketahui
const WEB = { unknown: 'Belum dicek', none: 'Tidak ada', social: 'Hanya sosmed/marketplace', own: 'Ada' };

// Domain yang bukan website company profile milik sendiri
const NOT_OWN_SITE = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|linkedin\.com|linktr\.ee|bio\.link|wa\.me|whatsapp\.com|t\.me|shopee\.co\.id|tokopedia\.com|bukalapak\.com|lazada\.co\.id|gofood\.co\.id|grab\.com|business\.site)$/i;

if (globalThis.chrome?.runtime?.id) document.addEventListener('DOMContentLoaded', init);

async function init() {
  Object.assign(state, await chrome.storage.local.get(['job', 'progress', 'places', 'noWebOnly', 'withRating']));
  // Isi form dengan pengaturan tugas terakhir
  if (state.job) {
    $('keywords').value = state.job.keywords.join('\n');
    $('max').value = state.job.max;
    $('detail').checked = state.job.detail;
  }
  $('noWebOnly').checked = !!state.noWebOnly;
  $('withRating').checked = !!state.withRating;
  chrome.storage.onChanged.addListener((changes) => {
    for (const k in changes) state[k] = changes[k].newValue;
    render();
  });

  $('combine').onclick = () => {
    const keywords = combineKeywords($('types').value, $('areas').value);
    if (!keywords.length) return alert('Isi jenis usaha dan daerah, pisahkan dengan koma.');
    $('keywords').value = keywords.join('\n');
  };
  $('noWebOnly').onchange = (e) => chrome.storage.local.set({ noWebOnly: e.target.checked });
  $('withRating').onchange = (e) => chrome.storage.local.set({ withRating: e.target.checked });
  $('start').onclick = start;
  $('stop').onclick = () => send({ type: 'stop' });
  $('exportXlsx').onclick = () => guard(exportXlsx);
  $('exportHtml').onclick = () => guard(exportHtml);
  $('exportCsv').onclick = () => guard(exportCsv);
  $('clear').onclick = async () => {
    if (confirm(`Hapus ${places().length} data yang sudah terkumpul?`)) await chrome.storage.local.remove('places');
  };
  render();
}

const places = () => state.places || [];

// "cafe, PT" × "Kerinci, Sungai Penuh" -> cafe Kerinci, cafe Sungai Penuh, PT Kerinci, PT Sungai Penuh
function combineKeywords(types, areas) {
  const split = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return split(types).flatMap((t) => split(areas).map((a) => `${t} ${a}`));
}

function webStatus(p) {
  if (!p.detail) return WEB.unknown;
  if (!p.website) return WEB.none;
  try {
    let url = new URL(p.website);
    // Link pengalihan Google: https://www.google.com/url?q=<situs asli>
    if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname === '/url') url = new URL(url.searchParams.get('q'));
    return NOT_OWN_SITE.test(url.hostname) ? WEB.social : WEB.own;
  } catch {
    return WEB.own;
  }
}

// Data untuk preview & export: ditambah status website, difilter jika diminta
function view() {
  const list = places().map((p) => ({ ...p, statusWeb: webStatus(p) }));
  return state.noWebOnly ? list.filter((p) => p.statusWeb === WEB.none || p.statusWeb === WEB.social) : list;
}

async function send(msg) {
  try {
    const res = await chrome.runtime.sendMessage(msg);
    if (res?.error) throw new Error(res.error);
    return res;
  } catch (e) {
    console.error('[MapsScraper:popup]', msg.type, e);
    alert(`Gagal (${msg.type}): ${e.message}`);
  }
}

function guard(fn) {
  try {
    fn();
  } catch (e) {
    console.error('[MapsScraper:popup] Export gagal:', e);
    alert('Export gagal: ' + e.message);
  }
}

function start() {
  const keywords = [...new Set($('keywords').value.split('\n').map((s) => s.trim()).filter(Boolean))];
  const max = Math.floor(Number($('max').value));
  if (!keywords.length) return alert('Isi minimal satu kata kunci.');
  if (!(max >= 1 && max <= 500)) return alert('Jumlah maksimal hasil harus antara 1 dan 500.');
  // Status website hanya diketahui dari panel detail
  if (state.noWebOnly && !$('detail').checked && confirm('Filter "belum punya website" butuh mode detail. Aktifkan "Ambil detail lengkap"?')) {
    $('detail').checked = true;
  }
  send({ type: 'start', keywords, max, detail: $('detail').checked });
}

function render() {
  const { job, progress } = state;
  const list = places();
  const running = !!job?.running;
  const n = job?.keywords.length || 0;

  $('start').disabled = running;
  $('stop').disabled = !running;
  $('clear').disabled = !list.length;
  $('preview').classList.toggle('hide-rating', !state.withRating);

  const frac = progress?.kwTotal ? Math.min(1, progress.kwDone / progress.kwTotal) : 0;
  $('progress').value = !job ? 0 : job.finished ? 1 : Math.min(1, (job.index + frac) / n);
  $('status').textContent = progress?.status || '';

  // Tabel hanya dibangun ulang jika data atau filter berubah
  if (rendered.list !== list || rendered.noWebOnly !== state.noWebOnly) {
    rendered = { list, noWebOnly: state.noWebOnly, rows: view() };
    for (const id of ['exportXlsx', 'exportHtml', 'exportCsv']) $(id).disabled = !rendered.rows.length;
    $('preview').tBodies[0].replaceChildren(
      ...rendered.rows.map((p, i) => {
        const tr = document.createElement('tr');
        for (const v of [i + 1, p.nama, p.kategori, p.rating, p.telepon, p.statusWeb, p.alamat]) tr.insertCell().textContent = v ?? '';
        tr.cells[3].className = 'rating';
        return tr;
      })
    );
  }
  const unchecked = list.filter((p) => !p.detail).length;
  const shown = state.noWebOnly ? ` (${rendered.rows.length} belum punya website${unchecked ? `, ${unchecked} belum dicek` : ''})` : '';
  $('headline').textContent = (job ? `Kata kunci ${Math.min(job.index + 1, n)}/${n} — ` : '') + `${list.length} data terkumpul${shown}`;
}

// ---------- Export ----------

// Nama file dari kata yang sama di awal semua kata kunci, mis. "loket-travel_2026-10-24.xlsx"
function fileName(ext, keywords = state.job?.keywords || []) {
  const words = keywords.map((k) => k.toLowerCase().split(/\s+/));
  const common = [];
  while (words.length && words[0][common.length] && words.every((w) => w[common.length] === words[0][common.length])) {
    common.push(words[0][common.length]);
  }
  const base = (common.join(' ') || keywords[0] || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const suffix = state.noWebOnly ? '_tanpa-website' : '';
  return `${base || 'data-maps'}${suffix}_${new Date().toLocaleDateString('sv-SE')}.${ext}`;
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportXlsx() {
  if (typeof XLSX === 'undefined') throw new Error('Library lib/xlsx.full.min.js tidak ditemukan');
  const cols = columns();
  const headers = cols.map(([, h]) => h);
  const rows = view().map((p) => Object.fromEntries(cols.map(([k, h]) => [h, p[k] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  // Header tebal (style hanya ditulis oleh build xlsx-js-style; SheetJS Community mengabaikannya)
  headers.forEach((_, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D9E1F2' } } };
  });
  // Lebar kolom otomatis dari isi terpanjang, maksimal 60 karakter
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(60, Math.max(h.length, ...rows.map((r) => String(r[h]).length)) + 2) }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, fileName('xlsx'));
}

function csvCell(v) {
  let s = String(v ?? '');
  // Cegah CSV/formula injection: teks diawali = + - @ dibuka dengan tanda kutip satu
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const cols = columns();
  const lines = [cols.map(([, h]) => csvCell(h)), ...view().map((p) => cols.map(([k]) => csvCell(p[k])))];
  // BOM agar karakter non-ASCII terbaca benar
  download('\ufeff' + lines.map((r) => r.join(',')).join('\r\n'), fileName('csv'), 'text/csv;charset=utf-8');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isHttp = (u) => /^https?:\/\//i.test(u || '');

// 0812-3456-7890 -> 6281234567890
function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
}

function exportHtml() {
  const list = view();
  const keywords = state.job?.keywords || [];
  const rows = list
    .map((p, i) => {
      const tel = String(p.telepon || '').replace(/[^\d+]/g, '');
      const phone = tel
        ? `<a href="tel:${esc(tel)}">${esc(p.telepon)}</a> <a class="wa" href="https://wa.me/${waNumber(tel)}" target="_blank" rel="noopener">WhatsApp</a>`
        : '';
      const site = isHttp(p.website) ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0])}</a>` : '';
      const rating = state.withRating ? `<td>${esc(p.rating)}</td><td>${esc(p.ulasan)}</td>` : '';
      return `<tr><td>${i + 1}</td><td><b>${esc(p.nama)}</b></td><td>${esc(p.kategori)}</td>${rating}<td class="addr">${esc(p.alamat)}</td><td class="nowrap">${phone}</td><td>${site}</td><td class="nowrap">${esc(p.statusWeb)}</td><td>${esc(p.kataKunci)}</td></tr>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Google Maps — ${esc(keywords.join(', '))}</title>
<style>
  body { font: 14px/1.45 system-ui, "Segoe UI", Roboto, sans-serif; margin: 16px; color: #202124; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #5f6368; margin: 0 0 12px; }
  .bar { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  #q { padding: 8px 10px; width: min(420px, 100%); border: 1px solid #dadce0; border-radius: 6px; font: inherit; }
  .wrap { overflow-x: auto; border: 1px solid #dadce0; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background: #f1f3f4; position: sticky; top: 0; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody tr:hover { background: #e8f0fe; }
  .nowrap { white-space: nowrap; }
  td.addr { min-width: 240px; }
  a { color: #1a73e8; }
  a.wa { display: inline-block; margin-top: 2px; padding: 1px 8px; border-radius: 10px; background: #25d366; color: #fff; text-decoration: none; font-size: 12px; }
</style>
</head>
<body>
<h1>Data Google Maps</h1>
<p class="meta">Kata kunci: ${esc(keywords.join(' · ')) || '-'}${state.noWebOnly ? ' — hanya yang belum punya website' : ''} — diekspor ${esc(new Date().toLocaleString('sv-SE'))}</p>
<div class="bar">
  <input id="q" type="search" placeholder="Cari nama, alamat, kategori, telepon..." aria-label="Cari data">
  <span id="info">${list.length} data</span>
</div>
<div class="wrap">
<table>
<thead><tr><th>No</th><th>Nama Usaha</th><th>Kategori</th>${state.withRating ? '<th>Rating</th><th>Ulasan</th>' : ''}<th>Alamat</th><th>Telepon</th><th>Website</th><th>Status Website</th><th>Kata Kunci</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<script>
  const q = document.getElementById('q');
  const info = document.getElementById('info');
  const rows = [...document.querySelectorAll('tbody tr')];
  q.addEventListener('input', () => {
    const t = q.value.toLowerCase().trim();
    let shown = 0;
    for (const r of rows) {
      r.hidden = !!t && !r.textContent.toLowerCase().includes(t);
      if (!r.hidden) shown++;
    }
    info.textContent = t ? shown + ' dari ' + rows.length + ' data' : rows.length + ' data';
  });
</script>
</body>
</html>`;
  download(html, fileName('html'), 'text/html;charset=utf-8');
}
