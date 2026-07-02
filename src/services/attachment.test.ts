import { describe, it, expect } from "vitest";
import { resolveAttachment, normalizeFilename } from "./attachment.js";
import type { ParsedAttachment } from "./attachment.js";

function makeAttachment(
  overrides: Partial<ParsedAttachment> & Pick<ParsedAttachment, "content">,
): ParsedAttachment {
  return {
    filename: "file.txt",
    contentType: "text/plain",
    size: overrides.content.length,
    ...overrides,
  };
}

describe("normalizeFilename", () => {
  it("returns filename when present", () => {
    expect(normalizeFilename("report.pdf")).toBe("report.pdf");
  });

  it("returns unnamed when missing", () => {
    expect(normalizeFilename()).toBe("unnamed");
    expect(normalizeFilename("")).toBe("unnamed");
  });
});

describe("resolveAttachment", () => {
  const attachments = [
    makeAttachment({ filename: "report.pdf", content: Buffer.from("first") }),
    makeAttachment({ filename: "notes.txt", content: Buffer.from("notes") }),
    makeAttachment({ filename: "report.pdf", content: Buffer.from("second") }),
  ];

  it("returns unique filename match without index", () => {
    const result = resolveAttachment(attachments, "notes.txt");
    expect(result).toEqual({
      ok: true,
      attachment: attachments[1],
      index: 1,
    });
  });

  it("returns ambiguous when filename matches multiple and index omitted", () => {
    const result = resolveAttachment(attachments, "report.pdf");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe("ambiguous");
    if (result.reason !== "ambiguous") return;

    expect(result.candidates).toEqual([
      {
        index: 0,
        filename: "report.pdf",
        contentType: "text/plain",
        size: 5,
      },
      {
        index: 2,
        filename: "report.pdf",
        contentType: "text/plain",
        size: 6,
      },
    ]);
  });

  it("returns correct attachment by index for duplicates", () => {
    const first = resolveAttachment(attachments, "report.pdf", 0);
    const second = resolveAttachment(attachments, "report.pdf", 2);

    expect(first).toEqual({ ok: true, attachment: attachments[0], index: 0 });
    expect(second).toEqual({ ok: true, attachment: attachments[2], index: 2 });
  });

  it("returns not_found for out of range index", () => {
    const result = resolveAttachment(attachments, "report.pdf", 99);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns index_mismatch when index filename differs", () => {
    const result = resolveAttachment(attachments, "report.pdf", 1);
    expect(result).toEqual({
      ok: false,
      reason: "index_mismatch",
      index: 1,
      filename: "report.pdf",
      actualFilename: "notes.txt",
    });
  });

  it("returns not_found when filename does not exist", () => {
    const result = resolveAttachment(attachments, "missing.pdf");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("treats multiple unnamed attachments as ambiguous", () => {
    const unnamed = [
      makeAttachment({ filename: undefined, content: Buffer.from("a") }),
      makeAttachment({ filename: undefined, content: Buffer.from("b") }),
    ];

    const result = resolveAttachment(unnamed, "unnamed");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe("ambiguous");
    if (result.reason !== "ambiguous") return;

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].index).toBe(0);
    expect(result.candidates[1].index).toBe(1);
  });
});
