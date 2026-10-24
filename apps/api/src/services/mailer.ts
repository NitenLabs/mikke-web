import type { Env } from "../env";

export interface LoginMail {
  to: string;
  code: string;
  link: string;
  expiresMinutes: number;
}

/** メールの送り先の差し替え口。本物（Resend）は後で足す */
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

export function loginMailText(m: LoginMail): { subject: string; text: string } {
  return {
    subject: `芦屋みっけ ログインのコード ${m.code}`,
    text:
      `ログインのコード：${m.code}\n\n` +
      `または、次のリンクを開いてください（${m.expiresMinutes} 分のあいだ、1回だけ使えます）。\n${m.link}\n\n` +
      `このメールに覚えがなければ、何もしないでください。`,
  };
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
    default:
      // resend などはまだない。黙って送らないのは困るので、はっきり失敗させる
      throw new Error(`MAILER=${env.MAILER} はまだ作っていません（log か memory）`);
  }
}
