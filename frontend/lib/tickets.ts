export type TicketStatus = "open" | "waiting_admin" | "waiting_user" | "closed";

export interface Ticket {
  id: string;
  user_id: number;
  user_email?: string | null;
  subject: string;
  status: TicketStatus;
  related_crawl_id: string | null;
  last_user_view_at: string | null;
  last_admin_view_at: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  unread_for_admin?: number;
  unread_for_user?: number;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_user_id: number;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  waiting_admin: "Waiting on us",
  waiting_user: "Waiting on you",
  closed: "Closed",
};

export const STATUS_CHIP: Record<TicketStatus, string> = {
  open: "chip-accent",
  waiting_admin: "chip-warn",
  waiting_user: "chip",
  closed: "chip",
};

export function newTicketId(): string {
  // Short, URL-safe id. Random enough for our scale.
  const r = crypto.getRandomValues(new Uint8Array(9));
  return "tk_" + Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newMessageId(): string {
  const r = crypto.getRandomValues(new Uint8Array(9));
  return "msg_" + Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 172800) return "yesterday";
  return `${Math.floor(d / 86400)}d ago`;
}
