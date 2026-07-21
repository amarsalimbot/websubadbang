# Crypto Bot Pro — WhatsApp Crypto Assistant v2

Versi yang lebih canggih dari bot crypto WhatsApp sebelumnya. Bukan lagi satu file
2700 baris, tapi project modular dengan **multi-strategy signal engine, backtesting,
paper trading (saldo virtual), AI multi-provider (teks/suara/chart), dan web dashboard**.

## Apa yang baru dibanding versi sebelumnya

| Area | Sebelumnya | Sekarang |
|---|---|---|
| Kode | 1 file `wa.js` (~2760 baris) | Modular: `src/market`, `src/strategies`, `src/backtest`, `src/trading`, `src/ai`, `src/whatsapp`, `src/web` |
| Sinyal | 1 scoring rule-based | 4 strategi (Trend, Mean Reversion, Breakout, Momentum) digabung jadi konsensus terbobot per mode, plus konfirmasi multi-timeframe |
| Market data | Binance -> CoinGecko | Binance -> Bybit -> CoinGecko (lebih tahan rate-limit/blokir region) |
| Trading | Jurnal manual saja | Jurnal manual **+ Paper Trading** (saldo virtual, fee, equity curve, leaderboard) |
| Backtest | Tidak ada | Walk-forward backtester per strategi/konsensus, lengkap dengan win rate, profit factor, max drawdown |
| AI | OpenAI -> Gemini fallback, teks saja | Urutan provider bisa diatur, **+ transkripsi voice note (Whisper)**, **+ chart image (QuickChart)**, **+ "ai deep"** untuk pembahasan mendalam |
| Watchlist | Tetap untuk semua | Per-nomor WhatsApp bisa custom (`watchlist add/remove`) |
| Penyimpanan | 1 file `state.json` | Tetap JSON (sesuai permintaan), tapi per koleksi + atomic write + autosave debounce |
| Dashboard | Endpoint `/health` JSON saja | Dashboard web penuh: harga live, sinyal, leaderboard paper trading, form backtest |

## Struktur folder

```
src/
  config.js          konfigurasi terpusat dari environment variable
  db.js               JSON collection store (atomic write + autosave)
  state.js            user, watchlist, posisi jurnal, akun paper trading, AI history
  market.js           Binance -> Bybit -> CoinGecko (ticker & candle, dengan cache)
  indicators.js        EMA, RSI, MACD, Bollinger, ATR, Stochastic, dll
  strategies.js        4 strategi + signal engine konsensus terbobot
  analysis.js          gabungan market + indikator + strategi -> hasil analisa & trade plan
  backtest.js           walk-forward backtester
  messages.js           pembuat teks balasan WhatsApp
  news.js               RSS + ringkasan berita lewat AI
  trading/
    riskEngine.js       kalkulator ukuran posisi berbasis risiko
    paperBroker.js      saldo virtual: buy/sell, fee, equity curve
    positionMonitor.js  cek TP/SL/trailing untuk posisi jurnal manual
  ai/
    openai.js, gemini.js  provider AI
    router.js             fallback chain + cooldown + riwayat percakapan
    context.js            konteks market/berita/posisi terpercaya untuk AI
    chat.js                jawaban chat & "ai deep"
    chart.js               render chart PNG via QuickChart
  whatsapp/
    client.js             koneksi Baileys, pairing code, reconnect
    router.js              parsing perintah & voice note
    handlers.js             implementasi semua perintah
  web/
    server.js               Express API + dashboard
    public/                  HTML/CSS/JS dashboard
  scheduler.js              monitor sinyal + auto report candle/interval
  index.js                  entry point
```

## Menjalankan

```bash
cp .env.example .env   # isi WHATSAPP_PHONE_NUMBER, OPENAI_API_KEY, dst
npm install
npm start
```

Saat pertama jalan, bot akan menampilkan **kode pairing** di log — buka WhatsApp di HP:
*Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon*, lalu masukkan kode itu.

Dashboard web otomatis aktif di `http://localhost:7860` (atau domain publik tempat Anda
deploy). Kalau `DASHBOARD_TOKEN` diisi, tambahkan `?token=...` di URL.

## Daftar perintah WhatsApp

Kirim `menu` ke bot untuk daftar lengkap. Ringkasannya:

```
harga | harga BTC | chart BTC
analisa BTC [trader|investor] [trend|meanreversion|breakout|momentum]
watchlist | watchlist add SOL | watchlist remove SOL

beli BTC sekarang | beli BTC 65000 0.01 | jual BTC sekarang
posisi | posisi BTC | jurnal | set sl BTC 62000 | set tp1 BTC 70000
risk BTC 1000 2

paper saldo | paper buy BTC 50% | paper buy BTC 0.01
paper sell BTC | paper posisi | paper riwayat | paper reset

backtest BTC 30d trader | backtest BTC 90d investor trend

berita | berita BTC | laporan | dashboard

ai <pertanyaan> | ai deep BTC | ai status | ai reset | ai retry
(kirim voice note untuk tanya lewat suara)

mode trader | mode investor | alert on | alert off | status
```

## Catatan penting

- **Tidak ada eksekusi order nyata.** Semua trading di sini adalah jurnal manual atau
  simulasi saldo virtual (paper trading). Tidak ada API key trading Binance yang dipegang bot.
- Backtest menyederhanakan eksekusi (tanpa slippage/funding rate) — hasil historis
  tidak menjamin hasil ke depan.
- Bot ini bukan penasihat keuangan. Selalu lakukan riset & manajemen risiko sendiri.
