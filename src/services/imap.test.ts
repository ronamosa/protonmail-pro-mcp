import { describe, it, expect } from "vitest";
import {
  buildRfc822Message,
  buildReplyHeaders,
  generateMessageId,
  normaliseReferences,
} from "./imap.js";

const FROM = "ron@theuncommon.ai";

function headers(raw: string): string {
  return raw.split("\r\n\r\n")[0];
}

describe("normaliseReferences", () => {
  it("returns undefined when there are none", () => {
    expect(normaliseReferences(undefined)).toBeUndefined();
    expect(normaliseReferences("")).toBeUndefined();
  });

  it("wraps a single reference in an array", () => {
    expect(normaliseReferences("<a@x.com>")).toEqual(["<a@x.com>"]);
  });

  it("passes an array through, trimmed", () => {
    expect(normaliseReferences([" <a@x.com> ", "<b@x.com>"])).toEqual([
      "<a@x.com>",
      "<b@x.com>",
    ]);
  });

  it("drops empty entries and returns undefined when nothing survives", () => {
    expect(normaliseReferences(["  ", ""])).toBeUndefined();
  });
});

describe("buildReplyHeaders", () => {
  it("appends the parent's Message-ID to its References chain", () => {
    const result = buildReplyHeaders({
      messageId: "<parent@x.com>",
      references: ["<root@x.com>"],
    });
    expect(result.inReplyTo).toBe("<parent@x.com>");
    expect(result.references).toEqual(["<root@x.com>", "<parent@x.com>"]);
  });

  it("starts a chain when the parent has no References", () => {
    const result = buildReplyHeaders({ messageId: "<parent@x.com>" });
    expect(result.references).toEqual(["<parent@x.com>"]);
  });

  it("does not duplicate a Message-ID already in the chain", () => {
    const result = buildReplyHeaders({
      messageId: "<parent@x.com>",
      references: ["<root@x.com>", "<parent@x.com>"],
    });
    expect(result.references).toEqual(["<root@x.com>", "<parent@x.com>"]);
  });

  it("degrades without a Message-ID rather than inventing one", () => {
    const result = buildReplyHeaders({ references: ["<root@x.com>"] });
    expect(result.inReplyTo).toBeUndefined();
    expect(result.references).toEqual(["<root@x.com>"]);
  });
});

describe("generateMessageId", () => {
  it("uses the sender's domain", () => {
    expect(generateMessageId(FROM)).toMatch(/^<\d+\.[0-9a-f-]+@theuncommon\.ai>$/);
  });

  it("falls back when the address has no domain", () => {
    expect(generateMessageId("nonsense")).toMatch(/@localhost>$/);
  });

  it("is unique across calls", () => {
    expect(generateMessageId(FROM)).not.toBe(generateMessageId(FROM));
  });
});

describe("buildRfc822Message", () => {
  it("always emits a Message-ID so replies to it can thread", () => {
    const raw = buildRfc822Message(
      { to: "a@x.com", subject: "Hi", body: "text" },
      FROM,
    );
    expect(headers(raw)).toMatch(/^Message-ID: <.+@theuncommon\.ai>$/m);
  });

  it("honours a caller-supplied Message-ID", () => {
    const raw = buildRfc822Message(
      { to: "a@x.com", subject: "Hi", body: "text", messageId: "<fixed@x.com>" },
      FROM,
    );
    expect(headers(raw)).toContain("Message-ID: <fixed@x.com>");
  });

  it("emits In-Reply-To and References when replying", () => {
    const raw = buildRfc822Message(
      {
        to: "a@x.com",
        subject: "Re: Hi",
        body: "text",
        inReplyTo: "<parent@x.com>",
        references: ["<root@x.com>", "<parent@x.com>"],
      },
      FROM,
    );
    const h = headers(raw);
    expect(h).toContain("In-Reply-To: <parent@x.com>");
    expect(h).toContain("References: <root@x.com>\r\n <parent@x.com>");
  });

  it("omits threading headers entirely on a fresh message", () => {
    const raw = buildRfc822Message(
      { to: "a@x.com", subject: "Hi", body: "text" },
      FROM,
    );
    expect(raw).not.toContain("In-Reply-To:");
    expect(raw).not.toContain("References:");
  });

  it("folds a long References chain onto continuation lines", () => {
    const chain = Array.from({ length: 5 }, (_, i) => `<m${i}@x.com>`);
    const raw = buildRfc822Message(
      { to: "a@x.com", subject: "Re: Hi", body: "text", references: chain },
      FROM,
    );
    // Every continuation line must begin with whitespace, or the header is malformed.
    const refBlock = headers(raw)
      .split("\r\n")
      .slice(
        headers(raw).split("\r\n").findIndex((l) => l.startsWith("References:")),
      )
      .slice(0, chain.length);
    expect(refBlock[0]).toBe(`References: ${chain[0]}`);
    for (const line of refBlock.slice(1)) {
      expect(line).toMatch(/^ </);
    }
  });

  it("keeps the header/body separator intact", () => {
    const raw = buildRfc822Message(
      { to: "a@x.com", subject: "Hi", body: "the body", inReplyTo: "<p@x.com>" },
      FROM,
    );
    expect(raw.split("\r\n\r\n")[1]).toBe("the body");
  });
});
