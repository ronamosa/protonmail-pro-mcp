import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { Config } from "../config.js";
import type { SendEmailOptions, SmtpService } from "../types.js";
import { logger } from "../logger.js";

export function createSmtpService(config: Config): SmtpService {
  let transporter: Transporter | null = null;

  function getTransporter(): Transporter {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.PROTONMAIL_SMTP_HOST,
        port: config.PROTONMAIL_SMTP_PORT,
        secure: config.PROTONMAIL_SMTP_PORT === 465,
        auth: {
          user: config.PROTONMAIL_USERNAME,
          pass: config.PROTONMAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: config.PROTONMAIL_SMTP_HOST !== "127.0.0.1" &&
            config.PROTONMAIL_SMTP_HOST !== "localhost",
        },
      });
    }
    return transporter;
  }

  return {
    async verify(): Promise<boolean> {
      try {
        await getTransporter().verify();
        logger.info("SMTP connection verified", "SMTP");
        return true;
      } catch (err) {
        logger.warn("SMTP verification failed", "SMTP", err);
        return false;
      }
    },

    async send(options: SendEmailOptions): Promise<{ messageId: string }> {
      const priorityMap: Record<string, string> = {
        high: "high",
        normal: "normal",
        low: "low",
      };

      const mailOptions: nodemailer.SendMailOptions = {
        from: config.PROTONMAIL_USERNAME,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        replyTo: options.replyTo,
        priority: priorityMap[options.priority ?? "normal"] as
          | "high"
          | "normal"
          | "low",
        ...(options.isHtml
          ? { html: options.body }
          : { text: options.body }),
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          encoding: (a.encoding ?? "base64") as "base64",
        })),
      };

      const result = await getTransporter().sendMail(mailOptions);
      logger.info(`Email sent: ${result.messageId}`, "SMTP");
      return { messageId: result.messageId };
    },

    async close(): Promise<void> {
      if (transporter) {
        transporter.close();
        transporter = null;
        logger.info("SMTP transport closed", "SMTP");
      }
    },
  };
}
