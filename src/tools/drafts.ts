import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ImapService, SmtpService } from "../types.js";
import { buildRfc822Message, buildReplyHeaders } from "../services/imap.js";
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
      inReplyTo: z.string().optional().describe("RFC 5322 Message-ID of the message being replied to, e.g. '<abc@example.com>'. Prefer create_reply_draft, which derives this for you."),
      references: z.array(z.string()).optional().describe("Full Message-ID chain of the conversation, oldest first. Prefer create_reply_draft, which derives this for you."),
    },
    {
      title: "Create Draft",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ to, cc, bcc, subject, body, isHtml, replyTo, inReplyTo, references }) => {
      try {
        const raw = buildRfc822Message(
          { to, cc, bcc, subject, body, isHtml, replyTo, inReplyTo, references },
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
      inReplyTo: z.string().optional().describe("RFC 5322 Message-ID of the message being replied to, e.g. '<abc@example.com>'. Prefer create_reply_draft, which derives this for you."),
      references: z.array(z.string()).optional().describe("Full Message-ID chain of the conversation, oldest first. Prefer create_reply_draft, which derives this for you."),
    },
    {
      title: "Update Draft",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ draftId, to, cc, bcc, subject, body, isHtml, replyTo, inReplyTo, references }) => {
      try {
        const raw = buildRfc822Message(
          { to, cc, bcc, subject, body, isHtml, replyTo, inReplyTo, references },
          username,
        );
        const { uid } = await imap.appendMessage("Drafts", raw, ["\\Draft"]);
        const newDraftId = `Drafts:${uid}`;

        await imap.deleteEmail(draftId);

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
    "create_reply_draft",
    "Create a draft reply to an existing email, threaded correctly. Derives recipients, the Re: subject and the In-Reply-To/References headers from the parent message. Does not send.",
    {
      emailId: z.string().describe("ID of the message being replied to (format: folder:uid)"),
      body: z.string().describe("Reply body content"),
      isHtml: z.boolean().default(false).describe("Whether body is HTML"),
      replyAll: z.boolean().default(false).describe("Include the parent's To and Cc recipients as well as its sender"),
      to: z.string().optional().describe("Override the derived recipients, comma-separated"),
      cc: z.string().optional().describe("Additional CC recipients, comma-separated"),
      bcc: z.string().optional().describe("BCC recipients, comma-separated"),
    },
    {
      title: "Create Reply Draft",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ emailId, body, isHtml, replyAll, to, cc, bcc }) => {
      try {
        const parent = await imap.getEmailById(emailId);
        if (!parent) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: "Parent message not found",
                  emailId,
                }),
              },
            ],
            isError: true,
          };
        }

        const addresses = (list?: { address: string }[]) =>
          (list ?? []).map((a) => a.address).filter(Boolean);

        // Never reply to ourselves: drop our own address from derived recipients.
        const self = username.toLowerCase();
        const dedupe = (list: string[]) =>
          [...new Set(list.map((a) => a.trim()).filter(Boolean))].filter(
            (a) => a.toLowerCase() !== self,
          );

        const derivedTo = dedupe([
          ...addresses(parent.from),
          ...(replyAll ? addresses(parent.to) : []),
        ]);
        const derivedCc = dedupe([
          ...(replyAll ? addresses(parent.cc) : []),
          ...(cc ? cc.split(",") : []),
        ]);

        const recipients = to ?? derivedTo.join(", ");
        if (!recipients) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: "Could not determine a recipient from the parent message",
                  emailId,
                }),
              },
            ],
            isError: true,
          };
        }

        const subject = /^re:/i.test(parent.subject)
          ? parent.subject
          : `Re: ${parent.subject}`;

        const { inReplyTo, references } = buildReplyHeaders(parent);
        if (!inReplyTo) {
          logger.warn(
            `Parent ${emailId} has no Message-ID; reply will group by subject only`,
            "CreateReplyDraft",
          );
        }

        const raw = buildRfc822Message(
          {
            to: recipients,
            cc: derivedCc.length > 0 ? derivedCc.join(", ") : undefined,
            bcc,
            subject,
            body,
            isHtml,
            inReplyTo,
            references,
          },
          username,
        );
        const { uid } = await imap.appendMessage("Drafts", raw, ["\\Draft"]);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  draftId: `Drafts:${uid}`,
                  inReplyToParent: emailId,
                  to: recipients,
                  cc: derivedCc.length > 0 ? derivedCc.join(", ") : undefined,
                  subject,
                  threaded: !!inReplyTo,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to create reply draft", "CreateReplyDraft", err);
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
          bcc: email.bcc?.map((a) => a.address).join(", "),
          subject: email.subject,
          body: email.html ?? email.body ?? "",
          isHtml: !!email.html,
          inReplyTo: email.inReplyTo,
          references: email.references,
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
