#!/usr/bin/env bash
set -euo pipefail

audio_base_url="${MAFATEEH_AUDIO_BASE_URL:-https://mafateeh-al-tharwa.alaya-1591.chatgpt.site/audio}"
audio_target_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/audio"
mkdir -p "$audio_target_dir"

for chapter_number in $(seq -w 1 34); do
  target_file="$audio_target_dir/chapter-${chapter_number}.mp3"
  if [[ -s "$target_file" ]]; then
    echo "موجود: chapter-${chapter_number}.mp3"
    continue
  fi
  echo "تنزيل الفصل ${chapter_number}…"
  curl --fail --location --retry 3 \
    "$audio_base_url/chapter-${chapter_number}.mp3" \
    --output "$target_file"
done

echo "اكتملت استعادة ملفات الصوت."
