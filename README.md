# Workout Log

This is a calendar log for workouts, meals, weight and sleep, built with Next.js and Supabase. It deploys to Vercel.

- **Calendar:** switch between four views, each with its own monthly stats.
  - **Workout:** weight-training type, sports and runs, and calories burned by workouts. Each day is shaded by effort (1–5) compared with your previous 4 weeks, with ★ on days you set a personal best. Above the calendar, bars show training load per week.
  - **Weight:** your morning weigh-ins.
  - **Calories:** daily surplus or deficit, plus calories eaten.
  - **Sleep:** hours slept, colour-coded.
- **Day page:** morning weight at the top, then your workouts (and meals, when switched on in `src/lib/features.ts`). One Save button saves everything.
- **Workout tab:** three sub-tabs, so you can log any mix of them on the same day. Each shows an estimate of calories burned.
  - **How hard was today's training?** Rate the day 1–10. Load = effort × minutes trained (weights, sports and runs together). If you don't rate a day, the effort is estimated: lifting from how your work on each exercise compares with your last 4 sessions of it, sports from the intensity you picked, runs from your speed.
  - **Weight Training:**
    - Pick the type: Push, Pull, Legs, Upper Body, Lower Body or Rest. Choosing a type lists every exercise you've done on that type, with your most recent numbers, ready to tick and add.
    - Last time's numbers appear in grey in each set. Tap **✓** to log the set as shown, or type or use **− / +** to change it first. Ticking a set starts a rest timer.
    - A summary bar stays at the top: sets done, minutes, effort and new bests. Finished exercises fold into one line.
    - Each exercise says how it went vs last time: **New best** (estimated one-rep max), **+2.5 kg vs last**, **+1 rep vs last** or **Same as last**.
    - Units switch per exercise (kg/lb). There is a separate **Core session** where sets can be timed.
    - Enter the **session length** for the calorie estimate. If you leave it blank, it's worked out from your sets (3 min per set).
  - **Sports:** the sport, minutes played and intensity. You can also add set scores (yours vs opponent's) for sports scored in sets.
  - **Running:** duration, plus distance if you have it. It shows pace and speed.
- **Meals tab:** add foods to Breakfast, Lunch, Dinner and Snacks.
  - Type what you ate (e.g. "scrambled egg"), pick a match from the USDA food database, and enter the weight in grams. The food is saved to your list, so next time it comes up straight away. For packaged food you can also type the numbers from the label.
  - Calories, protein, carbs and fat are calculated per meal and for the day, along with the day's calorie surplus or deficit.
  - You can copy meals from the previous logged day.
- **Sleep page:** tap **I'm going to bed** at night and **I'm awake** in the morning.
  - Each sleep has a full date and time, so late nights, naps and daytime sleep all work. It counts for the day you woke up.
  - Forgot to tap? Add or edit a sleep afterwards. A banner on the other pages reminds you while you're marked as in bed.
  - Time asleep is time in bed minus an estimate of how long you took to fall asleep (15 minutes, adjusted for the day's activity, the night before and your usual bedtime). Naps count in full.
  - Each tap saves the exact moment and your phone's time zone, so durations stay right when you travel or the clocks change, and past nights keep their local times.
- **Dashboard:** averages and charts for weight, sleep and sleep schedule, calories eaten vs burned, daily balance and workout burn. Choose 7 days, 30 days, 90 days or 1 year. There's also a data table.
- **Profile:** sex, birth year, height and day-to-day activity. These are used to estimate the calories your body burns outside workouts.

### How calories burned are estimated
- **Body (without workouts):** Mifflin–St Jeor BMR from your profile and latest weigh-in, × your activity level.
- **Workouts:** MET values from the Compendium of Physical Activities. The formula is (MET − 1) × body weight (kg) × hours.
  - Weight training uses 5 MET.
  - Each sport has its own value, adjusted by intensity.
  - Running uses your speed when you enter a distance.
- **Balance** = calories eaten − (body + workouts). About 7,700 kcal ≈ 1 kg of body weight.

These are estimates. Use the trend over weeks rather than any single day.

---

## Updating an existing install

When `supabase/schema.sql` changes, paste the whole file into the Supabase **SQL Editor** and click **Run** again. It is safe to re-run and won't touch your existing data.

## Setup (about 15 minutes, one time only)

### 1. Create the Supabase project (free)
1. Go to https://supabase.com, sign up, and click **New project**.
2. Open **SQL Editor**, then **New query**. Paste in all of `supabase/schema.sql` and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Register the app with Microsoft (for Outlook sign-in)
1. Go to https://portal.azure.com, then **Microsoft Entra ID → App registrations → New registration**. You can sign in with your Outlook account. A free Azure account works.
   - Name: `Workout Log`
   - Supported account types: **Personal Microsoft accounts only**. You can pick "Accounts in any organizational directory and personal Microsoft accounts" instead.
   - Redirect URI (Web): `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
2. Copy the **Application (client) ID**.
3. Go to **Certificates & secrets → New client secret** and copy the secret **Value** (not the ID).

### 3. Turn on Azure sign-in in Supabase
1. In Supabase, go to **Authentication → Sign In / Providers → Azure** and enable it.
2. Paste the Client ID and Secret.
3. Azure Tenant URL: `https://login.microsoftonline.com/consumers` for personal accounts. Use `.../common` if you picked "any directory".
4. Go to **Authentication → URL Configuration**:
   - Site URL: your Vercel URL, e.g. `https://your-app.vercel.app`
   - Redirect URLs: add `https://your-app.vercel.app/**` and `http://localhost:3000/**`

### 3b. Add Google sign-in (optional)
1. Go to https://console.cloud.google.com, create a project (any name), then open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**). Choose **External**, fill in the app name and your email, and save. Then either add the people who will use the app under **Audience → Test users**, or click **Publish app**.
2. Go to **Clients** (or **Credentials → Create credentials → OAuth client ID**) and create a **Web application** client.
3. Under **Authorized redirect URIs**, add the callback URL shown on Supabase's Google provider page: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
4. Copy the **Client ID** and **Client secret**.
5. In Supabase, go to **Authentication → Sign In / Providers → Google**, enable it, paste both, and save.

### 4. Deploy to Vercel
1. Push this folder to a GitHub repo, then in Vercel choose **Add New → Project** and import it.
2. Add these Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `FDC_API_KEY` = your free USDA FoodData Central key from https://fdc.nal.usda.gov/api-key-signup (powers the food search in Meals; without it the app falls back to the heavily rate-limited `DEMO_KEY`)
3. Click Deploy. Then update the Supabase Site URL (step 3) to the final Vercel URL.

### 5. Fill in your profile
After signing in, open **Profile** and enter your sex, birth year, height and activity level. Without these, the app can still show calories eaten and burned by workouts, but not your surplus or deficit.

### 6. Lock it to just you (optional)
Each account can only ever see its own data (Row Level Security). After you've signed in once, you can block other accounts from signing up. In Supabase, go to **Authentication → Sign In / Providers → User Signups** and turn off **Allow new users to sign up**.

### Run locally
```bash
cp .env.example .env.local   # fill in your values
npm install
npm run dev
```

**Tip for your phone:** open the site in Safari or Chrome and choose **Add to Home Screen**. It then opens like an app.
