import Link from "next/link";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function LoginPage() {
  return (
    <main className="organic flex min-h-screen flex-col items-center justify-center gap-[13.2px] px-6">
      <Link href="/" className="nav-brand mb-[8.8px]">
        Student Planner
      </Link>
      <p
        className="max-w-sm text-center text-[15px]"
        style={{ opacity: 0.75 }}
      >
        Sign in with Google to sync your auto-generated schedule to your
        calendar.
      </p>
      <GoogleSignInButton label="Continue with Google" big />
    </main>
  );
}
