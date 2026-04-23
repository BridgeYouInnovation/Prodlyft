import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no DB, no bcrypt). Used by middleware for route protection.
export default {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
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
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string | number }).id;
        token.email = user.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id?: string | number }).id = token.id as string | number;
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
