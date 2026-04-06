#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createServer } from "./server.js";

type TransportMode = "stdio" | "http";

function parseArgs(): { transport: TransportMode; port: number } {
  const args = process.argv.slice(2);
  let transport: TransportMode = "stdio";
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--transport" && args[i + 1]) {
      const val = args[i + 1];
      if (val === "stdio" || val === "http") {
        transport = val;
      } else {
        console.error(`Invalid transport: ${val}. Use "stdio" or "http".`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1) {
        console.error(`Invalid port: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    }
  }

  return { transport, port };
}

async function main(): Promise<void> {
  const config = loadConfig();
  logger.init(config.PROTONMAIL_PASSWORD);

  const { transport: transportMode, port: cliPort } = parseArgs();
  const port = cliPort || config.PORT;

  const { mcpServer, smtp, imap, shutdown } = createServer(config);

  // Attempt initial connections (non-fatal if they fail)
  try {
    const smtpOk = await smtp.verify();
    if (smtpOk) logger.info("SMTP connection verified", "Startup");
    else logger.warn("SMTP verification failed -- sending may not work", "Startup");
  } catch (err) {
    logger.warn("SMTP verification failed", "Startup", err);
  }

  try {
    await imap.connect();
    logger.info("IMAP connection established", "Startup");
  } catch (err) {
    logger.warn(
      "IMAP connection failed -- reading features will be limited. Ensure Proton Bridge is running.",
      "Startup",
      err,
    );
  }

  if (transportMode === "http") {
    await startHttpTransport(mcpServer, port, shutdown);
  } else {
    await startStdioTransport(mcpServer, shutdown);
  }
}

async function startStdioTransport(
  mcpServer: InstanceType<typeof import("@modelcontextprotocol/sdk/server/mcp.js").McpServer>,
  shutdown: () => Promise<void>,
): Promise<void> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  logger.info("MCP server started (stdio transport)", "Startup");

  async function gracefulShutdown(): Promise<void> {
    logger.info("Shutting down...", "Shutdown");
    await shutdown();
    await mcpServer.close();
    process.exit(0);
  }

  process.on("SIGINT", () => void gracefulShutdown());
  process.on("SIGTERM", () => void gracefulShutdown());
}

async function startHttpTransport(
  mcpServer: InstanceType<typeof import("@modelcontextprotocol/sdk/server/mcp.js").McpServer>,
  port: number,
  shutdown: () => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);

  app.post("/mcp", async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transport: "http" });
  });

  const server = app.listen(port, () => {
    logger.info(`MCP server started (HTTP transport on port ${port})`, "Startup");
  });

  async function gracefulShutdown(): Promise<void> {
    logger.info("Shutting down...", "Shutdown");
    await shutdown();
    await mcpServer.close();
    server.close();
  }

  process.on("SIGINT", () => void gracefulShutdown());
  process.on("SIGTERM", () => void gracefulShutdown());
}

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", "Fatal", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", "Fatal", reason);
  process.exit(1);
});

main().catch((err) => {
  logger.error("Fatal startup error", "Fatal", err);
  process.exit(1);
});
