export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-slate-700">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">
        Privacy Policy
      </h1>
      <p className="mb-4 text-sm text-slate-400">Last updated: 2026</p>

      <p className="mb-4">
        Student Planner ("the app") helps students auto-schedule their day
        and sync it to Google Calendar. This page explains what data the app
        accesses, how it's used, and how to have it deleted.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        What we access
      </h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
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

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        How it's used
      </h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
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

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        Data retention & deletion
      </h2>
      <p className="mb-4">
        Your data is retained as long as your account exists. To request
        deletion of your account and all associated data, email{" "}
        <a
          href="mailto:tusharchd29@gmail.com"
          className="text-indigo-600 underline"
        >
          tusharchd29@gmail.com
        </a>
        . You can also revoke the app's access to your Google account at any
        time from{" "}
        <a
          href="https://myaccount.google.com/permissions"
          className="text-indigo-600 underline"
        >
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        Contact
      </h2>
      <p>
        Questions about this policy: email{" "}
        <a
          href="mailto:tusharchd29@gmail.com"
          className="text-indigo-600 underline"
        >
          tusharchd29@gmail.com
        </a>
        .
      </p>
    </main>
  );
}
