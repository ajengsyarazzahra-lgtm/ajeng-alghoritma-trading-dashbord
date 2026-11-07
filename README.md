# Bot UAS Indodax — Dry Run

Implementasi ini hanya membuat simulasi transaksi. Bot tidak memiliki fungsi untuk mengirim order ke akun Indodax, dan tidak memerlukan login, API key exchange, atau KYC. Data pasar diambil dari endpoint publik Indodax. Status "RUNNING (ONLINE)" berarti tick terakhir berhasil, bukan jaminan bahwa scheduler berikutnya pasti berjalan.

## Struktur

- `api/tick.js` — endpoint tick dengan autentikasi `CRON_SECRET`.
- `api/dashboard.js` — state dan log dashboard; bootstrap saat offline dibatasi satu percobaan per jam agar polling tidak membanjiri API publik.
- `api/control.js` — kill switch manual berautentikasi `CONTROL_SECRET`.
- `lib/indodax-bot.js` — validasi candle tertutup, indikator, simulasi taker buy di ask / sell di bid, fee, sizing, dan risk limit.
- `lib/redis.js` — state/log persisten dan lock/idempotency atomik di Upstash Redis.
- `public/index.html` — dashboard live, kontrol kill switch berautentikasi, dan analisis offline file JSON.
- `tools/hitung_ulang.js` — hitung ulang metrik dari ekspor dashboard Vercel atau skema JSON UAS.
- `generate_log.py` — membuat template kosong, tanpa data pasar atau trade sintetis.
- `.github/workflows/indodax-dry-run.yml` — pemanggilan endpoint tiap jam pada menit ke-17 UTC.

## Konfigurasi sebelum deploy

1. Buat Upstash Redis database dan atur environment Vercel berdasarkan `.env.example`:
   - `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`
   - `CRON_SECRET` dan `CONTROL_SECRET` berupa secret acak yang panjang dan berbeda
   - `BOT_ENABLED=true` mengaktifkan simulasi dry-run (tidak ada order exchange). Atur `false` untuk menjeda bot.
   - `PROCESS_KILL_SWITCH=true` untuk memblokir entry segera melalui environment
   - Default pasangan bootstrap adalah `BTCIDR,ETHIDR,XRPIDR` sesuai permintaan. `BOT_PAIRS` bisa mengganti pasangan (3–10 market IDR, wajib `BTCIDR`) bila metodologi UAS sudah menentukan universe berbeda.
2. Deploy project ke Vercel dan pastikan `public` tetap menjadi output directory.
3. Vercel Cron memanggil `/api/tick` setiap hari pukul 07:07 WIB (00:07 UTC) dan mengirim bearer `CRON_SECRET` yang dikonfigurasi di project. Endpoint menerima GET/POST hanya jika bearer valid.
4. Untuk tick per jam, pada repository GitHub tambahkan Actions secret `CRON_SECRET` yang sama dengan Vercel, serta Actions variable `VERCEL_TICK_URL` dengan URL deployment diikuti `/api/tick`; workflow GitHub berjalan pada menit ke-17 tiap jam UTC. Vercel Cron harian tetap berjalan pada menit ke-7 UTC; idempotency mencegah pemrosesan candle/order ganda.
5. Dashboard mencoba bootstrap sekali saat state kosong atau offline; bootstrap hanya mengambil data publik dan melakukan simulasi lokal. Endpoint `/api/tick` sendiri tetap hanya menerima Bearer `CRON_SECRET`.

Environment Vercel dan secret GitHub harus dimasukkan sendiri lewat dashboard masing-masing. Jangan menaruh token atau secret di Git, file `.env.example`, log, maupun source code. Jalankan deployment ulang setelah mengubah environment Vercel.

### Fee, timeframe, dan batas strategi

Konfigurasi saat ini ada di `lib/bot-config.js`: candle 60 menit, modal virtual Rp100.000.000, fee taker 0,51%, minimum order Rp25.000, maks. 3 posisi, sizing 10% ekuitas, dan daily loss limit 3% per hari WIB. Baseline harian diambil dari mark ekuitas pada tick valid pertama setelah pergantian tanggal WIB; keterlambatan scheduler berarti baseline bukan snapshot tepat pada 00:00. Fee merupakan parameter yang diminta untuk implementasi ini; verifikasi tarif resmi Indodax yang berlaku dan aturan PDF sebelum mengaktifkan bot. Jangan mengubah parameter setelah pembekuan tanpa mencatat dan meminta persetujuan sesuai ketentuan UAS.

