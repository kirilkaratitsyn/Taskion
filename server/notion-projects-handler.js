const NOTION_VERSION = "2026-03-11";
const DEFAULT_TITLE_PROPERTY = "Task name";
const DEFAULT_STATUS_PROPERTY = "Status";
const DEFAULT_PRIORITY_PROPERTY = "Priority";

export async function handleNotionProjectsNodeRequest(req, res, env = process.env) {
  try {
    if (req.method !== "GET" && req.method !== "PATCH") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    const config = getNotionProjectsConfig(env);
    const accessToken = getBearerToken(req.headers.authorization);

    if (!accessToken) {
      sendJson(res, 401, { error: "Missing Supabase access token." });
      return;
    }

    const user = await readSupabaseUser(accessToken, config);
    const userEmail = user.email?.toLowerCase();
    const allowedEmail = config.allowedUserEmail.toLowerCase();

    if (!userEmail || userEmail !== allowedEmail) {
      sendJson(res, 403, {
        error: "This Notion sync is not allowed for this user.",
      });
      return;
    }

    if (req.method === "GET") {
      const projects = await readNotionProjects(config);

      sendJson(res, 200, {
        projects,
      });
      return;
    }

    const requestBody = await readJsonBody(req);
    const project = await updateNotionProject(config, requestBody);

    sendJson(res, 200, {
      project,
    });
  } catch (error) {
    console.error("Failed to handle Notion projects.", error);
    sendJson(res, 500, {
      error: error.message || "Failed to handle Notion projects.",
    });
  }
}

function getNotionProjectsConfig(env) {
  const notionToken = env.NOTION_TOKEN || env.NOTION_API_KEY;
  const dataSourceId = env.NOTION_PROJECTS_DATA_SOURCE_ID;
  const allowedUserEmail = env.NOTION_ALLOWED_USER_EMAIL;
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!notionToken) {
    throw new Error("Missing NOTION_TOKEN.");
  }

  if (!dataSourceId) {
    throw new Error("Missing NOTION_PROJECTS_DATA_SOURCE_ID.");
  }

  if (!allowedUserEmail) {
    throw new Error("Missing NOTION_ALLOWED_USER_EMAIL.");
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return {
    notionToken,
    dataSourceId,
    allowedUserEmail,
    supabaseUrl,
    supabasePublishableKey,
    titlePropertyName: env.NOTION_TITLE_PROPERTY || DEFAULT_TITLE_PROPERTY,
    statusPropertyName: env.NOTION_STATUS_PROPERTY || DEFAULT_STATUS_PROPERTY,
    priorityPropertyName:
      env.NOTION_PRIORITY_PROPERTY || DEFAULT_PRIORITY_PROPERTY,
    projectFilterPropertyName: env.NOTION_PROJECT_FILTER_PROPERTY || "",
    projectFilterValue: env.NOTION_PROJECT_FILTER_VALUE || "",
  };
}

function getBearerToken(authorizationHeader = "") {
  const tokenPrefix = "Bearer ";

  if (!authorizationHeader.startsWith(tokenPrefix)) {
    return "";
  }

  return authorizationHeader.slice(tokenPrefix.length).trim();
}

async function readSupabaseUser(accessToken, config) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error("Failed to verify the signed-in Supabase user.");
  }

  return payload;
}

async function readNotionProjects(config) {
  const projects = [];
  const relationTitleCache = new Map();
  let nextCursor = undefined;

  do {
    const queryResponse = await fetchNotionDataSourcePage(config, nextCursor);

    for (const entry of queryResponse.results || []) {
      const shouldIncludeProject = await matchesProjectFilter(
        entry,
        config,
        relationTitleCache,
      );

      if (!shouldIncludeProject) {
        continue;
      }

      const project = buildProjectPayload(entry, config);

      if (!project.name) {
        continue;
      }

      projects.push(project);
    }

    nextCursor = queryResponse.has_more ? queryResponse.next_cursor : undefined;
  } while (nextCursor);

  return projects;
}

