#!/bin/bash
# 精査で見つかった問題の確認スクリプトを、playground*_single.html に対して全部走らせる。
# 使い方: bash tools/verify-audit/run_audit.sh <single.html の絶対パス> [area ...]
#   area を省くと、下の REQUIRED を全部走らせる。
# 出力: area ごとに OK/NG の数と NG の行。最後に「全体 OK x / NG y」。終了コードは NG の合計（0 なら全部合格）。
# 決まり:
#   - REQUIRED のスクリプトが1本でも無ければ、その area を NG 999 として数える（スクリプトを作らずに合格させない）
#   - スクリプトが途中で落ちて「合計」の行が出なかった area も NG 999
#   - 同時に走らせない（IndexedDB と CPU の取り合いで判定が揺れるため）
set -u
HTML="${1:?usage: run_audit.sh <absolute path to playground_single.html> [area ...]}"
shift || true
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HOME/.venvs/mikke-verify/bin/python"; [ -x "$PY" ] || PY=python3
NAME="$(basename "$HTML" | sed -E 's/_single\.html$//')"
VDIR="$(dirname "$HTML")/$NAME/verify-audit"
mkdir -p "$VDIR"
REQUIRED=(text parts page ppt1 ppt2 misc1 misc2 misc3)
AREAS=("$@")
[ ${#AREAS[@]} -eq 0 ] && AREAS=("${REQUIRED[@]}")
TOK=0; TNG=0
for a in "${AREAS[@]}"; do
  S="$HERE/verify_audit_$a.py"
  if [ ! -f "$S" ]; then
    echo "$a: スクリプトがない（verify_audit_$a.py）→ NG 999"; TNG=$((TNG+999)); continue
  fi
  ( cd "$VDIR" && AUDIT_JOBS=1 "$PY" "$S" "$HTML" > "$a.log" 2>&1 )
  if ! grep -qE '^合計 OK' "$VDIR/$a.log"; then
    echo "$a: 最後まで走らなかった（$VDIR/$a.log）→ NG 999"; tail -5 "$VDIR/$a.log" | sed 's/^/    /'
    TNG=$((TNG+999)); continue
  fi
  ok=$(grep -cE '^OK ' "$VDIR/$a.log"); ng=$(grep -cE '^NG ' "$VDIR/$a.log")
  echo "$a: OK=$ok NG=$ng"
  [ "$ng" -gt 0 ] && grep -E '^NG ' "$VDIR/$a.log" | cut -c1-160 | sed 's/^/    /'
  TOK=$((TOK+ok)); TNG=$((TNG+ng))
done
echo "全体 OK $TOK / NG $TNG   （logs: ${VDIR}）"
[ $TNG -gt 255 ] && exit 255
exit $TNG
