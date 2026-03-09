#!/usr/bin/env tsx
/**
 * DX Metrics Import Script
 *
 * Usage: npx tsx --env-file .env scripts/import.ts --since 2024-01-01 [--entity <type>] [--tracker-csv <path>] [--force]
 *
 * Note: use --env-file .env (or export env vars manually) to load GITHUB_TOKEN and DATABASE_URL.
 *
 * Incrementally imports data from GitHub into PostgreSQL.
 * All imports use UPSERT for idempotency.
 *
 * Checkpoint system:
 *   Each (entity, repository) pair is tracked in the sync_runs table.
 *   If a previous successful import exists for the same --since date,
 *   it is skipped automatically. Use --force to re-import regardless.
 *   Adding a new repository to the whitelist only imports that repo's data.
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { Octokit } from "octokit";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { execSync } from "child_process";
import os from "os";

// --- CLI Args ---
function printHelp() {
  console.log(`
Usage: npx tsx scripts/import.ts --since YYYY-MM-DD [options]

Required:
  --since YYYY-MM-DD        Start date for the import (e.g. 2024-01-01)

Options:
  --entity <type>           Import only the specified entity type (default: all)
                            Valid values:
                              all               Import everything
                              pull-requests     GitHub pull requests
                              pr-reviews        GitHub pull request reviews
                              workflows         GitHub Actions workflow definitions
                              workflow-runs     GitHub Actions workflow run history
                              iac-pr            IaC pull request lead time
                              commits           Repository commits
                              code-search       Code search results (DX repo)
                              terraform-registry Terraform registry module releases
                              terraform-modules Terraform module usage (via terrawiz)
                              dx-pipelines      DX pipeline usages (via GitHub code search)
                              tracker           Tracker CSV data (requires --tracker-csv)

  --tracker-csv <path>      Path to the tracker CSV file (used with --entity tracker)
  --config <path>           Path to config YAML file (default: config.yaml)
  --force                   Re-import even if a checkpoint already exists
  --help                    Show this help message
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let since = "";
  let entity = "all";
  let trackerCsv = "";
  let force = false;
  let configPath = path.resolve(__dirname, "../config.yaml");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
    if (args[i] === "--since" && args[i + 1]) since = args[i + 1];
    if (args[i] === "--entity" && args[i + 1]) entity = args[i + 1];
    if (args[i] === "--tracker-csv" && args[i + 1]) trackerCsv = args[i + 1];
    if (args[i] === "--config" && args[i + 1]) configPath = args[i + 1];
    if (args[i] === "--force") force = true;
  }

  if (!since) {
    printHelp();
    process.exit(1);
  }

  return { since, entity, trackerCsv, force, configPath };
}

const { since, entity, trackerCsv, force, configPath } = parseArgs();

// --- Config Loading ---
interface Config {
  organization: string;
  repositories: string[];
  dx_team_members: string[];
  dx_repo: string;
}

function loadConfig(filePath: string): Config {
  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    return yaml.load(fileContents) as Config;
  } catch (e) {
    console.error(`Error loading config from ${filePath}:`, e);
    process.exit(1);
  }
}

const config = loadConfig(configPath);

const ORGANIZATION =
  process.env.ORGANIZATION || config.organization || "pagopa";
const REPOSITORIES = process.env.REPOSITORIES
  ? process.env.REPOSITORIES.split(",")
  : config.repositories;
const DX_TEAM_MEMBERS = process.env.DX_TEAM_MEMBERS
  ? process.env.DX_TEAM_MEMBERS.split(",")
  : config.dx_team_members;
const DX_REPO = process.env.DX_REPO || config.dx_repo || "dx";

// --- Setup ---
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// --- Checkpoint helpers ---

/**
 * Check if a successful checkpoint exists for the given entity + repo + since date.
 * Returns true if import can be skipped.
 */
async function hasCheckpoint(
  entityType: string,
  repoName: string | null,
  since: string,
): Promise<boolean> {
  const sinceDate = new Date(since);
  const key = repoName ? `${entityType}:${repoName}` : entityType;

  const rows = await db.execute<{ since_date: string }>(
    sql`SELECT since_date FROM sync_runs
        WHERE entity_type = ${key} AND status = 'done'`,
  );

  return rows.rows.some(
    (r) =>
      r.since_date && new Date(r.since_date).getTime() <= sinceDate.getTime(),
  );
}

/**
 * Record that an import has started. Returns the sync_run ID.
 */
async function startCheckpoint(
  entityType: string,
  repoName: string | null,
  since: string,
  repoId: number | null,
): Promise<number> {
  const key = repoName ? `${entityType}:${repoName}` : entityType;
  const rows = await db.execute<{ id: number }>(
    sql`INSERT INTO sync_runs (entity_type, repository_id, since_date, status)
        VALUES (${key}, ${repoId}, ${new Date(since)}, 'running')
        RETURNING id`,
  );
  return rows.rows[0].id;
}

