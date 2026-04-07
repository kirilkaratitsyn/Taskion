/**
 * reminders-poll Edge Function
 *
 * Runs on a schedule (e.g. every 5 minutes via Supabase Cron).
 * For each user with reminders sync enabled:
 *   - Fetches all VTODOs from their iCloud Taskion calendar
 *   - Upserts new/changed ones into Supabase tasks
 *   - Deletes tasks in Supabase whose VTODOs are gone from Reminders
 *
 * Loop prevention: skips VTODOs that carry X-TASKION-PUSH:true and were
 * modified within the last 60 seconds (i.e. we just pushed them).
 *
 * Invoke via Supabase pg_cron:
 *   select cron.schedule(
 *     'reminders-poll',
 *     '*/5 * * * *',
 *     $$select net.http_post(
 *       url:='<YOUR_SUPABASE_URL>/functions/v1/reminders-poll',
 *       headers:='{"Authorization":"Bearer <ANON_KEY>"}'::jsonb
 *     )$$
 *   );
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCalendarUrl, fetchVTODOs } from "../_shared/caldav.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  // Accept both GET (pg_cron HTTP) and POST
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load all enabled reminders configs
  const { data: configs, error: configErr } = await supabase
    .from("reminders_config")
    .select("*")
    .eq("enabled", true);

  if (configErr) {
    console.error("reminders_config fetch error:", configErr);
    return new Response("Config error", { status: 500 });
  }

  if (!configs || configs.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];

  for (const config of configs) {
    try {
      const stats = await syncUserReminders(supabase, config);
      results.push({ userId: config.user_id, ...stats });
    } catch (err) {
      console.error(`Poll error for user ${config.user_id}:`, err);
      results.push({ userId: config.user_id, error: err.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function syncUserReminders(supabase, config) {
  const calendarUrl = await ensureCalendarUrl(
    config.icloud_username,
    config.icloud_app_password,
    config.list_name,
  );

  const vtodos = await fetchVTODOs(
    config.icloud_username,
    config.icloud_app_password,
    calendarUrl,
  );

  // Load existing tasks for this user that have an apple_uid
  const { data: existingTasks } = await supabase
    .from("tasks")
    .select("id, apple_uid, title, status, description, apple_pushed_at")
    .eq("user_id", config.user_id)
    .not("apple_uid", "is", null);

  const tasksByUid = Object.fromEntries((existingTasks || []).map((t) => [t.apple_uid, t]));
  const seenUids = new Set();
  const now = Date.now();
  let upserted = 0;
  let skipped = 0;

  for (const vtodo of vtodos) {
    if (!vtodo.uid) continue;
    seenUids.add(vtodo.uid);

    const existing = tasksByUid[vtodo.uid];

    // Skip if Taskion pushed this recently (loop prevention — 60s window)
    if (vtodo.taskionPush && existing?.apple_pushed_at) {
      const pushedMs = new Date(existing.apple_pushed_at).getTime();
      if (now - pushedMs < 60_000) {
        skipped++;
        continue;
      }
    }

    const nextStatus = vtodo.status === "COMPLETED" ? "done" : "todo";
    const nextTitle = vtodo.summary?.trim() || "Untitled";

    if (existing) {
      // Update if anything changed
      if (existing.title !== nextTitle || existing.status !== nextStatus) {
        await supabase
          .from("tasks")
          .update({
            title: nextTitle,
            status: nextStatus,
            description: vtodo.description || existing.description,
          })
          .eq("id", existing.id);
        upserted++;
      }
    } else {
      // New reminder created in Apple — insert as a task
      // We need a project_notion_page_id; use null and let user assign it
      await supabase.from("tasks").insert({
        user_id: config.user_id,
        title: nextTitle,
        status: nextStatus,
        description: vtodo.description || "",
        apple_uid: vtodo.uid,
        project_notion_page_id: null,
      });
      upserted++;
    }
  }

  // Delete tasks whose VTODOs were removed from Reminders
  let deleted = 0;
  for (const task of existingTasks || []) {
    if (task.apple_uid && !seenUids.has(task.apple_uid)) {
      await supabase.from("tasks").delete().eq("id", task.id);
      deleted++;
    }
  }

  return { upserted, skipped, deleted };
}
