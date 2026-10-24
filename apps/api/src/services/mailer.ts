import type { Env } from "../env";

export interface LoginMail {
  to: string;
  code: string;
  link: string;
  expiresMinutes: number;
}

/** メールの送り先の差し替え口（log・memory・resend） */
export interface Mailer {
  sendLogin(mail: LoginMail): Promise<void>;
}

/** 今の実装：ログに出すだけ（wrangler dev の画面にコードとリンクが出る） */
export class LogMailer implements Mailer {
  async sendLogin(m: LoginMail) {
    console.log(`[mail] to=${m.to} code=${m.code} link=${m.link} (有効 ${m.expiresMinutes} 分)`);
  }
}

/** 試験用：送ったものを覚えておく */
export const memoryOutbox: LoginMail[] = [];
export class MemoryMailer implements Mailer {
  async sendLogin(m: LoginMail) {
    memoryOutbox.push(m);
  }
}

/** ログインのメールの文面（日本語・短く）。件名にコードは入れない（スマホの通知・ロック画面に出るので） */
export function loginMailText(m: LoginMail): { subject: string; text: string } {
  return {
    subject: "芦屋みっけ ログインのコード",
    text:
      `芦屋みっけにログインするためのコードです。\n\n` +
      `コード：${m.code}\n\n` +
      `または、次のリンクを開くとログインできます。\n${m.link}\n\n` +
      `コードとリンクは${m.expiresMinutes}分で切れます（1回だけ使えます）。\n` +
      `心当たりが無ければ、このメールは無視してください。\n\n` +
      `芦屋みっけ\n`,
  };
}

/** 送れなかった。message にコード・リンク・API キーは入れない */
export class MailError extends Error {
  constructor(
    public status: number | null,
    public retryable: boolean,
    detail: string,
  ) {
    super(`メールを送れませんでした（${status ?? "つながらない"}）：${detail}`);
  }
}

export const RESEND_URL = "https://api.resend.com/emails";

/**
 * 本物の送信：Resend（https://resend.com/docs/api-reference/emails/send-email）。
 * 429・5xx・つながらないときは 1 回だけやり直す（同じ Idempotency-Key なので 2 通にはならない）。4xx はやり直さない。
 */
export class ResendMailer implements Mailer {
  private fetch: typeof fetch;
  constructor(private o: { apiKey: string; from: string; fetch?: typeof fetch; retryDelayMs?: number }) {
    this.fetch = o.fetch ?? ((...a) => fetch(...a));
  }

  async sendLogin(m: LoginMail) {
    const { subject, text } = loginMailText(m);
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.o.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `mikke-login-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ from: this.o.from, to: [m.to], subject, text }),
    };
    let last: MailError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, this.o.retryDelayMs ?? 500));
      let res: Response;
      try {
        res = await this.fetch(RESEND_URL, init);
      } catch (e) {
        last = new MailError(null, true, String(e).slice(0, 200));
        continue;
      }
      if (res.ok) return;
      const detail = await res
        .text()
        .then((t) => {
          try {
            const j = JSON.parse(t);
            return String(j.message ?? j.name ?? t);
          } catch {
            return t;
          }
        })
        .catch(() => "");
      // 念のため、返ってきた文に宛先のコード・キーが混ざっていても出さない
      const safe = detail.slice(0, 300).split(m.code).join("******").split(this.o.apiKey).join("***");
      last = new MailError(res.status, res.status === 429 || res.status >= 500, safe);
      if (!last.retryable) throw last;
    }
    throw last!;
  }
}

let override: Mailer | null = null;
/** 試験などで差し替える */
export function setMailer(m: Mailer | null) {
  override = m;
}

export function mailerFor(env: Env): Mailer {
  if (override) return override;
  switch (env.MAILER) {
    case "memory":
      return new MemoryMailer();
    case "log":
      return new LogMailer();
    case "resend":
      if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error("MAILER=resend には RESEND_API_KEY と MAIL_FROM が要ります");
      return new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM });
    default:
      // 黙って送らないのは困るので、はっきり失敗させる
      throw new Error(`MAILER=${env.MAILER} はまだ作っていません（log・memory・resend）`);
  }
}
