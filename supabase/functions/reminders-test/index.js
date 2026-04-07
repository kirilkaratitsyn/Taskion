/**
 * reminders-test Edge Function
 *
 * Validates iCloud CalDAV credentials without saving anything.
 * Called by the "Test connection" button in Taskion settings.
 */

import { discoverPrincipalUrl } from "../_shared/caldav.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { icloud_username, icloud_app_password } = body;

  if (!icloud_username || !icloud_app_password) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing icloud_username or icloud_app_password" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await discoverPrincipalUrl(icloud_username, icloud_app_password);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
