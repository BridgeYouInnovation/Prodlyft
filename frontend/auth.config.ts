import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no DB adapter, no node-only deps). Used by middleware.
export default {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/auth/verify-request",
    error: "/signin",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isProtected = path.startsWith("/dashboard");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
