import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SmtpService, ImapService } from "../types.js";
import { logger } from "../logger.js";

export function registerSystemTools(
  server: McpServer,
  smtp: SmtpService,
  imap: ImapService,
): void {
  server.tool(
    "get_connection_status",
    "Check the current SMTP and IMAP connection status",
    {},
    {
      title: "Connection Status",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async () => {
      try {
        const smtpOk = await smtp.verify();
        const imapOk = imap.isConnected();

        // If IMAP is not connected, try to connect
        let imapStatus = imapOk;
        let imapError: string | undefined;
        if (!imapOk) {
          try {
            await imap.connect();
            imapStatus = true;
          } catch (err) {
            imapError =
              err instanceof Error ? err.message : String(err);
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  smtp: { connected: smtpOk },
                  imap: {
                    connected: imapStatus,
                    ...(imapError ? { error: imapError } : {}),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to check status", "ConnectionStatus", err);
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
