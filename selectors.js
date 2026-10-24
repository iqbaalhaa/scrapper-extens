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
  // Link tiap listing di dalam feed (href berisi ID tempat)
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
};

const PATTERNS = {
  // Teks penanda akhir daftar hasil
  endOfList: /akhir daftar|end of the list/i,
  // Awalan label aria, mis. "Alamat: " atau "Telepon: "
  labelPrefix: /^[^:]{1,20}:\s*/,
  // ID tempat (stabil antar pencarian): ...!1s0x2e2f...:0x5d...
  placeId: /!1s(0x[0-9a-f]+(?::|%3A)0x[0-9a-f]+)/i,
  // Nomor telepon Indonesia di teks kartu: 0812-3456-7890, +62 812 3456 7890, (0748) 21234
  phone: /(?<![\d.,])(?:\+62\s?|\(?0)\d{2,4}\)?[\d -]{5,12}\d/,
  // Karakter ikon/arah teks tak terlihat yang ikut terbawa innerText
  junk: /[\u200e\u200f\ue000-\uf8ff]/g,
};
