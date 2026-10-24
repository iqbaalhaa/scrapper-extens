// Self-test fungsi murni (tanpa browser): node tests/selftest.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const root = path.join(__dirname, '..');
const load = (...files) => {
  const ctx = vm.createContext({ console, Buffer, URL, document: { addEventListener() {} } });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  // const/let di level atas tidak menjadi properti context, ambil lewat eval
  return new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : vm.runInContext(String(k), t)) });
};

// ---- content.js ----
const c = load('selectors.js', 'content.js');
const href = 'https://www.google.com/maps/place/Loket+Travel+X/data=!4m7!3m6!1s0x2e2f4e2b2ad6c3d1%3A0x5d1c!8m2!3d-2.0621!4d101.3912!16s%2Fg%2F11?authuser=0&hl=id';
assert.deepEqual({ ...c.parseCoords(href) }, { lat: -2.0621, lng: 101.3912 });
assert.equal(c.placeIdFrom(href), '0x2e2f4e2b2ad6c3d1:0x5d1c');
assert.deepEqual({ ...c.parseRatingLabel('4,5 bintang 1.234 Ulasan') }, { rating: 4.5, ulasan: 1234 });
assert.deepEqual({ ...c.parseRatingLabel('4.5 stars 1,234 Reviews') }, { rating: 4.5, ulasan: 1234 });
assert.deepEqual({ ...c.parseRatingLabel('') }, { rating: '', ulasan: '' });

const phone = (s) => (s.match(c.PATTERNS.phone) || [''])[0].trim();
assert.equal(phone('Buka · Tutup pukul 17.00 · 0812-3456-7890'), '0812-3456-7890');
assert.equal(phone('Tutup pukul 17.00\n(0748) 21234'), '(0748) 21234');
assert.equal(phone('+62 812 3456 7890'), '+62 812 3456 7890');
assert.equal(phone('Buka 24 jam'), '');

// Kerinci & Sungai Penuh tumpang tindih: link beda (parameter pencarian) tapi ID sama
assert.ok(c.samePlace({ id: 'a:b', link: 'x' }, { id: 'a:b', link: 'y' }));
assert.ok(!c.samePlace({ id: 'a:b' }, { id: 'a:c' }));
assert.ok(c.samePlace({ nama: 'Travel ABC', alamat: 'Jl. Merdeka No. 1' }, { nama: 'travel abc', alamat: 'Jl Merdeka No 1' }));
assert.ok(!c.samePlace({ nama: 'Travel ABC', alamat: '' }, { nama: 'Travel ABC', alamat: '' }));

// Kartu daftar hasil (format teks asli Google Maps, termasuk ikon tersembunyi )
const card = (name, text) => [{ getAttribute: () => name }, { innerText: text, querySelectorAll: () => [] }];
const fam = c.extract(c.CARD_FIELDS, ...card('Family Kerinci', 'Family Kerinci\n4,3(18)\nBiro Perjalanan dan Wisata ·  · Jl. Depati Parbo No.69\nBuka 24 jam · (0748) 21332\nRute'));
assert.deepEqual({ ...fam }, { nama: 'Family Kerinci', kategori: 'Biro Perjalanan dan Wisata', rating: '', ulasan: '', alamat: 'Jl. Depati Parbo No.69', telepon: '(0748) 21332' });
const bare = c.extract(c.CARD_FIELDS, ...card('Kopi X', 'Kopi X\nKedai Kopi'));
assert.equal(bare.kategori, '');
assert.equal(bare.alamat, '');

// Field yang error diisi kosong, field lain tetap jalan
const out = c.extract({ ok: () => 'ya', rusak: () => { throw new Error('x'); } });
assert.deepEqual({ ...out }, { ok: 'ya', rusak: '' });

// ---- popup.js ----
const p = load('popup.js');
const today = new Date().toLocaleDateString('sv-SE');
assert.equal(p.fileName('xlsx', ['loket travel Kerinci', 'loket travel Sungai Penuh']), `loket-travel_${today}.xlsx`);
assert.equal(p.fileName('csv', ['loket travel Kerinci', 'travel Sungai Penuh']), `loket-travel-kerinci_${today}.csv`);
assert.equal(p.fileName('html', []), `data-maps_${today}.html`);
assert.equal(p.waNumber('0812-3456-7890'), '6281234567890');
assert.equal(p.waNumber('+62 812 3456 7890'), '6281234567890');
assert.equal(p.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
assert.equal(p.csvCell(-2.06), '"-2.06"');
assert.equal(p.esc('<b>"&\''), '&lt;b&gt;&quot;&amp;&#39;');

// Jenis usaha × daerah
assert.deepEqual([...p.combineKeywords('cafe, PT', 'Kerinci, Sungai Penuh')], ['cafe Kerinci', 'cafe Sungai Penuh', 'PT Kerinci', 'PT Sungai Penuh']);
assert.deepEqual([...p.combineKeywords('cafe', ' ')], []);

// Status website: tempat yang detailnya tidak dibuka TIDAK boleh dianggap "tanpa website"
const W = p.WEB;
assert.equal(p.webStatus({ detail: false, website: '' }), W.unknown);
assert.equal(p.webStatus({ detail: true, website: '' }), W.none);
assert.equal(p.webStatus({ detail: true, website: 'https://www.instagram.com/kopi.kerinci/' }), W.social);
assert.equal(p.webStatus({ detail: true, website: 'https://linktr.ee/kopi' }), W.social);
assert.equal(p.webStatus({ detail: true, website: 'https://www.google.com/url?q=https://facebook.com/ptabc&opi=1' }), W.social);
assert.equal(p.webStatus({ detail: true, website: 'https://ptabc.co.id/' }), W.own);
assert.equal(p.webStatus({ detail: true, website: 'https://notinstagram.com/' }), W.own);

// Filter "belum punya website" hanya menyisakan Tidak ada + Hanya sosmed
p.state.places = [
  { nama: 'A', detail: true, website: '' },
  { nama: 'B', detail: true, website: 'https://b.co.id' },
  { nama: 'C', detail: true, website: 'https://fb.com/c' },
  { nama: 'D', detail: false, website: '' },
];
p.state.noWebOnly = true;
assert.deepEqual(p.view().map((x) => x.nama), ['A', 'C']);
assert.match(p.fileName('xlsx', ['cafe Kerinci']), /^cafe-kerinci_tanpa-website_\d{4}-\d{2}-\d{2}\.xlsx$/);
p.state.noWebOnly = false;
assert.equal(p.view().length, 4);

// ---- xlsx: header tebal benar-benar tertulis ----
const x = load('lib/xlsx.full.min.js');
const ws = x.XLSX.utils.json_to_sheet([{ Nama: 'A' }]);
ws.A1.s = { font: { bold: true } };
const wb = x.XLSX.utils.book_new();
x.XLSX.utils.book_append_sheet(wb, ws, 'Data');
const zip = x.XLSX.CFB.read(x.XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
const stylesXml = Buffer.from(x.XLSX.CFB.find(zip, '/xl/styles.xml').content).toString('utf8');
assert.match(stylesXml, /<b\s*(val="1"\s*)?\/>/, 'header tebal tidak tertulis di styles.xml');

console.log('Semua self-test lolos ✔');
