#!/bin/bash
# Setup script for WhisperTranscriber

echo "🚀 Setting up WhisperTranscriber..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.12 or higher."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20 or higher."
    exit 1
fi

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg is not installed. Installing..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get update && sudo apt-get install -y ffmpeg
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install ffmpeg
    else
        echo "❌ Please install ffmpeg manually: https://ffmpeg.org/download.html"
        exit 1
    fi
fi

echo "✅ All prerequisites installed"

# Setup backend
echo "📦 Setting up backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file
if [ ! -f .env ]; then
    echo "🔐 Creating .env file..."
    cp .env.example .env
    ENCRYPTION_KEY=$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
    echo "✅ .env file created"
fi

cd ..

# Setup frontend
echo "📦 Setting up frontend..."
cd frontend
npm install

# Create .env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Frontend .env file created"
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  1. Start backend: cd backend && source venv/bin/activate && python run.py"
echo "  2. Start frontend: cd frontend && npm run dev"
echo ""
echo "Or use Docker: docker-compose up -d"
