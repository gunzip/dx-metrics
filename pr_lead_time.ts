import { Octokit } from "octokit";

// --- Configuration ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.argv[2];
const REPO_NAME = process.argv[3];
const FILE_PATH = process.argv[4];
const AUTHORS_INPUT = process.argv[5]; // Comma-separated list of authors
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
  author: string;
  createdAt: string;
  mergedAt: string;
  leadTimeDays: number;
  targetAuthors: string[];
}

/**
 * Main function to fetch PRs, calculate lead times, and generate a CSV report.
 */
async function getPullRequestLeadTimeForPath() {
  // Parse the authors list (optional parameter)
  const targetAuthors = AUTHORS_INPUT
    ? AUTHORS_INPUT.split(",").map((author) => author.trim().toLowerCase())
    : [];

  console.error(
    `Searching for PRs affecting path "${FILE_PATH}" in repository ${REPO_OWNER}/${REPO_NAME}...`
  );

  if (targetAuthors.length > 0) {
    console.error(
      `Tracking contributions from authors: ${targetAuthors.join(", ")}`
    );
  }

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
    // Track which PRs have contributions from target authors
    const prAuthorsMap = new Map<number, Set<string>>();

    // 2. For each commit, find its associated pull requests
    for (const commit of commits) {
      // Get the author/committer of this commit
      const commitAuthor = commit.author?.login?.toLowerCase();
      const commitCommitter = commit.committer?.login?.toLowerCase();
      const isTargetAuthor =
        targetAuthors.length > 0 &&
        ((commitAuthor && targetAuthors.includes(commitAuthor)) ||
          (commitCommitter && targetAuthors.includes(commitCommitter)));

      const prs = await octokit.rest.repos.listPullRequestsAssociatedWithCommit(
        {
          owner: REPO_OWNER,
          repo: REPO_NAME,
          commit_sha: commit.sha,
        }
      );

      for (const pr of prs.data) {
        // Track target author contributions for this PR
        if (isTargetAuthor) {
          if (!prAuthorsMap.has(pr.number)) {
            prAuthorsMap.set(pr.number, new Set());
          }
          if (commitAuthor) prAuthorsMap.get(pr.number)!.add(commitAuthor);
          if (commitCommitter)
            prAuthorsMap.get(pr.number)!.add(commitCommitter);
        }

        // 3. Process only merged PRs and avoid duplicates
        if (pr.merged_at && !pullRequestMap.has(pr.number)) {
          const createdAt = new Date(pr.created_at);
          const mergedAt = new Date(pr.merged_at);

          // Calculate lead time in seconds, then convert to days
          const leadTimeInSeconds =
            (mergedAt.getTime() - createdAt.getTime()) / 1000;
          const leadTimeInDays = leadTimeInSeconds / (60 * 60 * 24);

          // Get the list of target authors who contributed to this PR
          const contributingAuthors = prAuthorsMap.has(pr.number)
            ? Array.from(prAuthorsMap.get(pr.number)!)
            : [];

          pullRequestMap.set(pr.number, {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login || "unknown",
            createdAt: pr.created_at,
            mergedAt: pr.merged_at,
            leadTimeDays: leadTimeInDays,
            targetAuthors: contributingAuthors,
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
    const repoFullName = `${REPO_OWNER}/${REPO_NAME}`;
    const hasAuthorColumn = targetAuthors.length > 0 ? '"target_authors"' : "";
    console.log(
      `repository_full_name,title,author,created_at,merged_at,number,lead_time_days,${hasAuthorColumn}`
    );

    // Print data rows
    for (const pr of sortedPRs) {
      // To handle titles with commas, we enclose them in quotes and escape existing quotes.
      const safeTitle = `"${pr.title.replace(/"/g, '""')}"`;
      const leadTimeFixed = pr.leadTimeDays.toFixed(2);
      // Filter out 'web-flow' from the target authors list
      const filteredAuthors = pr.targetAuthors.filter(
        (author) => author !== "web-flow"
      );
      const authorColumn =
        targetAuthors.length > 0 ? `,"${filteredAuthors.join(", ")}"` : "";

      console.log(
        `"${repoFullName}",${safeTitle},"${pr.author}",${pr.createdAt},${pr.mergedAt},${pr.number},${leadTimeFixed}${authorColumn}`
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("An error occurred:", message);
  }
}

// Execute the main function
getPullRequestLeadTimeForPath();
