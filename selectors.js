/**
 * selectors.js — SATU-SATUNYA tempat selector CSS & pola teks Google Maps.
 * Jika Google Maps mengubah tampilan, cukup perbarui file ini lalu reload extension.
 *
 * Setiap selector berupa array: dicoba berurutan, yang pertama cocok dipakai.
 * Utamakan atribut stabil (role, aria-label, data-item-id) daripada nama class acak.
 */
const SELECTORS = {
  // ---- Daftar hasil pencarian ----
  // Panel daftar hasil yang di-scroll
  feed: ['div[role="feed"]'],
  // Link tiap listing di dalam feed (href berisi koordinat & ID tempat)
  listingLink: ['a[href*="/maps/place/"]'],
  // Kartu pembungkus listing, dicari dengan closest() dari link
  listingCard: ['div[role="article"]', 'div[jsaction*="mouseover"]'],
  // Rating di kartu, aria-label contoh: "4,5 bintang 120 Ulasan"
  cardRating: ['span[role="img"][aria-label*="bintang" i]', 'span[role="img"][aria-label*="star" i]'],

  // ---- Panel detail tempat (setelah listing diklik) ----
  // aria-label panel = nama tempat
  detailPanel: ['div[role="main"][aria-label]'],
  detailName: ['h1'],
  category: ['button[jsaction*="category"]'],
  // aria-label contoh: "4,5 bintang"
  rating: ['span[role="img"][aria-label*="bintang" i]', 'span[role="img"][aria-label*="star" i]'],
  // aria-label contoh: "120 ulasan"
  reviews: ['span[aria-label*="ulasan" i]', 'span[aria-label*="review" i]'],
  // aria-label contoh: "Alamat: Jl. Murad Alamsyah No. 1"
  address: ['button[data-item-id="address"]'],
  // data-item-id contoh: "phone:tel:081234567890", aria-label: "Telepon: 0812-3456-7890"
  phone: ['button[data-item-id^="phone:tel:"]'],
  website: ['a[data-item-id="authority"]'],
  // Tabel jam buka (ada di DOM walau dalam keadaan tertutup)
  hoursTable: ['table'],
  // Cadangan: elemen yang aria-label-nya berisi jadwal mingguan
  hoursLabel: ['[aria-label*="jam buka" i]', '[aria-label*="hours" i]'],
};

const PATTERNS = {
  // Teks penanda akhir daftar hasil
  endOfList: /akhir daftar|end of the list/i,
  // Nama hari, untuk mengenali tabel/label jam buka
  days: /senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i,
  // Awalan label aria, mis. "Alamat: " atau "Telepon: "
  labelPrefix: /^[^:]{1,20}:\s*/,
  // Ekor label jam buka, mis. ". Sembunyikan jam buka untuk seminggu"
  hoursNoise: /[.,]?\s*(Sembunyikan|Hide|Salin|Copy)\b.*$/i,
  // Koordinat di URL tempat: ...!3d-2.0621!4d101.3912...
  coords: /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  // Cadangan: pusat peta di URL ...@-2.06,101.39,17z
  coordsAt: /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  // ID tempat (stabil antar pencarian): ...!1s0x2e2f...:0x5d...
  placeId: /!1s(0x[0-9a-f]+(?::|%3A)0x[0-9a-f]+)/i,
  // Nomor telepon Indonesia di teks kartu: 0812-3456-7890, +62 812 3456 7890, (0748) 21234
  phone: /(?<![\d.,])(?:\+62\s?|\(?0)\d{2,4}\)?[\d -]{5,12}\d/,
  // Karakter ikon/arah teks tak terlihat yang ikut terbawa innerText
  junk: /[‎‏-]/g,
};
