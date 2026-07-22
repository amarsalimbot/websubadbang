# 🤖💰 Bot Keuangan WA

Asisten pencatatan & analisis keuangan pribadi berbasis WhatsApp — catat transaksi pakai kalimat sehari-hari, dapat laporan otomatis, monitoring budget real-time, insight AI, portofolio crypto, dan dashboard web pribadi bertema *liquid glass*.

Dibangun ulang dari PRD awal dengan arsitektur modular (bukan satu file monolitik), fallback berlapis (OpenAI → Gemini → parser lokal) agar **pencatatan transaksi tidak pernah gagal total**, dan emoji kontekstual di setiap balasan WhatsApp.

---

## ✨ Fitur Utama

| Area | Fitur |
|---|---|
| **Pencatatan** | Parsing natural bahasa Indonesia ("beli kopi 25k", "gajian 5jt"), deteksi nominal informal (25k/100rb/1.5jt/1jt500rb), auto kategori, auto dompet |
| **AI berlapis** | OpenAI (utama) → Gemini (fallback otomatis) → parser lokal berbasis aturan (jaring pengaman, selalu berhasil) dengan *circuit breaker* per provider |
| **Laporan** | Harian/mingguan/bulanan/tahunan/custom ("laporan Mei 2026"), pagination otomatis pesan panjang, ekspor `.xlsx` 5-sheet |
| **Budget** | Set budget per kategori, monitoring dengan progress bar, notifikasi otomatis di 85% & 100% |
| **Insight** | `analisis` (skor kesehatan + narasi AI), `tips`, `prediksi` cashflow, `grafik`/`tren` ASCII, tanya bebas `ai [pertanyaan]` dengan konteks keuangan kaya |
| **Crypto** | Saldo portofolio Binance real-time, konversi ke IDR, dibatasi khusus satu nomor terdaftar |
| **Dashboard Web** | Tautan pribadi bertanda tangan (HMAC), tema *liquid glass*, ringkasan saldo/budget/grafik komposisi/transaksi |
| **Reliabilitas** | Parser lokal selalu tersedia tanpa API key, circuit breaker cooldown quota/rate-limit, auto-reconnect WhatsApp |

---

## 🏗️ Struktur Proyek

```
bot-keuangan-wa/
├── src/
│   ├── config/env.js            # loader & validasi environment variable
│   ├── utils/                   # logger, parsing nominal, emoji, pagination, token
│   ├── categories/catalog.js    # katalog kategori pusat + migrasi kategori lama
│   ├── parser/localParser.js    # parser lokal berbasis aturan (fallback terakhir)
│   ├── ai/                      # provider OpenAI/Gemini + orchestrator + circuit breaker
│   ├── data/                    # repository Google Sheets (transaksi, budget, preferensi)
│   ├── features/                # service: transaksi, budget, laporan, ekspor Excel, insight, Binance, grafik ASCII
│   ├── whatsapp/                # koneksi Baileys, router perintah, formatter, pengingat
│   ├── dashboard/                # server HTTP + REST API dashboard
│   └── index.js                 # entry point
├── public/                      # dashboard web (HTML/CSS/JS statis, tema liquid glass)
├── .env.example
└── package.json
```

---

## 🚀 Instalasi

### 1. Prasyarat
- Node.js ≥ 18
- Nomor WhatsApp aktif (dipakai bot, sarankan nomor terpisah dari pribadi)
- Google Cloud Service Account dengan akses Google Sheets API
- (Opsional) API key OpenAI dan/atau Gemini — tanpa ini bot tetap jalan pakai parser lokal
- (Opsional) API key Binance — hanya untuk fitur portofolio crypto

### 2. Clone & install
```bash
npm install
cp .env.example .env
```

