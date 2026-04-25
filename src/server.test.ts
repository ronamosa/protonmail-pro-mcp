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

  it("lists all 17 expected tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name).sort();

    expect(toolNames).toEqual([
      "create_draft",
      "delete_draft",
      "delete_email",
      "get_attachment",
      "get_connection_status",
      "get_email_by_id",
      "get_emails",
      "get_folders",
      "mark_email_read",
      "move_email",
      "search_emails",
      "send_draft",
      "send_email",
      "send_test_email",
      "star_email",
      "sync_folders",
      "update_draft",
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

  it("get_email_by_id has format and includeBody parameters", async () => {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === "get_email_by_id");

    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties as Record<string, { type?: string; enum?: string[] }>;
    expect(props.format).toBeDefined();
    expect(props.format.enum).toEqual(["text", "html", "raw"]);
    expect(props.includeBody).toBeDefined();
    expect(props.includeBody.type).toBe("boolean");
  });

  it("get_attachment requires emailId and filename", async () => {
    const result = await client.listTools();
    const tool = result.tools.find((t) => t.name === "get_attachment");

    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toContain("emailId");
    expect(tool!.inputSchema.required).toContain("filename");
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it("get_emails has readOnlyHint annotation", async () => {
    const result = await client.listTools();
    const getTool = result.tools.find((t) => t.name === "get_emails");

    expect(getTool).toBeDefined();
    expect(getTool!.annotations?.readOnlyHint).toBe(true);
  });
});
