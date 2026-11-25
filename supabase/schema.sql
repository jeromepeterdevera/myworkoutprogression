-- Workout Progression App schema
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists exercises_user_name_uq
  on public.exercises (user_id, lower(name));

create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text check (type in ('push','pull','legs','upper','lower','rest')),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.day_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  section text not null check (section in ('main','core')),
  position int not null default 0,
  unit text not null default 'kg' check (unit in ('kg','lb')),
  mode text not null default 'reps' check (mode in ('reps','time')),
  -- sets: [{ "reps": 10, "weight": 40, "seconds": null }, ...]
  sets jsonb not null default '[]'::jsonb
);
create index if not exists day_exercises_day_idx on public.day_exercises (day_id);
create index if not exists day_exercises_ex_idx on public.day_exercises (exercise_id);

-- Table privileges for signed-in users (newer Supabase projects don't grant these automatically).
-- Row Level Security below still restricts each user to their own rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.exercises, public.workout_days, public.day_exercises to authenticated;

-- Row Level Security: each signed-in user only ever sees their own rows
alter table public.exercises enable row level security;
alter table public.workout_days enable row level security;
alter table public.day_exercises enable row level security;

drop policy if exists "own exercises" on public.exercises;
create policy "own exercises" on public.exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own days" on public.workout_days;
create policy "own days" on public.workout_days
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own day exercises" on public.day_exercises;
create policy "own day exercises" on public.day_exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Saves a whole day in one transaction.
-- p_items: [{ "name": "Bench Press", "section": "main", "unit": "kg", "mode": "reps",
--             "sets": [{ "reps": 10, "weight": 40, "seconds": null }] }]
-- Weight-training duration in minutes (optional; used for the calorie-burn estimate)
alter table public.workout_days add column if not exists duration_min numeric check (duration_min > 0);

-- (older versions of this function had 3 parameters)
drop function if exists public.save_day(date, text, jsonb);
create or replace function public.save_day(p_date date, p_type text, p_items jsonb, p_duration_min numeric default null)
returns void
language plpgsql
security invoker
as $$
declare
  v_day_id uuid;
  v_ex_id uuid;
  v_item jsonb;
  v_pos int := 0;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if p_type is null and p_duration_min is null and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    delete from public.workout_days where user_id = auth.uid() and date = p_date;
    return;
  end if;

  insert into public.workout_days (user_id, date, type, duration_min, updated_at)
  values (auth.uid(), p_date, p_type, p_duration_min, now())
  on conflict (user_id, date) do update
    set type = excluded.type, duration_min = excluded.duration_min, updated_at = now()
  returning id into v_day_id;

  delete from public.day_exercises where day_id = v_day_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_name := btrim(v_item->>'name');
    if v_name is null or v_name = '' then
      continue;
    end if;

    select id into v_ex_id from public.exercises
      where user_id = auth.uid() and lower(name) = lower(v_name);
    if v_ex_id is null then
      insert into public.exercises (user_id, name) values (auth.uid(), v_name)
      returning id into v_ex_id;
    end if;

    insert into public.day_exercises (user_id, day_id, exercise_id, section, position, unit, mode, sets)
    values (
      auth.uid(), v_day_id, v_ex_id,
      coalesce(v_item->>'section', 'main'),
      v_pos,
      coalesce(v_item->>'unit', 'kg'),
      coalesce(v_item->>'mode', 'reps'),
      coalesce(v_item->'sets', '[]'::jsonb)
    );
    v_pos := v_pos + 1;
  end loop;
end;
$$;

grant execute on function public.save_day(date, text, jsonb, numeric) to authenticated;

-- ============================================================
-- Daily log (morning weight + last night's sleep), foods and meals
-- ============================================================

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric check (weight_kg > 0),
  bed_time time,   -- when you went to bed the night before this date
  wake_time time,  -- when you woke up on this date
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Your personal food library. Macros are per base_amount of base_unit (e.g. 100 g, 1 piece).
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  base_amount numeric not null default 100 check (base_amount > 0),
  base_unit text not null default 'g',
  calories numeric check (calories >= 0), -- null = calculated from macros
  protein numeric not null default 0 check (protein >= 0),
  carbs numeric not null default 0 check (carbs >= 0),
  fat numeric not null default 0 check (fat >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists foods_user_name_uq on public.foods (user_id, lower(name));

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner','snack')),
  position int not null default 0,
  food_id uuid not null references public.foods(id) on delete restrict,
  quantity numeric not null check (quantity > 0)
);
create index if not exists meal_items_user_date_idx on public.meal_items (user_id, date);
create index if not exists meal_items_food_idx on public.meal_items (food_id);

grant select, insert, update, delete on public.daily_logs, public.foods, public.meal_items to authenticated;

alter table public.daily_logs enable row level security;
alter table public.foods enable row level security;
alter table public.meal_items enable row level security;

drop policy if exists "own daily logs" on public.daily_logs;
create policy "own daily logs" on public.daily_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own foods" on public.foods;
create policy "own foods" on public.foods
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own meal items" on public.meal_items;
create policy "own meal items" on public.meal_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Saves weight + sleep for a day. All nulls removes the row.
create or replace function public.save_daily_log(p_date date, p_weight_kg numeric, p_bed_time time, p_wake_time time)
returns void
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if p_weight_kg is null and p_bed_time is null and p_wake_time is null then
    delete from public.daily_logs where user_id = auth.uid() and date = p_date;
    return;
  end if;

  insert into public.daily_logs (user_id, date, weight_kg, bed_time, wake_time, updated_at)
  values (auth.uid(), p_date, p_weight_kg, p_bed_time, p_wake_time, now())
  on conflict (user_id, date) do update
    set weight_kg = excluded.weight_kg, bed_time = excluded.bed_time,
        wake_time = excluded.wake_time, updated_at = now();
end;
$$;

-- Replaces all meal items for a day in one transaction.
-- p_items: [{ "food_id": "...", "meal": "breakfast", "quantity": 150 }]
create or replace function public.save_meals(p_date date, p_items jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  v_item jsonb;
  v_pos int := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  delete from public.meal_items where user_id = auth.uid() and date = p_date;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
      continue;
    end if;
    if not exists (select 1 from public.foods where id = (v_item->>'food_id')::uuid and user_id = auth.uid()) then
      raise exception 'unknown food';
    end if;
    insert into public.meal_items (user_id, date, meal, position, food_id, quantity)
    values (auth.uid(), p_date, v_item->>'meal', v_pos, (v_item->>'food_id')::uuid, (v_item->>'quantity')::numeric);
    v_pos := v_pos + 1;
  end loop;
end;
$$;

grant execute on function public.save_daily_log(date, numeric, time, time) to authenticated;
grant execute on function public.save_meals(date, jsonb) to authenticated;

-- ============================================================
-- Sports, runs and profile (for calorie-burn estimates)
-- ============================================================

create table if not exists public.sport_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  position int not null default 0,
  sport text not null,
  minutes numeric not null check (minutes > 0),
  intensity text not null default 'moderate' check (intensity in ('light','moderate','vigorous')),
  -- sets: [{ "us": 21, "them": 18 }, ...]
  sets jsonb not null default '[]'::jsonb
);
create index if not exists sport_sessions_user_date_idx on public.sport_sessions (user_id, date);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  position int not null default 0,
  seconds int not null check (seconds > 0),
  distance numeric check (distance > 0),
  distance_unit text not null default 'km' check (distance_unit in ('km','mi'))
);
create index if not exists runs_user_date_idx on public.runs (user_id, date);

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  sex text check (sex in ('male','female')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric check (height_cm > 0),
  activity_factor numeric not null default 1.2 check (activity_factor between 1 and 2.5),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.sport_sessions, public.runs, public.profiles to authenticated;

alter table public.sport_sessions enable row level security;
alter table public.runs enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "own sport sessions" on public.sport_sessions;
create policy "own sport sessions" on public.sport_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own runs" on public.runs;
create policy "own runs" on public.runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Replaces all sports and runs for a day in one transaction.
-- p_sports: [{ "sport": "Tennis", "minutes": 60, "intensity": "moderate", "sets": [{ "us": 6, "them": 4 }] }]
-- p_runs:   [{ "seconds": 1800, "distance": 5, "distance_unit": "km" }]
create or replace function public.save_activities(p_date date, p_sports jsonb, p_runs jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  v_item jsonb;
  v_pos int := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  delete from public.sport_sessions where user_id = auth.uid() and date = p_date;
  delete from public.runs where user_id = auth.uid() and date = p_date;

  for v_item in select * from jsonb_array_elements(coalesce(p_sports, '[]'::jsonb)) loop
    if coalesce(btrim(v_item->>'sport'), '') = '' or coalesce((v_item->>'minutes')::numeric, 0) <= 0 then
      continue;
    end if;
    insert into public.sport_sessions (user_id, date, position, sport, minutes, intensity, sets)
    values (auth.uid(), p_date, v_pos, btrim(v_item->>'sport'), (v_item->>'minutes')::numeric,
            coalesce(v_item->>'intensity', 'moderate'), coalesce(v_item->'sets', '[]'::jsonb));
    v_pos := v_pos + 1;
  end loop;

  v_pos := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_runs, '[]'::jsonb)) loop
    if coalesce((v_item->>'seconds')::int, 0) <= 0 then
      continue;
    end if;
    insert into public.runs (user_id, date, position, seconds, distance, distance_unit)
    values (auth.uid(), p_date, v_pos, (v_item->>'seconds')::int, nullif(v_item->>'distance', '')::numeric,
            coalesce(v_item->>'distance_unit', 'km'));
    v_pos := v_pos + 1;
  end loop;
end;
$$;

grant execute on function public.save_activities(date, jsonb, jsonb) to authenticated;

-- ============================================================
-- Sleep sessions: one row per sleep (nights and naps).
-- bed_at / wake_at are exact moments; bed_tz / wake_tz are the time zones the phone was in (e.g. Asia/Manila).
-- wake_at is null while you are still in bed.
-- ============================================================
create table if not exists public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bed_at timestamptz not null,
  bed_tz text not null check (bed_tz <> ''),
  wake_at timestamptz,
  wake_tz text check (wake_tz <> ''),
  created_at timestamptz not null default now(),
  check ((wake_at is null) = (wake_tz is null)),
  check (wake_at is null or (wake_at > bed_at and wake_at <= bed_at + interval '24 hours'))
);

