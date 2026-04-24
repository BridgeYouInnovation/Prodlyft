import type { NextAuthConfig } from "next-auth";

export default {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    authorized({ auth, request }) {
      const user = auth?.user as { id?: string | number; is_admin?: boolean } | undefined;
      const isLoggedIn = !!user;
      const isAdmin = !!user?.is_admin;
      const path = request.nextUrl.pathname;

      // /admin/login is public so admins can sign in.
      if (path.startsWith("/admin") && path !== "/admin/login") {
        if (!isLoggedIn) {
          const url = new URL("/admin/login", request.nextUrl);
          url.searchParams.set("callbackUrl", request.nextUrl.pathname);
          return Response.redirect(url);
        }
        if (!isAdmin) {
          // Signed in as a regular user — send them to their own dashboard.
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      if (path.startsWith("/dashboard") && !isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as { id?: string | number; email?: string | null; is_admin?: boolean };
        token.id = u.id;
        token.email = u.email;
        token.is_admin = !!u.is_admin;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const t = token as { id?: string | number; is_admin?: boolean };
        (session.user as { id?: string | number; is_admin?: boolean }).id = t.id;
        (session.user as { id?: string | number; is_admin?: boolean }).is_admin = !!t.is_admin;
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
