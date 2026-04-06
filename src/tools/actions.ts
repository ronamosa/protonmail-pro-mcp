import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ImapService } from "../types.js";
import { logger } from "../logger.js";

export function registerActionTools(
  server: McpServer,
  imap: ImapService,
): void {
  server.tool(
    "mark_email_read",
    "Mark an email as read or unread",
    {
      emailId: z.string().describe("Email ID (format: folder:uid)"),
      isRead: z.boolean().default(true).describe("Set to true for read, false for unread"),
    },
    {
      title: "Mark Email Read/Unread",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ emailId, isRead }) => {
      try {
        if (isRead) {
          await imap.setFlags(emailId, { add: ["\\Seen"] });
        } else {
          await imap.setFlags(emailId, { remove: ["\\Seen"] });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                emailId,
                isRead,
              }),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to set read status", "MarkEmailRead", err);
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
    "star_email",
    "Star or unstar an email",
    {
      emailId: z.string().describe("Email ID (format: folder:uid)"),
      isStarred: z.boolean().default(true).describe("Set to true to star, false to unstar"),
    },
    {
      title: "Star/Unstar Email",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ emailId, isStarred }) => {
      try {
        if (isStarred) {
          await imap.setFlags(emailId, { add: ["\\Flagged"] });
        } else {
          await imap.setFlags(emailId, { remove: ["\\Flagged"] });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                emailId,
                isStarred,
              }),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to set star status", "StarEmail", err);
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
    "move_email",
    "Move an email to a different folder",
    {
      emailId: z.string().describe("Email ID (format: folder:uid)"),
      targetFolder: z.string().describe("Target folder name"),
    },
    {
      title: "Move Email",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ emailId, targetFolder }) => {
      try {
        await imap.moveEmail(emailId, targetFolder);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                emailId,
                targetFolder,
              }),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to move email", "MoveEmail", err);
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
    "delete_email",
    "Delete an email. Moves to Trash first; permanently deletes only if already in Trash.",
    {
      emailId: z.string().describe("Email ID (format: folder:uid)"),
    },
    {
      title: "Delete Email",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    async ({ emailId }) => {
      try {
        await imap.deleteEmail(emailId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                emailId,
                message: "Email deleted (moved to Trash if not already there)",
              }),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to delete email", "DeleteEmail", err);
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
