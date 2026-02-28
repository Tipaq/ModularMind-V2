import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        // Platform users are admin-only — no password hash for now (first setup sets it)
        // In production, compare with bcrypt
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const isLoggedIn = !!session?.user;
      const { pathname } = request.nextUrl;

      // Public routes
      if (
        pathname === "/" ||
        pathname.startsWith("/features") ||
        pathname.startsWith("/pricing") ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/api/engines") ||
        pathname.startsWith("/api/sync") ||
        pathname.startsWith("/api/reports")
      ) {
        return true;
      }

      // Protected routes require auth
      return isLoggedIn;
    },
  },
  session: { strategy: "jwt" },
});