PDF menetapkan freeze pada 4 November 2026 pukul 12:00 WIB. Karena implementasi ini dilakukan setelah tanggal tersebut, jangan klaim konfigurasi ini sebagai kode yang telah dibekukan atau sebagai hasil yang sesuai freeze tanpa persetujuan pengajar.

Perbaikan pemeliharaan sesudah freeze (6 November 2026): dashboard menerima ekspor server langsung, menampilkan uptime berdasarkan candle/deadline, menyediakan kontrol kill switch manual, dan menyimpan seluruh depth order book yang diterima. Perubahan ini memperbaiki pencatatan/presentasi dan tidak mengubah aturan sinyal, parameter, atau universe. Catat dan commit perubahan ini sebagai perbaikan bug pasca-freeze sesuai instruksi tugas.

Status kelengkapan data yang tersedia saat ini:

- Ekspor `indodax-dry-run-2026-11-05.json` adalah snapshot runtime forward test; ekspor tersebut tidak berisi backtest historis. Dashboard mengisinya sebagai forward-only dan menandai hasil backtest/kecocokan yang belum tersedia, bukan mengasumsikannya nol.
- Arsip data yang diperiksa tidak menyertakan folder candle `indodax_1jam`; file `indodax_d1h` berisi timestamp harian dan tidak boleh dipakai untuk mengklaim backtest 60 menit. Backtest minimal tiga tahun dan snapshot spread/slippage pra-freeze harus berasal dari data/snapshot Indodax asli yang dapat diaudit.
- Forward test 4–14 November 2026 belum selesai pada saat perbaikan ini. Statistik live saat ini bersifat sementara; jangan menyajikannya sebagai hasil final 10 hari.

Entry baru ditolak jika candle tidak lolos validasi, spread melebihi 2%, volume nol, orderbook kosong, daily loss limit aktif, data valuasi posisi terbuka stale, atau kill switch aktif. Posisi dinilai memakai best bid terbaru. State dan marker candle disimpan atomik sehingga tick ulang tidak menggandakan order simulasi pada candle yang sama.

## Endpoint

- `POST /api/tick` — wajib `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/dashboard` — data dashboard live dan log terbaru.
- `POST /api/control` — wajib `Authorization: Bearer <CONTROL_SECRET>` dengan body `{"enabled":true,"reason":"..."}` atau `{"enabled":false,"reason":"..."}`.

Kill switch dari environment dan Redis digabung dengan logika OR. Mengubah Redis ke `false` tidak dapat menonaktifkan `PROCESS_KILL_SWITCH=true`; ubah environment Vercel dan deploy ulang untuk melepasnya.

Dashboard menyediakan kontrol kill switch manual. Masukkan `CONTROL_SECRET` ke kolom password; browser mengirimkannya hanya ke `/api/control` dan tidak menyimpannya.

## Hitung ulang

Unduh `log server (JSON)` dari dashboard, lalu jalankan:

```powershell
node .\tools\hitung_ulang.js .\indodax-dry-run-export.json
```

Skrip menerima ekspor API Vercel maupun skema UAS dan menghitung return, drawdown, win rate, profit factor, jumlah trade/order, uptime candle tepat waktu, dan porsi fee+spread+slippage dari state/log yang tersedia. Uptime hanya memasukkan deadline candle yang sudah lewat; panggilan berstatus `duplicate` tidak dihitung sebagai pemrosesan. Log server dibatasi untuk menjaga ukuran storage; gunakan `state.stats` untuk statistik kumulatif jika ekspor tidak lengkap. Skrip tidak merekonstruksi data yang tidak ada dan tidak menganggap data sintetis sebagai bukti pasar.

`python .\generate_log.py` hanya membuat `template-log-indodax.json` dengan array kosong. File lama `log-indodax-lengkap.json` sebelumnya dihasilkan dengan nilai acak dan telah dihapus agar tidak disalahartikan sebagai hasil Indodax.

## Batasan operasional

Vercel Cron menjalankan tick harian; Vercel Hobby tidak menyediakan frekuensi per jam. Workflow GitHub Actions dapat menambah tick per jam tetapi memerlukan file workflow di branch default, secret `CRON_SECRET`, dan variable `VERCEL_TICK_URL`. Scheduled jobs dapat tertunda dan bukan layanan real-time. Pastikan koneksi Redis dan riwayat tick dipantau. Dashboard/log bersifat publik tanpa login karena hanya berisi data simulasi dan data pasar publik; endpoint kontrol dan tick tetap memerlukan secret.