/**
 * Mark a checkpoint as completed successfully.
 */
async function completeCheckpoint(syncRunId: number): Promise<void> {
  await db.execute(
    sql`UPDATE sync_runs SET status = 'done', completed_at = NOW()
        WHERE id = ${syncRunId}`,
  );
}

/**
 * Mark a checkpoint as failed.
 */
async function failCheckpoint(syncRunId: number): Promise<void> {
  await db.execute(
    sql`UPDATE sync_runs SET status = 'failed', completed_at = NOW()
        WHERE id = ${syncRunId}`,
  );
}

/**
 * Clean up stale "running" checkpoints from previous interrupted runs.
 * Marks them as "interrupted" so they will be retried.
 */
async function cleanStaleCheckpoints(): Promise<void> {
  await db.execute(
    sql`UPDATE sync_runs SET status = 'interrupted', completed_at = NOW()
        WHERE status = 'running'`,
  );
}

// --- Helpers ---
async function ensureRepo(name: string): Promise<number> {
  const fullName = `${ORGANIZATION}/${name}`;

  // Try to find existing
  const existing = await db
    .select()
    .from(schema.repositories)
    .where(sql`${schema.repositories.fullName} = ${fullName}`)
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  // Fetch from GitHub
  const { data } = await octokit.rest.repos.get({
    owner: ORGANIZATION,
    repo: name,
  });

  await db
    .insert(schema.repositories)
    .values({
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      organization: ORGANIZATION,
    })
    .onConflictDoNothing();

  return data.id;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Importers ---

async function importPullRequests(repoName: string, since: string) {
  const startTime = Date.now();
  const repoId = await ensureRepo(repoName);
  const fullName = `${ORGANIZATION}/${repoName}`;
  console.log(`  Importing pull requests for ${fullName}...`);

  let fetchedCount = 0;
  const prs = await octokit.paginate(
    octokit.rest.pulls.list,
    {
      owner: ORGANIZATION,
      repo: repoName,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    },
    (response, done) => {
      fetchedCount += response.data.length;
      process.stdout.write(`\r    Fetching PRs: ${fetchedCount}...`);
      return response.data;
    },
  );
  process.stdout.write(`\r    Fetched ${fetchedCount} PRs total\n`);

  const sinceDate = new Date(since);
  const filtered = prs.filter((pr) => new Date(pr.updated_at) >= sinceDate);

  console.log(`    Processing ${filtered.length} PRs since ${since}...`);
  let count = 0;
  for (const pr of filtered) {
    await db
      .insert(schema.pullRequests)
      .values({
        id: pr.id,
        repositoryId: repoId,
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || null,
        reviewDecision: null, // Not available from REST API list
        createdAt: new Date(pr.created_at),
        closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        mergedBy: null,
        additions: null,
        totalCommentsCount: null,
        draft: pr.draft ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: schema.pullRequests.id,
        set: {
          title: pr.title,
          closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          draft: pr.draft ? 1 : 0,
        },
      });
    count++;
    if (count % 10 === 0) {
      process.stdout.write(`\r    Imported: ${count}/${filtered.length}`);
    }
  }
  if (count > 0)
    process.stdout.write(`\r    Imported: ${count}/${filtered.length}\n`);

  // Fetch additions and comments for PRs that are missing them
  const prsNeedingDetails = await db
    .select()
    .from(schema.pullRequests)
    .where(
      sql`${schema.pullRequests.repositoryId} = ${repoId}
          AND (${schema.pullRequests.additions} IS NULL
               OR ${schema.pullRequests.totalCommentsCount} IS NULL)
          AND ${schema.pullRequests.createdAt} >= ${since}`,
    );

  if (prsNeedingDetails.length > 0) {
    console.log(`    Fetching details for ${prsNeedingDetails.length} PRs...`);
  }
  let detailsCount = 0;
  for (const pr of prsNeedingDetails) {
    try {
      const { data: detail } = await octokit.rest.pulls.get({
        owner: ORGANIZATION,
        repo: repoName,
        pull_number: pr.number,
      });
      await db
        .update(schema.pullRequests)
        .set({
          additions: detail.additions,
          mergedBy: detail.merged_by?.login || null,
          reviewDecision: null,
          totalCommentsCount:
            (detail.comments || 0) + (detail.review_comments || 0),
        })
        .where(sql`${schema.pullRequests.id} = ${pr.id}`);
      detailsCount++;
      if (detailsCount % 5 === 0) {
        process.stdout.write(
          `\r    Details fetched: ${detailsCount}/${prsNeedingDetails.length}`,
        );
      }
    } catch {
      // Rate limit or not found - skip
    }
    await sleep(100);
  }
  if (detailsCount > 0)
    process.stdout.write(
      `\r    Details fetched: ${detailsCount}/${prsNeedingDetails.length}\n`,
    );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`    ✓ ${count} pull requests imported in ${elapsed}s`);
}

