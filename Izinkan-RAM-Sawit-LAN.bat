@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Skrip ini memerlukan hak Administrator.
  echo Klik kanan file ini lalu pilih "Run as administrator".
  pause
  exit /b 1
)
netsh advfirewall firewall add rule name="RAM Sawit Local Network TCP 37851" dir=in action=allow protocol=TCP localport=37851 profile=private
if %errorlevel% equ 0 (
  echo Aturan firewall untuk jaringan Private berhasil ditambahkan.
) else (
  echo Gagal menambahkan aturan firewall. Periksa kebijakan keamanan Windows.
)
pause
