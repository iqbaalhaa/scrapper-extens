# Maps Scraper Bisnis (Chrome Extension, Manifest V3)

Mengumpulkan data bisnis dari hasil pencarian Google Maps (nama, kategori, rating, ulasan, alamat, telepon, website, jam buka, koordinat, link), lalu mengekspornya ke **Excel (.xlsx)**, **HTML**, atau **CSV**.

## Struktur

```
manifest.json      konfigurasi extension
popup.html/.css/.js form, progress, preview, export
background.js      service worker: antrean kata kunci & navigasi tab
content.js         scroll, klik listing, ambil data, simpan (jalan di google.com/maps)
selectors.js       SEMUA selector & pola teks Google Maps (edit di sini jika Maps berubah)
lib/xlsx.full.min.js  SheetJS (build xlsx-js-style), di-bundle lokal
icons/             ikon 16/48/128
tests/selftest.js  self-test parser & export (node tests/selftest.js)
```

## Instalasi

1. Buka `chrome://extensions`.
2. Aktifkan **Developer mode** (pojok kanan atas).
3. Klik **Load unpacked**, lalu pilih folder ini (yang berisi `manifest.json`).
4. Pin ikon extension di toolbar agar mudah dibuka.

Setelah mengubah file apa pun, klik tombol **reload** (↻) pada kartu extension di `chrome://extensions`, lalu **muat ulang tab Google Maps** yang sedang terbuka.

## Library SheetJS

`lib/xlsx.full.min.js` **sudah disertakan**. Isinya build **xlsx-js-style 1.2.0**, yaitu fork SheetJS dengan API `XLSX` yang sama, ditambah dukungan style. Fork ini dipakai karena SheetJS Community Edition tidak bisa menulis header tebal.

Cara mengunduh ulang:

```
curl -L -o lib/xlsx.full.min.js https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js
```

Atau buka URL di atas di browser, lalu **Save As** ke `lib/xlsx.full.min.js`.

Kalau ingin memakai SheetJS resmi, unduh `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` ke path yang sama. Semuanya tetap jalan, hanya header-nya tidak tebal.

File harus disimpan lokal, karena Manifest V3 melarang memuat script dari CDN.

## Cara pakai

1. Klik ikon extension, lalu isi kata kunci (satu per baris), misalnya:
   ```
   loket travel Kerinci
   loket travel Sungai Penuh
   travel Sungai Penuh
   ```
   Cara lain: isi **Jenis usaha** (misalnya `cafe, PT, CV`) dan **Daerah** (misalnya `Kerinci, Sungai Penuh`), lalu klik **Buat kata kunci ↓**. Semua kombinasinya akan terisi otomatis (`cafe Kerinci`, `cafe Sungai Penuh`, `PT Kerinci`, dan seterusnya).
2. Atur **Maks. hasil per kata kunci** (default 100). Centang **Ambil detail lengkap** jika butuh telepon, website, dan jam buka mingguan.
3. Klik **Mulai**. Extension memakai tab Google Maps yang sudah ada (atau membuka tab baru), lalu memproses kata kunci satu per satu.
4. Popup boleh ditutup karena proses tetap berjalan. Buka lagi kapan saja untuk melihat progres.
5. Klik **Berhenti** kapan saja. Data yang sudah terkumpul tetap tersimpan.
6. Export lewat **Export Excel / HTML / CSV**. Contoh nama file: `loket-travel_2026-10-24.xlsx` (diambil dari kata yang sama di awal semua kata kunci, atau dari kata kunci pertama).

Catatan:
- **Biarkan tab Google Maps terlihat**, misalnya di jendela tersendiri. Chrome memperlambat timer di tab latar belakang, sehingga proses bisa jauh lebih lambat.
- Google Maps biasanya hanya menampilkan sekitar **120 hasil per pencarian**. Untuk cakupan lebih luas, pecah kata kunci per wilayah atau kecamatan.
- Tanpa mode detail, telepon, alamat singkat, dan status buka diambil dari kartu daftar (cepat, kadang kurang lengkap). Dengan mode detail, data diambil dari panel tempat (alamat lengkap dan jadwal mingguan), dengan jeda acak 1,5–4 detik per tempat.
- **Deduplikasi**: tempat yang sama dikenali dari ID tempat Google (`!1s0x…:0x…`), link, atau kombinasi nama + alamat. Hasil Kerinci dan Sungai Penuh yang tumpang tindih hanya tersimpan sekali. Tempat yang sudah punya data detail tidak dibuka ulang di kata kunci berikutnya.
- **Mode WhatsApp di HTML**: awalan `0` diubah menjadi `62`. Nomor telepon kantor (fixed line) tetap mendapat tombol, tapi biasanya tidak terdaftar di WhatsApp.
- **CSV memakai pemisah koma.** Excel dengan regional Indonesia bisa menampilkan semua isi di satu kolom, jadi untuk Excel gunakan **Export Excel**.

