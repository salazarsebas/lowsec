#!/usr/bin/env bash
# Mux Sebastián's voiceover (any format ffmpeg reads: wav, m4a, mp3, ogg, webm…) onto the silent cut,
# with two-pass EBU R128 loudness normalisation to -16 LUFS / -1.5 dBTP (YouTube/X friendly).
# Usage: demo/mux.sh path/to/voiceover.ext [offset_seconds]   ->  demo/lowsec-demo.mp4
set -euo pipefail
cd "$(dirname "$0")"
IN="${1:?usage: demo/mux.sh voiceover.(wav|m4a|mp3|...) [offset_seconds]}"
OFFSET="${2:-0}"
VIDEO=lowsec-demo-silent.mp4
OUT=lowsec-demo.mp4
# pass 1: measure
STATS=$(ffmpeg -hide_banner -nostats -i "$IN" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$STATS" | sed -n "s/.*\"$1\" : \"\(.*\)\".*/\1/p"; }
LN="loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true"
# pass 2: normalise, light high-pass, delay by OFFSET, pad/trim to the video length
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
DELAY_MS=$(awk "BEGIN{printf \"%d\", $OFFSET*1000}")
ffmpeg -hide_banner -loglevel warning -stats -y -i "$VIDEO" -i "$IN" \
  -filter_complex "[1:a]highpass=f=80,${LN},aresample=48000,adelay=${DELAY_MS}|${DELAY_MS},apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -t "$DUR" -movflags +faststart "$OUT"
echo "wrote demo/$OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT") s)"
# check: ffmpeg -i demo/lowsec-demo.mp4 -af ebur128=framelog=quiet -f null - 2>&1 | tail -12
