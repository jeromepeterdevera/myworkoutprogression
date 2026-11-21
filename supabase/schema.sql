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
create or replace function public.save_day(p_date date, p_type text, p_items jsonb)
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

  if p_type is null and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    delete from public.workout_days where user_id = auth.uid() and date = p_date;
    return;
  end if;

  insert into public.workout_days (user_id, date, type, updated_at)
  values (auth.uid(), p_date, p_type, now())
  on conflict (user_id, date) do update set type = excluded.type, updated_at = now()
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

grant execute on function public.save_day(date, text, jsonb) to authenticated;

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
