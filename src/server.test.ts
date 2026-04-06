import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

const TEST_CONFIG = {
  PROTONMAIL_USERNAME: "test@protonmail.com",
  PROTONMAIL_PASSWORD: "test-password",
  PROTONMAIL_SMTP_HOST: "smtp.protonmail.ch",
  PROTONMAIL_SMTP_PORT: 587,
  PROTONMAIL_IMAP_HOST: "127.0.0.1",
  PROTONMAIL_IMAP_PORT: 1143,
  PROTONMAIL_IMAP_TLS: false,
  PORT: 3000,
  DEBUG: false,
} as const;

describe("server tool registration", () => {
  let client: Client;

  beforeAll(async () => {
    const { mcpServer } = createServer(TEST_CONFIG);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await mcpServer.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  it("lists all 12 expected tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name).sort();

    expect(toolNames).toEqual([
      "delete_email",
      "get_connection_status",
      "get_email_by_id",
      "get_emails",
      "get_folders",
      "mark_email_read",
      "move_email",
      "search_emails",
      "send_email",
      "send_test_email",
      "star_email",
      "sync_folders",
    ]);
  });

  it("tools have input schemas defined", async () => {
    const result = await client.listTools();

    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("send_email requires to, subject, body", async () => {
    const result = await client.listTools();
    const sendEmail = result.tools.find((t) => t.name === "send_email");

    expect(sendEmail).toBeDefined();
    expect(sendEmail!.inputSchema.required).toContain("to");
    expect(sendEmail!.inputSchema.required).toContain("subject");
    expect(sendEmail!.inputSchema.required).toContain("body");
  });

  it("delete_email has destructiveHint annotation", async () => {
    const result = await client.listTools();
    const deleteTool = result.tools.find((t) => t.name === "delete_email");

    expect(deleteTool).toBeDefined();
    expect(deleteTool!.annotations?.destructiveHint).toBe(true);
  });

  it("get_emails has readOnlyHint annotation", async () => {
    const result = await client.listTools();
    const getTool = result.tools.find((t) => t.name === "get_emails");

    expect(getTool).toBeDefined();
    expect(getTool!.annotations?.readOnlyHint).toBe(true);
  });
});