### 3. Isi `.env`
Minimal wajib diisi:
- `SPREADSHEET_ID` — ID spreadsheet Google Sheets (dari URL-nya)
- `WHATSAPP_PHONE_NUMBER` — nomor bot dengan format `62xxxxxxxxxx`
- Kredensial Google Service Account — pilih **salah satu**:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (isi JSON key mentah)
  - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` (JSON key di-encode base64, lebih aman untuk env var single-line)
  - `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`

  > Bagikan spreadsheet tujuan ke email `client_email` Service Account dengan akses **Editor**. Sheet `Transaksi`, `Budget`, `Preferensi`, `Kategori` akan dibuat otomatis saat bot pertama kali start bila belum ada.

- `DASHBOARD_SECRET` — string acak panjang untuk menandatangani tautan dashboard (**wajib diganti**, jangan pakai contoh)

Opsional (aktifkan sesuai kebutuhan): `OPENAI_API_KEY`, `GEMINI_API_KEY`, `BINANCE_API_KEY_<nomor>` / `BINANCE_API_SECRET_<nomor>`, `SUPER_ADMIN_NUMBERS`.

### 4. Jalankan
```bash
npm start
```
Scan QR yang muncul di terminal dengan WhatsApp (Perangkat Tertaut). Setelah terhubung, kirim `menu` ke nomor bot dari nomor pribadimu.

Dashboard web otomatis aktif di `http://localhost:7860` (atau `PORT` yang kamu set). Ketik `dashboard` di chat untuk mendapat tautan pribadi bertanda tangan.

---

## 💬 Daftar Perintah WhatsApp

```
beli kopi 25k                  → catat transaksi natural
menu                           → tampilkan menu bantuan
laporan [periode]              → laporan periode: "bulan ini", "bulan lalu", "Mei 2026", "tahun 2026"
export [periode]               → unduh laporan Excel (.xlsx, 5 sheet)
budget                         → monitoring budget seluruh kategori
set budget makan 1500000       → atur budget kategori
analisis                       → skor kesehatan keuangan + insight AI
tips                           → tips keuangan harian
prediksi                       → proyeksi cashflow akhir bulan
grafik                         → grafik ASCII pengeluaran per kategori
tren                           → tren arus kas 7 hari terakhir
ai [pertanyaan]                → tanya bebas ke asisten (berkonteks data keuangan asli)
status ai                      → status provider AI (aktif/cooldown)
saldo binance                  → portofolio crypto (khusus nomor terdaftar)
dashboard                      → dapatkan tautan dashboard pribadi
hapus terakhir                 → batalkan transaksi terakhir
pengingat on / pengingat off   → atur reminder harian pukul 20:00
```

---

## 🔒 Keamanan
- Tautan dashboard ditandatangani HMAC-SHA256 (`DASHBOARD_SECRET`), kedaluwarsa otomatis (`DASHBOARD_LINK_DAYS`, default 30 hari), dan diverifikasi dengan perbandingan *timing-safe*.
- Kredensial (Google, OpenAI, Gemini, Binance) **hanya** dibaca dari environment variable — tidak pernah ditulis ke kode atau ke Google Sheets.
- Bot mengabaikan pesan dari grup WhatsApp (`@g.us`) — dirancang untuk percakapan pribadi satu-ke-satu.

## ⚠️ Keterbatasan yang Diketahui
- Grafik native Excel tidak didukung stabil oleh `exceljs`; sheet "Diagram Kategori"/"Diagram Tren" disajikan sebagai tabel data + bar berbasis karakter, tetap terbaca tanpa plugin tambahan.
- Parser lokal fallback bisa salah kategori/nominal untuk kalimat yang sangat ambigu — AI (bila dikonfigurasi) jauh lebih akurat untuk kasus kompleks.
- Reminder harian saat ini terjadwal pada jam tetap (20:00 waktu server); jadikan `REMINDER_HOUR` di `src/whatsapp/reminders.js` dapat dikonfigurasi via env bila perlu jam berbeda per pengguna.

## 🗺️ Roadmap Lanjutan (opsional, belum diimplementasikan)
- Reminder jam kustom per pengguna
- Multi-currency
- Ekspor PDF selain Excel
- Berbagi akun (rumah tangga/pasangan) dalam satu spreadsheet
