export interface EmailAddress {
  name?: string;
  address: string;
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  cid?: string;
}

export type AttachmentResult =
  | { filename: string; contentType: string; content: string }
  | { error: "ambiguous"; filename: string; candidates: AttachmentMeta[] }
  | { error: "index_mismatch"; index: number; filename: string; actualFilename: string };

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
    index?: number,
  ): Promise<AttachmentResult | null>;
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
