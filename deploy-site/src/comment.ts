import type { getOctokit } from "@actions/github";

type Octokit = ReturnType<typeof getOctokit>;

// The marker is a contract: the CLI repo's future GitHub App upserts the same
// `<!-- bunny-sites:<site> -->` marker, so it must not change without
// coordinating there.
export function marker(site: string): string {
  return `<!-- bunny-sites:${site} -->`;
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
    `**bunny.net** deployed a preview of \`${input.site}\``,
    "",
    "| Deploy | Preview | Updated |",
    "| ------ | ------- | ------- |",
    `| \`${input.deployId}\` | ${input.previewUrl} | ${formatUpdated(input.updated)} |`,
    "",
  ].join("\n");
}

export type UpsertContext = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export async function upsertPreviewComment(
  octokit: Octokit,
  ctx: UpsertContext,
  input: CommentInput,
): Promise<void> {
  const body = buildCommentBody(input);
  const prefix = marker(input.site);

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.issueNumber,
  });

  const existing = comments.find((c) => (c.body ?? "").startsWith(prefix));

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
