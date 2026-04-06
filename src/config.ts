import { z } from "zod";

export const ConfigSchema = z.object({
  PROTONMAIL_USERNAME: z.string().min(1, "PROTONMAIL_USERNAME is required"),
  PROTONMAIL_PASSWORD: z.string().min(1, "PROTONMAIL_PASSWORD is required"),
  PROTONMAIL_SMTP_HOST: z.string().default("smtp.protonmail.ch"),
  PROTONMAIL_SMTP_PORT: z.coerce.number().int().positive().default(587),
  PROTONMAIL_IMAP_HOST: z.string().default("127.0.0.1"),
  PROTONMAIL_IMAP_PORT: z.coerce.number().int().positive().default(1143),
  PROTONMAIL_IMAP_TLS: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  PORT: z.coerce.number().int().positive().default(3000),
  DEBUG: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

export type Config = z.infer<typeof ConfigSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  _config = result.data;
  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}
