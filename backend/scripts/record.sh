#!/usr/bin/env bash
# Record from the default microphone, then run the clip through the pipeline.
#
#   ./scripts/record.sh          # records 10 seconds
#   ./scripts/record.sh 15       # records 15 seconds
set -euo pipefail

SECONDS_TO_RECORD="${1:-10}"
OUT="/tmp/muse-recording-$(date +%s).wav"
cd "$(dirname "$0")/.."

echo ""
echo "  Say something like:"
echo "    বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে,"
echo "    আর হুইল এর নতুন অফার দিছে, পাঁচ টাকা কম"
echo ""
echo "  (Bijoy Store needs 1.5 dozen PRAN Mango Juice,"
echo "   and Wheel has a new offer, 5 taka less)"
echo ""
for i in 3 2 1; do printf "  starting in %s...\r" "$i"; sleep 1; done
printf "  ● RECORDING %ss — speak now          \n" "$SECONDS_TO_RECORD"

ffmpeg -hide_banner -loglevel error -f avfoundation -i ":0" \
  -t "$SECONDS_TO_RECORD" -ar 16000 -ac 1 "$OUT"

echo "  ✓ captured $(du -h "$OUT" | cut -f1)"
echo ""
npx tsx scripts/try-clip.ts "$OUT"
