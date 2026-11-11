// apps/api の呼び方（README「編集画面からの呼び方」）。同じオリジン（/api は dev/serve.mjs が中継）。
export class ApiError extends Error {
  constructor(status, data) { super(data?.message || `api ${status}`); this.status = status; this.data = data; }
}

export async function api(path, { method = "GET", body, ifMatch, raw } = {}) {
  const headers = {};
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (ifMatch != null) headers["If-Match"] = `"${ifMatch}"`;
  const r = await fetch(path, { method, headers, credentials: "include", body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  if (raw) return r;
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}

/** 店主向けの短い言葉（エラーの種類から） */
export function sayError(e) {
  const s = e?.status, k = e?.data?.error;
  if (s === 401) return "ログインが切れました。もう一度入ってください";
  if (s === 409) return "ほかの所で直されました";
  if (k === "too_soon" || s === 429) return "少し時間をおいてから、もう一度お試しください";
  if (s === 413) return "大きすぎて送れませんでした";
  if (s === 415 || k === "not_an_image") return "この写真は使えませんでした。別の写真をお選びください";
  if (!s) return "つながりませんでした。電波の良い所でもう一度お試しください";
  return "うまくいきませんでした。もう一度お試しください";
}