async function updateNotionProject(config, requestBody) {
  const pageId = String(requestBody?.pageId || "").trim();
  const name = String(requestBody?.name || "").trim();
  const status = String(requestBody?.status || "").trim();
  const priority = String(requestBody?.priority || "").trim();

  if (!pageId) {
    throw new Error("Missing Notion project page id.");
  }

  if (!name) {
    throw new Error("Project name is required.");
  }

  if (!status) {
    throw new Error("Project status is required.");
  }

  const page = await fetchNotionPage(pageId, config);
  const propertiesToUpdate = {
    ...buildPropertyUpdate(
      page.properties,
      config.titlePropertyName,
      name,
      "title",
    ),
    ...buildPropertyUpdate(
      page.properties,
      config.statusPropertyName,
      status,
      "status",
    ),
    ...buildPropertyUpdate(
      page.properties,
      config.priorityPropertyName,
      priority,
      "priority",
    ),
  };

  const updatedPage = await patchNotionPage(pageId, propertiesToUpdate, config);

  return buildProjectPayload(updatedPage, config);
}

async function fetchNotionDataSourcePage(config, startCursor) {
  const response = await fetch(
    `https://api.notion.com/v1/data_sources/${config.dataSourceId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error(payload?.message || "Notion data source query failed.");
  }

  return payload;
}

async function fetchNotionPage(pageId, config) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      "Notion-Version": NOTION_VERSION,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error(payload?.message || "Failed to read Notion project.");
  }

  return payload;
}

async function patchNotionPage(pageId, properties, config) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error(payload?.message || "Failed to update Notion project.");
  }

  return payload;
}

async function matchesProjectFilter(entry, config, relationTitleCache) {
  if (!config.projectFilterPropertyName || !config.projectFilterValue) {
    return true;
  }

  const projectProperty = findPropertyByName(
    entry.properties,
    config.projectFilterPropertyName,
  );

  if (!projectProperty) {
    return false;
  }

  const propertyValues = await readPropertyDisplayValues(
    projectProperty,
    config,
    relationTitleCache,
  );
  const expectedValue = normalizeValue(config.projectFilterValue);

  return propertyValues.some((value) => normalizeValue(value) === expectedValue);
}

function readEntryTitle(entry, titlePropertyName) {
  const explicitTitleProperty = findPropertyByName(entry.properties, titlePropertyName);
  const titleProperty =
    explicitTitleProperty || Object.values(entry.properties || {}).find(isTitleProperty);

  if (!titleProperty) {
    return "";
  }

  return readPropertyText(titleProperty);
}

function readEntryStatus(entry, statusPropertyName) {
  const explicitStatusProperty = findPropertyByName(
    entry.properties,
    statusPropertyName,
  );
  const statusProperty =
    explicitStatusProperty || Object.values(entry.properties || {}).find(isStatusProperty);

  if (!statusProperty) {
    return "";
  }

  return readPropertyText(statusProperty);
}

function readEntryPriority(entry, priorityPropertyName) {
  const explicitPriorityProperty = findPropertyByName(
    entry.properties,
    priorityPropertyName,
  );

  if (!explicitPriorityProperty) {
    return "";
  }

  return readPropertyText(explicitPriorityProperty);
}

function buildProjectPayload(entry, config) {
  const projectName = readEntryTitle(entry, config.titlePropertyName);
  const projectStatus = readEntryStatus(entry, config.statusPropertyName);
  const projectPriority = readEntryPriority(entry, config.priorityPropertyName);

  return {
    id: entry.id,
    name: projectName,
    status: projectStatus || "No status",
    priority: projectPriority || "",
  };
}

function buildPropertyUpdate(properties, expectedPropertyName, nextValue, fieldType) {
  const propertyEntry = findPropertyEntryByName(properties, expectedPropertyName);

  if (!propertyEntry) {
    throw new Error(`Missing Notion property: ${expectedPropertyName}.`);
  }

  const [propertyName, property] = propertyEntry;

  if (property.type === "title") {
    return {
      [propertyName]: {
        title: buildTextBlocks(nextValue),
      },
    };
  }

  if (property.type === "rich_text") {
    return {
      [propertyName]: {
        rich_text: buildTextBlocks(nextValue),
      },
    };
  }

  if (property.type === "status") {
    return {
      [propertyName]: {
        status: nextValue ? { name: nextValue } : null,
      },
    };
  }

  if (property.type === "select") {
    return {
      [propertyName]: {
        select: nextValue ? { name: nextValue } : null,
      },
    };
  }

  throw new Error(
    `Notion property ${propertyName} can't be updated for ${fieldType}.`,
  );
}

