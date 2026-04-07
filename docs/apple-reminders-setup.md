# Apple Reminders Sync — Setup Guide

## 1. Run SQL migration

In Supabase Dashboard → SQL Editor, run:

```
sql/2026-04-07_apple_reminders_sync.sql
```

This creates `reminders_config` table + adds `apple_uid` and `apple_pushed_at` columns to `tasks`.

---

## 2. Deploy Edge Functions

Install Supabase CLI if you haven't:
```bash
npm install -g supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

Deploy all functions:
```bash
supabase functions deploy reminders-push --no-verify-jwt
supabase functions deploy reminders-poll --no-verify-jwt
supabase functions deploy reminders-test
```

Set the required secrets:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
supabase secrets set REMINDERS_WEBHOOK_SECRET=<choose_a_random_secret>
```

---

## 3. Configure Database Webhook (Supabase Dashboard)

1. Go to **Database → Webhooks → Create a new hook**
2. Fill in:
   - **Name:** `reminders-push`
   - **Table:** `tasks`
   - **Events:** `INSERT`, `UPDATE`, `DELETE`
   - **Type:** HTTP Request
   - **URL:** `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/reminders-push`
   - **HTTP Method:** POST
   - **Headers:**
     - `Authorization`: `Bearer <REMINDERS_WEBHOOK_SECRET>` (same value you set above)
3. Save

---

## 4. Schedule the Poll Function (every 5 minutes)

In Supabase Dashboard → Database → Extensions, enable **pg_cron** if not already enabled.

Then in SQL Editor:
```sql
select cron.schedule(
  'reminders-poll',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/reminders-poll',
    headers := '{"Authorization": "Bearer <YOUR_ANON_KEY>"}'::jsonb
  )
  $$
);
```

---

## 5. User setup (each user does this once)

1. Go to [appleid.apple.com](https://appleid.apple.com) → Sign In → Security
2. Under **App-Specific Passwords**, click **+** and generate a password (e.g. `Taskion`)
3. In Taskion, scroll to **Apple Reminders Sync** card
4. Enter your iCloud email and the app-specific password
5. Click **Test connection** to verify
6. Click **Save**

From this point tasks will sync automatically:
- **Taskion → Reminders:** instantly on create/update/delete (via webhook)
- **Reminders → Taskion:** every 5 minutes (via poll)

---

## Field mapping

| Taskion field | Apple Reminders field |
|---|---|
| `title` | Title |
| `description` | Notes |
| `status = done` | Completed |
| `status = todo / in_progress` | Not completed |
