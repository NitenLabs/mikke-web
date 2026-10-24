// ログインの箱（M3）。ApiStore.open() が、ログインしていないときに編集画面の前に出す。
// メールアドレス → メールに届いた 6 桁のコード → 入る。メールのリンク（/login#t=…）で来たときは verifyLinkToken が入る。
// API の決まり（apps/api/README.md「編集画面からの呼び方」）：申し込み（request）と確かめ（verify）は同じブラウザから
// credentials: "include" で呼ぶ（申し込みの Cookie で突き合わせる）。リンクの合言葉は # の後ろから取り、読んだらすぐ消す。

const CSS = `
#mkLogin{position:fixed;inset:0;z-index:100000;background:#f6f4ef;display:flex;align-items:center;justify-content:center;padding:16px;font:16px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:#222}
#mkLogin .lg-card{width:100%;max-width:380px;background:#fff;border-radius:14px;box-shadow:0 6px 30px rgba(0,0,0,.08);padding:28px 22px}
#mkLogin h1{font-size:20px;margin:0 0 4px}
#mkLogin .lg-sub{font-size:14px;color:#666;margin:0 0 20px}
#mkLogin label{display:block;font-size:14px;font-weight:600;margin:0 0 6px}
#mkLogin input{display:block;width:100%;box-sizing:border-box;font-size:18px;padding:12px;border:1px solid #bbb;border-radius:10px;margin:0 0 14px;background:#fff;color:#222}
#mkLogin input[data-login-code]{letter-spacing:.3em;text-align:center;font-size:24px}
#mkLogin button{display:block;width:100%;font-size:16px;padding:13px;border-radius:10px;border:0;background:#2b5f4a;color:#fff;font-weight:600;cursor:pointer}
#mkLogin button[disabled]{opacity:.5;cursor:default}
#mkLogin .lg-link{background:none;color:#2b5f4a;font-weight:400;padding:8px;margin-top:6px;text-decoration:underline}
#mkLogin .lg-msg{min-height:1.6em;font-size:14px;margin:10px 0 0;color:#b34700}
#mkLogin .lg-msg.ok{color:#2b5f4a}
#mkLogin .lg-note{font-size:13px;color:#666;margin:14px 0 0}
`;

const el = (tag, attrs, text) => { const n = document.createElement(tag); for (const k in attrs || {}) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; };

// エラーの種類 → 店主に分かる言葉（サーバーの日本語の説明があればそれを使う）
function say(e, fallback) {
  if (e && e.network) return "つながりません。インターネットのつながりを確かめて、もう一度お試しください";
  if (e && e.code === "invalid_code") return "コードが違うか、期限が切れています。もう一度確かめるか、メールを送り直してください";
  return (e && e.message && !/^HTTP /.test(e.message)) ? e.message : fallback;
}

