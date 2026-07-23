import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = createRouteHandlerClient(
      { cookies },
      { options: { db: { schema: "planner" } } }
    );
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    const session = data?.session;
    if (session?.provider_token && session.user) {
      // Supabase only ever hands us the Google access/refresh token right
      // here, immediately after the OAuth exchange — it's dropped on every
      // later session refresh. Persist it ourselves so calendar sync can
      // mint fresh Google access tokens later using the refresh token.
      const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
      await supabase.from("planner_google_tokens").upsert({
        user_id: session.user.id,
        access_token: session.provider_token,
        refresh_token: session.provider_refresh_token ?? undefined,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
