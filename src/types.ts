export interface EmailAddress {
  name?: string;
  address: string;
}

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  cid?: string;
}

export interface EmailMessage {
  id: string;
  uid: number;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: string;
  body?: string;
  html?: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: AttachmentMeta[];
  folder: string;
  snippet?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface EmailFolder {
  name: string;
  path: string;
  total: number;
  unseen: number;
  delimiter: string;
  children?: EmailFolder[];
}

export interface ConnectionStatus {
  smtp: { connected: boolean; error?: string };
  imap: { connected: boolean; error?: string };
}

export interface DraftOptions {
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  replyTo?: string;
  /** Message-ID for this message. Generated when omitted. */
  messageId?: string;
  /** RFC 5322 Message-ID of the message being replied to. */
  inReplyTo?: string;
  /** Full Message-ID chain of the conversation, oldest first. */
  references?: string[];
}

export interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  priority?: "high" | "normal" | "low";
  replyTo?: string;
  /** RFC 5322 Message-ID of the message being replied to. */
  inReplyTo?: string;
  /** Full Message-ID chain of the conversation, oldest first. */
  references?: string[];
  attachments?: Array<{
    filename: string;
    content: string;
    encoding?: string;
  }>;
}

export interface SmtpService {
  verify(): Promise<boolean>;
  send(options: SendEmailOptions): Promise<{ messageId: string }>;
  close(): Promise<void>;
}

export interface ImapService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getEmails(
    folder: string,
    limit: number,
    offset: number,
  ): Promise<EmailMessage[]>;
  getEmailById(emailId: string): Promise<EmailMessage | null>;
  searchEmails(criteria: SearchCriteria): Promise<EmailMessage[]>;
  getFolders(): Promise<EmailFolder[]>;
  setFlags(
    emailId: string,
    flags: { add?: string[]; remove?: string[] },
  ): Promise<void>;
  moveEmail(emailId: string, targetFolder: string): Promise<void>;
  deleteEmail(emailId: string): Promise<void>;
  getAttachment(
    emailId: string,
    filename: string,
  ): Promise<{ filename: string; contentType: string; content: string } | null>;
  appendMessage(
    folder: string,
    rawMessage: string | Buffer,
    flags?: string[],
  ): Promise<{ uid: number }>;
}

export interface SearchCriteria {
  query?: string;
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}
