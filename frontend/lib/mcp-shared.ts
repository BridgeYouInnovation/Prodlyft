/**
 * Payment operator labels safe to import from both server and client
 * modules. Keeping them here means client components can render
 * operator names without dragging in `crypto` (Node-only) from
 * lib/fapshi.ts.
 *
 * Covers Fapshi's `medium` values plus the legacy My-CoolPay
 * operator codes (for rows in the DB from before the switch).
 */
export type PaymentOperator = string;

const NORMALISE: Record<string, string> = {
  // Fapshi mediums
  "mobile money":   "MTN Mobile Money",
  "orange money":   "Orange Money",
  "fapshi":         "Fapshi wallet",
  // Legacy My-CoolPay operator codes
  "CM_MOMO":        "MTN Mobile Money",
  "CM_OM":          "Orange Money",
  "CARD":           "Visa / Mastercard",
  "MCP":            "My-CoolPay wallet",
};

/** Human-readable label for whatever the payment provider tagged the
 *  payment with. Falls back to the raw value or "—". */
export function operatorLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const key = code.trim();
  return NORMALISE[key] || NORMALISE[key.toLowerCase()] || NORMALISE[key.toUpperCase()] || key;
}
