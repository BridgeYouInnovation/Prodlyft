import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { currencyFromCountry } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/geo — reads Vercel's geo headers and returns the detected
 * country + default currency. Used by the client-side /pricing page to
 * initialise the selector before any user override.
 */
export async function GET() {
  const h = await headers();
  const country =
    h.get("x-vercel-ip-country") ??
    h.get("cf-ipcountry") ??
    h.get("x-country") ??
    null;
  return NextResponse.json({
    country: country ? country.toUpperCase() : null,
    currency: currencyFromCountry(country),
  });
}
