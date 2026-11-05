# Bot UAS Indodax — Dry Run

Implementasi ini hanya membuat simulasi transaksi. Bot tidak memiliki fungsi untuk mengirim order ke akun Indodax, dan tidak memerlukan login, API key exchange, atau KYC. Data pasar diambil dari endpoint publik Indodax. Status "RUNNING (ONLINE)" berarti tick terakhir berhasil, bukan jaminan bahwa scheduler berikutnya pasti berjalan.

## Struktur

- `api/tick.js` — endpoint tick dengan autentikasi `CRON_SECRET`.
- `api/dashboard.js` — state dan log untuk dashboard.
- `api/control.js` — kill switch manual berautentikasi `CONTROL_SECRET`.
- `lib/indodax-bot.js` — validasi candle tertutup, indikator, simulasi taker buy di ask / sell di bid, fee, sizing, dan risk limit.
- `lib/redis.js` — state/log persisten dan lock/idempotency atomik di Upstash Redis.
- `public/index.html` — dashboard live dan analisis offline file JSON.
- `tools/hitung_ulang.js` — hitung ulang metrik dari ekspor JSON dashboard.
- `.github/workflows/indodax-dry-run.yml` — pemanggilan endpoint per jam dari GitHub Actions.

## Konfigurasi sebelum deploy

1. Buat Upstash Redis database dan atur environment Vercel berdasarkan `.env.example`:
   - `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`
   - `CRON_SECRET` dan `CONTROL_SECRET` berupa secret acak yang panjang dan berbeda
   - `BOT_ENABLED=false` sampai semua aturan, data, dan konfigurasi disetujui
   - `PROCESS_KILL_SWITCH=true` untuk memblokir entry segera melalui environment
   - `BOT_PAIRS` berisi 3–10 market IDR; wajib mencakup `BTCIDR`. Pilih pasangan dari kriteria likuiditas dan periode backtest resmi, jangan menebak pasangan.
2. Deploy project ke Vercel dan pastikan `public` tetap menjadi output directory.
3. Pada repository GitHub, tambahkan Actions secret `CRON_SECRET` yang sama dengan Vercel, serta Actions variable `VERCEL_TICK_URL` dengan URL deployment diikuti `/api/tick`.
4. Jalankan `workflow_dispatch` sekali untuk menguji scheduler. Jadwal otomatis berjalan pada menit ke-7 setiap jam UTC; GitHub dapat menunda scheduled workflow dan jadwal hanya tersedia pada branch default.
5. Setelah pasangan, sumber data, biaya, parameter, storage, dan tanggal freeze disetujui, atur `BOT_ENABLED=true`. Jangan menyalakan bot hanya untuk menghilangkan status konfigurasi.

Environment Vercel dan secret GitHub harus dimasukkan sendiri lewat dashboard masing-masing. Jangan menaruh token atau secret di Git, file `.env.example`, log, maupun source code. Jalankan deployment ulang setelah mengubah environment Vercel.

### Fee, timeframe, dan batas strategi

Konfigurasi saat ini ada di `lib/bot-config.js`: candle 60 menit, modal virtual Rp100.000.000, fee taker 0,51%, minimum order Rp25.000, maks. 3 posisi, sizing 10% ekuitas, dan daily loss limit 3% per hari WIB. Baseline harian diambil dari mark ekuitas pada tick valid pertama setelah pergantian tanggal WIB; keterlambatan scheduler berarti baseline bukan snapshot tepat pada 00:00. Fee merupakan parameter yang diminta untuk implementasi ini; verifikasi tarif resmi Indodax yang berlaku dan aturan PDF sebelum mengaktifkan bot. Jangan mengubah parameter setelah pembekuan tanpa mencatat dan meminta persetujuan sesuai ketentuan UAS.

PDF menetapkan freeze pada 4 November 2026 pukul 12:00 WIB. Karena implementasi ini dilakukan setelah tanggal tersebut, jangan klaim konfigurasi ini sebagai kode yang telah dibekukan atau menyalakan `BOT_ENABLED` untuk penilaian sebelum meminta persetujuan pengajar.

Entry baru ditolak jika candle tidak lolos validasi, spread melebihi 2%, volume nol, orderbook kosong, daily loss limit aktif, data valuasi posisi terbuka stale, atau kill switch aktif. Posisi dinilai memakai best bid terbaru. State dan marker candle disimpan atomik sehingga tick ulang tidak menggandakan order simulasi pada candle yang sama.

## Endpoint

- `POST /api/tick` — wajib `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/dashboard` — data dashboard live dan log terbaru.
- `POST /api/control` — wajib `Authorization: Bearer <CONTROL_SECRET>` dengan body `{"enabled":true,"reason":"..."}` atau `{"enabled":false,"reason":"..."}`.

Kill switch dari environment dan Redis digabung dengan logika OR. Mengubah Redis ke `false` tidak dapat menonaktifkan `PROCESS_KILL_SWITCH=true`; ubah environment Vercel dan deploy ulang untuk melepasnya.

## Hitung ulang

Unduh `log server (JSON)` dari dashboard, lalu jalankan:

```powershell
node .\tools\hitung_ulang.js .\indodax-dry-run-export.json
```

Skrip menghitung return, drawdown, win rate, profit factor, jumlah trade/order, uptime, dan porsi fee+spread+slippage dari state/log yang tersedia. Log server dibatasi untuk menjaga ukuran storage; gunakan `state.stats` untuk statistik kumulatif. Skrip tidak merekonstruksi data yang tidak ada dan tidak menganggap data sintetis sebagai bukti pasar.

## Batasan operasional

Vercel Hobby Cron umumnya tidak cocok untuk tick per jam; workflow GitHub Actions digunakan sebagai scheduler eksternal. Scheduled Actions bukan layanan real-time dengan jaminan waktu eksekusi. Pastikan workflow, rahasia, koneksi Redis, URL Vercel, dan riwayat tick dipantau. Dashboard/log bersifat publik tanpa login karena hanya berisi data simulasi dan data pasar publik; endpoint kontrol dan tick tetap memerlukan secret.
