"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.events",
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  };

  return (
    <main className="organic flex min-h-screen flex-col items-center justify-center gap-[13.2px] px-6">
      <Link href="/" className="nav-brand mb-[8.8px]">
        Student Planner
      </Link>
      <p
        className="max-w-sm text-center text-[15px]"
        style={{ opacity: 0.75 }}
      >
        Sign in with Google to sync your auto-generated schedule to your
        calendar.
      </p>
      <button
        onClick={handleGoogleLogin}
        className="btn btn-primary"
        style={{ padding: "13.2px 26.4px", fontSize: "16px" }}
      >
        <GoogleIcon />
        Continue with Google
      </button>
    </main>
  );
}
