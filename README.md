# ProtonMail MCP Server

An MCP (Model Context Protocol) server that provides email management through ProtonMail via Proton Bridge. Send, read, search, and organize emails using any MCP-compatible client (Claude Desktop, Cursor, etc.).

## Prerequisites

- **Node.js** >= 18
- **Proton Bridge** running locally (required for IMAP; download from [proton.me/mail/bridge](https://proton.me/mail/bridge))
- A **ProtonMail** account

## Installation

```bash
git clone https://github.com/ronamosa/protonmail-pro-mcp.git
cd protonmail-pro-mcp
npm install
npm link
```

`npm install` automatically builds the project, and `npm link` makes `protonmail-pro-mcp` available as a global command. On any new machine, the same four commands set everything up.

To verify it's installed:

```bash
which protonmail-pro-mcp
```

## Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROTONMAIL_USERNAME` | Yes | | Your ProtonMail email address |
| `PROTONMAIL_PASSWORD` | Yes | | Your Proton Bridge password (not your login password) |
| `PROTONMAIL_SMTP_HOST` | No | `smtp.protonmail.ch` | SMTP server host |
| `PROTONMAIL_SMTP_PORT` | No | `587` | SMTP server port |
| `PROTONMAIL_IMAP_HOST` | No | `127.0.0.1` | IMAP server host (Proton Bridge) |
| `PROTONMAIL_IMAP_PORT` | No | `1143` | IMAP server port (Proton Bridge) |
| `PROTONMAIL_IMAP_TLS` | No | `false` | Enable TLS for IMAP |
| `PORT` | No | `3000` | HTTP transport port |
| `DEBUG` | No | `false` | Enable debug logging |

> **Security note:** `PROTONMAIL_PASSWORD` is the bridge-generated password, not your ProtonMail login password. Never commit `.env` files to version control.

## Usage

After `npm link`, the server is available as `protonmail-pro-mcp` from anywhere.

### Stdio transport (default -- local use with Claude Code / Desktop / Cursor)

```bash
protonmail-pro-mcp
```

### HTTP transport (remote / cloud deployment)

```bash
protonmail-pro-mcp --transport http --port 3000
```

The server listens on `POST /mcp`, `GET /mcp`, and `DELETE /mcp` (Streamable HTTP). A health check is available at `GET /health`.

### Claude Code configuration

Add to `~/.claude/claude_code_config.json` (or set with `claude mcp add`):

```json
{
  "mcpServers": {
    "protonmail": {
      "command": "protonmail-pro-mcp",
      "env": {
        "PROTONMAIL_USERNAME": "you@protonmail.com",
        "PROTONMAIL_PASSWORD": "your-bridge-password"
      }
    }
  }
}
```

### Claude Desktop configuration

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "protonmail": {
      "command": "protonmail-pro-mcp",
      "env": {
        "PROTONMAIL_USERNAME": "you@protonmail.com",
        "PROTONMAIL_PASSWORD": "your-bridge-password"
      }
    }
  }
}
```

### Cursor configuration

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "protonmail": {
      "command": "protonmail-pro-mcp",
      "env": {
        "PROTONMAIL_USERNAME": "you@protonmail.com",
        "PROTONMAIL_PASSWORD": "your-bridge-password"
      }
    }
  }
}
```

## Tools

### Email sending

| Tool | Description |
|------|-------------|
| `send_email` | Send email with to/cc/bcc, HTML support, priority, reply-to, and attachments |
| `send_test_email` | Send a quick test email to verify SMTP connectivity |

### Email reading

| Tool | Description |
|------|-------------|
| `get_emails` | Fetch emails from a folder with pagination |
| `get_email_by_id` | Get a specific email with full body and headers |
| `search_emails` | Search with filters: from, to, subject, date range, flags, attachments |

### Email actions

| Tool | Description |
|------|-------------|
| `mark_email_read` | Mark an email as read or unread |
| `star_email` | Star or unstar an email |
| `move_email` | Move an email to a different folder |
| `delete_email` | Soft-delete (move to Trash); permanent delete only if already in Trash |

### Folder management

| Tool | Description |
|------|-------------|
| `get_folders` | List all folders with message counts |
| `sync_folders` | Force-refresh the folder list from the server |

### System

| Tool | Description |
|------|-------------|
| `get_connection_status` | Check SMTP and IMAP connection status |

## Architecture

```
src/
  index.ts            Entry point, transport selection, graceful shutdown
  server.ts           McpServer setup, tool registration
  config.ts           Zod-validated environment configuration
  logger.ts           Structured stderr logger with credential redaction
  types.ts            Shared TypeScript interfaces
  services/
    smtp.ts           nodemailer wrapper (lazy connection)
    imap.ts           imapflow + mailparser wrapper (lazy connection, auto-reconnect)
  tools/
    sending.ts        send_email, send_test_email
    reading.ts        get_emails, get_email_by_id, search_emails
    actions.ts        mark_email_read, star_email, move_email, delete_email
    folders.ts        get_folders, sync_folders
    system.ts         get_connection_status
```

Key design decisions:
- **McpServer API** (SDK v1.29+) with Zod input validation on every tool
- **Tool annotations** (`readOnlyHint`, `destructiveHint`, `openWorldHint`) per MCP spec
- **Dual transport**: stdio for local use, Streamable HTTP for remote deployment
- **Lazy connections**: SMTP and IMAP connect on first use, not at startup
- **Credential redaction**: passwords are scrubbed from all log output
- **Soft delete**: `delete_email` moves to Trash first; only permanently deletes from Trash

## Development

```bash
npm run dev          # Watch mode with tsx
npm run typecheck    # Type checking without emit
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Run tests
```

After making changes, rebuild and re-link:

```bash
npm run build
```

The global `protonmail-pro-mcp` command is a symlink into this repo's `dist/`, so a rebuild is all that's needed -- no need to re-run `npm link`.

## Credits

This project was originally scaffolded from [anyrxo/protonmail-pro-mcp](https://github.com/anyrxo/protonmail-pro-mcp) and has been completely rewritten with a modern MCP SDK, Zod validation, dual transport support, and full tool implementations.

## License

MIT
