import { createHash } from "crypto";

// My-CoolPay only charges in XAF (or EUR). We charge all upgrades in XAF
// regardless of what currency the user's browser was set to on /pricing —
// the display currency is informational only. The `xafPrice` fields below
// are the truth for every checkout.
export const MCP_XAF_PRICES: Record<"pro" | "unlimited", number> = {
  pro: 10_000,
  unlimited: 25_000,
};

export type MCPCurrency = "XAF" | "EUR";

export interface PaylinkRequest {
  transaction_amount: number;
  transaction_currency?: MCPCurrency;
  transaction_reason?: string;
  app_transaction_ref: string;
  customer_phone_number?: string;
  customer_name?: string;
  customer_email?: string;
  customer_lang?: "fr" | "en";
}

export interface PaylinkSuccess {
  status: "success";
  transaction_ref: string;
  payment_url: string;
}

export interface PaylinkError {
  status: "error";
  message: string;
}

function mcpBase(): string {
  const base = (process.env.MCP_BASE_URL || "https://my-coolpay.com/api").replace(/\/+$/, "");
  const pub = process.env.MCP_PUBLIC_KEY;
  if (!pub) throw new Error("MCP_PUBLIC_KEY is not set");
  return `${base}/${pub}`;
}

/** Call My-CoolPay's POST /paylink to get a hosted checkout URL. */
export async function createPaylink(req: PaylinkRequest): Promise<PaylinkSuccess | PaylinkError> {
  const body: PaylinkRequest = {
    transaction_currency: "XAF",
    customer_lang: "fr",
    ...req,
  };
  const r = await fetch(`${mcpBase()}/paylink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as PaylinkSuccess | PaylinkError;
  return data;
}

export interface CallbackPayload {
  application: string;
  app_transaction_ref: string;
  operator_transaction_ref?: string;
  transaction_ref: string;
  transaction_type: "PAYIN" | "PAYOUT";
  transaction_amount: number | string;
  transaction_fees?: number | string;
  transaction_currency: string;
  transaction_operator: string;
  transaction_status: "SUCCESS" | "CANCELED" | "FAILED" | "PENDING" | "CREATED";
  transaction_reason?: string;
  transaction_message?: string;
  customer_phone_number?: string;
  signature: string;
}

/**
 * Verify the MD5 signature on an incoming callback.
 * Formula from the MCP docs:
 *   md5(transaction_ref + transaction_type + transaction_amount
 *       + transaction_currency + transaction_operator + private_key)
 *
 * Amount is compared as the *string* MCP sends — don't reformat it.
 */
export function verifyCallbackSignature(p: CallbackPayload): boolean {
  const priv = process.env.MCP_PRIVATE_KEY;
  if (!priv) return false;
  const raw =
    String(p.transaction_ref) +
    String(p.transaction_type) +
    String(p.transaction_amount) +
    String(p.transaction_currency) +
    String(p.transaction_operator) +
    priv;
  const expected = createHash("md5").update(raw).digest("hex");
  return expected.toLowerCase() === String(p.signature || "").toLowerCase();
}

/** Short, unguessable id we store on our side and pass as app_transaction_ref. */
export function newAppTransactionRef(): string {
  return `pl_${createHash("sha256")
    .update(`${Date.now()}:${Math.random()}:${process.pid}`)
    .digest("hex")
    .slice(0, 24)}`;
}
