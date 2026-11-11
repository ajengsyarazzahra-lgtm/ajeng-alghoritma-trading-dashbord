# Panduan snapshot order book Indodax

`tools/collect_snapshots.js` mengambil data publik order book BTCIDR, ETHIDR, dan XRPIDR secara berurutan, maksimal tiga request per detik, tanpa API key dan tanpa membuat order.

## Jalankan sekali

```powershell
node .\tools\collect_snapshots.js --once
```

Setiap pair yang berhasil diukur ditambahkan sebagai satu baris JSON ke `logs/snapshots_laptop.jsonl`. Berkas ini berisi timestamp, bid/ask terbaik, spread, kedalaman 20 level, nilai order simulasi Rp10.000.000, dan slippage terukur terhadap best bid/ask. Snapshot yang dikumpulkan setelah freeze 4 November 2026 tidak dapat dijadikan bukti biaya pra-freeze.

## Penjadwal Windows

Task Scheduler lokal `IndodaxSnapshotUAS` dijadwalkan menjalankan satu putaran setiap jam. Laptop harus menyala dan tidak tidur saat tugas jatuh tempo; koneksi jaringan juga diperlukan. Hasil dan pesan tugas dijadwalkan ditambahkan ke `logs/snapshot_task.log`.

Periksa status:

```powershell
schtasks.exe /Query /TN IndodaxSnapshotUAS /FO LIST /V
```

Untuk menghentikan pengumpulan otomatis:

```powershell
schtasks.exe /Delete /TN IndodaxSnapshotUAS /F
```

Menghapus tugas tidak menghapus snapshot yang sudah terkumpul.

Jalankan pengumpul sekali tanpa penjadwalan memakai perintah pertama. Jangan mengisi atau mengubah baris snapshot dengan angka perkiraan. Skrip ini sengaja tidak membuat snapshot historis.
