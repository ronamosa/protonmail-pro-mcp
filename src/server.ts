import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { createSmtpService } from "./services/smtp.js";
import { createImapService } from "./services/imap.js";
import { registerSendingTools } from "./tools/sending.js";
import { registerReadingTools } from "./tools/reading.js";
import { registerActionTools } from "./tools/actions.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerDraftTools } from "./tools/drafts.js";
import { registerSystemTools } from "./tools/system.js";
import type { SmtpService, ImapService } from "./types.js";

export interface ProtonMailServer {
  mcpServer: McpServer;
  smtp: SmtpService;
  imap: ImapService;
  shutdown(): Promise<void>;
}

export function createServer(config: Config): ProtonMailServer {
  const mcpServer = new McpServer({
    name: "protonmail-mcp",
    version: "2.0.0",
  });

  const smtp = createSmtpService(config);
  const imap = createImapService(config);

  registerSendingTools(mcpServer, smtp, config.PROTONMAIL_USERNAME);
  registerReadingTools(mcpServer, imap);
  registerActionTools(mcpServer, imap);
  registerFolderTools(mcpServer, imap);
  registerDraftTools(mcpServer, imap, smtp, config.PROTONMAIL_USERNAME);
  registerSystemTools(mcpServer, smtp, imap);

  return {
    mcpServer,
    smtp,
    imap,
    async shutdown() {
      await imap.disconnect();
      await smtp.close();
    },
  };
}