function buildTextBlocks(value) {
  if (!value) {
    return [];
  }

  return [
    {
      type: "text",
      text: {
        content: value,
      },
    },
  ];
}

function findPropertyEntryByName(properties, propertyName) {
  return Object.entries(properties || {}).find(([key]) => {
    return key.toLowerCase() === propertyName.toLowerCase();
  });
}

function findPropertyByName(properties, propertyName) {
  return findPropertyEntryByName(properties, propertyName)?.[1];
}

function isTitleProperty(property) {
  return property?.type === "title";
}

function isStatusProperty(property) {
  return property?.type === "status";
}

function readPropertyText(property) {
  if (!property) {
    return "";
  }

  if (property.type === "title") {
    return joinPlainText(property.title);
  }

  if (property.type === "rich_text") {
    return joinPlainText(property.rich_text);
  }

  if (property.type === "status") {
    return property.status?.name || "";
  }

  if (property.type === "select") {
    return property.select?.name || "";
  }

  if (property.type === "multi_select") {
    return property.multi_select?.map((item) => item.name).join(", ") || "";
  }

  if (property.type === "formula") {
    return readFormulaText(property.formula);
  }

  if (property.type === "number") {
    return property.number != null ? String(property.number) : "";
  }

  if (property.type === "url") {
    return property.url || "";
  }

  if (property.type === "email") {
    return property.email || "";
  }

  if (property.type === "phone_number") {
    return property.phone_number || "";
  }

  return "";
}

async function readPropertyDisplayValues(property, config, relationTitleCache) {
  if (property.type !== "relation") {
    const propertyText = readPropertyText(property);
    return propertyText ? propertyText.split(",").map((value) => value.trim()) : [];
  }

  const relationValues = [];

  for (const relation of property.relation || []) {
    const relationTitle = await readRelationTitle(relation.id, config, relationTitleCache);

    if (relationTitle) {
      relationValues.push(relationTitle);
    }
  }

  return relationValues;
}

async function readRelationTitle(pageId, config, relationTitleCache) {
  if (relationTitleCache.has(pageId)) {
    return relationTitleCache.get(pageId);
  }

  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.notionToken}`,
      "Notion-Version": NOTION_VERSION,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error("Failed to read a related Notion page.");
  }

  const titleProperty = Object.values(payload.properties || {}).find(isTitleProperty);
  const relationTitle = titleProperty ? readPropertyText(titleProperty) : "";

  relationTitleCache.set(pageId, relationTitle);

  return relationTitle;
}

function joinPlainText(items = []) {
  return items.map((item) => item.plain_text || "").join("").trim();
}

function readFormulaText(formula) {
  if (!formula) {
    return "";
  }

  if (formula.type === "string") {
    return formula.string || "";
  }

  if (formula.type === "number") {
    return formula.number != null ? String(formula.number) : "";
  }

  if (formula.type === "boolean") {
    return formula.boolean ? "true" : "false";
  }

  if (formula.type === "date") {
    return formula.date?.start || "";
  }

  return "";
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
