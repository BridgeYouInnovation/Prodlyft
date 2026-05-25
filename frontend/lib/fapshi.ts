/**
 * Fapshi payment integration (https://docs.fapshi.com/en).
 *
 * Replaces My-CoolPay. Three things to know vs the old integration:
 *
 *  1. Auth is two HTTP headers: `apiuser` + `apikey`. No public key in
 *     the URL path, no MD5 signing — secrets stay in transit.
 *  2. Webhooks include an `x-wh-secret` header whose value matches what
 *     you configured in the Fapshi dashboard. Verification is a single
 *     constant-time string compare — no hashing.
 *  3. Status values use SUCCESSFUL / FAILED / EXPIRED / PENDING /
 *     CREATED (note the -FUL suffix vs MCP's bare SUCCESS).
 *
 * Required env (set on Vercel):
 *   FAPSHI_API_USER       — apiuser header value
 *   FAPSHI_API_KEY        — apikey header value (keep secret)
 *   FAPSHI_WEBHOOK_SECRET — x-wh-secret to verify incoming webhooks
 *   FAPSHI_BASE_URL       — optional override; defaults to
 *                           https://live.fapshi.com (use
 *                           https://sandbox.fapshi.com for testing)
 */
import { createHash, timingSafeEqual } from "crypto";

export type FapshiStatus = "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";

function baseUrl(): string {
  return (process.env.FAPSHI_BASE_URL || "https://live.fapshi.com").replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const apiuser = process.env.FAPSHI_API_USER;
  const apikey = process.env.FAPSHI_API_KEY;
  if (!apiuser || !apikey) {
    throw new Error("FAPSHI_API_USER / FAPSHI_API_KEY env vars are not set");
  }
  return {
    apiuser,
    apikey,
    "Content-Type": "application/json",
  };
}

export interface InitiatePayRequest {
  /** XAF amount, integer, minimum 100. */
  amount: number;
  /** Customer email — Fapshi sends them a receipt and pre-fills checkout. */
  email?: string;
  /** Where the user lands after paying. Fapshi appends ?status=...&transId=... */
  redirectUrl?: string;
  /** Our user id (passes through to webhook + status responses). 1-100 chars a-zA-Z0-9_-. */
  userId?: string;
  /** Our internal transaction ref (passes through too). Same 1-100 char pattern. */
  externalId?: string;
  /** Short message shown on the checkout page (the reason / pack name). */
  message?: string;
}

export interface InitiatePaySuccess {
  ok: true;
  /** Hosted checkout URL — redirect the browser here. */
  link: string;
  /** Fapshi's transaction id, 8-10 chars. Store this; needed for status checks. */
  transId: string;
  dateInitiated: string;
  message: string;
}

export interface InitiatePayError {
  ok: false;
  status: number;
  message: string;
}

export type InitiatePayResult = InitiatePaySuccess | InitiatePayError;

/** Validate amount per Fapshi's rules so we surface a useful error
 *  instead of a generic 400 from their API. */
export function validateAmount(amount: number): string | null {
  if (!Number.isInteger(amount)) return "amount must be an integer (XAF)";
  if (amount < 100) return "amount must be at least 100 XAF";
  return null;
}

/** POST /initiate-pay. Returns a checkout link the browser navigates to. */
export async function initiatePay(req: InitiatePayRequest): Promise<InitiatePayResult> {
  const err = validateAmount(req.amount);
  if (err) return { ok: false, status: 400, message: err };

  let r: Response;
  try {
    r = await fetch(`${baseUrl()}/initiate-pay`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        amount: req.amount,
        email: req.email,
        redirectUrl: req.redirectUrl,
        userId: req.userId,
        externalId: req.externalId,
        message: req.message,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, status: 502, message: (e as Error).message || "Network error" };
  }

  let data: unknown;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) {
    const msg = (data && typeof data === "object" && "message" in data
      ? String((data as { message?: unknown }).message)
      : "") || `Fapshi HTTP ${r.status}`;
    return { ok: false, status: r.status, message: msg };
  }
  const d = (data || {}) as Partial<InitiatePaySuccess>;
  if (!d.link || !d.transId) {
    return { ok: false, status: 502, message: "Fapshi returned no link/transId" };
  }
  return {
    ok: true,
    link: d.link,
    transId: d.transId,
    dateInitiated: d.dateInitiated || new Date().toISOString(),
    message: d.message || "",
  };
}

export interface PaymentStatus {
  ok: true;
  transId: string;
  status: FapshiStatus;
  medium?: string;
  serviceName?: string;
  transType?: string;
  amount?: number;
  revenue?: number;
  payerName?: string;
  email?: string;
  redirectUrl?: string;
  externalId?: string;
  userId?: string;
  webhook?: string;
  reason?: string;
  financialTransId?: string;
  dateInitiated?: string;
  dateConfirmed?: string;
}

export interface StatusError {
  ok: false;
  status: number;
  message: string;
}

export type StatusResult = PaymentStatus | StatusError;

/** GET /payment-status/{transId}. Rate-limited to 6 req/min/transId by
 *  Fapshi — exceeding returns 429. The /api/payment/[ref] reconcile
 *  path is gated by the 8s-since-last-update window which keeps us
 *  well under that limit in practice. */
export async function checkPaymentStatus(transId: string): Promise<StatusResult> {
  if (!/^[a-zA-Z0-9]{8,10}$/.test(transId)) {
    return { ok: false, status: 400, message: "invalid transId format" };
  }
  let r: Response;
  try {
    r = await fetch(`${baseUrl()}/payment-status/${encodeURIComponent(transId)}`, {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, status: 502, message: (e as Error).message || "Network error" };
  }

  let data: unknown;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) {
    const msg = (data && typeof data === "object" && "message" in data
      ? String((data as { message?: unknown }).message)
      : "") || `Fapshi HTTP ${r.status}`;
    return { ok: false, status: r.status, message: msg };
  }
  const d = (data || {}) as Partial<PaymentStatus>;
  return { ok: true, ...d } as PaymentStatus;
}

/**
 * Verify an incoming webhook is genuinely from Fapshi.
 *
 * Fapshi POSTs the same payment-status JSON body with an `x-wh-secret`
 * header whose value matches what you configured in the dashboard. We
 * compare in constant time against FAPSHI_WEBHOOK_SECRET so timing
 * attacks can't probe the secret one byte at a time.
 */
export function verifyWebhookSecret(headerValue: string | null | undefined): boolean {
  const expected = process.env.FAPSHI_WEBHOOK_SECRET;
  if (!expected || !headerValue) return false;
  // constant-time compare requires equal lengths; sha256 both sides
  // first so the length-equality check itself doesn't leak the
  // expected secret's length.
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(headerValue).digest();
  return timingSafeEqual(a, b);
}

/** Map Fapshi's enum to our internal payment status enum. */
export function mapStatus(fapshi: FapshiStatus | string | undefined): string {
  switch ((fapshi || "").toUpperCase()) {
    case "SUCCESSFUL": return "success";
    case "FAILED":     return "failed";
    case "EXPIRED":    return "canceled"; // closest analogue in our enum
    case "PENDING":    return "pending";
    case "CREATED":    return "created";
    default:           return "created";
  }
}

/** Generate a 1-100 char alphanumeric+dash externalId we send to Fapshi
 *  and store as our app_transaction_ref. */
export function newExternalId(): string {
  return `pl_${createHash("sha256")
    .update(`${Date.now()}:${Math.random()}:${process.pid}`)
    .digest("hex")
    .slice(0, 24)}`;
}
