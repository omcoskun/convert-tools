#!/bin/zsh

PROJECT_FOLDER="${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js ve npm bulunamadı. Node.js 22 veya daha yeni bir sürüm kurun."
  echo "https://nodejs.org/"
  read -r "?Kapatmak için Enter tuşuna basın."
  exit 1
fi

cd "$PROJECT_FOLDER" || exit 1

if [[ ! -d node_modules ]]; then
  echo "Paketler hazırlanıyor..."
  npm ci --ignore-scripts || exit 1
fi

echo "Convert başlatılıyor..."
echo "Tarayıcı adresi: http://localhost:3008/"
echo "Durdurmak için Control + C tuşlarına basın."
echo

npm run dev
