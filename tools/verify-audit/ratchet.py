# ratchet.py — 確認スクリプトの結果を「今 NG でよい項目の一覧」（expected_ng.txt）と比べる。
# 使い方: python3 tools/verify-audit/ratchet.py <ログのフォルダ> [expected_ng.txt]
#   ログのフォルダ: verify_audit_<area>.py の出力（<area>.log）が入ったフォルダ（run_audit.sh の verify-audit/ か、CI で集めたもの）
# 終了コード:
#   0 … 一覧の外の NG がない（壊していない）
#   1 … 一覧の外の NG がある（どこかを壊した）／ログが足りない
# 一覧にあるのに OK になった項目は「直った」として出す（一覧から消す PR を促す。失敗にはしない）。
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
AREAS = ['text', 'parts', 'page', 'ppt1', 'ppt2', 'misc1', 'misc2', 'misc3']

def load_expected(p):
    s = set()
    for ln in open(p, encoding='utf-8'):
        ln = ln.split('#', 1)[0].strip()
        if ln: s.add(ln)
    return s

def main():
    logdir = sys.argv[1]
    exp_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'expected_ng.txt')
    expected = load_expected(exp_path)
    ng, ok, missing = {}, set(), []
    for a in AREAS:
        p = os.path.join(logdir, f'{a}.log')
        if not os.path.exists(p):
            missing.append(a); continue
        txt = open(p, encoding='utf-8', errors='replace').read()
        if not re.search(r'^合計 OK', txt, re.M):
            missing.append(a + '（最後まで走っていない）'); continue
        for m in re.finditer(r'^(OK|NG) ([A-Z]\d+)\b(.*)$', txt, re.M):
            if m.group(1) == 'NG': ng[m.group(2)] = m.group(3).strip()[:140]
            else: ok.add(m.group(2))
    bad = 0
    if missing:
        print('ログが足りない: ' + ', '.join(missing)); bad = 1
    regress = sorted(set(ng) - expected, key=lambda x: (x[0], int(x[1:])))
    fixed = sorted(expected & ok, key=lambda x: (x[0], int(x[1:])))
    if regress:
        print(f'壊した（一覧の外の NG）: {len(regress)}')
        for i in regress: print(f'  NG {i} {ng[i]}')
        bad = 1
    if fixed:
        print(f'直った（expected_ng.txt から消してよい）: {" ".join(fixed)}')
    print(f'NG {len(ng)} / 一覧 {len(expected)} / 壊した {len(regress)} / 直った {len(fixed)}')
    sys.exit(bad)

if __name__ == '__main__':
    main()
