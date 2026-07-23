export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-slate-700">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">
        Terms of Service
      </h1>
      <p className="mb-4 text-sm text-slate-400">Last updated: 2026</p>

      <p className="mb-4">
        Student Planner is a personal productivity tool that auto-generates a
        daily schedule from tasks you enter and can sync that schedule to
        your Google Calendar. By using it, you agree to the following.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        The service
      </h2>
      <p className="mb-4">
        The app is provided as-is, without warranty of any kind. It is a
        personal/small-scale project — not a commercial service — and may
        change, be interrupted, or be discontinued at any time without
        notice.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        Your responsibilities
      </h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
        <li>You're responsible for the accuracy of the tasks you enter.</li>
        <li>
          Don't use the app to store or process anyone else's data without
          their consent.
        </li>
        <li>
          Don't attempt to abuse, overload, or reverse-engineer the service.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        Google Calendar integration
      </h2>
      <p className="mb-4">
        If you connect Google Calendar, the app will create, update, and
        delete events on your calendar to reflect your schedule. You can
        disconnect this access at any time via{" "}
        <a
          href="https://myaccount.google.com/permissions"
          className="text-indigo-600 underline"
        >
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        Limitation of liability
      </h2>
      <p className="mb-4">
        The app is not liable for missed deadlines, scheduling errors, or any
        damages arising from its use. It's a scheduling aid, not a guarantee.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-900">
        Contact
      </h2>
      <p>
        Questions about these terms: email{" "}
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
