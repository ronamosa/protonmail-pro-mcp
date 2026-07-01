import type { AttachmentMeta } from "../types.js";

export interface ParsedAttachment {
  filename?: string;
  contentType: string;
  size: number;
  cid?: string;
  content: Buffer;
}

export type ResolveResult =
  | { ok: true; attachment: ParsedAttachment; index: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ambiguous"; filename: string; candidates: AttachmentMeta[] }
  | { ok: false; reason: "index_mismatch"; index: number; filename: string; actualFilename: string };

export function normalizeFilename(filename?: string): string {
  return filename || "unnamed";
}

function toMeta(attachment: ParsedAttachment, index: number): AttachmentMeta {
  return {
    index,
    filename: normalizeFilename(attachment.filename),
    contentType: attachment.contentType,
    size: attachment.size,
    cid: attachment.cid || undefined,
  };
}

export function resolveAttachment(
  attachments: ParsedAttachment[],
  filename: string,
  index?: number,
): ResolveResult {
  if (index !== undefined) {
    const attachment = attachments[index];
    if (!attachment) return { ok: false, reason: "not_found" };

    const actualFilename = normalizeFilename(attachment.filename);
    if (actualFilename !== filename) {
      return {
        ok: false,
        reason: "index_mismatch",
        index,
        filename,
        actualFilename,
      };
    }

    return { ok: true, attachment, index };
  }

  const matches = attachments
    .map((attachment, i) => ({ attachment, index: i }))
    .filter(({ attachment }) => normalizeFilename(attachment.filename) === filename);

  if (matches.length === 0) return { ok: false, reason: "not_found" };
  if (matches.length === 1) {
    return { ok: true, attachment: matches[0].attachment, index: matches[0].index };
  }

  return {
    ok: false,
    reason: "ambiguous",
    filename,
    candidates: matches.map(({ attachment, index: i }) => toMeta(attachment, i)),
  };
}
