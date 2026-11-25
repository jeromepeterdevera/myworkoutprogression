"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SleepSession, formatClock, formatWallDate, wallAt, wallTime, zoneNote } from "@/lib/sleep";
import { loadOpenSleep } from "@/lib/sleepStore";

/** Shown on every page except Sleep while you're marked as in bed. */
export default function SleepBanner() {
  const path = usePathname();
  const [open, setOpen] = useState<SleepSession | null>(null);

  useEffect(() => {
    let live = true;
    const check = () =>
      loadOpenSleep().then((r) => {
        if (live) setOpen(r.open);
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path]);

  if (!open || path === "/sleep") return null;
  const bed = wallAt(open.bedAt, open.bedTz);
  return (
    <Link href="/sleep" className="flex items-center justify-between gap-3 bg-indigo-950 px-4 py-4 text-white">
      <span className="min-w-0 text-sm">
        In bed since <b>{formatClock(wallTime(bed))}</b>, {formatWallDate(bed)}
        {zoneNote(open.bedAt, open.bedTz)}
      </span>
      <span className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-950">I&apos;m awake</span>
    </Link>
  );
}
