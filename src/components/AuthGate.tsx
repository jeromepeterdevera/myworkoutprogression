"use client";

import { useAuth, signInWithGoogle, signInWithMicrosoft } from "@/lib/useAuth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-zinc-400">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <h1 className="text-3xl font-bold">Workout Log</h1>
          <p className="mt-2 text-zinc-500">Track your sessions and progressive overload.</p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={signInWithGoogle}
          className="flex items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-5 py-3 font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
          </svg>
          Sign in with Google
        </button>
        <button
          onClick={signInWithMicrosoft}
          className="flex items-center justify-center gap-3 rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft / Outlook
        </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
