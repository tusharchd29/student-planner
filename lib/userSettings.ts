import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "./timezone";

// Looks up the user's stored timezone preference, falling back to
// DEFAULT_TIMEZONE if they haven't set one yet (or the row somehow holds
// something Intl won't accept).
export async function getUserTimezone(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("planner_user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.timezone && isValidTimeZone(data.timezone)) {
    return data.timezone;
  }
  return DEFAULT_TIMEZONE;
}
