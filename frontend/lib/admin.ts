import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireAdmin(): Promise<{ ok: true; userId: number } | { ok: false; res: NextResponse }> {
  const session = await auth();
  const user = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  if (!user?.is_admin) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: Number(user.id) };
}
