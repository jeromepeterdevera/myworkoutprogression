/** "HH:MM" -> minutes after midnight */
export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM" from minutes after midnight (wraps around the day) */
export function fromMinutes(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes between going to bed and waking up; crossing midnight is handled. */
export function sleepMinutes(bed: string | null | undefined, wake: string | null | undefined) {
  if (!bed || !wake) return null;
  let d = toMinutes(wake) - toMinutes(bed);
  if (d <= 0) d += 1440;
  return d;
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 13:05 -> "1:05 PM" in the user's locale */
export function formatClock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const CYCLE_MIN = 90;
export const FALL_ASLEEP_MIN = 15;
