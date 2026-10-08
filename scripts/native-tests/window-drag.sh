#!/bin/sh
set -eu

PROCESS_NAME="${CHEATLY_PROCESS_NAME:-cheatly}"
before=$(osascript -e "tell application \"System Events\" to tell process \"$PROCESS_NAME\" to get position of window 1")
origin_x=$(printf '%s' "$before" | cut -d, -f1 | tr -d ' ')
origin_y=$(printf '%s' "$before" | cut -d, -f2 | tr -d ' ')
start_x=$((origin_x + 500))
start_y=$((origin_y + 20))
end_x=$((start_x + 120))
end_y=$((start_y + 80))

cliclick "m:${start_x},${start_y}" "dd:${start_x},${start_y}" w:250 "m:${end_x},${end_y}" "du:${end_x},${end_y}"
sleep 1
after=$(osascript -e "tell application \"System Events\" to tell process \"$PROCESS_NAME\" to get position of window 1")

if [ "$before" = "$after" ]; then
  echo "Window did not move: $before" >&2
  exit 1
fi

echo "Window moved: $before -> $after"