create index if not exists sleep_sessions_user_bed on public.sleep_sessions (user_id, bed_at);
create index if not exists sleep_sessions_user_wake on public.sleep_sessions (user_id, wake_at);
-- you can only be in bed once at a time
create unique index if not exists sleep_sessions_one_open on public.sleep_sessions (user_id) where wake_at is null;

grant select, insert, update, delete on public.sleep_sessions to authenticated;
alter table public.sleep_sessions enable row level security;

drop policy if exists "own sleep sessions" on public.sleep_sessions;
create policy "own sleep sessions" on public.sleep_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Copy nights logged the old way (bed_time / wake_time on the wake-up date). Those have no time zone,
-- so they are read as Asia/Manila. Each is copied once; the flag stops a re-run from bringing back
-- a night you deleted since.
alter table public.daily_logs add column if not exists sleep_migrated boolean not null default false;

insert into public.sleep_sessions (user_id, bed_at, bed_tz, wake_at, wake_tz)
select o.user_id, o.bed_at, 'Asia/Manila', o.wake_at, 'Asia/Manila'
from (
  select l.user_id,
         ((case when l.bed_time >= l.wake_time then l.date - 1 else l.date end) + l.bed_time) at time zone 'Asia/Manila' as bed_at,
         (l.date + l.wake_time) at time zone 'Asia/Manila' as wake_at
  from public.daily_logs l
  where not l.sleep_migrated and l.bed_time is not null and l.wake_time is not null
) o
where not exists (
  select 1 from public.sleep_sessions s
  where s.user_id = o.user_id
    and s.bed_at < o.wake_at
    and coalesce(s.wake_at, 'infinity'::timestamptz) > o.bed_at
);

update public.daily_logs set sleep_migrated = true
where not sleep_migrated and bed_time is not null and wake_time is not null;
