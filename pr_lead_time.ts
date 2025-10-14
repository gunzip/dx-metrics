import { Octokit } from "octokit";

// --- Configuration ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.argv[2];
const REPO_NAME = process.argv[3];
const FILE_PATH = process.argv[4];
// ---------------------

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is not set.");
  process.exit(1);
}
// Initialize Octokit
const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Define a type for our PR data structure
interface PullRequestData {
  number: number;
  title: string;
  createdAt: string;
  mergedAt: string;
  leadTimeDays: number;
}

/**
 * Main function to fetch PRs, calculate lead times, and generate a CSV report.
 */
async function getPullRequestLeadTimeForPath() {
  console.error(
    `Searching for PRs affecting path "${FILE_PATH}" in repository ${REPO_OWNER}/${REPO_NAME}...`
  );

  try {
    // 1. Get all commits that have affected the specified path
    const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: FILE_PATH,
      per_page: 100,
    });

    if (commits.length === 0) {
      console.error("No commits found for the specified path.");
      return;
    }

    console.error(
      `Found ${commits.length} commits. Analyzing associated pull requests...`
    );

    const pullRequestMap = new Map<number, PullRequestData>();

    // 2. For each commit, find its associated pull requests
    for (const commit of commits) {
      const prs = await octokit.rest.repos.listPullRequestsAssociatedWithCommit(
        {
          owner: REPO_OWNER,
          repo: REPO_NAME,
          commit_sha: commit.sha,
        }
      );

      for (const pr of prs.data) {
        // 3. Process only merged PRs and avoid duplicates
        if (pr.merged_at && !pullRequestMap.has(pr.number)) {
          const createdAt = new Date(pr.created_at);
          const mergedAt = new Date(pr.merged_at);

          // Calculate lead time in seconds, then convert to days
          const leadTimeInSeconds =
            (mergedAt.getTime() - createdAt.getTime()) / 1000;
          const leadTimeInDays = leadTimeInSeconds / (60 * 60 * 24);

          pullRequestMap.set(pr.number, {
            number: pr.number,
            title: pr.title,
            createdAt: pr.created_at,
            mergedAt: pr.merged_at,
            leadTimeDays: leadTimeInDays,
          });
        }
      }
    }

    if (pullRequestMap.size === 0) {
      console.error(
        "No merged pull requests were found associated with the commits for this path."
      );
      return;
    }

    // 4. Convert map to array and sort by creation date (ascending)
    const sortedPRs = Array.from(pullRequestMap.values()).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    console.error(
      `\nProcessing complete. Found ${sortedPRs.length} unique, merged PRs.`
    );
    console.error("Generating CSV output below.\n");

    // 5. Generate and print CSV output
    // Print header
    console.log(
      `"PR Title","Opening Date","Closing Date","PR Number","Lead Time (Days)"`
    );

    // Print data rows
    for (const pr of sortedPRs) {
      // To handle titles with commas, we enclose them in quotes and escape existing quotes.
      const safeTitle = `"${pr.title.replace(/"/g, '""')}"`;
      const leadTimeFixed = pr.leadTimeDays.toFixed(2);

      console.log(
        `${safeTitle},${pr.createdAt},${pr.mergedAt},${pr.number},${leadTimeFixed}`
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("An error occurred:", message);
  }
}

// Execute the main function
getPullRequestLeadTimeForPath();
