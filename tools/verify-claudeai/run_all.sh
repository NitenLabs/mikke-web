#!/bin/bash
# Claude.ai の確認スクリプト6本を、この Mac で playground*_single.html に対して走らせる。
# 使い方: bash tools/verify-claudeai/run_all.sh <single.html の絶対パス>
# 決まり（CLAUDE_CODE_TODO.md その1）：同時に2本走らせない／photo を text より先に／playground は最後（8〜9分）。
set -u
HTML="${1:?usage: run_all.sh <absolute path to playground_single.html>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HOME/.venvs/mikke-verify/bin/python"
# ログ先：HTML と同じ所の playground<NN>/verify（無ければ html と同じディレクトリの verify）
NAME="$(basename "$HTML" | sed -E 's/_single\.html$//')"
VDIR="$(dirname "$HTML")/$NAME/verify"
mkdir -p "$VDIR"
run() {
  local s="$1"
  "$PY" "$HERE/$s.py" "$HTML" > "$VDIR/$s.log" 2>&1
  local ec=$?
  local ok ng
  ok=$(grep -cE '^OK' "$VDIR/$s.log")
  # 不合格＝行頭 "NG " の実テスト（"NG: []" の空サマリは除く）
  ng=$(grep -cE '^NG ' "$VDIR/$s.log")
  local tot
  tot=$(grep -oE '合計 [0-9]+ / [0-9]+' "$VDIR/$s.log" | tail -1)
  echo "$s: exit=$ec  OK=$ok  NG=$ng  ${tot}"
  if [ "$ng" -gt 0 ]; then grep -E '^NG ' "$VDIR/$s.log" | sed 's/^/    /'; fi
}
# 軽い5本（photo→text の順を守る）
for s in verify_extra_photo verify_extra_text verify_extra_arrange verify_extra_publish verify_touch; do run "$s"; done
# 重い1本（最後）
run verify_playground
echo "logs: $VDIR"