async function importWorkflows(repoName: string) {
  const startTime = Date.now();
  const repoId = await ensureRepo(repoName);
  const fullName = `${ORGANIZATION}/${repoName}`;
  console.log(`  Importing workflows for ${fullName}...`);

  const wfs = await octokit.paginate(octokit.rest.actions.listRepoWorkflows, {
    owner: ORGANIZATION,
    repo: repoName,
    per_page: 100,
  });
  console.log(`    Found ${wfs.length} workflows`);

  let count = 0;
  for (const wf of wfs) {
    // Fetch workflow YAML content to detect reusable workflow references
    // (e.g. pagopa/dx/.github/workflows/...) for DX pipeline classification.
    // The original Steampipe CSV stored the full parsed YAML as JSON in the
    // pipeline column; we store its JSON serialization so that
    // `pipeline LIKE '%pagopa/dx%'` keeps working in dashboard queries.
    let pipelineContent: string | null = wf.path || null;
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner: ORGANIZATION,
        repo: repoName,
        path: wf.path,
      });
      if ("content" in fileData && fileData.content) {
        const decoded = Buffer.from(fileData.content, "base64").toString(
          "utf-8",
        );
        const parsed = yaml.load(decoded);
        pipelineContent = JSON.stringify(parsed);
      }
    } catch {
      // If we can't fetch content (deleted workflow, etc.), fall back to path
      pipelineContent = wf.path || null;
    }

    await db
      .insert(schema.workflows)
      .values({
        id: wf.id,
        repositoryId: repoId,
        name: wf.name,
        pipeline: pipelineContent,
      })
      .onConflictDoUpdate({
        target: schema.workflows.id,
        set: {
          name: wf.name,
          pipeline: pipelineContent,
        },
      });
    count++;
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`    ✓ ${count} workflows imported in ${elapsed}s`);
}

async function importWorkflowRuns(repoName: string, since: string) {
  const startTime = Date.now();
  const repoId = await ensureRepo(repoName);
  const fullName = `${ORGANIZATION}/${repoName}`;
  console.log(`  Importing workflow runs for ${fullName}...`);

  let fetchedCount = 0;
  const runs = await octokit.paginate(
    octokit.rest.actions.listWorkflowRunsForRepo,
    {
      owner: ORGANIZATION,
      repo: repoName,
      created: `>=${since}`,
      per_page: 100,
    },
    (response, done) => {
      fetchedCount += response.data.length;
      process.stdout.write(`\r    Fetching runs: ${fetchedCount}...`);
      return response.data;
    },
  );
  process.stdout.write(`\r    Fetched ${fetchedCount} runs total\n`);

  let count = 0;
  for (const run of runs) {
    // Ensure workflow exists
    await db
      .insert(schema.workflows)
      .values({
        id: run.workflow_id,
        repositoryId: repoId,
        name: run.name || "unknown",
        pipeline: null,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.workflowRuns)
      .values({
        id: run.id,
        repositoryId: repoId,
        workflowId: run.workflow_id,
        conclusion: run.conclusion || null,
        status: run.status || null,
        createdAt: new Date(run.created_at),
        updatedAt: new Date(run.updated_at),
      })
      .onConflictDoUpdate({
        target: schema.workflowRuns.id,
        set: {
          conclusion: run.conclusion || null,
          status: run.status || null,
          updatedAt: new Date(run.updated_at),
        },
      });
    count++;
    if (count % 50 === 0) {
      process.stdout.write(`\r    Imported: ${count}/${runs.length}`);
    }
  }
  if (count > 0)
    process.stdout.write(`\r    Imported: ${count}/${runs.length}\n`);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`    ✓ ${count} workflow runs imported in ${elapsed}s`);
}

