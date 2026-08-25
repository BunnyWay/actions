import type { getOctokit } from "@actions/github";

type Octokit = ReturnType<typeof getOctokit>;

// Every deploy goes live, so a run maps one-to-one onto a GitHub deployment:
// the repository's Environments tab becomes the deploy history, with the live
// URL linked off the latest successful one.

export type RepoRef = {
  owner: string;
  repo: string;
  /** The commit being deployed; a sha is a valid deployment ref. */
  ref: string;
};

export type DeploymentState = "in_progress" | "success" | "failure" | "error";

// GitHub truncates silently past these; do it here so the API sees exactly
// what we meant to send.
const DESCRIPTION_MAX = 140;
const LOG_URL_MAX = 255;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function runLogUrl(
  serverUrl: string,
  owner: string,
  repo: string,
  runId: number,
): string {
  return truncate(
    `${serverUrl}/${owner}/${repo}/actions/runs/${runId}`,
    LOG_URL_MAX,
  );
}

// Open the deployment record. `auto_merge: false` and `required_contexts: []`
// are what make the API return a deployment rather than a merge commit or a
// "conflict with pending checks" message: the workflow reaching this step is
// itself the decision to deploy, and re-checking its own status would deadlock.
export async function createDeployment(
  octokit: Octokit,
  ref: RepoRef,
  opts: { environment: string; description: string },
): Promise<number | undefined> {
  const { data } = await octokit.rest.repos.createDeployment({
    owner: ref.owner,
    repo: ref.repo,
    ref: ref.ref,
    environment: opts.environment,
    description: truncate(opts.description, DESCRIPTION_MAX),
    auto_merge: false,
    required_contexts: [],
    // Deploying is publishing: whatever the environment is named, this deploy
    // is the live site once it succeeds.
    production_environment: true,
    transient_environment: false,
  });

  // The 202/409 bodies are `{ message }` with no deployment; the caller treats
  // that as "not recorded" rather than guessing an id.
  return "id" in data ? data.id : undefined;
}

export async function setDeploymentStatus(
  octokit: Octokit,
  ref: RepoRef,
  deploymentId: number,
  opts: {
    state: DeploymentState;
    description: string;
    environmentUrl?: string;
    logUrl?: string;
  },
): Promise<void> {
  await octokit.rest.repos.createDeploymentStatus({
    owner: ref.owner,
    repo: ref.repo,
    deployment_id: deploymentId,
    state: opts.state,
    description: truncate(opts.description, DESCRIPTION_MAX),
    // Omitted rather than sent empty: an empty environment_url makes GitHub
    // render an environment with a dead "View deployment" button.
    ...(opts.environmentUrl ? { environment_url: opts.environmentUrl } : {}),
    ...(opts.logUrl ? { log_url: opts.logUrl } : {}),
    // Supersede the previous successful deploy of this environment; only one
    // deploy is live at a time.
    auto_inactive: true,
  });
}
