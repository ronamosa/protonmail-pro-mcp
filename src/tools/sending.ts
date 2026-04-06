import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SmtpService } from "../types.js";
import { logger } from "../logger.js";

export function registerSendingTools(
  server: McpServer,
  smtp: SmtpService,
  username: string,
): void {
  server.tool(
    "send_email",
    "Send an email via ProtonMail SMTP with support for CC, BCC, HTML, priority, and attachments",
    {
      to: z.string().describe("Recipient email address(es), comma-separated"),
      cc: z.string().optional().describe("CC recipients, comma-separated"),
      bcc: z.string().optional().describe("BCC recipients, comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
      isHtml: z.boolean().default(false).describe("Whether body is HTML"),
      priority: z
        .enum(["high", "normal", "low"])
        .default("normal")
        .describe("Email priority"),
      replyTo: z.string().optional().describe("Reply-to email address"),
      attachments: z
        .array(
          z.object({
            filename: z.string(),
            content: z.string().describe("Base64-encoded file content"),
            encoding: z.string().default("base64"),
          }),
        )
        .optional()
        .describe("File attachments"),
    },
    {
      title: "Send Email",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ to, cc, bcc, subject, body, isHtml, priority, replyTo, attachments }) => {
      try {
        const result = await smtp.send({
          to,
          cc,
          bcc,
          subject,
          body,
          isHtml,
          priority,
          replyTo,
          attachments,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  messageId: result.messageId,
                  to,
                  subject,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to send email", "SendEmail", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "send_test_email",
    "Send a quick test email to verify SMTP is working",
    {
      to: z.string().describe("Recipient email address"),
      customMessage: z
        .string()
        .optional()
        .describe("Optional custom message body"),
    },
    {
      title: "Send Test Email",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ to, customMessage }) => {
      try {
        const body =
          customMessage ??
          `This is a test email sent from ProtonMail MCP Server at ${new Date().toISOString()}.\n\nFrom: ${username}`;

        const result = await smtp.send({
          to,
          subject: "ProtonMail MCP - Test Email",
          body,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  messageId: result.messageId,
                  to,
                  message: "Test email sent successfully",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to send test email", "SendTestEmail", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
