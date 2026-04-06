import { describe, it, expect } from "vitest";
import { ConfigSchema } from "./config.js";

describe("ConfigSchema validation", () => {
  it("rejects when PROTONMAIL_USERNAME is missing", () => {
    const result = ConfigSchema.safeParse({
      PROTONMAIL_PASSWORD: "test-pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when PROTONMAIL_PASSWORD is missing", () => {
    const result = ConfigSchema.safeParse({
      PROTONMAIL_USERNAME: "user@protonmail.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty PROTONMAIL_USERNAME", () => {
    const result = ConfigSchema.safeParse({
      PROTONMAIL_USERNAME: "",
      PROTONMAIL_PASSWORD: "test-pass",
    });
    expect(result.success).toBe(false);
  });

  it("parses valid config with defaults", () => {
    const result = ConfigSchema.safeParse({
      PROTONMAIL_USERNAME: "user@protonmail.com",
      PROTONMAIL_PASSWORD: "bridge-password",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.PROTONMAIL_USERNAME).toBe("user@protonmail.com");
    expect(result.data.PROTONMAIL_PASSWORD).toBe("bridge-password");
    expect(result.data.PROTONMAIL_SMTP_HOST).toBe("smtp.protonmail.ch");
    expect(result.data.PROTONMAIL_SMTP_PORT).toBe(587);
    expect(result.data.PROTONMAIL_IMAP_HOST).toBe("127.0.0.1");
    expect(result.data.PROTONMAIL_IMAP_PORT).toBe(1143);
    expect(result.data.PROTONMAIL_IMAP_TLS).toBe(false);
    expect(result.data.PORT).toBe(3000);
    expect(result.data.DEBUG).toBe(false);
  });

  it("parses custom values", () => {
    const result = ConfigSchema.safeParse({
      PROTONMAIL_USERNAME: "user@protonmail.com",
      PROTONMAIL_PASSWORD: "bridge-password",
      PROTONMAIL_SMTP_PORT: "465",
      PORT: "8080",
      DEBUG: "true",
      PROTONMAIL_IMAP_TLS: "true",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.PROTONMAIL_SMTP_PORT).toBe(465);
    expect(result.data.PORT).toBe(8080);
    expect(result.data.DEBUG).toBe(true);
    expect(result.data.PROTONMAIL_IMAP_TLS).toBe(true);
  });

  it("coerces string port numbers", () => {
    const result = ConfigSchema.safeParse({
      PROTONMAIL_USERNAME: "user@protonmail.com",
      PROTONMAIL_PASSWORD: "bridge-password",
      PROTONMAIL_SMTP_PORT: "587",
      PROTONMAIL_IMAP_PORT: "993",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.PROTONMAIL_SMTP_PORT).toBe(587);
    expect(result.data.PROTONMAIL_IMAP_PORT).toBe(993);
  });
});
