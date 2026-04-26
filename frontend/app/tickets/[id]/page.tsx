"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shell } from "@/components/Shell";
import { TicketThread } from "@/components/TicketThread";

export default function UserTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id) || null;

  return (
    <Shell active="tickets" crumbs={["Help", id.slice(0, 10)]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-[800px]">
          <Link href="/tickets" className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1 mb-3">
            ← All tickets
          </Link>
          <TicketThread
            ticketId={id}
            apiBase={`/api/tickets/${id}`}
            messagesBase={`/api/tickets/${id}/messages`}
            isAdmin={false}
            myUserId={userId}
          />
        </div>
      </div>
    </Shell>
  );
}
