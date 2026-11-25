import { supabase } from "./supabase";
import { MAX_SESSION_MIN, SleepSession, elapsedMinutes } from "./sleep";

export interface SleepRow {
  id: string;
  bed_at: string;
  bed_tz: string;
  wake_at: string | null;
  wake_tz: string | null;
}

export const SLEEP_COLUMNS = "id, bed_at, bed_tz, wake_at, wake_tz";

export const toSession = (r: SleepRow): SleepSession => ({
  id: r.id,
  bedAt: Date.parse(r.bed_at),
  bedTz: r.bed_tz,
  wakeAt: r.wake_at ? Date.parse(r.wake_at) : null,
  wakeTz: r.wake_tz,
});

/** The sleep you are in right now, if any. */
export async function loadOpenSleep(): Promise<{ open: SleepSession | null; error: string | null }> {
  const { data, error } = await supabase().from("sleep_sessions").select(SLEEP_COLUMNS).is("wake_at", null).maybeSingle();
  if (error) return { open: null, error: error.message };
  return { open: data ? toSession(data as SleepRow) : null, error: null };
}

/**
 * Create or change a sleep (wakeAt null = still in bed). Returns an error message or null.
 * `onlyIfOpen` refuses to overwrite a sleep that was already ended, e.g. on another device.
 */
export async function saveSleep(s: Omit<SleepSession, "id"> & { id?: string }, onlyIfOpen = false): Promise<string | null> {
  const now = Date.now();
  if (!Number.isFinite(s.bedAt)) return "Enter when you went to bed.";
  if (s.bedAt > now) return "Bedtime can't be in the future.";
  if (s.wakeAt != null) {
    if (!Number.isFinite(s.wakeAt)) return "Enter when you woke up.";
    if (s.wakeAt > now) return "Wake time can't be in the future.";
    const len = elapsedMinutes(s.bedAt, s.wakeAt);
    if (len <= 0) return "Wake time has to be after bedtime. Check the dates.";
    if (len > MAX_SESSION_MIN) return "That's more than 24 hours. Check the dates.";
  }

  const bedIso = new Date(s.bedAt).toISOString();
  const wakeIso = s.wakeAt == null ? null : new Date(s.wakeAt).toISOString();
  const table = () => supabase().from("sleep_sessions");
  // overlap: starts before this one ends, and ends after this one starts (or hasn't ended)
  let q = table().select("id").or(`wake_at.is.null,wake_at.gt."${bedIso}"`).limit(1);
  if (wakeIso != null) q = q.lt("bed_at", wakeIso);
  if (s.id) q = q.neq("id", s.id);
  const { data: clash, error: clashError } = await q;
  if (clashError) return clashError.message;
  if (clash.length) return "This overlaps another sleep you logged.";

  const row = { bed_at: bedIso, bed_tz: s.bedTz, wake_at: wakeIso, wake_tz: wakeIso == null ? null : s.wakeTz };
  if (!s.id) {
    const { error } = await table().insert(row);
    return error ? (error.code === "23505" ? "You're already marked as in bed." : error.message) : null;
  }
  let u = table().update(row).eq("id", s.id);
  if (onlyIfOpen) u = u.is("wake_at", null);
  const { data, error } = await u.select("id");
  if (error) return error.message;
  return data.length ? null : "This sleep was already changed on another device.";
}

export async function deleteSleep(id: string): Promise<string | null> {
  const { error } = await supabase().from("sleep_sessions").delete().eq("id", id);
  return error?.message ?? null;
}