async function importIacPrLeadTime(repoName: string, since: string) {
  if (repoName === DX_REPO) return;

  const startTime = Date.now();
  const repoId = await ensureRepo(repoName);
  const fullName = `${ORGANIZATION}/${repoName}`;
  console.log(`  Importing IaC PR lead time for ${fullName}...`);

  const targetAuthors = DX_TEAM_MEMBERS;
  const filePath = "infra";

  // Get commits affecting the path
  let allCommits;
  try {
    let commitCount = 0;
    allCommits = await octokit.paginate(
      octokit.rest.repos.listCommits,
      {
        owner: ORGANIZATION,
        repo: repoName,
        path: filePath,
        since,
        per_page: 100,
      },
      (response, done) => {
        commitCount += response.data.length;
        process.stdout.write(`\r    Fetching commits: ${commitCount}...`);
        return response.data;
      },
    );
    process.stdout.write(`\r    Fetched ${commitCount} commits\n`);
  } catch {
    console.log(`    ⚠ No commits found for path ${filePath}`);
    return;
  }

  const prMap = new Map<
    number,
    {
      number: number;
      title: string;
      author: string;
      createdAt: string;
      mergedAt: string;
      leadTimeDays: number;
    }
  >();
  const prReviewersMap = new Map<number, Set<string>>();

  console.log(`    Analyzing ${allCommits.length} commits...`);
  let processedCommits = 0;
  for (const commit of allCommits) {
    const commitAuthor = commit.author?.login?.toLowerCase();
    const isTarget =
      commitAuthor &&
      targetAuthors.map((a) => a.toLowerCase()).includes(commitAuthor);

    let prs;
    try {
      prs = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner: ORGANIZATION,
        repo: repoName,
        commit_sha: commit.sha,
      });
    } catch {
      continue;
    }

    for (const pr of prs.data) {
      // If a DX team member made a commit in this PR, they are a potential reviewer/supervisor
      if (
        isTarget &&
        commitAuthor &&
        commitAuthor !== pr.user?.login?.toLowerCase()
      ) {
        if (!prReviewersMap.has(pr.number))
          prReviewersMap.set(pr.number, new Set());
        prReviewersMap.get(pr.number)!.add(commitAuthor);
      }

      if (pr.merged_at && !prMap.has(pr.number)) {
        const createdAt = new Date(pr.created_at);
        const mergedAt = new Date(pr.merged_at);
        const leadTimeDays =
          (mergedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        prMap.set(pr.number, {
          number: pr.number,
          title: pr.title,
          author: pr.user?.login || "unknown",
          createdAt: pr.created_at,
          mergedAt: pr.merged_at,
          leadTimeDays,
        });
      }
    }
    processedCommits++;
    if (processedCommits % 10 === 0) {
      process.stdout.write(
        `\r    Analyzed: ${processedCommits}/${allCommits.length} commits, found ${prMap.size} PRs`,
      );
    }
    await sleep(50);
  }
  if (processedCommits > 0) {
    process.stdout.write(
      `\r    Analyzed: ${processedCommits}/${allCommits.length} commits, found ${prMap.size} PRs\n`,
    );
  }

  let count = 0;
  for (const pr of prMap.values()) {
    const reviewers = prReviewersMap.has(pr.number)
      ? Array.from(prReviewersMap.get(pr.number)!).filter(
          (a) => a !== "web-flow",
        )
      : [];

    await db
      .insert(schema.iacPrLeadTimes)
      .values({
        repositoryId: repoId,
        repositoryFullName: fullName,
        prNumber: pr.number,
        title: pr.title,
        author: pr.author,
        createdAt: new Date(pr.createdAt),
        mergedAt: new Date(pr.mergedAt),
        leadTimeDays: pr.leadTimeDays.toFixed(2),
        targetAuthors: reviewers,
      })
      .onConflictDoUpdate({
        target: [
          schema.iacPrLeadTimes.repositoryId,
          schema.iacPrLeadTimes.prNumber,
        ],
        set: {
          title: pr.title,
          mergedAt: new Date(pr.mergedAt),
          leadTimeDays: pr.leadTimeDays.toFixed(2),
          targetAuthors: reviewers,
        },
      });
    count++;
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`    ✓ ${count} IaC PR lead times imported in ${elapsed}s`);
}

const BOT_LOGINS = new Set(["renovate-pagopa", "dependabot", "dx-pagopa-bot"]);

async function importPullRequestReviews(repoName: string, since: string) {
  const startTime = Date.now();
  const repoId = await ensureRepo(repoName);
  const fullName = `${ORGANIZATION}/${repoName}`;
  console.log(`  Importing PR reviews for ${fullName}...`);

  const prs = await db
    .select({ id: schema.pullRequests.id, number: schema.pullRequests.number })
    .from(schema.pullRequests)
    .where(
      sql`repository_id = ${repoId} AND created_at >= ${new Date(since)} AND merged_at IS NOT NULL`,
    );

  let count = 0;
  let prIdx = 0;
  for (const pr of prs) {
    prIdx++;
    if (prIdx % 50 === 0) {
      process.stdout.write(`\r    Processing PR ${prIdx}/${prs.length}...`);
    }
    try {
      const reviews = await octokit.rest.pulls.listReviews({
        owner: ORGANIZATION,
        repo: repoName,
        pull_number: pr.number,
        per_page: 100,
      });
      for (const review of reviews.data) {
        const login = review.user?.login;
        if (!login || BOT_LOGINS.has(login)) continue;
        await db
          .insert(schema.pullRequestReviews)
          .values({
            id: review.id,
            pullRequestId: pr.id,
            repositoryId: repoId,
            reviewer: login,
            state: review.state,
            submittedAt: review.submitted_at
              ? new Date(review.submitted_at)
              : null,
          })
          .onConflictDoUpdate({
            target: schema.pullRequestReviews.id,
            set: {
              state: review.state,
              submittedAt: review.submitted_at
                ? new Date(review.submitted_at)
                : null,
            },
          });
        count++;
      }
    } catch (e) {
      console.log(`\n    ⚠ listReviews failed for PR #${pr.number}: ${e}`);
    }
    await sleep(100);
  }
  if (prIdx > 0) process.stdout.write(`\n`);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `    ✓ ${count} reviews imported for ${prs.length} PRs in ${elapsed}s`,
  );
}

