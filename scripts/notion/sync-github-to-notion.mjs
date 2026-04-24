#!/usr/bin/env node
// WebAppV1 — GitHub → Notion Tasks sync.
//
// Reads issues + PRs of the current repository via the GitHub API,
// and upserts them into a Notion database using a stable "GitHub ID"
// property as the dedupe key.
//
// GitHub stays the source of truth. Notion is read-only mirror.
//
// Required env:
//   NOTION_TOKEN         Notion internal integration secret
//   NOTION_DATABASE_ID   Target Notion database id
//   GITHUB_TOKEN         Any token with repo:read (Actions provides one)
//   GITHUB_REPOSITORY    "owner/repo" (Actions provides this)
//
// Optional env:
//   DRY_RUN=1            Do not write to Notion, just log
//   SYNC_LIMIT=200       Max items per kind (issues, PRs)

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const DRY_RUN = process.env.DRY_RUN === "1";
const SYNC_LIMIT = Number(process.env.SYNC_LIMIT || 200);
const NOTION_VERSION = "2022-06-28";

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

requireEnv("NOTION_TOKEN", NOTION_TOKEN);
requireEnv("NOTION_DATABASE_ID", NOTION_DATABASE_ID);
requireEnv("GITHUB_TOKEN", GITHUB_TOKEN);
requireEnv("GITHUB_REPOSITORY", GITHUB_REPOSITORY);

const [OWNER, REPO] = GITHUB_REPOSITORY.split("/");
if (!OWNER || !REPO) {
  console.error(`GITHUB_REPOSITORY must be "owner/repo", got: ${GITHUB_REPOSITORY}`);
  process.exit(1);
}

// ---------- HTTP helpers ----------

async function ghFetch(path, params = {}) {
  const url = new URL(`https://api.github.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "webappv1-notion-sync",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${res.statusText} on ${path} :: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function notionFetch(path, init = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Never log the token. Body is Notion's error payload, safe.
    throw new Error(`Notion ${res.status} ${res.statusText} on ${path} :: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ---------- GitHub fetch ----------

async function fetchPaginated(path, extra = {}) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const items = await ghFetch(path, {
      state: "all",
      per_page: "100",
      page: String(page),
      sort: "updated",
      direction: "desc",
      ...extra,
    });
    out.push(...items);
    if (items.length < 100 || out.length >= SYNC_LIMIT) break;
  }
  return out.slice(0, SYNC_LIMIT);
}

async function fetchAllIssues() {
  // /issues also returns PRs; filter them out.
  const items = await fetchPaginated(`/repos/${OWNER}/${REPO}/issues`);
  return items.filter((i) => !i.pull_request);
}

async function fetchAllPRs() {
  return fetchPaginated(`/repos/${OWNER}/${REPO}/pulls`);
}

// ---------- Mapping ----------

function buildGitHubId(kind, number) {
  return `${OWNER}/${REPO}#${kind}-${number}`;
}

function computeStatus(item, kind) {
  if (kind === "PR") {
    if (item.merged_at) return "Merged";
    if (item.state === "closed") return "Closed";
    if (item.draft) return "Draft";
    return "Open";
  }
  return item.state === "closed" ? "Closed" : "Open";
}

function toNotionProps(item, kind) {
  const githubId = buildGitHubId(kind, item.number);
  const title = (item.title || `#${item.number}`).slice(0, 2000);
  const assignee =
    (item.assignees || []).map((a) => a.login).join(", ") ||
    item.assignee?.login ||
    "";
  const labels = (item.labels || [])
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter(Boolean)
    .slice(0, 50)
    // Notion multi_select option names can't contain commas.
    .map((name) => ({ name: String(name).replace(/,/g, " ").slice(0, 100) }));
  const state = item.state; // "open" | "closed"
  const draft = kind === "PR" ? Boolean(item.draft) : false;

  return {
    Title: { title: [{ text: { content: title } }] },
    Type: { select: { name: kind } },
    Status: { select: { name: computeStatus(item, kind) } },
    Assignee: {
      rich_text: assignee ? [{ text: { content: assignee } }] : [],
    },
    URL: { url: item.html_url },
    Repo: { rich_text: [{ text: { content: `${OWNER}/${REPO}` } }] },
    Number: { number: item.number },
    "Updated At": { date: { start: item.updated_at } },
    Labels: { multi_select: labels },
    State: { select: { name: state } },
    Draft: { checkbox: draft },
    "GitHub ID": { rich_text: [{ text: { content: githubId } }] },
  };
}

// ---------- Notion upsert ----------

async function findNotionPageByGitHubId(githubId) {
  const body = {
    filter: {
      property: "GitHub ID",
      rich_text: { equals: githubId },
    },
    page_size: 1,
  };
  const res = await notionFetch(`/databases/${NOTION_DATABASE_ID}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.results?.[0] || null;
}

async function upsert(item, kind) {
  const githubId = buildGitHubId(kind, item.number);
  if (DRY_RUN) {
    console.log(`[dry-run] ${githubId} :: ${item.title}`);
    return "dry";
  }
  const props = toNotionProps(item, kind);
  const existing = await findNotionPageByGitHubId(githubId);
  if (existing) {
    await notionFetch(`/pages/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: props }),
    });
    console.log(`updated ${githubId}`);
    return "updated";
  }
  await notionFetch(`/pages`, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: props,
    }),
  });
  console.log(`created ${githubId}`);
  return "created";
}

// ---------- Main ----------

async function main() {
  console.log(
    `Syncing ${OWNER}/${REPO} → Notion DB (dry_run=${DRY_RUN}, limit=${SYNC_LIMIT})`,
  );
  const [issues, prs] = await Promise.all([fetchAllIssues(), fetchAllPRs()]);
  console.log(`Fetched ${issues.length} issues, ${prs.length} PRs`);

  let ok = 0;
  let fail = 0;
  for (const issue of issues) {
    try {
      await upsert(issue, "Issue");
      ok++;
    } catch (e) {
      fail++;
      console.error(`[issue #${issue.number}] ${e.message}`);
    }
  }
  for (const pr of prs) {
    try {
      await upsert(pr, "PR");
      ok++;
    } catch (e) {
      fail++;
      console.error(`[pr #${pr.number}] ${e.message}`);
    }
  }

  console.log(`Done. ok=${ok} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
