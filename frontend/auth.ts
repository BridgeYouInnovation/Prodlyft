import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import authConfig from "./auth.config";
import { findUserByEmail } from "./lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await findUserByEmail(email);
        if (!user || !user.password) return null;
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          image: user.image,
          is_admin: user.is_admin,
          plan: user.plan || "free",
        } as unknown as {
          id: string;
          email: string;
          name: string | null;
          image: string | null;
          is_admin: boolean;
          plan: string;
        };
      },
    }),
  ],
});
