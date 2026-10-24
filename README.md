# RAM Sawit Desktop 2.2.0 — Localhost & LAN

Aplikasi RAM Sawit untuk Windows dengan server localhost dan berbagi melalui Wi-Fi/LAN.

## Unduh installer Windows

Setelah workflow **Build RAM Sawit Windows Installer** berhasil, unduh installer dari tab **Releases** atau EXE dari **Actions → workflow run → Artifacts**.

Setiap push ke branch `main` dan setiap proses `workflow_dispatch` membangun:
- Installer Windows x64 (NSIS)
- Aplikasi portable Windows x64

## Build otomatis dari GitHub

1. Unggah seluruh isi paket proyek ini ke repositori `nanahara87/RAM-SAWIT` pada branch `main`, termasuk folder tersembunyi `.github/workflows`.
2. Pastikan **Settings → Actions → General → Workflow permissions** mengizinkan workflow menulis ke repository bila pengaturan organisasi meminta persetujuan.
3. Buka tab **Actions**, pilih **Build RAM Sawit Windows Installer**, lalu klik **Run workflow** jika belum berjalan otomatis.
4. Tunggu sampai status hijau. Buka **Releases** untuk mengunduh installer `RAM-Sawit-2.2.0-Setup.exe` atau versi portable.

## Jalankan dari sumber

Memerlukan Node.js 22+ dan koneksi internet untuk pertama kali.

```powershell
npm install
npm start
```

## Berbagi LAN

Jalankan aplikasi pada satu komputer host, lalu pilih menu **File → Tampilkan alamat berbagi LAN**. Buka alamat IP yang ditampilkan dari browser pada perangkat yang berada di jaringan lokal yang sama. Biarkan aplikasi tetap berjalan pada komputer host.

**Keamanan:** server LAN ini ditujukan untuk jaringan tepercaya. Jangan meneruskan port 37851 langsung ke internet; aplikasi saat ini tidak memiliki autentikasi pengguna.

## Data dan sinkronisasi

Database lokal host disimpan di direktori data aplikasi Windows. Sinkronisasi Google Apps Script tetap terpisah dari database bersama LAN. Simpan cadangan secara berkala melalui menu **File → Buka folder data bersama**.
