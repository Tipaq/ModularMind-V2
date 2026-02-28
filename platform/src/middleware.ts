export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // Skip static files and api/auth routes
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
