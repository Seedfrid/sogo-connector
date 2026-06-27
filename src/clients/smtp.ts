/**
 * SMTP client built on Nodemailer for sending mail through SOGo's MTA.
 */
import nodemailer from 'nodemailer';
import type { SogoConfig } from '../config.js';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  html?: boolean;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export async function sendEmail(
  config: SogoConfig,
  params: SendEmailParams
): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.username, pass: config.password },
    tls: { rejectUnauthorized: !config.allowInsecureTls },
  });

  const message: nodemailer.SendMailOptions = {
    from: config.fromAddress,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
  };
  if (params.html) {
    message.html = params.body;
  } else {
    message.text = params.body;
  }

  const info = await transporter.sendMail(message);
  return {
    messageId: info.messageId,
    accepted: (info.accepted || []).map(String),
    rejected: (info.rejected || []).map(String),
  };
}
