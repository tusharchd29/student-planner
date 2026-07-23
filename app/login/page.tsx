"use client";

import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.events",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Student Planner</h1>
      <p className="max-w-sm text-center text-sm text-slate-500">
        Sign in with Google to sync your auto-generated schedule to your
        calendar.
      </p>
      <button
        onClick={handleGoogleLogin}
        className="rounded-full bg-indigo-600 px-6 py-2 text-white shadow hover:bg-indigo-700"
      >
        Continue with Google
      </button>
    </main>
  );
}
