#!/bin/sh
# Solo preparación local. Los modelos y originales no se publican en Git.
set -eu
cd "$(dirname "$0")/.."
SOC_VENV=/tmp/ladra-sosafe-vision-env
if [ ! -x "$SOC_VENV/bin/python" ]; then
  python3 -m venv "$SOC_VENV"
fi
if ! "$SOC_VENV/bin/python" -c 'import ultralytics, PIL' >/dev/null 2>&1; then
  "$SOC_VENV/bin/pip" install --no-cache-dir -r scripts/requirements-sosafe.txt
fi
if [ ! -x /opt/homebrew/bin/tesseract ]; then
  echo 'Falta Tesseract local; no se puede procesar la importación.' >&2
  exit 1
fi
mkdir -p output/sosafe/tessdata
if [ ! -s output/sosafe/tessdata/spa.traineddata ]; then
  curl -fLsS --max-time 60 https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/spa.traineddata -o output/sosafe/tessdata/spa.traineddata
fi
if [ ! -s output/sosafe/tessdata/eng.traineddata ]; then
  cp /opt/homebrew/share/tessdata/eng.traineddata output/sosafe/tessdata/eng.traineddata
fi