async function importCommitsForMember(member: string, since: string) {
  const startTime = Date.now();
  const sinceDate = new Date(since);
  const query = `org:${ORGANIZATION} committer-date:${sinceDate.toISOString().split("T")[0]}..${new Date().toISOString().split("T")[0]} author:${member}`;

  try {
    let fetchedCount = 0;
    const results = await octokit.paginate(
      octokit.rest.search.commits,
      {
        q: query,
        per_page: 100,
      },
      (response, done) => {
        fetchedCount += response.data.length;
        process.stdout.write(
          `\r      Fetching commits for ${member}: ${fetchedCount}...`,
        );
        return response.data;
      },
    );
    process.stdout.write(
      `\r      Fetched ${fetchedCount} commits for ${member}\n`,
    );

    let count = 0;
    for (const item of results) {
      const repoFullName = item.repository?.full_name;
      if (!repoFullName) continue;

      let repoId: number;
      try {
        const repoName = repoFullName.split("/")[1];
        repoId = await ensureRepo(repoName);
      } catch {
        continue;
      }

      await db
        .insert(schema.commits)
        .values({
          sha: item.sha,
          repositoryId: repoId,
          repositoryFullName: repoFullName,
          author: item.author?.login || null,
          committer:
            (item.committer as { login?: string } | null)?.login || null,
          committerDate: item.commit?.committer?.date
            ? new Date(item.commit.committer.date)
            : null,
          message: item.commit?.message?.slice(0, 500) || null,
        })
        .onConflictDoNothing();
      count++;
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`    ✓ ${member}: ${count} commits imported in ${elapsed}s`);
  } catch (e) {
    console.log(`    ⚠ ${member}: search failed - ${e}`);
    throw e; // Re-throw so checkpoint is marked as failed
  }
  await sleep(2000); // Search API rate limit
}

async function importDxPipelineUsages() {
  console.log(
    `  Importing DX pipeline usages (code search for pagopa/dx/.github/workflows)...`,
  );

  const query = `pagopa/dx/.github/workflows org:${ORGANIZATION} path:.github/workflows`;
  try {
    const results = await octokit.paginate(octokit.rest.search.code, {
      q: query,
      per_page: 100,
    });
    console.log(`    Found ${results.length} workflow files referencing DX`);

    // Snapshot: clear all existing records before reinserting
    await db.execute(sql`TRUNCATE TABLE dx_pipeline_usages`);

    const DX_USES_RE =
      /uses:\s*(pagopa\/dx\/\.github\/workflows\/([^@\s"'\n]+))(?:@([^\s"'\n]+))?/g;

    let count = 0;
    for (const item of results) {
      const repoFullName = item.repository?.full_name;
      const callerFile = item.path;
      if (!repoFullName || !callerFile) continue;

      // Fetch file content to extract specific DX workflow references
      let content = "";
      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner: item.repository.owner.login,
          repo: item.repository.name,
          path: callerFile,
        });
        if ("content" in fileData && fileData.content) {
          content = Buffer.from(fileData.content, "base64").toString("utf-8");
        }
      } catch {
        // If content fetch fails, skip this file
        continue;
      }

      // Extract all `uses: pagopa/dx/.github/workflows/X@ref` patterns
      const matches = [...content.matchAll(DX_USES_RE)];
      for (const m of matches) {
        const dxWorkflow = m[1]; // full path e.g. pagopa/dx/.github/workflows/node-ci.yml
        const ref = m[3] ?? null;
        await db
          .insert(schema.dxPipelineUsages)
          .values({ repository: repoFullName, callerFile, dxWorkflow, ref })
          .onConflictDoNothing();
        count++;
      }
      await sleep(200); // be gentle with secondary rate limits
    }
    console.log(`    ✓ ${count} DX pipeline usage records imported`);
  } catch (e) {
    console.log(`    ⚠ DX pipeline usages import failed: ${e}`);
    throw e;
  }
}

