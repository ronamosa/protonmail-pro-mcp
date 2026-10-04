import { loadConfig } from "../src/config.js";
import { createImapService } from "../src/services/imap.js";
import { createSmtpService } from "../src/services/smtp.js";
import { loadProjectEnv, projectRoot } from "./load-env.js";

const TEST_FILENAME = "dupe.txt";
const FIRST_CONTENT = "first-attachment-body";
const SECOND_CONTENT = "second-attachment-body";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runAttachmentAssertions(
  imap: ReturnType<typeof createImapService>,
  emailId: string,
  testSubject: string,
): Promise<void> {
  const email = await imap.getEmailById(emailId);
  assert(email, "Could not fetch test email by ID");
  assert(email.attachments?.length === 2, `Expected 2 attachments, got ${email.attachments?.length ?? 0}`);

  const dupeAttachments = email.attachments!.filter((a) => a.filename === TEST_FILENAME);
  assert(dupeAttachments.length === 2, "Expected two attachments named dupe.txt");
  assert(dupeAttachments[0].index !== dupeAttachments[1].index, "Attachment indices should differ");

  console.log("Attachment metadata:");
  for (const attachment of email.attachments!) {
    console.log(
      `  index=${attachment.index} filename=${attachment.filename} size=${attachment.size}`,
    );
  }

  const ambiguous = await imap.getAttachment(emailId, TEST_FILENAME);
  assert(
    ambiguous && "error" in ambiguous && ambiguous.error === "ambiguous",
    "Expected ambiguous error without index",
  );
  console.log("OK: duplicate filename without index returns ambiguous");

  const [firstMeta, secondMeta] = dupeAttachments.sort((a, b) => a.index - b.index);
  const first = await imap.getAttachment(emailId, TEST_FILENAME, firstMeta.index);
  const second = await imap.getAttachment(emailId, TEST_FILENAME, secondMeta.index);

  assert(first && !("error" in first), "Expected first attachment by index");
  assert(second && !("error" in second), "Expected second attachment by index");

  const bodies = [
    Buffer.from(first.content, "base64").toString("utf8"),
    Buffer.from(second.content, "base64").toString("utf8"),
  ].sort();

  assert(bodies[0] === FIRST_CONTENT && bodies[1] === SECOND_CONTENT, "Attachment bodies mismatch");
  assert(bodies[0] !== bodies[1], "Attachment bodies should differ");
  console.log("OK: each index returned the correct attachment body");

  const mismatch = await imap.getAttachment(emailId, "wrong-name.txt", firstMeta.index);
  assert(
    mismatch && "error" in mismatch && mismatch.error === "index_mismatch",
    "Expected index/filename mismatch error",
  );
  console.log("OK: index/filename mismatch detected");

  console.log("");
  console.log("Manual attachment test passed.");
  console.log(`Test email left in INBOX: ${emailId}`);
  console.log(`Subject: ${testSubject}`);
}

async function main(): Promise<void> {
  const loadedEnv = loadProjectEnv();
  if (!loadedEnv && !process.env.PROTONMAIL_USERNAME) {
    console.error(
      [
        "Missing Proton Bridge credentials.",
        "",
        "Add credentials to .env or .cursor/mcp.json, then:",
        "  npm run build && npm run test:attachments:manual",
      ].join("\n"),
    );
    process.exit(1);
  }

  const config = loadConfig();
  const smtp = createSmtpService(config);
  const imap = createImapService(config);

  const testSubject = `[MCP TEST] attachment-index ${Date.now()}`;
  console.log(`Project: ${projectRoot}`);
  console.log(
    `SMTP ${config.PROTONMAIL_SMTP_HOST}:${config.PROTONMAIL_SMTP_PORT} | IMAP ${config.PROTONMAIL_IMAP_HOST}:${config.PROTONMAIL_IMAP_PORT}`,
  );

  try {
    const smtpOk = await smtp.verify();
    assert(smtpOk, "SMTP verification failed");
    console.log("OK: SMTP connected");

    await imap.connect();
    console.log("OK: IMAP connected");

    console.log(`Sending test email to ${config.PROTONMAIL_USERNAME}...`);
    const { messageId } = await smtp.send({
      to: config.PROTONMAIL_USERNAME,
      subject: testSubject,
      body: "Manual integration test for duplicate attachment filename handling.",
      attachments: [
        {
          filename: TEST_FILENAME,
          content: Buffer.from(FIRST_CONTENT).toString("base64"),
          encoding: "base64",
        },
        {
          filename: TEST_FILENAME,
          content: Buffer.from(SECOND_CONTENT).toString("base64"),
          encoding: "base64",
        },
      ],
    });
    console.log(`Sent test email (${messageId}). Waiting for INBOX delivery...`);

    let emailId: string | undefined;
    for (let attempt = 1; attempt <= 15; attempt++) {
      await sleep(2000);
      const results = await imap.searchEmails({
        folder: "INBOX",
        subject: testSubject,
        limit: 1,
      });
      if (results.length > 0) {
        emailId = results[0].id;
        console.log(`Found test email on attempt ${attempt}: ${emailId}`);
        break;
      }
      console.log(`Attempt ${attempt}/15: not visible yet...`);
    }

    assert(emailId, "Timed out waiting for test email in INBOX");
    await runAttachmentAssertions(imap, emailId, testSubject);
  } finally {
    await imap.disconnect();
    await smtp.close();
  }
}

main().catch((err) => {
  console.error("Manual attachment test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