## Mencari prospek: usaha yang belum punya website

1. Isi jenis usaha dan daerah, lalu klik **Buat kata kunci ↓**.
2. **Centang "Ambil detail lengkap".** Website hanya terlihat di panel detail tempat; kartu di daftar hasil tidak memuatnya.
3. Klik **Mulai**. Setelah selesai, centang **Hanya yang belum punya website**. Preview dan semua export akan berisi prospek saja, dan nama file mendapat akhiran `_tanpa-website`.

Kolom **Status Website**:

| Status | Arti |
|---|---|
| Tidak ada | Panel detail sudah dibuka dan tidak ada website → **prospek** |
| Hanya sosmed/marketplace | Website-nya hanya Facebook/Instagram/TikTok/Linktree/wa.me/Shopee/Tokopedia/business.site dll. → **prospek** (belum punya web company profile sendiri) |
| Ada | Punya domain sendiri |
| Belum dicek | Diambil tanpa mode detail, atau panel detailnya gagal dibuka → **bukan** prospek. Jalankan ulang kata kunci tersebut dengan mode detail. |

Daftar domain yang dianggap "sosmed/marketplace" ada di `NOT_OWN_SITE` dalam `popup.js`, dan bisa ditambah sendiri. Filter hanya memengaruhi tampilan dan export; data asli di storage tetap utuh.

## Jika Google Maps mengubah tampilannya

Semua selector ada di **`selectors.js`**. Setiap entri berupa array yang dicoba berurutan, jadi selector baru bisa ditambahkan di depan tanpa menghapus yang lama.

1. Buka Google Maps, cari sesuatu, lalu klik satu listing.
2. Klik kanan elemen yang datanya hilang (misalnya alamat), lalu pilih **Inspect**.
3. Cari atribut yang stabil, dengan urutan prioritas: `data-item-id`, `aria-label`, `role`, `jsaction`. **Hindari nama class acak** seperti `.DUwDvf` atau `.Io6YTe`, karena sering berubah.
4. Uji di Console tab Maps, misalnya: `document.querySelectorAll('button[data-item-id="address"]')`.
5. Tambahkan selector baru di depan array terkait, misalnya `address: ['selector-baru', 'button[data-item-id="address"]']`.
6. Reload extension, muat ulang tab Maps, lalu coba lagi.

Peta selector ke data:

| Kunci | Data |
|---|---|
| `feed`, `listingLink`, `listingCard`, `cardRating` | daftar hasil & kartu |
| `detailPanel`, `detailName` | panel tempat (aria-label = nama) |
| `category`, `rating`, `reviews`, `address`, `phone`, `website` | field detail |
| `hoursTable`, `hoursLabel` | jam buka mingguan |

`PATTERNS` di file yang sama berisi pola teks seperti penanda akhir daftar, nama hari, format telepon, dan koordinat `!3d…!4d…`. Pencarian dibuka dengan `?hl=id` supaya teks Google selalu berbahasa Indonesia dan cocok dengan pola ini.

## Debugging

- **Content script**: buka DevTools di tab Google Maps (F12), lalu di Console ketik `MapsScraper` pada kotak filter. Setiap langkah, field yang gagal diambil, dan error tercatat di sini.
- **Background**: di `chrome://extensions`, pada kartu extension klik link **service worker**, lalu buka Console (prefix `[MapsScraper:bg]`).
- **Popup**: klik kanan di popup, lalu pilih **Inspect**.
- **Data mentah**: di Console popup jalankan `chrome.storage.local.get(null).then(console.log)`.
- Jika muncul *"Panel detail gagal 5x berturut-turut"*, besar kemungkinan `detailPanel`/`detailName` perlu diperbarui. Proses otomatis lanjut tanpa mode detail.
- Self-test logika (Node.js): `node tests/selftest.js`.

## Peringatan

Scraping otomatis bertentangan dengan Ketentuan Layanan Google Maps, dan Google bisa memperlambat atau memblokir akses jika terlalu agresif. Gunakan seperlunya, pertahankan jeda bawaan, dan jangan jalankan banyak kata kunci besar sekaligus.
