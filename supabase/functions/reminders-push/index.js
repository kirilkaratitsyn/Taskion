/**
 * reminders-push Edge Function
 *
 * Triggered by a Supabase Database Webhook on the `tasks` table (INSERT / UPDATE / DELETE).
 * Pushes the change to iCloud CalDAV so it appears in Apple Reminders.
 *
 * Expected webhook payload (Supabase format):
 * {
 *   type: "INSERT" | "UPDATE" | "DELETE",
 *   table: "tasks",
 *   record: { ...task row } | null,       // null on DELETE
 *   old_record: { ...task row } | null,   // null on INSERT
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCalendarUrl, putVTODO, deleteVTODO } from "../_shared/caldav.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify the webhook secret to prevent unauthorized calls
  const webhookSecret = Deno.env.get("REMINDERS_WEBHOOK_SECRET");
  if (webhookSecret) {
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { type, record, old_record } = payload;
  const task = record || old_record;

  if (!task?.user_id) {
    return new Response("No task data", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load user's reminders config
  const { data: config, error: configErr } = await supabase
    .from("reminders_config")
    .select("*")
    .eq("user_id", task.user_id)
    .eq("enabled", true)
    .maybeSingle();

  if (configErr) {
    console.error("reminders_config fetch error:", configErr);
    return new Response("Config error", { status: 500 });
  }

  if (!config) {
    // User hasn't set up Apple Reminders sync — nothing to do
    return new Response("No reminders config", { status: 200 });
  }

  try {
    const calendarUrl = await ensureCalendarUrl(
      config.icloud_username,
      config.icloud_app_password,
      config.list_name,
    );

    if (type === "DELETE") {
      const uid = old_record?.apple_uid || old_record?.id;
      if (uid) {
        await deleteVTODO(config.icloud_username, config.icloud_app_password, calendarUrl, uid);
      }
      return new Response(JSON.stringify({ ok: true, action: "deleted" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // INSERT or UPDATE
    const uid = await putVTODO(
      config.icloud_username,
      config.icloud_app_password,
      calendarUrl,
      task,
    );

    // On INSERT, store the UID and push timestamp back on the task row
    if (type === "INSERT" && !task.apple_uid) {
      await supabase
        .from("tasks")
        .update({ apple_uid: uid, apple_pushed_at: new Date().toISOString() })
        .eq("id", task.id);
    } else {
      await supabase
        .from("tasks")
        .update({ apple_pushed_at: new Date().toISOString() })
        .eq("id", task.id);
    }

    return new Response(JSON.stringify({ ok: true, action: type.toLowerCase(), uid }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reminders-push error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
