import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ImapService, SmtpService } from "../types.js";
import { buildRfc822Message } from "../services/imap.js";
import { logger } from "../logger.js";

export function registerDraftTools(
  server: McpServer,
  imap: ImapService,
  smtp: SmtpService,
  username: string,
): void {
  server.tool(
    "create_draft",
    "Create a new draft email in the Drafts folder",
    {
      to: z.string().optional().describe("Recipient email address(es), comma-separated"),
      cc: z.string().optional().describe("CC recipients, comma-separated"),
      bcc: z.string().optional().describe("BCC recipients, comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
      isHtml: z.boolean().default(false).describe("Whether body is HTML"),
      replyTo: z.string().optional().describe("Reply-to email address"),
    },
    {
      title: "Create Draft",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ to, cc, bcc, subject, body, isHtml, replyTo }) => {
      try {
        const raw = buildRfc822Message(
          { to, cc, bcc, subject, body, isHtml, replyTo },
          username,
        );
        const { uid } = await imap.appendMessage("Drafts", raw, ["\\Draft"]);
        const draftId = `Drafts:${uid}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, draftId, subject },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to create draft", "CreateDraft", err);
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
    "update_draft",
    "Update an existing draft by replacing it with new content",
    {
      draftId: z.string().describe("Draft ID to update (format: Drafts:uid)"),
      to: z.string().optional().describe("Recipient email address(es), comma-separated"),
      cc: z.string().optional().describe("CC recipients, comma-separated"),
      bcc: z.string().optional().describe("BCC recipients, comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
      isHtml: z.boolean().default(false).describe("Whether body is HTML"),
      replyTo: z.string().optional().describe("Reply-to email address"),
    },
    {
      title: "Update Draft",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ draftId, to, cc, bcc, subject, body, isHtml, replyTo }) => {
      try {
        await imap.deleteEmail(draftId);

        const raw = buildRfc822Message(
          { to, cc, bcc, subject, body, isHtml, replyTo },
          username,
        );
        const { uid } = await imap.appendMessage("Drafts", raw, ["\\Draft"]);
        const newDraftId = `Drafts:${uid}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  previousDraftId: draftId,
                  draftId: newDraftId,
                  subject,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to update draft", "UpdateDraft", err);
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
    "delete_draft",
    "Delete a draft email",
    {
      draftId: z.string().describe("Draft ID to delete (format: Drafts:uid)"),
    },
    {
      title: "Delete Draft",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    async ({ draftId }) => {
      try {
        await imap.deleteEmail(draftId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, draftId }),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to delete draft", "DeleteDraft", err);
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
    "send_draft",
    "Send an existing draft via SMTP and remove it from Drafts",
    {
      draftId: z.string().describe("Draft ID to send (format: Drafts:uid)"),
    },
    {
      title: "Send Draft",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ draftId }) => {
      try {
        const email = await imap.getEmailById(draftId);
        if (!email) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: "Draft not found",
                  draftId,
                }),
              },
            ],
            isError: true,
          };
        }

        const to = email.to.map((a) => a.address).join(", ");
        if (!to) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: "Draft has no recipients",
                  draftId,
                }),
              },
            ],
            isError: true,
          };
        }

        const result = await smtp.send({
          to,
          cc: email.cc?.map((a) => a.address).join(", "),
          subject: email.subject,
          body: email.html ?? email.body ?? "",
          isHtml: !!email.html,
        });

        await imap.deleteEmail(draftId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  messageId: result.messageId,
                  to,
                  subject: email.subject,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to send draft", "SendDraft", err);
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
