# devcommpulse

A Friday-morning brief of what developers are struggling with around code review, CI/CD and developer workflow. It is built from public posts on Stack Overflow, Stack Exchange, Reddit, Hacker News, DEV, Lobsters and devRant.

It shows which pain points come up most, whether each topic is rising or falling versus last week, and which problems look unresolved or underserved. Click any topic or keyword for charts, the underlying posts and an AI deep dive.

- **AI:** Gemini Flash only (default `gemini-3.6-flash`, automatic fallback to `gemini-2.5-flash`).
- **Data and config:** Supabase. Topics and keywords are rows, editable from the dashboard without code changes.
- **Hosting:** Vercel, with two cron jobs.

See **[COMPONENTS.md](COMPONENTS.md)** for the components map.

## Deploy (about 10 minutes)

### 1. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste all of `supabase/schema.sql` and run it. This creates the tables and functions and seeds 7 topics and 6 sources.
3. In **Project Settings → API**, copy the **Project URL** and the **service_role** key.

### 2. Gemini
Create an API key at aistudio.google.com/apikey.

### 3. Free keys that make live data reliable on Vercel
- **Stack Exchange:** register an app at stackapps.com/apps/oauth/register and copy the **Key**. This raises the limit from 300 to 10,000 requests a day.
- **Reddit:** at reddit.com/prefs/apps, create a **script** app and copy the client ID (under the app name) and the secret. Reddit often blocks anonymous requests from cloud servers.

### 4. Vercel
1. Import this GitHub repo at vercel.com/new. The framework is detected automatically.
2. Add the environment variables from `.env.example`. These are required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ADMIN_PASSCODE`, `CRON_SECRET` (any long random string).
3. Deploy. The crons in `vercel.json` are registered automatically.

### 5. First run
Open `https://<your-app>.vercel.app/settings`, enter your `ADMIN_PASSCODE` and click **Run full pipeline**.

The first collection backfills 21 days, so the brief has a real "vs last week" comparison straight away. Analysis runs in repeated chunks until every post is done. The brief for the last complete week is written at the end.

## Run locally
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```
To trigger the crons locally: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/weekly`

## Customising
- **Topics and keywords:** use the dashboard's **Topics & sources** page. Saving re-tags already-collected posts from the last 60 days.
- **Communities:** turn each one on or off, and edit subreddits, DEV tags or Stack Exchange sites as JSON on the same page.
- **Brief time:** change `vercel.json`. Times are in UTC; `30 0 * * 5` is Friday 06:00 IST.
- **Delivery:** set `SLACK_WEBHOOK_URL`, and/or `RESEND_API_KEY` + `DIGEST_EMAIL_TO` + `DIGEST_EMAIL_FROM`.

## Notes and limits
- **Counts:** a post is counted once per topic it matches. Posts Gemini marks irrelevant (for example "review" in an unrelated sense) are excluded. Posts not yet analysed still count toward volume.
- **Unresolved:** for Stack Exchange this uses the site's own answered flag. Elsewhere it is Gemini's judgement from the post text.
- **devRant** is lightly maintained; if it is down, the run logs it and continues.
- **Blind and other FAANG communities** are not scraped: there is no public API and their terms prohibit scraping. Hacker News and Lobsters cover the senior-engineer audience.
- **Vercel Hobby:** cron jobs run within the scheduled hour. Functions use `maxDuration = 300`.
