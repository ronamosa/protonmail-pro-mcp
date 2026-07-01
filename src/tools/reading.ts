import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ImapService } from "../types.js";
import { logger } from "../logger.js";

export function registerReadingTools(
  server: McpServer,
  imap: ImapService,
): void {
  server.tool(
    "get_emails",
    "Fetch emails from a folder with pagination",
    {
      folder: z.string().default("INBOX").describe("Folder name"),
      limit: z.number().int().min(1).max(500).default(20).describe("Number of emails to fetch"),
      offset: z.number().int().min(0).default(0).describe("Pagination offset"),
    },
    {
      title: "Get Emails",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ folder, limit, offset }) => {
      try {
        const emails = await imap.getEmails(folder, limit, offset);
        const summary = emails.map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.from.map((a) => a.address).join(", "),
          date: e.date,
          isRead: e.isRead,
          isStarred: e.isStarred,
          hasAttachments: e.hasAttachments,
          snippet: e.snippet,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { folder, count: emails.length, offset, emails: summary },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to get emails", "GetEmails", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
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
    "get_email_by_id",
    "Get a specific email by its ID with full body and headers",
    {
      emailId: z.string().describe("Email ID (format: folder:uid)"),
      format: z.enum(["text", "html", "raw"]).default("text")
        .describe("Body format: text (default), html, or raw (both)"),
      includeBody: z.boolean().default(true)
        .describe("Include email body (set false for headers/metadata only)"),
    },
    {
      title: "Get Email by ID",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ emailId, format, includeBody }) => {
      try {
        const email = await imap.getEmailById(emailId);
        if (!email) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Email not found", emailId }),
              },
            ],
            isError: true,
          };
        }

        const result = { ...email };
        if (!includeBody) {
          delete result.body;
          delete result.html;
          delete result.snippet;
        } else if (format === "text") {
          delete result.html;
        } else if (format === "html") {
          delete result.body;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to get email", "GetEmailById", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
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
    "get_attachment",
    "Download a specific attachment from an email",
    {
      emailId: z.string().describe("Email ID (format: folder:uid)"),
      filename: z.string().describe("Attachment filename to retrieve"),
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "0-based attachment index from get_email_by_id; required when filename is duplicated",
        ),
    },
    {
      title: "Get Attachment",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ emailId, filename, index }) => {
      try {
        const result = await imap.getAttachment(emailId, filename, index);
        if (!result) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Attachment not found",
                  emailId,
                  filename,
                  index,
                }),
              },
            ],
            isError: true,
          };
        }

        if ("error" in result) {
          if (result.error === "ambiguous") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "ambiguous_filename",
                    filename: result.filename,
                    candidates: result.candidates,
                  }),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "index_filename_mismatch",
                  index: result.index,
                  filename: result.filename,
                  actualFilename: result.actualFilename,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to get attachment", "GetAttachment", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
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
    "search_emails",
    "Search emails with advanced filters across from, to, subject, dates, and flags",
    {
      query: z.string().optional().describe("Full-text search query"),
      folder: z.string().default("INBOX").describe("Folder to search in"),
      from: z.string().optional().describe("Filter by sender"),
      to: z.string().optional().describe("Filter by recipient"),
      subject: z.string().optional().describe("Filter by subject"),
      hasAttachment: z.boolean().optional().describe("Filter by attachment presence"),
      isRead: z.boolean().optional().describe("Filter by read status"),
      isStarred: z.boolean().optional().describe("Filter starred emails"),
      dateFrom: z.string().optional().describe("Start date (ISO format)"),
      dateTo: z.string().optional().describe("End date (ISO format)"),
      limit: z.number().int().min(1).max(500).default(50).describe("Max results"),
    },
    {
      title: "Search Emails",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async (criteria) => {
      try {
        const emails = await imap.searchEmails(criteria);
        const summary = emails.map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.from.map((a) => a.address).join(", "),
          date: e.date,
          isRead: e.isRead,
          isStarred: e.isStarred,
          hasAttachments: e.hasAttachments,
          snippet: e.snippet,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { folder: criteria.folder, count: emails.length, results: summary },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to search emails", "SearchEmails", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
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
