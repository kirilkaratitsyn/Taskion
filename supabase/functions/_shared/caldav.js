/**
 * Minimal iCloud CalDAV helper (Deno/fetch-based, no external deps).
 * Handles VTODO create, update, delete, and list.
 */

const ICLOUD_CALDAV_BASE = "https://caldav.icloud.com";

/** Build a Basic-auth header value */
function basicAuth(username, password) {
  return "Basic " + btoa(`${username}:${password}`);
}

/**
 * Discover the principal CalDAV URL for this iCloud account.
 * iCloud requires a PROPFIND on / first to find the real home URL.
 */
export async function discoverPrincipalUrl(username, password) {
  const res = await fetch(`${ICLOUD_CALDAV_BASE}/`, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "0",
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`,
  });

  if (!res.ok) {
    throw new Error(`CalDAV PROPFIND failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const match = text.match(/<d:href>([^<]+)<\/d:href>/);
  if (!match) throw new Error("Could not parse principal URL from CalDAV response");
  return match[1].startsWith("http") ? match[1] : `${ICLOUD_CALDAV_BASE}${match[1]}`;
}

/**
 * Find or create a calendar collection named `listName` under the
 * user's calendar home set, return its URL.
 */
export async function ensureCalendarUrl(username, password, listName) {
  const principalUrl = await discoverPrincipalUrl(username, password);

  // Find calendar-home-set
  const homeRes = await fetch(principalUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "0",
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`,
  });

  if (!homeRes.ok) throw new Error(`CalDAV home-set lookup failed: ${homeRes.status}`);
  const homeText = await homeRes.text();
  const homeMatch = homeText.match(/<c:calendar-home-set[^>]*>\s*<d:href>([^<]+)<\/d:href>/);
  if (!homeMatch) throw new Error("Could not parse calendar-home-set");

  const homeUrl = homeMatch[1].startsWith("http")
    ? homeMatch[1]
    : `${ICLOUD_CALDAV_BASE}${homeMatch[1]}`;

  // List all calendars
  const listRes = await fetch(homeUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "1",
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`,
  });

  if (!listRes.ok) throw new Error(`CalDAV calendar list failed: ${listRes.status}`);
  const listText = await listRes.text();

  // Extract displayname + href pairs
  const responses = [...listText.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)];
  for (const [, block] of responses) {
    const nameMatch = block.match(/<d:displayname>([^<]*)<\/d:displayname>/);
    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/);
    if (nameMatch && nameMatch[1] === listName && hrefMatch) {
      return hrefMatch[1].startsWith("http")
        ? hrefMatch[1]
        : `${ICLOUD_CALDAV_BASE}${hrefMatch[1]}`;
    }
  }

  // Calendar not found — create it
  const newCalUrl = `${homeUrl}${encodeURIComponent(listName)}/`;
  const mkRes = await fetch(newCalUrl, {
    method: "MKCALENDAR",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:set>
    <d:prop>
      <d:displayname>${listName}</d:displayname>
      <c:supported-calendar-component-set>
        <c:comp name="VTODO"/>
      </c:supported-calendar-component-set>
    </d:prop>
  </d:set>
</c:mkcalendar>`,
  });

  if (!mkRes.ok && mkRes.status !== 201) {
    throw new Error(`Could not create calendar "${listName}": ${mkRes.status}`);
  }
  return newCalUrl;
}

/**
 * Build a VTODO iCal string from a Taskion task object.
 */
export function buildVTODO(task) {
  const uid = task.apple_uid || task.id;
  const status = task.status === "done" ? "COMPLETED" : "NEEDS-ACTION";
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const created = task.created_at
    ? new Date(task.created_at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : now;

  const descLine = task.description
    ? `DESCRIPTION:${task.description.replace(/\r?\n/g, "\\n").replace(/,/g, "\\,")}\r\n`
    : "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Taskion//Taskion//EN",
    "BEGIN:VTODO",
    `UID:${uid}`,
    `SUMMARY:${task.title.replace(/,/g, "\\,")}`,
    descLine.trimEnd(),
    `STATUS:${status}`,
    `CREATED:${created}`,
    `LAST-MODIFIED:${now}`,
    `X-TASKION-ID:${task.id}`,
    `X-TASKION-PUSH:true`,
    "END:VTODO",
    "END:VCALENDAR",
  ]
    .filter((line) => line !== "")
    .join("\r\n");
}

/**
 * PUT a VTODO to iCloud CalDAV. Returns the UID used.
 */
export async function putVTODO(username, password, calendarUrl, task) {
  const uid = task.apple_uid || task.id;
  const ical = buildVTODO({ ...task, apple_uid: uid });
  const url = `${calendarUrl.replace(/\/$/, "")}/${uid}.ics`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "text/calendar; charset=utf-8",
    },
    body: ical,
  });

  if (!res.ok && res.status !== 201 && res.status !== 204) {
    throw new Error(`CalDAV PUT failed: ${res.status} ${res.statusText}`);
  }

  return uid;
}

/**
 * DELETE a VTODO from iCloud CalDAV by UID.
 */
export async function deleteVTODO(username, password, calendarUrl, uid) {
  const url = `${calendarUrl.replace(/\/$/, "")}/${uid}.ics`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: basicAuth(username, password),
    },
  });

  // 404 is fine — already gone
  if (!res.ok && res.status !== 404) {
    throw new Error(`CalDAV DELETE failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Fetch all VTODOs from a calendar. Returns array of parsed objects:
 * { uid, summary, description, status, lastModified, taskionId }
 */
export async function fetchVTODOs(username, password, calendarUrl) {
  const res = await fetch(calendarUrl, {
    method: "REPORT",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "1",
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VTODO"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
  });

  if (!res.ok) throw new Error(`CalDAV REPORT failed: ${res.status}`);

  const text = await res.text();
  const dataBlocks = [...text.matchAll(/<c:calendar-data[^>]*>([\s\S]*?)<\/c:calendar-data>/g)];

  return dataBlocks.map(([, raw]) => parseVTODO(raw));
}

/** Parse a VTODO ical string into a plain object */
function parseVTODO(ical) {
  const get = (key) => {
    const m = ical.match(new RegExp(`^${key}[^:]*:(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };

  return {
    uid: get("UID"),
    summary: get("SUMMARY").replace(/\\,/g, ","),
    description: get("DESCRIPTION").replace(/\\n/g, "\n").replace(/\\,/g, ","),
    status: get("STATUS"),
    lastModified: get("LAST-MODIFIED"),
    taskionId: get("X-TASKION-ID"),
    taskionPush: get("X-TASKION-PUSH") === "true",
  };
}
