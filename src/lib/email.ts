import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Plain SMTP works with Resend, Postmark, SES, Mailgun… and with Mailpit locally.
// SMTP_URL examples:
//   smtp://127.0.0.1:54325                         (local Mailpit)
//   smtps://resend:re_xxx@smtp.resend.com:465      (Resend)
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  transporter = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transporter;
}

export function isEmailEnabled() {
  return Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM);
}

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const transport = getTransporter();
  if (!transport || !process.env.EMAIL_FROM) return false;
  try {
    await transport.sendMail({ from: process.env.EMAIL_FROM, ...message });
    return true;
  } catch (error) {
    console.error("sendEmail failed", error);
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// We don't know the invitee's language, so the invitation is bilingual.
export function invitationEmail({
  inviter,
  nickname,
  role,
  url,
}: {
  inviter: string;
  nickname: string;
  role: "viewer" | "teacher" | "editor";
  url: string;
}) {
  const roleEn = { viewer: "a viewer", teacher: "a teacher", editor: "an editor" }[role];
  const roleZh = { viewer: "查看者", teacher: "老师", editor: "编辑者" }[role];
  const who = inviter || "Someone";
  const subject = `${who} invited you to ${nickname}'s journal on Sprout / ${who} 邀请你查看 ${nickname} 的成长记录`;
  const text = [
    `${who} invited you to join ${nickname}'s private growth journal on Sprout as ${roleEn}.`,
    `Accept the invitation: ${url}`,
    "The link works only for this email address and expires in 14 days.",
    "",
    `${who} 邀请你以${roleZh}身份加入 Sprout 上 ${nickname} 的私密成长记录。`,
    `接受邀请：${url}`,
    "此链接仅对本邮箱地址有效，14 天后过期。",
  ].join("\n");
  const e = escapeHtml;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2421;background:#fbfaf7;padding:24px">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e6e3dc;border-radius:16px;padding:24px">
<p style="font-size:20px;margin:0 0 16px">🌱 Sprout</p>
<p>${e(who)} invited you to join <strong>${e(nickname)}</strong>'s private growth journal as ${roleEn}.</p>
<p>${e(who)} 邀请你以${roleZh}身份加入 <strong>${e(nickname)}</strong> 的私密成长记录。</p>
<p style="margin:24px 0"><a href="${e(url)}" style="background:#2f855a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Accept invitation · 接受邀请</a></p>
<p style="font-size:12px;color:#6b726d">The link works only for this email address and expires in 14 days.<br>此链接仅对本邮箱地址有效，14 天后过期。</p>
</div></body></html>`;
  return { subject, text, html };
}
