import { getConfig } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let _redactPatterns: string[] = [];

function setRedactPatterns(patterns: string[]): void {
  _redactPatterns = patterns.filter((p) => p.length > 0);
}

function redact(message: string): string {
  let result = message;
  for (const pattern of _redactPatterns) {
    result = result.replaceAll(pattern, "***REDACTED***");
  }
  return result;
}

function shouldLog(level: LogLevel): boolean {
  try {
    const config = getConfig();
    const minLevel = config.DEBUG ? "debug" : "info";
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
  } catch {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY["info"];
  }
}

function formatMessage(
  level: LogLevel,
  context: string,
  message: string,
  data?: unknown,
): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] ${level.toUpperCase()} [${context}] ${redact(message)}`;
  if (data !== undefined) {
    const serialized =
      data instanceof Error
        ? data.message
        : typeof data === "string"
          ? data
          : JSON.stringify(data);
    return `${base} ${redact(serialized)}`;
  }
  return base;
}

export const logger = {
  init(password?: string): void {
    if (password) setRedactPatterns([password]);
  },

  debug(message: string, context = "General", data?: unknown): void {
    if (shouldLog("debug"))
      console.error(formatMessage("debug", context, message, data));
  },

  info(message: string, context = "General", data?: unknown): void {
    if (shouldLog("info"))
      console.error(formatMessage("info", context, message, data));
  },

  warn(message: string, context = "General", data?: unknown): void {
    if (shouldLog("warn"))
      console.error(formatMessage("warn", context, message, data));
  },

  error(message: string, context = "General", data?: unknown): void {
    if (shouldLog("error"))
      console.error(formatMessage("error", context, message, data));
  },
};
