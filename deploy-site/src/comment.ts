import type { getOctokit } from "@actions/github";

type Octokit = ReturnType<typeof getOctokit>;

// The marker is a contract: the CLI repo's future GitHub App upserts the same
// `<!-- bunny-sites:<site> -->` marker, so it must not change without
// coordinating there.
export function marker(site: string): string {
  return `<!-- bunny-sites:${site} -->`;
}

// Hidden line carrying the deploy id. The close-event cleanup reads it back:
// the id can't be recomputed at close time (PR runs deploy the merge-ref
// checkout, whose sha isn't in the closed event and whose ref may be gone).
export function deployIdLine(deployId: string): string {
  return `<!-- bunny-sites-deploy:${deployId} -->`;
}

export function parseDeployId(body: string): string | undefined {
  const match = body.match(/<!-- bunny-sites-deploy:([a-z0-9]{4,40}) -->/);
  return match?.[1];
}

// `2026-07-13T14:02:31.000Z` -> `2026-07-13 14:02 UTC`
export function formatUpdated(date: Date): string {
  const [d, t] = date.toISOString().split("T");
  return `${d} ${t.slice(0, 5)} UTC`;
}

export type CommentInput = {
  site: string;
  deployId: string;
  previewUrl: string;
  updated: Date;
};

export function buildCommentBody(input: CommentInput): string {
  return [
    marker(input.site),
    deployIdLine(input.deployId),
    `**bunny.net** deployed a preview of \`${input.site}\``,
    "",
    "| Deploy | Preview | Updated |",
    "| ------ | ------- | ------- |",
    `| \`${input.deployId}\` | ${input.previewUrl} | ${formatUpdated(input.updated)} |`,
    "",
  ].join("\n");
}

// The body after cleanup deleted the preview. No deploy-id line: there is
// nothing left to clean, so a re-run's cleanup finds no id and no-ops.
export function buildCleanupCommentBody(
  site: string,
  deployId: string,
  updated: Date,
): string {
  return [
    marker(site),
    `**bunny.net** preview of \`${site}\` was deleted (deploy \`${deployId}\`, ${formatUpdated(updated)}).`,
    "",
  ].join("\n");
}

export type UpsertContext = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export async function findPreviewComment(
  octokit: Octokit,
  ctx: UpsertContext,
  site: string,
): Promise<{ id: number; body: string } | undefined> {
  const prefix = marker(site);

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.issueNumber,
  });

  const existing = comments.find((c) => (c.body ?? "").startsWith(prefix));
  if (!existing) return undefined;
  return { id: existing.id, body: existing.body ?? "" };
}

export async function upsertComment(
  octokit: Octokit,
  ctx: UpsertContext,
  site: string,
  body: string,
): Promise<void> {
  const existing = await findPreviewComment(octokit, ctx, site);

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: ctx.owner,
      repo: ctx.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.issueNumber,
      body,
    });
  }
}

export async function upsertPreviewComment(
  octokit: Octokit,
  ctx: UpsertContext,
  input: CommentInput,
): Promise<void> {
  await upsertComment(octokit, ctx, input.site, buildCommentBody(input));
}
