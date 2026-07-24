import Link from "next/link";

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

function CalendarClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <circle cx="15" cy="15" r="4" />
      <path d="M15 13.5V15l1 1" />
    </svg>
  );
}

function RefreshCwIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8a9 9 0 0 0-15-6.7L3 4" />
      <path d="M3 4v5h5" />
      <path d="M3 16a9 9 0 0 0 15 6.7l3-2.7" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

function MessageSquareTextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16v12H8l-4 4V4z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

function ClipboardCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="1" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}

const FEATURES = [
  {
    title: "Auto-generated schedule",
    body: "Add your classes, assignments, and personal time — the app builds a realistic daily timeline around them, protecting rest time instead of always giving homework priority.",
    icon: <CalendarClockIcon />,
    tone: "accent" as const,
  },
  {
    title: "Google Calendar sync",
    body: "Push your generated schedule straight to your Google Calendar, with reminders tuned to how urgent or long each task is.",
    icon: <RefreshCwIcon />,
    tone: "accent-2" as const,
  },
  {
    title: "Add tasks by describing them",
    body: "Type something like: history essay due Friday, about 2 hours. It gets parsed into a properly scheduled task automatically.",
    icon: <MessageSquareTextIcon />,
    tone: "accent" as const,
  },
  {
    title: "Weekly review",
    body: "Get a short, honest summary of what you finished, what's overdue, and how your personal time held up — written in plain language, not just numbers.",
    icon: <ClipboardCheckIcon />,
    tone: "accent-2" as const,
  },
];

const STEPS = [
  {
    title: "Add your stuff",
    body: "Classes, assignments, personal time — type it in plain language.",
  },
  {
    title: "We build your day",
    body: "A realistic timeline appears, rest time included.",
  },
  {
    title: "Sync to Google Calendar",
    body: "One click pushes it, with smart reminders attached.",
  },
  {
    title: "Review your week",
    body: "A plain-language summary of what actually happened.",
  },
];

type BlockKind = "fixed" | "flex" | "personal";

const SCHEDULE: {
  time: string;
  title: string;
  kind: BlockKind;
  done?: boolean;
}[] = [
  { time: "9:00 – 10:15", title: "Calculus lecture", kind: "fixed", done: true },
  { time: "10:30 – 12:00", title: "History essay (2h)", kind: "flex", done: true },
  { time: "12:30 – 13:15", title: "Lunch + walk", kind: "personal" },
  { time: "14:00 – 15:30", title: "Chem lab", kind: "fixed" },
  { time: "16:00 – 17:00", title: "Guitar practice", kind: "personal" },
  { time: "20:00 – 20:45", title: "Review flashcards", kind: "flex" },
];

const KIND_LABEL: Record<BlockKind, string> = {
  fixed: "Class",
  flex: "Task",
  personal: "Personal",
};

function kindColor(kind: BlockKind) {
  if (kind === "personal") {
    return { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-700)" };
  }
  if (kind === "flex") {
    return { bg: "var(--color-accent-100)", fg: "var(--color-accent-700)" };
  }
  return { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-700)" };
}

