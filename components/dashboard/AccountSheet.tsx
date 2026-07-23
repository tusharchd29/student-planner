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
    <div className="fixed inset-0 flex items-end bg-black/30">
      <div className="w-full rounded-t-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Account</h2>

        {done ? (
          <p className="mb-4 text-sm text-emerald-700">
            {done} Signing you out…
          </p>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="mb-1 font-medium text-slate-800">
                Export your data
              </h3>
              <p className="mb-2 text-sm text-slate-500">
                Download everything you've stored in the app as a JSON file.
              </p>
              <button
                onClick={exportData}
                disabled={exporting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                {exporting ? "Preparing…" : "Download my data"}
              </button>
            </div>

            <div className="mb-2 border-t pt-4">
              <h3 className="mb-1 font-medium text-red-700">
                Delete your account
              </h3>
              <p className="mb-2 text-sm text-slate-500">
                Permanently deletes all your tasks, calendar sync data, and
                settings. This can't be undone. Type DELETE to confirm.
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="mb-2 w-full rounded-lg border p-2"
              />
              <button
                onClick={deleteAccount}
                disabled={deleting || confirmText !== "DELETE"}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </button>
            </div>
          </>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {!done && (
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-lg border py-2 text-slate-600"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
