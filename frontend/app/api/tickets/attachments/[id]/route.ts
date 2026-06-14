import { NextResponse } from "next/server";
import { loadAttachment } from "@/lib/ticket-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tickets/attachments/[id] — public proxy that streams the
 * raw bytes for an attachment with its original content-type.
 *
 * Intentionally public (no auth). Safety relies on the unguessable id
 * (`att_` + 18 hex chars = 72 bits of entropy) AND the fact that only
 * the ticket owner + admins ever receive the URL — it's embedded in
 * the message thread response, which IS auth-gated. Anyone with the
 * URL already had to be authorised to see it once.
 *
 * Long Cache-Control because the bytes are immutable for an
 * attachment id; if the message is deleted, the row goes away (FK
 * cascade) and this endpoint returns 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const att = await loadAttachment(id);
  if (!att) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(att.data, {
    status: 200,
    headers: {
      "Content-Type": att.content_type,
      "Content-Length": String(att.size_bytes),
      "Cache-Control": "public, max-age=86400, immutable",
      ...(att.filename
        ? {
            "Content-Disposition": `inline; filename="${att.filename.replace(/[^\w.\-]/g, "_")}"`,
          }
        : {}),
    },
  });
}
