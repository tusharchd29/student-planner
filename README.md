# Student Planner

AI-assisted daily planner for students. Auto-generates a schedule from
fixed commitments (school, tuition, sport), flexible academic tasks
(homework, revision), and protected personal time (hobbies, rest) —
then syncs it to Google Calendar.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (auth + DB)
· Google Calendar API

## Setup

### 1. Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project.
2. Open the **SQL Editor** and run `supabase/schema.sql`.
3. **Project Settings → API** → copy `Project URL` and `anon public` key
   into `.env.local` (copy `.env.local.example` first).

### 2. Google Cloud OAuth app
1. [console.cloud.google.com](https://console.cloud.google.com) → new
   or existing project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → configure (External is
   fine for testing).
4. **Credentials → Create Credentials → OAuth client ID** → **Web
   application**.
   - Redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   - Copy the Client ID and Client Secret.

### 3. Connect Google to Supabase
1. Supabase → **Authentication → Providers → Google** → paste Client ID
   + Secret → enable.
2. **Authentication → URL Configuration** → add
   `http://localhost:3000/auth/callback` (and your production URL later)
   to the redirect allow-list.

### 4. Run locally
```bash
npm install
npm run dev
```
Visit `http://localhost:3000`.

### 5. Deploy
Import this repo into Vercel, add the two `NEXT_PUBLIC_SUPABASE_*` env
vars, and update the Google OAuth redirect URI + Supabase allow-list to
include the production domain.

## Roadmap

- ~~Phase 3: Groq-powered natural-language task entry~~ ✅ done — "Quick add"
  in the Add Task sheet, plus automatic missed-task re-slotting on load
- Phase 4: adaptive reminders, streaks/nudges
- Phase 5: Groq-generated weekly narrative report