async function importCodeSearch() {
  console.log(`  Importing code search results (DX adoption)...`);

  const query = "pagopa/dx org:pagopa";
  try {
    const results = await octokit.paginate(octokit.rest.search.code, {
      q: query,
      per_page: 100,
    });

    // Clear old results for this query
    await db
      .delete(schema.codeSearchResults)
      .where(sql`${schema.codeSearchResults.query} = ${query}`);

    let count = 0;
    for (const item of results) {
      const repoFullName = item.repository?.full_name;
      if (!repoFullName) continue;

      await db
        .insert(schema.codeSearchResults)
        .values({
          query,
          repositoryFullName: repoFullName,
          path: item.path || null,
        })
        .onConflictDoNothing();
      count++;
    }
    console.log(`    ✓ ${count} code search results`);
  } catch (e) {
    console.log(`    ⚠ Code search failed: ${e}`);
  }
}

async function importTerraformModules(repoName: string) {
  const fullName = `${ORGANIZATION}/${repoName}`;
  console.log(`  Scanning Terraform modules for ${fullName} (terrawiz)...`);

  interface TerrawizModule {
    source: string;
    sourceType: string;
    version: string;
    repository: string;
    filePath: string;
    lineNumber: number;
  }

  interface TerrawizOutput {
    modules: TerrawizModule[];
  }

  let output: TerrawizOutput = { modules: [] };

  const tmpFile = path.join(
    os.tmpdir(),
    `terrawiz-${repoName}-${Date.now()}.json`,
  );
  try {
    execSync(
      `npx --yes terrawiz scan github:${fullName} -f json -e ${tmpFile}`,
      {
        env: { ...process.env },
        timeout: 5 * 60 * 1000, // 5 minutes per repo
        maxBuffer: 50 * 1024 * 1024, // 50 MB
        stdio: "pipe",
      },
    );
    output = JSON.parse(fs.readFileSync(tmpFile, "utf-8")) as TerrawizOutput;
  } catch (e: unknown) {
    console.log(`    ⚠ terrawiz failed for ${fullName}: ${e}`);
    return;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }

  const modules = output.modules ?? [];
  if (modules.length === 0) {
    console.log(`    ⚠ No Terraform modules found in ${fullName}`);
    return;
  }

  // Replace previous snapshot for this repo (handles deleted modules).
  await db.execute(
    sql`DELETE FROM terraform_modules WHERE repository = ${fullName}`,
  );

  let count = 0;
  for (const mod of modules) {
    await db
      .insert(schema.terraformModules)
      .values({
        repository: fullName,
        module: mod.source,
        filePath: mod.filePath ?? null,
        version: mod.version ?? null,
      })
      .onConflictDoNothing();
    count++;
  }
  console.log(`    ✓ ${count} Terraform modules imported for ${fullName}`);
}

async function importTerraformRegistryReleases() {
  console.log(`  Importing Terraform registry releases...`);

  const NAMESPACE = "pagopa-dx";
  const API = "https://registry.terraform.io/v1";

  try {
    // Paginate through all modules in the namespace
    const allModules: { name: string; provider: string; namespace: string }[] =
      [];
    let nextUrl: string | null = `${API}/modules/${NAMESPACE}`;
    while (nextUrl) {
      const res = await fetch(nextUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        meta?: { next_url?: string };
        modules: { name: string; provider: string; namespace: string }[];
      };
      allModules.push(...(data.modules || []));
      nextUrl = data.meta?.next_url ?? null;
      if (nextUrl) await sleep(100);
    }

    let totalCount = 0;
    for (const mod of allModules) {
      const vRes = await fetch(
        `${API}/modules/${mod.namespace}/${mod.name}/${mod.provider}/versions`,
      );
      if (!vRes.ok) continue;
      const vData = (await vRes.json()) as {
        modules: { versions: { version: string }[] }[];
      };
      // The /versions endpoint does not include published_at; sort by semver ascending
      const versions = (vData.modules?.[0]?.versions || []).map(
        (v) => v.version,
      );

      const sorted = [...versions].sort((a, b) => {
        const parse = (s: string) => s.replace(/^v/, "").split(".").map(Number);
        const [aMaj, aMin = 0, aPatch = 0] = parse(a);
        const [bMaj, bMin = 0, bPatch = 0] = parse(b);
        return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
      });

      // Find first version per major
      const firstByMajor = new Map<number, string>();
      for (const ver of sorted) {
        const match = ver.match(/^v?(\d+)\./);
        if (!match) continue;
        const major = parseInt(match[1], 10);
        if (!firstByMajor.has(major)) firstByMajor.set(major, ver);
      }

      for (const [major, firstVer] of firstByMajor) {
        // Fetch published_at from the individual version endpoint
        const detailRes = await fetch(
          `${API}/modules/${mod.namespace}/${mod.name}/${mod.provider}/${firstVer}`,
        );
        if (!detailRes.ok) continue;
        const detail = (await detailRes.json()) as {
          published_at?: string;
        };
        const publishedAt = detail.published_at
          ? new Date(detail.published_at)
          : null;
        if (!publishedAt || isNaN(publishedAt.getTime())) continue;

        const majorVersionsList = sorted.filter((sv) => {
          const m = sv.match(/^v?(\d+)\./);
          return m && parseInt(m[1], 10) === major;
        });
        const majorCount = majorVersionsList.length;
        const latestVersion =
          majorVersionsList[majorVersionsList.length - 1] ?? firstVer;

        await db
          .insert(schema.terraformRegistryReleases)
          .values({
            moduleName: mod.name,
            provider: mod.provider,
            majorVersion: major,
            firstReleaseVersion: firstVer,
            releaseDate: publishedAt,
            releasesCount: majorCount,
            latestVersion,
          })
          .onConflictDoUpdate({
            target: [
              schema.terraformRegistryReleases.moduleName,
              schema.terraformRegistryReleases.provider,
              schema.terraformRegistryReleases.majorVersion,
            ],
            set: {
              releasesCount: majorCount,
              latestVersion,
            },
          });
        totalCount++;
        await sleep(100);
      }
    }
    console.log(`    ✓ ${totalCount} registry releases`);
  } catch (e) {
    console.log(`    ⚠ Registry import failed: ${e}`);
  }
}

