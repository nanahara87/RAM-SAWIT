@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
set "LOG=%~dp0build-log.txt"
set "NODE_ARCH="

echo ================================================================
echo             PEMBUAT APLIKASI WINDOWS - RAM SAWIT
echo ================================================================
echo.
echo Folder kerja: %CD%
echo Log proses : %LOG%
echo.

>"%LOG%" echo RAM Sawit Windows Build Log
echo Tanggal: %DATE% %TIME%>>"%LOG%"
echo Folder: %CD%>>"%LOG%"
echo.>>"%LOG%"

rem Pastikan paket diekstrak lengkap dan skrip dijalankan dari folder proyek.
for %%F in (package.json main.js index.html) do (
  if not exist "%%F" (
    echo [GAGAL] File wajib tidak ditemukan: %%F
    echo Ekstrak ulang seluruh isi ZIP, lalu jalankan build-windows.bat dari folder RAM-Sawit-Desktop.
    echo File wajib tidak ditemukan: %%F>>"%LOG%"
    goto :failed
  )
)
if not exist "assets\ram-sawit.ico" (
  echo [GAGAL] File ikon assets\ram-sawit.ico tidak ditemukan.
  echo File ikon tidak ditemukan.>>"%LOG%"
  goto :failed
)

where node >nul 2>&1
if errorlevel 1 (
  echo [GAGAL] Perintah node tidak ditemukan oleh CMD.
  echo Node tidak ditemukan. Periksa PATH lalu tutup dan buka kembali CMD.>>"%LOG%"
  goto :failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [GAGAL] npm.cmd tidak ditemukan oleh CMD.
  echo npm.cmd tidak ditemukan. Pasang ulang Node.js LTS dengan opsi menambahkan PATH.>>"%LOG%"
  goto :failed
)

echo [INFO] Versi Node.js:
node --version
echo [INFO] Versi npm:
call npm.cmd --version
for /f "delims=" %%A in ('node -p "process.arch"') do set "NODE_ARCH=%%A"
echo [INFO] Arsitektur Node.js: %NODE_ARCH%
node --version>>"%LOG%" 2>&1
call npm.cmd --version>>"%LOG%" 2>&1
echo Arsitektur Node.js: %NODE_ARCH%>>"%LOG%"
if /I not "%NODE_ARCH%"=="x64" goto :wrong_arch

echo.
echo [1/2] Memasang paket yang dibutuhkan...
echo Langkah ini membutuhkan koneksi internet dan dapat memerlukan waktu.
echo Menjalankan npm install...>>"%LOG%"
call npm.cmd install --no-audit --no-fund --fetch-retries=3 --fetch-timeout=120000 >>"%LOG%" 2>&1
if errorlevel 1 goto :install_failed

if not exist "node_modules\electron\dist\electron.exe" (
  echo [PERINGATAN] Electron belum ditemukan di node_modules.>>"%LOG%"
  echo [GAGAL] Electron tidak terpasang dengan lengkap.
  goto :failed
)

echo.
echo [2/2] Membuat installer dan aplikasi portable Windows x64...
echo Menjalankan npm run dist:win...>>"%LOG%"
call npm.cmd run dist:win >>"%LOG%" 2>&1
if errorlevel 1 goto :build_failed

if not exist "dist" (
  echo [GAGAL] Folder dist tidak ditemukan setelah proses build.
  echo Folder dist tidak ditemukan.>>"%LOG%"
  goto :failed
)

echo.
echo [BERHASIL] Build selesai.
echo Hasil build ada di: %~dp0dist
echo Log lengkap ada di: %LOG%
echo.
start "" explorer "%~dp0dist"
pause
exit /b 0

:wrong_arch
echo.
echo [GAGAL] Node.js yang terpasang bukan versi x64.
echo Paket ini membangun aplikasi Windows x64. Instal Node.js LTS versi Windows x64, buka CMD baru, lalu jalankan ulang.
echo Arsitektur Node.js bukan x64.>>"%LOG%"
goto :failed

:install_failed
echo.
echo [GAGAL] npm install tidak berhasil. Berikut bagian akhir log:
echo ---------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%LOG%' -Tail 45"
echo ---------------------------------------------------------------
echo Penyebab umum: koneksi internet/proxy memblokir unduhan npm atau Electron, antivirus mengarantina unduhan, atau folder tidak memiliki izin tulis.
echo Log lengkap disimpan di %LOG%
goto :failed

:build_failed
echo.
echo [GAGAL] Proses pembuatan EXE gagal. Berikut bagian akhir log:
echo ---------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%LOG%' -Tail 60"
echo ---------------------------------------------------------------
echo Log lengkap disimpan di %LOG%
goto :failed

:failed
echo.
echo Build belum berhasil. Jangan hapus build-log.txt; file ini membantu mengetahui penyebab kegagalan.
echo Lokasi log: %LOG%
echo Pastikan seluruh ZIP sudah diekstrak ke folder lokal yang bisa ditulis, misalnya C:\RAM-Sawit-Desktop.
pause
exit /b 1
