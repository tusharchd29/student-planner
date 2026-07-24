import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="organic min-h-screen">
      <header className="nav mx-auto max-w-[720px]">
        <Link href="/" className="nav-brand">
          Student Planner
        </Link>
      </header>
      <div className="mx-auto max-w-[720px] px-[26.4px] py-[26.4px]">
        <h1 className="mb-[8.8px]">Privacy Policy</h1>
        <p className="text-muted mb-[17.6px] text-[13px]">Last updated: 2026</p>

        <p>
          Student Planner ("the app") helps students auto-schedule their day
          and sync it to Google Calendar. This page explains what data the
          app accesses, how it's used, and how to have it deleted.
        </p>

        <h3 className="mb-[8.8px] mt-[26.4px]">What we access</h3>
        <ul className="mb-[17.6px] flex list-disc flex-col gap-[4px] pl-[20px]">
          <li>
            Your Google account's basic profile info (name, email) when you
            sign in.
          </li>
          <li>
            Google Calendar access (the <code>calendar.events</code> scope
            only) — used solely to create, update, and delete events that
            represent your auto-generated study schedule. We never read your
            existing calendar events or any other Google data.
          </li>
          <li>
            Task data you enter into the app (titles, durations, deadlines,
            recurrence) — stored to build your schedule.
          </li>
        </ul>

        <h3 className="mb-[8.8px] mt-[26.4px]">How it's used</h3>
        <ul className="mb-[17.6px] flex list-disc flex-col gap-[4px] pl-[20px]">
          <li>
            Your tasks are used to generate a daily schedule and, optionally,
            synced as events on your Google Calendar.
          </li>
          <li>
            Free-text task descriptions you type (e.g. "essay due Friday, 2
            hours") are sent to Groq's API to be parsed into structured task
            data. Groq does not receive your Google account data.
          </li>
          <li>
            We never sell your data, use it for advertising, or share it with
            any third party beyond the processors above (Supabase for
            storage, Google for calendar sync, Groq for text parsing) needed
            to run the app.
          </li>
        </ul>

        <h3 className="mb-[8.8px] mt-[26.4px]">Data retention & deletion</h3>
        <p className="mb-[17.6px]">
          Your data is retained as long as your account exists. To request
          deletion of your account and all associated data, email{" "}
          <a href="mailto:tusharchd29@gmail.com">tusharchd29@gmail.com</a>.
          You can also revoke the app's access to your Google account at any
          time from{" "}
          <a href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h3 className="mb-[8.8px] mt-[26.4px]">Contact</h3>
        <p>
          Questions about this policy: email{" "}
          <a href="mailto:tusharchd29@gmail.com">tusharchd29@gmail.com</a>.
        </p>
      </div>
    </main>
  );
}
