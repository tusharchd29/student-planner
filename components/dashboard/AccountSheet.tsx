"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function exportData() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        setError("Couldn't export your data. Please try again.");
        setExporting(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `student-planner-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error while exporting.");
    }
    setExporting(false);
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't delete your account. Please try again.");
        setDeleting(false);
        return;
      }
      setDone(data.message);
      // Sign out locally and bounce to the homepage — the account and all
      // its data are gone regardless of whether Supabase Auth itself
      // could be fully closed (see route for why that's best-effort).
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = "/";
      }, 2500);
    } catch {
      setError("Network error while deleting your account.");
      setDeleting(false);
    }
  }

  return (
    <div className="organic sheet-backdrop">
      <div className="sheet">
        <h4 className="mb-[13.2px]">Account</h4>

        {done ? (
          <p className="banner banner-success mb-[13.2px]">
            {done} Signing you out…
          </p>
        ) : (
          <>
            <div className="mb-[26.4px]">
              <h5 className="mb-[4px]">Export your data</h5>
              <p className="text-muted mb-[8.8px] text-[13px]">
                Download everything you've stored in the app as a JSON file.
              </p>
              <button
                onClick={exportData}
                disabled={exporting}
                className="btn btn-secondary"
              >
                {exporting ? "Preparing…" : "Download my data"}
              </button>
            </div>

            <div
              className="mb-[8.8px] pt-[17.6px]"
              style={{ borderTop: "1px solid var(--color-divider)" }}
            >
              <h5
                className="mb-[4px]"
                style={{ color: "var(--color-accent-900)" }}
              >
                Delete your account
              </h5>
              <p className="text-muted mb-[8.8px] text-[13px]">
                Permanently deletes all your tasks, calendar sync data, and
                settings. This can&apos;t be undone. Type DELETE to confirm.
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="input mb-[8.8px]"
              />
              <button
                onClick={deleteAccount}
                disabled={deleting || confirmText !== "DELETE"}
                className="btn btn-danger-solid"
              >
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </button>
            </div>
          </>
        )}

        {error && <p className="banner banner-error mb-[13.2px]">{error}</p>}

        {!done && (
          <button
            onClick={onClose}
            className="btn btn-secondary mt-[13.2px] w-full"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
