import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";

/** Sliding-window refresh threshold: re-validate user from DB every hour. */
const JWT_REFRESH_SECONDS = 60 * 60; // 1 hour

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in — stamp the token
      if (user) {
        token.role = (user as { role: string }).role;
        token.issuedAt = Math.floor(Date.now() / 1000);
        return token;
      }

      // Sliding refresh — re-validate user from DB every hour
      const now = Math.floor(Date.now() / 1000);
      const issued = (token.issuedAt as number) ?? 0;
      if (now - issued > JWT_REFRESH_SECONDS) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub! },
          select: { id: true, role: true },
        });
        if (!dbUser) {
          // User deleted — invalidate session
          return {} as typeof token;
        }
        token.role = dbUser.role;
        token.issuedAt = now;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;

      // Public routes
      if (
        pathname === "/" ||
        pathname.startsWith("/features") ||
        pathname.startsWith("/pricing") ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/api/engines") ||
        pathname.startsWith("/api/install") ||
        pathname.startsWith("/api/sync") ||
        pathname.startsWith("/api/reports") ||
        pathname.startsWith("/api/mini-apps") ||
        pathname.startsWith("/sdk/")
      ) {
        return true;
      }

      // Require valid session with user ID (catches empty tokens from deleted users)
      return !!session?.user?.id;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days hard expiry
  },
});
