"use client";

import { supabase } from "@/lib/supabaseClient";

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

export async function signInWithGoogle() {
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
}

export function GoogleSignInButton({
  label,
  big = false,
}: {
  label: string;
  big?: boolean;
}) {
  return (
    <button
      onClick={signInWithGoogle}
      className="btn btn-primary"
      style={big ? { padding: "13.2px 26.4px", fontSize: "16px" } : undefined}
    >
      <GoogleIcon size={big ? 18 : 16} />
      {label}
    </button>
  );
}
