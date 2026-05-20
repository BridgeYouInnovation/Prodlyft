"use client";
import { SessionProvider } from "next-auth/react";
import { HelpWidget } from "./HelpWidget";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      {/* Floating support widget — rendered on every page. Hides itself
          on /admin/** routes. Anonymous visitors get a "sign in" CTA;
          authed users can open a ticket inline. */}
      <HelpWidget />
    </SessionProvider>
  );
}
