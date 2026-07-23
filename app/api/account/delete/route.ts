import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guard } from "@/lib/apiGuard";

// Deletes everything tied to the requesting user: all task data, Google
// tokens, settings, cached reports, rate-limit counters — and, if a
// service role key is configured, the auth account itself (row deletion
// alone can't remove the auth.users row; that needs an admin-privileged
// client, which is why this is optional and gracefully degrades rather
// than crashing when SUPABASE_SERVICE_ROLE_KEY isn't set).
export async function POST() {
  const auth = await guard({ bucket: "account_delete", limit: 3, window: "1 hour" });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const tables = [
    "planner_fixed_events",
    "planner_flex_tasks",
    "planner_personal_tasks",
    "planner_google_tokens",
    "planner_weekly_reports",
    "planner_user_settings",
    "planner_rate_limits",
  ];

  const results = await Promise.allSettled(
    tables.map((t) => supabase.from(t).delete().eq("user_id", user.id))
  );
  const failedTables = results
    .map((r, i) => (r.status === "rejected" ? tables[i] : null))
    .filter(Boolean);

  if (failedTables.length > 0) {
    console.error("Account deletion: some tables failed to clear:", failedTables);
    return NextResponse.json(
      {
        error:
          "Some of your data couldn't be deleted. Please try again or contact support.",
        failedTables,
      },
      { status: 500 }
    );
  }

  // Optional: fully close the auth account too, if we have admin access.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let accountClosed = false;

  if (serviceRoleKey && supabaseUrl) {
    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { error } = await adminClient.auth.admin.deleteUser(user.id);
      if (!error) accountClosed = true;
    } catch (err) {
      console.error("Failed to close auth account:", err);
    }
  }

  return NextResponse.json({
    dataDeleted: true,
    accountClosed,
    message: accountClosed
      ? "All your data and your account have been deleted."
      : "All your data has been deleted. Your login credential could not be fully removed automatically — contact support to close it entirely, or it will simply have no data associated with it if you sign in again.",
  });
}
