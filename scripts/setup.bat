@echo off
REM Setup script for WhisperTranscriber (Windows)

echo Setting up WhisperTranscriber...

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python 3.12 or higher.
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed. Please install Node.js 20 or higher.
    exit /b 1
)

REM Check if ffmpeg is installed
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo ffmpeg is not installed. Please install ffmpeg from https://ffmpeg.org/download.html
    exit /b 1
)

echo All prerequisites installed

REM Setup backend
echo Setting up backend...
cd backend
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt

REM Create .env file
if not exist .env (
    echo Creating .env file...
    copy .env.example .env
    python -c "from cryptography.fernet import Fernet; print(f'ENCRYPTION_KEY={Fernet.generate_key().decode()}')" >> .env
    echo .env file created
)

cd ..

REM Setup frontend
echo Setting up frontend...
cd frontend
npm install

REM Create .env file
if not exist .env (
    copy .env.example .env
    echo Frontend .env file created
)

cd ..

echo.
echo Setup complete!
echo.
echo To start the application:
echo   1. Start backend: cd backend ^&^& venv\Scripts\activate ^&^& python run.py
echo   2. Start frontend: cd frontend ^&^& npm run dev
echo.
echo Or use Docker: docker-compose up -d