function ScheduleMockup() {
  return (
    <div
      className="w-full rounded-[28px] p-[17.6px]"
      style={{
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div className="mb-[13.2px] flex items-center justify-between">
        <div>
          <div
            className="text-[11px] uppercase"
            style={{ letterSpacing: "0.08em", opacity: 0.6 }}
          >
            Today · Wednesday
          </div>
          <h5 className="m-0">Your schedule</h5>
        </div>
        <span
          className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-[4px] text-[11px]"
          style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
        >
          <RefreshCwIcon />
          Synced
        </span>
      </div>

      <div className="flex flex-col gap-[8.8px]">
        {SCHEDULE.map((block) => {
          const colors = kindColor(block.kind);
          return (
            <div
              key={block.title}
              className="flex items-center gap-[13.2px] rounded-[16px] px-[13.2px] py-[10px]"
              style={{ background: "var(--color-bg)" }}
            >
              <span
                className="w-[64px] flex-none text-[12px]"
                style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}
              >
                {block.time}
              </span>
              <span
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{ background: colors.fg }}
              />
              <span
                className={`flex-1 text-[14px] ${block.done ? "line-through" : ""}`}
                style={{ opacity: block.done ? 0.5 : 1 }}
              >
                {block.title}
              </span>
              <span
                className="flex-none rounded-full px-[8px] py-[2px] text-[10px]"
                style={{ background: colors.bg, color: colors.fg }}
              >
                {KIND_LABEL[block.kind]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignInButton({ label, big = false }: { label: string; big?: boolean }) {
  return (
    <Link
      href="/login"
      className="btn btn-primary"
      style={
        big
          ? { padding: "13.2px 26.4px", fontSize: "16px" }
          : undefined
      }
    >
      <GoogleIcon size={big ? 18 : 16} />
      {label}
    </Link>
  );
}

export default function Home() {
  return (
    <main className="organic min-h-screen">
      {/* Nav */}
      <header className="nav mx-auto max-w-[1120px]">
        <span className="nav-brand">Student Planner</span>
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <SignInButton label="Sign in with Google" />
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1120px] px-[26.4px] py-[35.2px] grid gap-[35.2px] items-center md:grid-cols-[1fr_0.9fr]">
        <div>
          <span className="tag tag-accent-2 mb-[13.2px] inline-flex">
            Daily scheduling, sorted
          </span>
          <h1 className="max-w-[520px]">
            Your school life, actually scheduled.
          </h1>
          <p className="max-w-[460px] text-[17px]" style={{ opacity: 0.85 }}>
            Student Planner turns your classes, homework, and personal time
            into one auto-generated daily schedule — then keeps it in sync
            with your Google Calendar.
          </p>
          <div className="mt-[13.2px]">
            <SignInButton label="Sign in with Google to get started" big />
          </div>
        </div>
        <ScheduleMockup />
      </section>

      {/* Features */}
      <section
        id="features"
        className="mx-auto max-w-[1120px] px-[26.4px] pt-[26.4px] pb-[35.2px]"
      >
        <h2 className="max-w-[460px]">Four things it does, well.</h2>
        <div className="mt-[26.4px] flex max-w-[780px] flex-col gap-[17.6px]">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="card elev-sm flex-row items-start gap-[17.6px]"
            >
              <div
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full"
                style={{
                  background:
                    feature.tone === "accent"
                      ? "var(--color-accent-100)"
                      : "var(--color-accent-2-100)",
                  color:
                    feature.tone === "accent"
                      ? "var(--color-accent-700)"
                      : "var(--color-accent-2-700)",
                }}
              >
                {feature.icon}
              </div>
              <div>
                <h4>{feature.title}</h4>
                <p className="m-0 text-[13px]" style={{ opacity: 0.8 }}>
                  {feature.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="mx-auto max-w-[1120px] px-[26.4px] pt-[26.4px] pb-[35.2px]"
      >
        <h2 className="max-w-[460px]">How it works</h2>
        <div className="mt-[26.4px] flex max-w-[640px] flex-col gap-[17.6px]">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex items-start gap-[17.6px]">
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[15px]"
                style={{
                  background: "var(--color-accent-2-100)",
                  color: "var(--color-accent-2-700)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {i + 1}
              </span>
              <div>
                <h5 className="m-0 mb-1">{step.title}</h5>
                <p className="text-muted m-0 text-[14px]">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-[1120px] px-[26.4px] pb-[35.2px]">
        <div
          className="card elev-md flex-row flex-wrap items-center justify-between gap-[26.4px]"
          style={{
            background: "var(--color-accent-2-100)",
            padding: "26.4px",
          }}
        >
          <h2 className="max-w-[420px]">Stop guessing at your day.</h2>
          <SignInButton label="Sign in with Google" big />
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-[17.6px] px-[26.4px] pb-[26.4px] text-[13px]">
        <span className="text-muted">© 2026 Student Planner</span>
        <Link href="/privacy" className="text-muted hover:!text-[var(--color-accent)]">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-muted hover:!text-[var(--color-accent)]">
          Terms of Service
        </Link>
      </footer>
    </main>
  );
}
