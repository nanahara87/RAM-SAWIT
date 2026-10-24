# RAM Sawit Desktop 2.2.0 — Localhost & Berbagi LAN

RAM Sawit berjalan sebagai aplikasi Windows `.exe` sekaligus server web lokal. Satu komputer menjadi **host**, menyimpan database bersama, dan perangkat lain pada Wi-Fi/LAN yang sama dapat membuka aplikasi melalui browser.

## Fitur versi ini

- Aplikasi desktop membuka `http://127.0.0.1:37851` melalui server localhost bawaan.
- Server mendengarkan pada antarmuka jaringan lokal (`0.0.0.0`) sehingga perangkat lain di jaringan yang sama dapat mengaksesnya.
- Database bersama disimpan di folder data aplikasi Windows, bukan hanya pada localStorage browser.
- Setiap perubahan dari klien browser dikirim ke server lokal; klien memeriksa perubahan bersama setiap 5 detik.
- Transaksi digabung berdasarkan ID dan `updatedAt`; pembaruan lebih baru diprioritaskan. Riwayat snapshot server ditambahkan ke `history.jsonl`, bukan menimpa riwayat audit.
- Penghapusan transaksi disebarkan sebagai tombstone agar catatan yang dihapus tidak muncul lagi saat klien melakukan refresh.
- Google Apps Script tetap tersedia untuk sinkronisasi online yang sudah ada di menu **Sinkron**.

## Build Windows EXE

1. Ekstrak seluruh ZIP ke folder lokal yang bisa ditulis, misalnya `C:\RAM-Sawit-Desktop`.
2. Pasang Node.js LTS Windows x64 dan pastikan `node --version` serta `npm --version` berjalan dari Command Prompt.
3. Jalankan `build-windows.bat`. Proses pertama perlu internet untuk mengunduh Electron dan Electron Builder.
4. Hasil installer dan portable ada di folder `dist`.

## Cara menjalankan dan berbagi

1. Jalankan **RAM Sawit.exe** atau installer yang sudah dibuat. Biarkan aplikasi tetap terbuka pada komputer host.
2. Pada menu aplikasi **File → Tampilkan alamat berbagi LAN**, catat alamat IP yang ditampilkan, misalnya `http://192.168.1.10:37851`.
3. Pastikan ponsel/komputer pengguna lain tersambung ke Wi-Fi atau LAN yang sama dengan host.
4. Buka alamat tersebut pada browser perangkat lain. Semua klien akan menggunakan database bersama di komputer host.
5. Jika alamat tidak dapat dibuka, izinkan aplikasi/port TCP `37851` untuk profil jaringan **Private** pada Windows Firewall. Skrip opsional `Izinkan-RAM-Sawit-LAN.bat` dapat dijalankan sebagai Administrator.

**Catatan penting:**
- Komputer host harus tetap menyala dan aplikasi RAM Sawit tetap berjalan.
- Fitur berbagi LAN hanya untuk jaringan lokal. Ini bukan tautan internet publik. Untuk akses dari luar jaringan, gunakan VPN yang dikelola dengan baik; jangan membuka port ini langsung ke internet karena aplikasi belum memiliki autentikasi pengguna.
- Gunakan satu komputer host utama untuk mencegah beberapa server/database terpisah.
- Buat cadangan JSON dan salin folder data bersama secara berkala. Lokasi data dapat dibuka dari menu **File → Buka folder data bersama**.
- Sinkronisasi lokal dan sinkronisasi Google Apps Script adalah dua layanan berbeda. Akses LAN menggunakan database bersama host; tombol Sinkron tetap berinteraksi dengan Google Apps Script.
- Konflik dengan ID sama memilih versi terbaru berdasarkan `updatedAt`; transaksi dengan ID berbeda tetap dipertahankan. Riwayat snapshot tersimpan di `history.jsonl`.

## Troubleshooting

- **Port 37851 sedang digunakan:** tutup proses RAM Sawit lain atau aplikasi yang memakai port tersebut, kemudian jalankan ulang.
- **Perangkat lain tidak bisa terhubung:** pastikan berada di Wi-Fi yang sama, gunakan alamat IP LAN dari menu File, dan cek Windows Firewall untuk jaringan Private.
- **Tidak ada IP LAN yang ditampilkan:** sambungkan host ke Wi-Fi/Ethernet terlebih dahulu.
- **Build gagal:** baca `build-log.txt` yang dibuat oleh `build-windows.bat`.

## Berkas proyek

- `index.html`: antarmuka aplikasi.
- `main.js`: Electron dan server HTTP localhost/LAN serta API database bersama.
- `package.json`: konfigurasi build Electron.
- `Code.gs`: backend Google Apps Script untuk sinkronisasi spreadsheet online.
- `Template_Spreadsheet_RAM_Sawit.xlsx`: template spreadsheet.

## Build installer otomatis (online)

Workflow GitHub Actions tersedia pada `.github/workflows/build-windows.yml`. Panduan lengkap: `BUILD_EXE_DENGAN_GITHUB.md`. Jika workflow berhasil, file installer Windows akan tersedia pada bagian Artifacts dari run GitHub Actions.
