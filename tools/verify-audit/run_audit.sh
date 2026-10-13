#!/bin/bash
# 精査で見つかった問題の確認スクリプトを、playground*_single.html に対して全部走らせる。
# 使い方: bash tools/verify-audit/run_audit.sh <single.html の絶対パス> [area ...]
#   area を省くと text parts page と、あれば ppt misc も走らせる。
# 出力: area ごとに OK/NG の数と NG の行。最後に「全体 OK x / NG y」。終了コードは NG の合計（0 なら全部合格）。
# 同時に走らせない（IndexedDB と CPU の取り合いで判定が揺れるため）。
set -u
HTML="${1:?usage: run_audit.sh <absolute path to playground_single.html> [area ...]}"
shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HOME/.venvs/mikke-verify/bin/python"; [ -x "$PY" ] || PY=python3
NAME="$(basename "$HTML" | sed -E 's/_single\.html$//')"
VDIR="$(dirname "$HTML")/$NAME/verify-audit"
mkdir -p "$VDIR"
AREAS=("$@")
if [ ${#AREAS[@]} -eq 0 ]; then
  AREAS=(text parts page)
  [ -f "$HERE/verify_audit_ppt.py" ] && AREAS+=(ppt)
  [ -f "$HERE/verify_audit_misc.py" ] && AREAS+=(misc)
fi
TOK=0; TNG=0
for a in "${AREAS[@]}"; do
  ( cd "$VDIR" && "$PY" "$HERE/verify_audit_$a.py" "$HTML" > "$a.log" 2>&1 )
  ok=$(grep -cE '^OK ' "$VDIR/$a.log"); ng=$(grep -cE '^NG ' "$VDIR/$a.log")
  echo "$a: OK=$ok NG=$ng"
  [ "$ng" -gt 0 ] && grep -E '^NG ' "$VDIR/$a.log" | cut -c1-160 | sed 's/^/    /'
  TOK=$((TOK+ok)); TNG=$((TNG+ng))
done
echo "全体 OK $TOK / NG $TNG   （logs: ${VDIR}）"
exit $TNG
