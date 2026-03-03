"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { LoginForm } from "@modularmind/ui";

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = async (email: string, password: string) => {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return !result?.error;
  };

  return (
    <LoginForm
      subtitle="Sign in to the Platform"
      onLogin={handleLogin}
      onSuccess={() => router.push("/agents")}
      footer={
        <>
          No account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Register
          </Link>
        </>
      }
    />
  );
}
