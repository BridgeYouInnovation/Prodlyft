/**
 * My-CoolPay constants safe to import from both server and client modules.
 * Keeping them here means client components can render operator labels
 * without dragging in `crypto` (Node-only) from lib/mcp.ts.
 */

export type McpOperator = "CM_MOMO" | "CM_OM" | "CARD" | "MCP" | string;

/** Human-readable label for an MCP operator code. */
export function operatorLabel(code: string | null | undefined): string {
  switch ((code || "").toUpperCase()) {
    case "CM_MOMO": return "MTN Mobile Money";
    case "CM_OM":   return "Orange Money";
    case "CARD":    return "Visa / Mastercard";
    case "MCP":     return "My-CoolPay wallet";
    default:        return code || "—";
  }
}
