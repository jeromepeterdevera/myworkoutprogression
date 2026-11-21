# Workout Log

This is a calendar workout log built with Next.js and Supabase, and it deploys to Vercel.

- **Calendar view:** each day shows its workout type badge, total volume (sets × reps × weight), working sets, and a **CORE** tag on days you did core.
- **Day page:**
  - Pick the workout type: Push, Pull, Legs, Upper Body, Lower Body or Rest.
  - Choosing a type lists **every exercise you've ever done on that type**, each with your most recent numbers. Tick the ones you're doing today and they're added, prefilled with last time's sets.
  - Each exercise shows **Last** (date + sets), a per-set **Prev** column, and your volume vs last time (+/-).
  - You can add brand-new exercises at any time. Past exercise names autocomplete.
  - Each set takes its own reps and weight. Units are switchable per exercise (kg/lb). Totals convert to the unit picked in the header.
  - A separate **Core session** is available on every day, including Rest days. Sets can be reps × weight or timed (seconds).
  - Exercise history is shared across workout types. For example, Bench Press on an Upper day shows your last Push-day Bench numbers.

---

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

### 4. Deploy to Vercel
1. Push this folder to a GitHub repo, then in Vercel choose **Add New → Project** and import it.
2. Add these Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
3. Click Deploy. Then update the Supabase Site URL (step 3) to the final Vercel URL.

### 5. Lock it to just you (optional)
Each account can only ever see its own data (Row Level Security). After you've signed in once, you can block other accounts from signing up. In Supabase, go to **Authentication → Sign In / Providers → User Signups** and turn off **Allow new users to sign up**.

### Run locally
```bash
cp .env.example .env.local   # fill in your values
npm install
npm run dev
```

**Tip for your phone:** open the site in Safari or Chrome and choose **Add to Home Screen**. It then opens like an app.
