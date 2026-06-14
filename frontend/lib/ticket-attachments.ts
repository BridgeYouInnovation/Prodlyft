/**
 * Image attachments for support-ticket messages.
 *
 * Storage: BYTEA column on a dedicated `ticket_attachments` table, one
 * row per file. Same pattern as the blog-image proxy — keeps things
 * self-contained, no Vercel Blob / S3 dependency. Images are served via
 * a public `/api/tickets/attachments/[id]` proxy that streams the bytes
 * with the original content-type.
 *
 * Validation:
 *   - max 4 attachments per message
 *   - max 5 MB per file
 *   - content types: image/jpeg, image/png, image/webp, image/gif
 *   - the attachment id (`att_` + 18 random hex) is unguessable so the
 *     proxy endpoint can be public — the URL itself is the credential
 */
import { randomBytes } from "crypto";
import type { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from "pg";
import { pool } from "./db";

/** Minimal pg-shaped interface — covers both `Pool` and the per-
 *  request `PoolClient` we receive when the caller is mid-transaction.
 *  Lets us share the insert helper between both paths without losing
 *  generic-typed query results. */
interface PgRunner {
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string | QueryConfig,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}
// Compile-time assertion that Pool + PoolClient satisfy our shape.
type _Check = Pool extends PgRunner ? (PoolClient extends PgRunner ? true : never) : never;
const _check: _Check = true as _Check;
void _check;

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

let schemaReady: Promise<void> | null = null;

/** Idempotent schema bootstrap. Called from every entry point that
 *  touches attachments so Vercel doesn't have to wait for the Railway
 *  worker's init_db() to provision the table. */
export async function ensureAttachmentSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,
        filename TEXT,
        content_type VARCHAR(80) NOT NULL,
        size_bytes INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_attachments_msg
        ON ticket_attachments(message_id);
    `);
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

export interface AttachmentMeta {
  id: string;
  message_id: string;
  filename: string | null;
  content_type: string;
  size_bytes: number;
  /** Public proxy URL the UI uses for the <img src>. */
  url: string;
  created_at: string;
}

/** Generate a fresh, unguessable attachment id. */
function newAttachmentId(): string {
  return "att_" + randomBytes(9).toString("hex");
}

/** Input shape accepted from the client. */
export interface IncomingAttachment {
  filename?: string | null;
  content_type: string;
  /** `data:image/<type>;base64,<...>` from a FileReader.readAsDataURL call. */
  data_url: string;
}

export interface DecodedAttachment {
  filename: string | null;
  content_type: string;
  bytes: Buffer;
}

/** Validate + decode one incoming attachment. Returns the bytes ready
 *  for INSERT, or a string error. Caller decides whether to reject the
 *  whole message or skip the offending file. */
export function decodeAttachment(att: IncomingAttachment): DecodedAttachment | string {
  if (!att || typeof att !== "object") return "invalid attachment";
  const ct = (att.content_type || "").toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(ct)) {
    return `unsupported file type: ${ct || "(none)"}. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`;
  }
  const dataUrl = att.data_url || "";
  const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) return "data_url must be a base64-encoded data URL";
  if (m[1].toLowerCase() !== ct) {
    return "content_type doesn't match the data URL's declared MIME";
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(m[2], "base64");
  } catch {
    return "invalid base64 payload";
  }
  if (bytes.byteLength === 0) return "empty attachment";
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return `attachment too large (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB; max 5 MB)`;
  }
  // Light filename sanitisation — drop any path component, cap length.
  const rawName = (att.filename || "").trim();
  const safeName = rawName ? rawName.split(/[\\/]/).pop()!.slice(0, 200) : null;
  return { filename: safeName, content_type: ct, bytes };
}

/** Insert decoded attachments for a given message. Runs inside the
 *  caller's transaction if a client is passed; otherwise uses the pool
 *  directly. Returns the new attachment ids. */
export async function insertAttachments(
  messageId: string,
  attachments: DecodedAttachment[],
  origin: string,
  client?: PgRunner,
): Promise<AttachmentMeta[]> {
  if (attachments.length === 0) return [];
  await ensureAttachmentSchema();
  const q: PgRunner = client || pool;
  const out: AttachmentMeta[] = [];
  for (const a of attachments) {
    const id = newAttachmentId();
    const r = await q.query<{
      id: string; filename: string | null; content_type: string;
      size_bytes: number; created_at: string;
    }>(
      `INSERT INTO ticket_attachments
         (id, message_id, filename, content_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, filename, content_type, size_bytes, created_at`,
      [id, messageId, a.filename, a.content_type, a.bytes.byteLength, a.bytes],
    );
    const row = r.rows[0];
    out.push({
      id: row.id,
      message_id: messageId,
      filename: row.filename,
      content_type: row.content_type,
      size_bytes: row.size_bytes,
      url: `${origin.replace(/\/+$/, "")}/api/tickets/attachments/${row.id}`,
      created_at: row.created_at,
    });
  }
  return out;
}

/** Look up attachments for many messages at once. Returns a map of
 *  message_id → AttachmentMeta[]. */
export async function attachmentsByMessageIds(
  messageIds: string[],
  origin: string,
): Promise<Record<string, AttachmentMeta[]>> {
  const out: Record<string, AttachmentMeta[]> = {};
  if (messageIds.length === 0) return out;
  await ensureAttachmentSchema();
  const r = await pool.query<{
    id: string; message_id: string; filename: string | null;
    content_type: string; size_bytes: number; created_at: string;
  }>(
    `SELECT id, message_id, filename, content_type, size_bytes, created_at
       FROM ticket_attachments
      WHERE message_id = ANY($1::text[])
      ORDER BY created_at ASC`,
    [messageIds],
  );
  const base = origin.replace(/\/+$/, "");
  for (const row of r.rows) {
    (out[row.message_id] ||= []).push({
      ...row,
      url: `${base}/api/tickets/attachments/${row.id}`,
    });
  }
  return out;
}

/** Fetch the raw bytes for one attachment — used by the public proxy. */
export async function loadAttachment(id: string): Promise<{
  content_type: string;
  size_bytes: number;
  filename: string | null;
  data: Buffer;
} | null> {
  if (!/^att_[0-9a-f]{18}$/i.test(id)) return null;
  await ensureAttachmentSchema();
  const r = await pool.query<{
    content_type: string; size_bytes: number; filename: string | null; data: Buffer;
  }>(
    `SELECT content_type, size_bytes, filename, data
       FROM ticket_attachments WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}