async function importTrackerCsv(csvPath: string) {
  console.log(`  Importing tracker CSV from ${csvPath}...`);
  const fs = await import("fs");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    console.log("    ⚠ CSV is empty");
    return;
  }

  // Parse header
  const splitCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ""));
    return result;
  };

  const headers = splitCSVLine(lines[0]);

  // Find column indices
  const submittedIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("data di invio"),
  );
  const closedIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("data di scadenza"),
  );
  const categoryIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("tipologia"),
  );
  const priorityIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("priorit"),
  );
  const isClosedIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("completato"),
  );
  const statusIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("status"),
  );

  // Clear existing tracker data and reimport
  await db.delete(schema.trackerRequests);

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);

    const rawSubmitted =
      submittedIdx >= 0 &&
      cols[submittedIdx] &&
      cols[submittedIdx] !== "undefined"
        ? cols[submittedIdx]
        : "";
    const rawClosed =
      closedIdx >= 0 && cols[closedIdx] && cols[closedIdx] !== "undefined"
        ? cols[closedIdx]
        : "";
    const category = categoryIdx >= 0 ? cols[categoryIdx] : "";
    const priority = priorityIdx >= 0 ? cols[priorityIdx] : "";
    const isClosed = isClosedIdx >= 0 ? cols[isClosedIdx] : "";
    const status = statusIdx >= 0 ? cols[statusIdx] : "";

    // Parse dates
    let submittedAt: Date | null = null;
    let closedAt: Date | null = null;

    if (rawSubmitted) {
      // Format: DD/MM/YY, HH:MI or YYYY-MM-DD
      try {
        const match = rawSubmitted.match(
          /^(\d{1,2})\/(\d{1,2})\/(\d{2}),?\s*(\d{1,2}):(\d{1,2})$/,
        );
        if (match) {
          const [, d, m, y, h, min] = match;
          submittedAt = new Date(
            2000 + parseInt(y),
            parseInt(m) - 1,
            parseInt(d),
            parseInt(h),
            parseInt(min),
          );
        } else if (rawSubmitted.match(/^\d{4}-\d{2}-\d{2}/)) {
          const d = new Date(rawSubmitted);
          if (!isNaN(d.getTime())) {
            submittedAt = d;
          }
        }
      } catch {
        // skip
      }
    }

    if (rawClosed) {
      try {
        if (rawClosed.match(/^\d{4}-\d{2}-\d{2}/)) {
          const d = new Date(rawClosed);
          if (!isNaN(d.getTime())) {
            closedAt = d;
          }
        }
      } catch {
        // skip
      }
    }

    await db.insert(schema.trackerRequests).values({
      submittedAt,
      closedAt,
      category,
      priority,
      isClosed,
      status,
      rawSubmittedAt: rawSubmitted,
      rawClosedAt: rawClosed,
    });
    count++;
  }
  console.log(`    ✓ ${count} tracker requests imported`);
}

async function seedConfig() {
  console.log("  Seeding config and DX team members...");

  await db
    .insert(schema.config)
    .values({ key: "organization", value: ORGANIZATION })
    .onConflictDoUpdate({
      target: schema.config.key,
      set: { value: ORGANIZATION },
    });

  await db
    .insert(schema.config)
    .values({ key: "dx_repo", value: DX_REPO })
    .onConflictDoUpdate({
      target: schema.config.key,
      set: { value: DX_REPO },
    });

  for (const member of DX_TEAM_MEMBERS) {
    await db
      .insert(schema.dxTeamMembers)
      .values({ username: member })
      .onConflictDoNothing();
  }

  console.log("    ✓ Config seeded");
}

