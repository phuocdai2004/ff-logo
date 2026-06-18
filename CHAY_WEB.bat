@echo off
chcp 65001 >nul
title FF Logo AI Matcher - CHAY WEB
cd /d "%~dp0"

echo ===============================================
echo        FF Logo AI Matcher - 1 CLICK THAT
echo ===============================================
echo.

if not exist "package.json" (
  echo [LOI] Khong thay package.json.
  echo Hay giai nen ZIP truoc, roi chay CHAY_WEB.bat trong thu muc da giai nen.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Node.js hoac CMD chua nhan Node.
  echo Hay cai Node.js, tat cua so nay, roi bam lai CHAY_WEB.bat.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua nhan npm. Hay cai lai Node.js va chon Add to PATH.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo [LAN DAU] Dang cai thu vien. Doi 1-3 phut, chi lam lan dau...
  call npm install
  if errorlevel 1 (
    echo.
    echo [LOI] Cai thu vien that bai. Hay chup man hinh phan loi tren.
    pause
    exit /b 1
  )
)

set "PORT=3000"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="PORT" set "PORT=%%B"
  )
)
if "%PORT%"=="" set "PORT=3000"

echo Dang khoi dong server local...
echo Link web: http://localhost:%PORT%
echo.
echo Neu web khong tu mo sau vai giay, copy link tren dan vao Chrome.
echo KHONG tat cua so nay khi dang dung web.
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start "" "http://localhost:%PORT%""
node server.js

echo.
echo Server da dung.
pause
