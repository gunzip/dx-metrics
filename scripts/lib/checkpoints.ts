/** This module manages checkpoint tracking for incremental imports. */

import { sql } from "drizzle-orm";
import type { ImportContext } from "./import-context";

const getCheckpointKey = (
  entityType: string,
  repoName: string | null,
): string => (repoName ? `${entityType}:${repoName}` : entityType);

export async function hasCheckpoint(
  context: ImportContext,
  entityType: string,
  repoName: string | null,
  since: string,
): Promise<boolean> {
  const sinceDate = new Date(since);
  const checkpointKey = getCheckpointKey(entityType, repoName);
  const rows = await context.db.execute<{ since_date: string }>(
    sql`SELECT since_date FROM sync_runs
        WHERE entity_type = ${checkpointKey} AND status = 'done'`,
  );

  return rows.rows.some(
    (row) =>
      Boolean(row.since_date) &&
      new Date(row.since_date).getTime() <= sinceDate.getTime(),
  );
}

export async function startCheckpoint(
  context: ImportContext,
  entityType: string,
  repoName: string | null,
  since: string,
  repoId: number | null,
): Promise<number> {
  const checkpointKey = getCheckpointKey(entityType, repoName);
  const rows = await context.db.execute<{ id: number }>(
    sql`INSERT INTO sync_runs (entity_type, repository_id, since_date, status)
        VALUES (${checkpointKey}, ${repoId}, ${new Date(since)}, 'running')
        RETURNING id`,
  );

  return rows.rows[0].id;
}

export async function completeCheckpoint(
  context: ImportContext,
  syncRunId: number,
): Promise<void> {
  await context.db.execute(
    sql`UPDATE sync_runs SET status = 'done', completed_at = NOW()
        WHERE id = ${syncRunId}`,
  );
}

export async function failCheckpoint(
  context: ImportContext,
  syncRunId: number,
): Promise<void> {
  await context.db.execute(
    sql`UPDATE sync_runs SET status = 'failed', completed_at = NOW()
        WHERE id = ${syncRunId}`,
  );
}

export async function cleanStaleCheckpoints(
  context: ImportContext,
): Promise<void> {
  await context.db.execute(
    sql`UPDATE sync_runs SET status = 'interrupted', completed_at = NOW()
        WHERE status = 'running'`,
  );
}
