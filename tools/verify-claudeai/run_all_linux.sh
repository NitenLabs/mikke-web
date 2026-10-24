#!/bin/bash
# Claude.ai の環境（Linux・python3）で、verify-claudeai の全スクリプトを1つの試験台に走らせる。
# 使い方: bash tools/verify-claudeai/run_all_linux.sh <single.html の絶対パス> [script ...]
#   script を省くと全部（photo→text の順を守る。playground は最後）。
# 出力: スクリプトごとに OK/NG の数と NG の行。ログは <html と同じ所>/<名前>/verify-linux/
set -u
HTML="${1:?usage: run_all_linux.sh <absolute path to playground_single.html> [script ...]}"
shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$HTML" | sed -E 's/_single\.html$//')"
VDIR="$(dirname "$HTML")/$NAME/verify-linux"
mkdir -p "$VDIR"
S=("$@")
[ ${#S[@]} -eq 0 ] && S=(verify_extra_photo verify_extra_text verify_extra_arrange verify_extra_publish verify_touch verify_extra_save verify_extra_catalog verify_extra_align verify_extra_width verify_playground)
for s in "${S[@]}"; do
  ( cd "$VDIR" && timeout 1500 python3 "$HERE/$s.py" "$HTML" > "$s.log" 2>&1 )
  ec=$?
  ok=$(grep -cE '^OK' "$VDIR/$s.log"); ng=$(grep -cE '^NG ' "$VDIR/$s.log")
  echo "$s: exit=$ec OK=$ok NG=$ng"
  [ "$ng" -gt 0 ] && grep -E '^NG ' "$VDIR/$s.log" | cut -c1-160 | sed 's/^/    /'
done
echo "logs: $VDIR"
