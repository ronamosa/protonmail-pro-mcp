import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ImapService } from "../types.js";
import { logger } from "../logger.js";

export function registerFolderTools(
  server: McpServer,
  imap: ImapService,
): void {
  server.tool(
    "get_folders",
    "List all email folders with message counts",
    {},
    {
      title: "Get Folders",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async () => {
      try {
        const folders = await imap.getFolders();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ folders }, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to get folders", "GetFolders", err);
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
    "sync_folders",
    "Force a refresh of the folder list from the IMAP server",
    {},
    {
      title: "Sync Folders",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async () => {
      try {
        const folders = await imap.getFolders();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  folderCount: folders.length,
                  folders: folders.map((f) => ({
                    name: f.name,
                    path: f.path,
                    total: f.total,
                    unseen: f.unseen,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("Failed to sync folders", "SyncFolders", err);
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