/** /login#t=… で来たら、その合言葉で入る（成功しても失敗しても # は消す）。入れたら true */
export async function verifyLinkToken(req) {
  let m = null; try { m = /(?:^#|&)t=([^&]+)/.exec(location.hash || ""); } catch (e) {}
  if (!m) return false;
  const token = decodeURIComponent(m[1]);
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  try { await req("POST", "/api/auth/verify", { json: { token } }); return true; }
  catch (e) { linkError = say(e, "このリンクは使えません。もう一度メールを送ってください"); return false; }
}
let linkError = "";

/**
 * ログインの箱を出し、入れたら解ける Promise
 * @param {object} [opts]  expired: ログインが切れたとき（M3b。言葉を変える）／check: 入れたかを確かめる関数（別のタブでメールのリンクから入ったら閉じる）
 */
export function showLogin(req, opts = {}) {
  return new Promise((resolve) => {
    if (!document.getElementById("mkLoginCss")) { const st = el("style", { id: "mkLoginCss" }); st.textContent = CSS; document.head.appendChild(st); }
    const root = el("div", { id: "mkLogin", role: "dialog", "aria-modal": "true", "aria-labelledby": "mkLoginTitle" });
    const card = el("div", { class: "lg-card" }); root.appendChild(card);
    let email = "", resendAt = 0, timer = null, poll = null;
    if (opts.expired) root.setAttribute("data-login-expired", "1");
    const msg = el("p", { class: "lg-msg", "data-login-msg": "1", "aria-live": "polite" });
    const setMsg = (t, ok) => { msg.textContent = t || ""; msg.classList.toggle("ok", !!ok); };

    function stepEmail() {
      card.innerHTML = "";
      card.appendChild(el("h1", { id: "mkLoginTitle" }, opts.expired ? "ログインが切れました" : "芦屋みっけ ログイン"));
      card.appendChild(el("p", { class: "lg-sub" }, opts.expired
        ? "しばらく使わなかったか、ほかの端末でログアウトしたためです。もう一度ログインしてください。直しかけの内容はこの端末に取ってあるので、ログインすると続きから保存します。"
        : "お店のサイトを直すには、登録したメールアドレスでログインします。パスワードは要りません。"));
      const f = el("form", { novalidate: "" });
      f.appendChild(el("label", { for: "mkLoginEmail" }, "メールアドレス"));
      const inp = el("input", { id: "mkLoginEmail", type: "email", autocomplete: "email", inputmode: "email", "data-login-email": "1", placeholder: "例：shop@example.com" });
      inp.value = email; f.appendChild(inp);
      const btn = el("button", { type: "submit", "data-login-send": "1" }, "ログインのメールを送る"); f.appendChild(btn);
      f.appendChild(msg); card.appendChild(f);
      setMsg(linkError); linkError = "";
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        const v = inp.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setMsg("メールアドレスの形を確かめてください"); inp.focus(); return; }
        btn.disabled = true; setMsg("送っています…", true);
        try { const r = await req("POST", "/api/auth/request", { json: { email: v } }); email = v; resendAt = Date.now() + ((r && r.retryAfter) || 60) * 1000; stepCode(); }
        catch (e) { setMsg(say(e, "メールを送れませんでした。少し待ってからもう一度お試しください")); btn.disabled = false; }
      };
      setTimeout(() => inp.focus(), 0);
    }

    function stepCode() {
      card.innerHTML = "";
      card.appendChild(el("h1", { id: "mkLoginTitle" }, "メールを送りました"));
      card.appendChild(el("p", { class: "lg-sub" }, email + " に届いたメールの 6 桁のコードを入れてください（15 分で使えなくなります）。メールの中のリンクを押しても入れます。"));
      const f = el("form", { novalidate: "" });
      f.appendChild(el("label", { for: "mkLoginCode" }, "6 桁のコード"));
      const inp = el("input", { id: "mkLoginCode", type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]*", "data-login-code": "1" });
      f.appendChild(inp);
      const btn = el("button", { type: "submit", "data-login-enter": "1" }, "入る"); f.appendChild(btn);
      f.appendChild(msg);
      const again = el("button", { type: "button", class: "lg-link", "data-login-resend": "1" }, "メールをもう一度送る");
      const other = el("button", { type: "button", class: "lg-link", "data-login-change": "1" }, "メールアドレスを変える");
      f.appendChild(again); f.appendChild(other);
      f.appendChild(el("p", { class: "lg-note" }, "メールが見つからないときは、迷惑メールのフォルダも見てください。"));
      card.appendChild(f); setMsg("");
      const tick = () => { const s = Math.ceil((resendAt - Date.now()) / 1000); again.disabled = s > 0; again.textContent = s > 0 ? `メールをもう一度送る（あと ${s} 秒）` : "メールをもう一度送る"; if (s <= 0 && timer) { clearInterval(timer); timer = null; } };
      if (timer) clearInterval(timer); timer = setInterval(tick, 1000); tick();
      inp.addEventListener("input", () => { const d = inp.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "").slice(0, 6); if (d !== inp.value) inp.value = d; });
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        const code = inp.value.trim();
        if (!/^\d{6}$/.test(code)) { setMsg("6 桁の数字を入れてください"); inp.focus(); return; }
        btn.disabled = true; setMsg("確かめています…", true);
        try { await req("POST", "/api/auth/verify", { json: { email, code } }); done(); }
        catch (e) { setMsg(say(e, "入れませんでした。もう一度お試しください")); btn.disabled = false; inp.select(); }
      };
      again.onclick = async () => {
        again.disabled = true;
        try { const r = await req("POST", "/api/auth/request", { json: { email } }); resendAt = Date.now() + ((r && r.retryAfter) || 60) * 1000; setMsg("もう一度送りました", true); }
        catch (e) { const ra = e && e.data && e.data.retryAfter; if (ra) resendAt = Date.now() + ra * 1000; setMsg(say(e, "メールを送れませんでした")); }
        tick();
      };
      other.onclick = () => { if (timer) { clearInterval(timer); timer = null; } stepEmail(); };
      setTimeout(() => inp.focus(), 0);
    }

    function done() { if (timer) clearInterval(timer); if (poll) clearInterval(poll); root.remove(); resolve(); }
    if (typeof opts.check === "function") { let busy = false; poll = setInterval(async () => { if (busy) return; busy = true; try { if (await opts.check()) done(); } finally { busy = false; } }, 3000); }
    document.body.appendChild(root);
    stepEmail();
  });
}
