// ---------- clock helpers ----------

/** "HH:MM" -> minutes after midnight */
export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const mod = (v: number, n: number) => ((v % n) + n) % n;

/** "HH:MM" from minutes after midnight (wraps around the day) */
export function fromMinutes(min: number) {
  const m = mod(Math.round(min), 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDuration(min: number) {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 13:05 -> "1:05 PM" in the user's locale */
export function formatClock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ---------- wall-clock date-times: "YYYY-MM-DDTHH:MM", what a clock showed, no time zone ----------

/** Milliseconds on a zone-less scale, for arithmetic on wall-clock times. Not a real moment. */
const wallMs = (w: string) => Date.parse(`${w}:00Z`);
const wallFromMs = (ms: number) => new Date(ms).toISOString().slice(0, 16);
export const addMinutes = (w: string, min: number) => wallFromMs(wallMs(w) + min * 60000);
/** Distance between two clock readings; for real elapsed time use elapsedMinutes on moments. */
export const wallMinutesBetween = (a: string, b: string) => Math.round((wallMs(b) - wallMs(a)) / 60000);
export const wallDate = (w: string) => w.slice(0, 10);
export const wallTime = (w: string) => w.slice(11, 16);

// ---------- moments (ms since epoch) and time zones ----------

export const elapsedMinutes = (from: number, to: number) => Math.round((to - from) / 60000);
/** Now, to the whole minute. */
export const nowMs = () => Math.floor(Date.now() / 60000) * 60000;

export function deviceZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formats = new Map<string, Intl.DateTimeFormat>();
function zoneFormat(tz: string) {
  let f = formats.get(tz);
  if (!f) {
    const make = (timeZone: string) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    try {
      f = make(tz);
    } catch {
      f = make("UTC"); // a zone this browser doesn't know
    }
    formats.set(tz, f);
  }
  return f;
}

/** What the clock in `tz` shows at this moment. */
export function wallAt(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of zoneFormat(tz).formatToParts(ms)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * The moment the clock in `tz` shows `wall`. When clocks go back and a time happens twice, the first one;
 * when clocks go forward and a time is skipped, the same distance after the jump.
 */
export function momentOf(wall: string, tz: string) {
  const target = wallMs(wall);
  const offsetAt = (ms: number) => wallMs(wallAt(ms, tz)) - ms;
  const before = offsetAt(target - 86400000);
  const after = offsetAt(target + 86400000);
  const hits = [target - before, target - after].filter((ms) => wallAt(ms, tz) === wall);
  return hits.length ? Math.min(...hits) : target - before;
}

/** "Asia/Manila" -> "Manila" */
export const zoneCity = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

/** " (Tokyo)" when the zone's clock differs from this device's at that moment, otherwise nothing. */
export function zoneNote(ms: number, tz: string) {
  return wallAt(ms, tz) === wallAt(ms, deviceZone()) ? "" : ` (${zoneCity(tz)})`;
}

export function allZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

/** "Tue, Nov 25" */
export function formatWallDate(w: string) {
  const [y, m, d] = wallDate(w).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ---------- sessions ----------

export interface SleepSession {
  id: string;
  /** exact moments; wakeAt is null while still in bed */
  bedAt: number;
  bedTz: string;
  wakeAt: number | null;
  wakeTz: string | null;
}

/** A finished sleep with its estimates. `bed` and `wake` are what the local clock showed. */
export interface SleepNight {
  id: string;
  bedAt: number;
  bedTz: string;
  wakeAt: number;
  wakeTz: string;
  bed: string;
  wake: string;
  inBed: number;
  /** estimated minutes to fall asleep; 0 for naps */
  latency: number;
  asleep: number;
  factors: LatencyFactor[];
  nap: boolean;
}

export const MAX_SESSION_MIN = 1440;
/** an open session longer than this was probably forgotten */
export const FORGOTTEN_MIN = 16 * 60;
/** sleeps closer together than this are one broken-up night */
export const SAME_NIGHT_GAP_MIN = 180;

/** Short sleeps that start in the daytime (9 AM to 8 PM). */
export function isNap(bed: string, inBed: number) {
  const start = toMinutes(wallTime(bed));
  return inBed < 180 && start >= 540 && start < 1200;
}

/** The day you were awake before this bedtime: anything before noon belongs to the day before. */
export const dayBeforeBed = (bed: string) => wallDate(addMinutes(bed, -720));

/** Bedtime and wake time of the day's main sleep; a broken-up night counts as one. */
export function mainSleep(nights: SleepNight[]): { bed: string; wake: string } | null {
  const sorted = nights.filter((n) => !n.nap).sort((a, b) => a.bedAt - b.bedAt);
  const groups: { bed: string; wake: string; wakeAt: number; asleep: number }[] = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    if (g && elapsedMinutes(g.wakeAt, n.bedAt) < SAME_NIGHT_GAP_MIN) {
      g.wake = n.wake;
      g.wakeAt = n.wakeAt;
      g.asleep += n.asleep;
    } else groups.push({ bed: n.bed, wake: n.wake, wakeAt: n.wakeAt, asleep: n.asleep });
  }
  return groups.sort((a, b) => b.asleep - a.asleep)[0] ?? null;
}

/** Shortest signed distance from a to b on the clock, −720..720 minutes. */
const clockDiff = (a: number, b: number) => mod(b - a + 720, 1440) - 720;

/** Average clock time (minutes after midnight) and its spread, handling times either side of midnight. */
export function clockStats(minutes: number[]): { mean: number; spread: number } | null {
  if (!minutes.length) return null;
  const ang = minutes.map((m) => (m / 1440) * 2 * Math.PI);
  const x = ang.reduce((a, t) => a + Math.cos(t), 0);
  const y = ang.reduce((a, t) => a + Math.sin(t), 0);
  const mean = mod((Math.atan2(y, x) / (2 * Math.PI)) * 1440, 1440);
  const spread = Math.sqrt(minutes.reduce((a, m) => a + clockDiff(mean, m) ** 2, 0) / minutes.length);
  return { mean, spread };
}

// ---------- goal ----------

export const CYCLE_MIN = 90;
export const FALL_ASLEEP_MIN = 15;
export const SLEEP_GOAL_KEY = "sleep-goal-min";
export const SLEEP_GOALS = [420, 450, 480, 510, 540];

export function readSleepGoal() {
  try {
    const v = Number(localStorage.getItem(SLEEP_GOAL_KEY));
    if (SLEEP_GOALS.includes(v)) return v;
  } catch {}
  return 480;
}

// ---------- time to fall asleep ----------

/** What we know before a sleep, to guess how long it took to fall asleep. */
export interface SleepContext {
  /** workout calories burned on the day before going to bed */
  exerciseKcal: number | null;
  /** that day's intake − burn, null if meals or profile are missing */
  balance: number | null;
  /** estimated minutes asleep the night before, null if not logged */
  prevNightAsleep: number | null;
  /** bedtimes ("HH:MM") of up to 7 main sleeps before */
  recentBeds: string[];
  /** sleep goal in minutes, used as your sleep need */
  goalMin: number;
}

export interface LatencyFactor {
  label: string;
  minutes: number;
}

const MIN_LATENCY = 5;
const MAX_LATENCY = 60;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Educated guess at how long it took to fall asleep after getting into bed (sleep onset latency).
 * Starts from a typical 15 minutes and adjusts for:
 *  - how active the day was: more exercise builds sleep pressure (up to 5 min faster, a rest day is a bit slower)
 *  - eating: a big surplus or a big deficit (going to bed hungry) both make it slower
 *  - sleep debt: a short night before makes you fall asleep faster
 *  - bedtime: going to bed well before your usual time makes it slower, later makes it faster
 * The result is kept between 5 and 60 minutes.
 */
export function estimateLatency(bed: string, ctx: SleepContext): { minutes: number; factors: LatencyFactor[] } {
  const factors: LatencyFactor[] = [];
  const add = (label: string, m: number) => {
    const r = Math.round(m);
    if (r !== 0) factors.push({ label, minutes: r });
  };

  if (ctx.exerciseKcal != null) {
    const k = ctx.exerciseKcal;
    if (k < 50) add("Rest day, less sleep pressure", 3);
    else add(`Active day (≈ ${Math.round(k)} kcal of workouts)`, (-5 * Math.min(k, 800)) / 800);
  }

  if (ctx.balance != null) {
    const b = ctx.balance;
    if (b > 300) add(`Ate ${Math.round(b)} kcal more than you burned`, Math.min(6, (b - 300) / 150));
    else if (b < -700) add(`Big deficit (${Math.round(-b)} kcal), hunger can keep you up`, Math.min(6, (-b - 700) / 150));
  }

  if (ctx.prevNightAsleep != null) {
    const short = ctx.goalMin - ctx.prevNightAsleep;
    if (short > 30) add(`Short sleep the night before (${formatDuration(ctx.prevNightAsleep)})`, -Math.min(8, (short / 60) * 3));
    else if (short < -60) add("Slept long the night before", Math.min(4, ((-short - 60) / 60) * 2));
  }

  if (ctx.recentBeds.length >= 3) {
    const tonight = toMinutes(bed);
    const diffs = ctx.recentBeds.map((b) => clockDiff(tonight, toMinutes(b))).sort((a, b) => a - b);
    const earlier = diffs[Math.floor(diffs.length / 2)];
    // more than 6 hours off is a different schedule (e.g. after a night shift), not an early or late night
    if (earlier > 30 && earlier <= 360) add(`In bed ${formatDuration(earlier)} earlier than usual`, Math.min(12, ((earlier - 30) / 60) * 8));
    else if (earlier < -30 && earlier >= -360) add(`In bed ${formatDuration(-earlier)} later than usual`, -Math.min(5, ((-earlier - 30) / 60) * 4));
  }

  const raw = FALL_ASLEEP_MIN + factors.reduce((a, f) => a + f.minutes, 0);
  return { minutes: Math.round(clamp(raw, MIN_LATENCY, MAX_LATENCY)), factors };
}
