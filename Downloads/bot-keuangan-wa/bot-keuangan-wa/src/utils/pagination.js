'use strict';

const WA_SAFE_LENGTH = 3500; // batas aman per pesan WhatsApp agar tidak terpotong klien

/**
 * F-2.2: memecah teks panjang menjadi beberapa "halaman" rapi tanpa memotong
 * baris di tengah, dan menambahkan penanda halaman (mis. "Halaman 2/3").
 */
function paginate(fullText, { maxLength = WA_SAFE_LENGTH, label = 'Halaman' } = {}) {
  if (fullText.length <= maxLength) return [fullText];

  const lines = fullText.split('\n');
  const pages = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > maxLength) {
      pages.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) pages.push(current);

  return pages.map((page, i) => `${page}\n\n_${label} ${i + 1}/${pages.length}_`);
}

module.exports = { paginate, WA_SAFE_LENGTH };
