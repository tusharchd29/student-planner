import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type GuardResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; status: number; error: string };

type RateLimit = {
  bucket: string;
  limit: number;
  /** Postgres interval string, e.g. '1 hour', '1 day'. */
  window: string;
};

/**
 * Every API route should start with this. It does two things that were
 * previously either duplicated or (in /api/tasks/parse) missing entirely:
 *
 *   1. Verifies there's an authenticated user. The parse route had NO auth
 *      check at all, which meant anyone who found the URL could burn our
 *      Groq API key as free LLM inference.
 *   2. Optionally enforces a per-user rate limit, tracked in Postgres —
 *      serverless functions can't share in-memory counters, so an
 *      in-process limiter would be trivially bypassed by hitting a
 *      different instance.
 */
export async function guard(
  rateLimit?: RateLimit
): Promise<GuardResult> {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Not signed in" };
  }

  if (rateLimit) {
    // Note: no user id is passed — the function derives it from auth.uid()
    // internally. An earlier version took it as an argument, which let any
    // signed-in user exhaust someone else's limit by passing their id.
    const { data: allowed, error } = await supabase.rpc(
      "planner_check_rate_limit",
      {
        p_bucket: rateLimit.bucket,
        p_limit: rateLimit.limit,
        p_window: rateLimit.window,
      }
    );

    // Fail closed on a limiter error — better to reject a legitimate
    // request than to leave the limit unenforced.
    if (error) {
      console.error("Rate limit check failed:", error);
      return { ok: false, status: 503, error: "Service temporarily unavailable" };
    }

    if (allowed === false) {
      return {
        ok: false,
        status: 429,
        error: "You've hit the limit for this action. Please try again later.",
      };
    }
  }

  return { ok: true, supabase, user };
}
