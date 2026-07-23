import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-3 text-3xl font-bold text-slate-900">
        Student Planner
      </h1>
      <p className="mb-8 max-w-xl text-lg text-slate-600">
        Student Planner turns your school commitments, homework, and
        personal time into one auto-generated daily schedule — then keeps it
        in sync with your Google Calendar.
      </p>

      <Link
        href="/login"
        className="mb-12 inline-block rounded-full bg-indigo-600 px-6 py-3 text-white shadow hover:bg-indigo-700"
      >
        Sign in with Google to get started
      </Link>

      <section className="grid gap-6 sm:grid-cols-2">
        <Feature
          title="Auto-generated schedule"
          body="Add your classes, assignments, and personal time — the app builds a realistic daily timeline around them, protecting rest time instead of always giving homework priority."
        />
        <Feature
          title="Google Calendar sync"
          body="Push your generated schedule straight to your Google Calendar, with reminders tuned to how urgent or long each task is."
        />
        <Feature
          title="Add tasks by just describing them"
          body="Type something like: history essay due Friday, about 2 hours. It gets parsed into a properly scheduled task automatically."
        />
        <Feature
          title="Weekly review"
          body="Get a short, honest summary of what you finished, what's overdue, and how your personal time held up — written in plain language, not just numbers."
        />
      </section>

      <footer className="mt-16 flex gap-4 text-sm text-slate-400">
        <Link href="/privacy" className="hover:text-slate-600">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-slate-600">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <h2 className="mb-1 font-semibold text-slate-800">{title}</h2>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}
