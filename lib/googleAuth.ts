import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";

// Builds a Google OAuth2 client from the tokens we stored ourselves in
// planner_google_tokens (Supabase's session.provider_token is dropped on
// every session refresh, so we can't rely on it — see auth/callback/route.ts
// and api/calendar/sync/route.ts for the full story).
//
// Returns { client, error } rather than throwing, so callers can turn the
// error straight into a user-facing message.
export async function getGoogleClientForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { client: InstanceType<typeof google.auth.OAuth2>; error?: undefined }
  | { client?: undefined; error: string }
> {
  const { data: tokenRow, error: tokenError } = await supabase
    .from("planner_google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return {
      error:
        "No Google Calendar connection found. Please sign out and sign in again to grant calendar access.",
    };
  }

  if (!tokenRow.refresh_token) {
    return {
      error:
        "Google didn't return a refresh token last time you signed in. Please sign out, revoke access at https://myaccount.google.com/permissions, and sign in again.",
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.client_id,
    process.env.client_secret
  );
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await supabase
      .from("planner_google_tokens")
      .update({
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } catch (err) {
    return {
      error:
        "Google rejected the stored refresh token. Please sign out and sign in again.",
    };
  }

  return { client: oauth2Client };
}
