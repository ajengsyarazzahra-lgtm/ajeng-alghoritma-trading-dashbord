# Log forward test

## Tersedia

- `snapshots_laptop.jsonl`: tiga snapshot order book BTCIDR, ETHIDR, XRPIDR yang diambil manual pada 10 November 2026. Data ini nyata tetapi pasca-freeze, sehingga tidak boleh dipakai untuk mengklaim biaya pasar historis pra-freeze.
- `PANDUAN_SNAPSHOT.md`: cara menjalankan collector dan memeriksa/menghentikan tugas hourly Task Scheduler lokal.
- `LAPORAN_VSCODE.md`: status pekerjaan, pengujian, audit, dan batas bukti.

## Belum tersedia

- `raw_forward_test.json` dan log forward test lengkap 10 hari belum tersedia. Jangan membuat atau mengisi log sintetik.
- `snapshot_task.log` belum diverifikasi pernah dibuat oleh tugas terjadwal; tugas memerlukan laptop menyala dan tidak tidur.
- Snapshot spread/slippage pra-freeze tidak tersedia.

Ekspor log dari `/api/dashboard?full=1` hanya dapat dipakai bila `logExportComplete` bernilai `true` dan rentang waktu yang disyaratkan benar-benar lengkap. Simpan ekspor mentah apa adanya di folder ini setelah periode forward test selesai.
