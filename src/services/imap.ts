import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { Config } from "../config.js";
import type {
  EmailMessage,
  EmailAddress,
  EmailFolder,
  ImapService,
  SearchCriteria,
  DraftOptions,
} from "../types.js";
import { logger } from "../logger.js";

const stripInlineImages = (html: string) =>
  html.replace(/data:image\/[^;]+;base64,[^"'\s)]+/g, "[inline image removed]");

const MAX_BODY_CHARS = 50_000;
function truncateBody(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text;
  return text.slice(0, MAX_BODY_CHARS) +
    `\n[...truncated: ${text.length - MAX_BODY_CHARS} more chars]`;
}

function toAddressList(
  input: AddressObject | AddressObject[] | undefined,
): EmailAddress[] {
  if (!input) return [];
  const items = Array.isArray(input) ? input : [input];
  return items.flatMap((group) =>
    group.value.map((v) => ({
      name: v.name || undefined,
      address: v.address || "",
    })),
  );
}

function uidToId(uid: number, folder: string): string {
  return `${folder}:${uid}`;
}

function idToUid(id: string): { folder: string; uid: number } {
  const sep = id.lastIndexOf(":");
  if (sep === -1) throw new Error(`Invalid email ID format: ${id}`);
  return { folder: id.slice(0, sep), uid: parseInt(id.slice(sep + 1), 10) };
}

export function buildRfc822Message(
  options: DraftOptions,
  fromAddress: string,
): string {
  const lines: string[] = [];
  lines.push(`From: ${fromAddress}`);
  if (options.to) lines.push(`To: ${options.to}`);
  if (options.cc) lines.push(`Cc: ${options.cc}`);
  if (options.bcc) lines.push(`Bcc: ${options.bcc}`);
  lines.push(`Subject: ${options.subject}`);
  if (options.replyTo) lines.push(`Reply-To: ${options.replyTo}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("MIME-Version: 1.0");
  lines.push(
    options.isHtml
      ? "Content-Type: text/html; charset=utf-8"
      : "Content-Type: text/plain; charset=utf-8",
  );
  lines.push("");
  lines.push(options.body);
  return lines.join("\r\n");
}

export function createImapService(config: Config): ImapService {
  let client: ImapFlow | null = null;
  let connected = false;

  function createClient(): ImapFlow {
    return new ImapFlow({
      host: config.PROTONMAIL_IMAP_HOST,
      port: config.PROTONMAIL_IMAP_PORT,
      secure: config.PROTONMAIL_IMAP_TLS,
      auth: {
        user: config.PROTONMAIL_USERNAME,
        pass: config.PROTONMAIL_PASSWORD,
      },
      logger: false,
      tls: {
        rejectUnauthorized: config.PROTONMAIL_IMAP_HOST !== "127.0.0.1" &&
          config.PROTONMAIL_IMAP_HOST !== "localhost",
      },
    });
  }

  async function ensureConnected(): Promise<ImapFlow> {
    if (client && connected) return client;
    if (client) {
      try {
        await client.logout();
      } catch {
        // ignore cleanup errors
      }
    }
    client = createClient();
    client.on("close", () => {
      connected = false;
      logger.warn("IMAP connection closed", "IMAP");
    });
    client.on("error", (err: Error) => {
      connected = false;
      logger.error("IMAP connection error", "IMAP", err);
    });
    await client.connect();
    connected = true;
    logger.info("IMAP connected", "IMAP");
    return client;
  }

  async function parseFetchedMessage(
    uid: number,
    source: Buffer | Uint8Array,
    folder: string,
    flags?: Set<string>,
  ): Promise<EmailMessage> {
    const parsed = await simpleParser(Buffer.from(source));
    return {
      id: uidToId(uid, folder),
      uid,
      subject: parsed.subject || "(no subject)",
      from: toAddressList(parsed.from),
      to: toAddressList(parsed.to as AddressObject | AddressObject[] | undefined),
      cc: parsed.cc ? toAddressList(parsed.cc as AddressObject | AddressObject[] | undefined) : undefined,
      date: (parsed.date ?? new Date()).toISOString(),
      body: parsed.text ? truncateBody(parsed.text) : undefined,
      html: parsed.html ? truncateBody(stripInlineImages(parsed.html)) : undefined,
      isRead: flags?.has("\\Seen") ?? false,
      isStarred: flags?.has("\\Flagged") ?? false,
      hasAttachments: (parsed.attachments?.length ?? 0) > 0,
      attachments: parsed.attachments?.map((a) => ({
        filename: a.filename || "unnamed",
        contentType: a.contentType,
        size: a.size,
        cid: a.cid || undefined,
      })),
      folder,
      snippet: parsed.text?.slice(0, 200),
    };
  }

  return {
    async connect(): Promise<void> {
      await ensureConnected();
    },

    async disconnect(): Promise<void> {
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore
        }
        client = null;
        connected = false;
        logger.info("IMAP disconnected", "IMAP");
      }
    },

    isConnected(): boolean {
      return connected;
    },

    async getEmails(
      folder: string,
      limit: number,
      offset: number,
    ): Promise<EmailMessage[]> {
      const imap = await ensureConnected();
      const lock = await imap.getMailboxLock(folder);
      try {
        const status = await imap.status(folder, { messages: true });
        const total = status.messages ?? 0;
        if (total === 0) return [];

        const start = Math.max(1, total - offset - limit + 1);
        const end = Math.max(1, total - offset);
        if (start > end) return [];

        const range = `${start}:${end}`;
        const messages: EmailMessage[] = [];

        for await (const msg of imap.fetch(range, {
          source: true,
          uid: true,
          flags: true,
        })) {
          if (!msg.source) continue;
          messages.push(
            await parseFetchedMessage(msg.uid, msg.source, folder, msg.flags),
          );
        }

        return messages.reverse();
      } finally {
        lock.release();
      }
    },

    async getEmailById(emailId: string): Promise<EmailMessage | null> {
      const { folder, uid } = idToUid(emailId);
      const imap = await ensureConnected();
      const lock = await imap.getMailboxLock(folder);
      try {
        const msg = await imap.fetchOne(String(uid), {
          source: true,
          uid: true,
          flags: true,
        }, { uid: true });
        if (!msg || !("source" in msg) || !msg.source) return null;
        return parseFetchedMessage(msg.uid, msg.source, folder, msg.flags);
      } catch (err) {
        logger.warn(`Email not found: ${emailId}`, "IMAP", err);
        return null;
      } finally {
        lock.release();
      }
    },

    async getAttachment(
      emailId: string,
      filename: string,
    ): Promise<{ filename: string; contentType: string; content: string } | null> {
      const { folder, uid } = idToUid(emailId);
      const imap = await ensureConnected();
      const lock = await imap.getMailboxLock(folder);
      try {
        const msg = await imap.fetchOne(String(uid), {
          source: true,
          uid: true,
        }, { uid: true });
        if (!msg || !("source" in msg) || !msg.source) return null;

        const parsed = await simpleParser(Buffer.from(msg.source));
        const attachment = parsed.attachments?.find(
          (a) => (a.filename || "unnamed") === filename,
        );
        if (!attachment) return null;

        return {
          filename: attachment.filename || "unnamed",
          contentType: attachment.contentType,
          content: attachment.content.toString("base64"),
        };
      } catch (err) {
        logger.warn(`Attachment not found: ${emailId}/${filename}`, "IMAP", err);
        return null;
      } finally {
        lock.release();
      }
    },

    async searchEmails(criteria: SearchCriteria): Promise<EmailMessage[]> {
      const imap = await ensureConnected();
      const folder = criteria.folder || "INBOX";
      const lock = await imap.getMailboxLock(folder);
      try {
        const searchQuery: Record<string, unknown> = {};
        if (criteria.from) searchQuery.from = criteria.from;
        if (criteria.to) searchQuery.to = criteria.to;
        if (criteria.subject) searchQuery.subject = criteria.subject;
        if (criteria.query) searchQuery.body = criteria.query;
        if (criteria.isRead === true) searchQuery.seen = true;
        if (criteria.isRead === false) searchQuery.unseen = true;
        if (criteria.isStarred === true) searchQuery.flagged = true;
        if (criteria.dateFrom) searchQuery.since = new Date(criteria.dateFrom);
        if (criteria.dateTo) searchQuery.before = new Date(criteria.dateTo);

        const searchResult = await imap.search(searchQuery, { uid: true });
        const uids = Array.isArray(searchResult) ? searchResult : [];
        const limit = criteria.limit ?? 100;
        const limitedUids = uids.slice(-limit);

        if (limitedUids.length === 0) return [];

        const messages: EmailMessage[] = [];
        const uidRange = limitedUids.join(",");

        for await (const msg of imap.fetch(uidRange, {
          source: true,
          uid: true,
          flags: true,
        }, { uid: true })) {
          if (!msg.source) continue;
          messages.push(
            await parseFetchedMessage(msg.uid, msg.source, folder, msg.flags),
          );

          if (criteria.hasAttachment !== undefined) {
            const last = messages[messages.length - 1];
            if (last.hasAttachments !== criteria.hasAttachment) {
              messages.pop();
            }
          }
        }

        return messages.reverse();
      } finally {
        lock.release();
      }
    },

    async getFolders(): Promise<EmailFolder[]> {
      const imap = await ensureConnected();
      const tree = await imap.listTree();

      async function convert(
        node: typeof tree,
      ): Promise<EmailFolder> {
        let total = 0;
        let unseen = 0;
        try {
          const folderPath = node.path || "";
          if (!folderPath) throw new Error("No path");
          const status = await imap.status(folderPath, {
            messages: true,
            unseen: true,
          });
          total = status.messages ?? 0;
          unseen = status.unseen ?? 0;
        } catch {
          // some folders may not support STATUS
        }

        const children: EmailFolder[] = [];
        if (node.folders) {
          for (const child of node.folders) {
            children.push(await convert(child));
          }
        }

        return {
          name: node.name || "",
          path: node.path || "",
          total,
          unseen,
          delimiter: node.delimiter ?? "/",
          ...(children.length > 0 ? { children } : {}),
        };
      }

      const folders: EmailFolder[] = [];
      if (tree.folders) {
        for (const child of tree.folders) {
          folders.push(await convert(child));
        }
      }
      return folders;
    },

    async setFlags(
      emailId: string,
      flags: { add?: string[]; remove?: string[] },
    ): Promise<void> {
      const { folder, uid } = idToUid(emailId);
      const imap = await ensureConnected();
      const lock = await imap.getMailboxLock(folder);
      try {
        if (flags.add?.length) {
          await imap.messageFlagsAdd(String(uid), flags.add, { uid: true });
        }
        if (flags.remove?.length) {
          await imap.messageFlagsRemove(String(uid), flags.remove, { uid: true });
        }
      } finally {
        lock.release();
      }
    },

    async moveEmail(emailId: string, targetFolder: string): Promise<void> {
      const { folder, uid } = idToUid(emailId);
      const imap = await ensureConnected();
      const lock = await imap.getMailboxLock(folder);
      try {
        await imap.messageMove(String(uid), targetFolder, { uid: true });
        logger.info(`Moved ${emailId} to ${targetFolder}`, "IMAP");
      } finally {
        lock.release();
      }
    },

    async deleteEmail(emailId: string): Promise<void> {
      const { folder, uid } = idToUid(emailId);
      const imap = await ensureConnected();
      const lock = await imap.getMailboxLock(folder);
      try {
        if (folder.toLowerCase() === "trash") {
          await imap.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
          await imap.messageDelete(String(uid), { uid: true });
          logger.info(`Permanently deleted ${emailId}`, "IMAP");
        } else {
          await imap.messageMove(String(uid), "Trash", { uid: true });
          logger.info(`Moved ${emailId} to Trash`, "IMAP");
        }
      } finally {
        lock.release();
      }
    },

    async appendMessage(
      folder: string,
      rawMessage: string | Buffer,
      flags?: string[],
    ): Promise<{ uid: number }> {
      const imap = await ensureConnected();
      const result = await imap.append(folder, rawMessage, flags ?? []);
      if (!result || result.uid == null) {
        throw new Error(`IMAP APPEND to ${folder} failed or server did not return a UID`);
      }
      logger.info(`Appended message to ${folder} (uid: ${result.uid})`, "IMAP");
      return { uid: result.uid };
    },
  };
}
