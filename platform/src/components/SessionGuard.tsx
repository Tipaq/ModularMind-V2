"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/", "/login", "/register", "/features", "/pricing"];

/**
 * Watches session status and redirects to /login when the session expires.
 * Uses signOut() (not router.push) to clear the stale cookie and avoid loops.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (isPublic) return;

    if (status === "unauthenticated") {
      signOut({ callbackUrl: "/login" });
    }
  }, [status, pathname]);

  return <>{children}</>;
}
