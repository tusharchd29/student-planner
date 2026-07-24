import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="organic min-h-screen">
      <header className="nav mx-auto max-w-[720px]">
        <Link href="/" className="nav-brand">
          Student Planner
        </Link>
      </header>
      <div className="mx-auto max-w-[720px] px-[26.4px] py-[26.4px]">
        <h1 className="mb-[8.8px]">Terms of Service</h1>
        <p className="text-muted mb-[17.6px] text-[13px]">Last updated: 2026</p>

        <p>
          Student Planner is a personal productivity tool that auto-generates
          a daily schedule from tasks you enter and can sync that schedule to
          your Google Calendar. By using it, you agree to the following.
        </p>

        <h3 className="mb-[8.8px] mt-[26.4px]">The service</h3>
        <p className="mb-[17.6px]">
          The app is provided as-is, without warranty of any kind. It is a
          personal/small-scale project — not a commercial service — and may
          change, be interrupted, or be discontinued at any time without
          notice.
        </p>

        <h3 className="mb-[8.8px] mt-[26.4px]">Your responsibilities</h3>
        <ul className="mb-[17.6px] flex list-disc flex-col gap-[4px] pl-[20px]">
          <li>You're responsible for the accuracy of the tasks you enter.</li>
          <li>
            Don't use the app to store or process anyone else's data without
            their consent.
          </li>
          <li>
            Don't attempt to abuse, overload, or reverse-engineer the
            service.
          </li>
        </ul>

        <h3 className="mb-[8.8px] mt-[26.4px]">
          Google Calendar integration
        </h3>
        <p className="mb-[17.6px]">
          If you connect Google Calendar, the app will create, update, and
          delete events on your calendar to reflect your schedule. You can
          disconnect this access at any time via{" "}
          <a href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h3 className="mb-[8.8px] mt-[26.4px]">Limitation of liability</h3>
        <p className="mb-[17.6px]">
          The app is not liable for missed deadlines, scheduling errors, or
          any damages arising from its use. It's a scheduling aid, not a
          guarantee.
        </p>

        <h3 className="mb-[8.8px] mt-[26.4px]">Contact</h3>
        <p>
          Questions about these terms: email{" "}
          <a href="mailto:tusharchd29@gmail.com">tusharchd29@gmail.com</a>.
        </p>
      </div>
    </main>
  );
}