// --- Main ---

async function main() {
  const { since, entity, trackerCsv, force } = parseArgs();
  const overallStartTime = Date.now();

  console.log(`\n🚀 DX Metrics Import`);
  console.log(`   Since: ${since}`);
  console.log(`   Entity: ${entity}`);
  console.log(`   Force: ${force}`);
  console.log(`   Organization: ${ORGANIZATION}`);
  console.log(`   Repositories: ${REPOSITORIES.length}\n`);

  // Track totals
  const stats = {
    pullRequests: 0,
    workflows: 0,
    workflowRuns: 0,
    iacPrLeadTimes: 0,
    commits: 0,
    skipped: 0,
  };

  // Clean up stale "running" checkpoints from interrupted runs
  await cleanStaleCheckpoints();

  // Seed config
  await seedConfig();

  const shouldRun = (e: string) => entity === "all" || entity === e;

  /**
   * Run an importer with checkpoint tracking.
   * Skips if a successful checkpoint already exists (unless --force).
   */
  async function runWithCheckpoint(
    entityType: string,
    repoName: string | null,
    fn: () => Promise<void>,
  ) {
    if (!force && (await hasCheckpoint(entityType, repoName, since))) {
      const label = repoName ? `${entityType} (${repoName})` : entityType;
      console.log(
        `  ⏭ Skipping ${label} — already imported for --since ${since}`,
      );
      stats.skipped++;
      return;
    }

    // Only resolve repoId when repoName is an actual repository
    // (not a member username, as happens for "commits" entity)
    const isRepoEntity = repoName && REPOSITORIES.includes(repoName);
    const repoId = isRepoEntity ? await ensureRepo(repoName) : null;
    const syncRunId = await startCheckpoint(
      entityType,
      repoName,
      since,
      repoId,
    );

    try {
      await fn();
      await completeCheckpoint(syncRunId);
    } catch (e) {
      await failCheckpoint(syncRunId);
      console.error(`  ❌ Failed: ${e}`);
    }
  }

  for (const repoName of REPOSITORIES) {
    console.log(`\n📦 ${ORGANIZATION}/${repoName}`);

    if (shouldRun("pull-requests")) {
      await runWithCheckpoint("pull-requests", repoName, () =>
        importPullRequests(repoName, since),
      );
    }
    if (shouldRun("workflows")) {
      await runWithCheckpoint("workflows", repoName, () =>
        importWorkflows(repoName),
      );
    }
    if (shouldRun("workflow-runs")) {
      await runWithCheckpoint("workflow-runs", repoName, () =>
        importWorkflowRuns(repoName, since),
      );
    }
    if (shouldRun("iac-pr")) {
      await runWithCheckpoint("iac-pr", repoName, () =>
        importIacPrLeadTime(repoName, since),
      );
    }
    if (shouldRun("terraform-modules")) {
      await runWithCheckpoint("terraform-modules", repoName, () =>
        importTerraformModules(repoName),
      );
    }
    if (shouldRun("pr-reviews")) {
      await runWithCheckpoint("pr-reviews", repoName, () =>
        importPullRequestReviews(repoName, since),
      );
    }
  }

  if (shouldRun("commits")) {
    console.log("\n🔍 DX Team Commits");
    // Track commits per member so partial runs resume correctly
    for (const member of DX_TEAM_MEMBERS) {
      await runWithCheckpoint("commits", member, () =>
        importCommitsForMember(member, since),
      );
    }
  }

  if (shouldRun("code-search")) {
    console.log("\n🔍 Code Search (DX Adoption)");
    await runWithCheckpoint("code-search", null, () => importCodeSearch());
  }

  if (shouldRun("dx-pipelines")) {
    console.log("\n🔍 DX Pipeline Usages");
    await runWithCheckpoint("dx-pipelines", null, () =>
      importDxPipelineUsages(),
    );
  }

  if (shouldRun("terraform-registry")) {
    console.log("\n📦 Terraform Registry");
    await runWithCheckpoint("terraform-registry", null, () =>
      importTerraformRegistryReleases(),
    );
  }

  if (shouldRun("tracker") && trackerCsv) {
    console.log("\n📋 Tracker");
    await runWithCheckpoint("tracker", null, () =>
      importTrackerCsv(trackerCsv),
    );
  }

  const overallElapsed = ((Date.now() - overallStartTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(50));
  console.log("✅ Import complete!");
  console.log("\n📊 Summary:");
  console.log(`   Total time: ${overallElapsed}s`);
  console.log(`   Tasks skipped: ${stats.skipped}`);
  console.log("\n");
  await pool.end();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
