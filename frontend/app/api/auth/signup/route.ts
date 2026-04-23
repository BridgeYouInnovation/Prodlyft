import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { email, password, name } = (body ?? {}) as {
    email?: string;
    password?: string;
    name?: string;
  };

  const emailNorm = String(email ?? "").trim().toLowerCase();
  const pw = String(password ?? "");

  if (!EMAIL_RE.test(emailNorm)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (pw.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await findUserByEmail(emailNorm);
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const hash = await bcrypt.hash(pw, 10);
  const displayName = typeof name === "string" && name.trim() ? name.trim() : null;
  await createUser(emailNorm, hash, displayName);
  return NextResponse.json({ ok: true });
}
