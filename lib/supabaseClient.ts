import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// Points at the 'planner' Postgres schema rather than the default 'public'
// one, which this app shares with unrelated business data (Meraki client
// records, fitness tracking) in the same Supabase project. Requires
// 'planner' to be added to Project Settings -> Data API -> Exposed schemas
// in the Supabase dashboard, or every query here will 404.
export const supabase = createClientComponentClient({
  options: { db: { schema: "planner" } },
});
