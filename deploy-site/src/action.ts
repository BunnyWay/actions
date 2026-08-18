import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as cli from "./cli";
import {
  buildCleanupCommentBody,
  findPreviewComment,
  parseDeployId,
  upsertComment,
  upsertPreviewComment,
} from "./comment";

export async function run() {
  try {
    const site = core.getInput("site", { required: true });
    const directory = core.getInput("directory", { required: true });
    const apiKey = core.getInput("api_key", { required: true });
    const production = core.getBooleanInput("production");
    const comment = core.getBooleanInput("comment");
    const cleanup = core.getBooleanInput("cleanup");
    const githubToken = core.getInput("github_token");
    const cliVersion = core.getInput("cli_version");
    const force = core.getBooleanInput("force");

    // Mask the API key before spawning anything.
    core.setSecret(apiKey);

    if (site.trim() === "") {
      core.setFailed("Input `site` must not be empty.");
      return;
    }

    // A closed PR is a cleanup run, not a deploy: delete the preview deploy
    // recorded in the sticky comment. Branches before the directory checks,
    // since nothing was built on this event.
    if (
      github.context.eventName === "pull_request" &&
      github.context.payload.action === "closed"
    ) {
      if (!cleanup) {
        core.info("PR closed and `cleanup` is false; nothing to do.");
        return;
      }
      await cleanupPreview(githubToken, site, cliVersion, apiKey);
      return;
    }

    if (directory.trim() === "") {
      core.setFailed("Input `directory` must not be empty.");
      return;
    }

    if (!fs.existsSync(directory)) {
      core.setFailed(
        `Directory "${directory}" does not exist. Build your site before deploying.`,
      );
      return;
    }

    const result = await cli.runDeploy(
      { cliVersion, directory, site, production, force },
      apiKey,
    );

    if (result.exitCode !== 0) {
      const tail = cli.lastLines(result.stderr, 20);
      core.setFailed(`Deploy failed (exit ${result.exitCode}).\n${tail}`);
      return;
    }

    const output = cli.parseDeployOutput(result.stdout);

    const previewUrl = output.preview ?? "";
    const productionUrl = output.production ?? "";
    const unchanged = cli.isUnchanged(output);
    // Whether this deploy is the live production deploy. The CLI reports it
    // (`promoted` on a fresh deploy, `live` on a no-op), so trust that rather
    // than assuming the `production` input decided it.
    const promoted = unchanged ? output.live : output.promoted;

    core.setOutput("deploy-id", output.id);
    core.setOutput("preview-url", previewUrl);
    core.setOutput("production-url", productionUrl);
    core.setOutput("promoted", promoted ? "true" : "false");
    core.setOutput("unchanged", unchanged ? "true" : "false");

    const liveNote = promoted && productionUrl ? `, live at ${productionUrl}` : "";
    const summary = unchanged
      ? `bunny.net: \`${site}\` already up to date (deploy \`${output.id}\`)${liveNote}.`
      : `bunny.net: deployed \`${site}\` (deploy \`${output.id}\`)${previewUrl ? `, preview ${previewUrl}` : ""}${liveNote}.`;
    core.info(summary);
    await core.summary.addRaw(summary).addEOL().write();

    // Comment only on pull_request events, when enabled, and when a preview URL
    // exists (the site may have no hostname yet).
    if (
      comment &&
      github.context.eventName === "pull_request" &&
      previewUrl !== ""
    ) {
      await postComment(githubToken, site, output.id, previewUrl);
    }
  } catch (error: unknown) {
    core.setFailed((error as Error).message);
  }
}

// Cleanup never fails the job: a red run on a closed PR blocks nothing, and a
// leaked preview is exactly what `sites deployments prune` catches later. The
// CLI refuses to delete the live or rollback deploy (a fast-forward merge can
// promote the preview's own id), which surfaces here as a warning too.
async function cleanupPreview(
  githubToken: string,
  site: string,
  cliVersion: string,
  apiKey: string,
): Promise<void> {
  try {
    const issueNumber = github.context.payload.pull_request?.number;
    if (issueNumber === undefined) {
      core.warning("No pull request number in context; skipping cleanup.");
      return;
    }
    if (githubToken === "") {
      core.warning("No github_token provided; skipping cleanup.");
      return;
    }

    const octokit = github.getOctokit(githubToken);
    const ctx = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issueNumber,
    };

    // The sticky comment is the record of the last preview's deploy id; the
    // id can't be recomputed here (PR runs deploy the merge-ref checkout).
    const existing = await findPreviewComment(octokit, ctx, site);
    const deployId = existing && parseDeployId(existing.body);
    if (!deployId) {
      core.info("No preview recorded on this PR; nothing to clean up.");
      core.setOutput("deleted", "false");
      return;
    }

    const result = await cli.runDelete(
      { cliVersion, site, id: deployId },
      apiKey,
    );
    if (result.exitCode !== 0) {
      const tail = cli.lastLines(result.stderr, 10);
      core.warning(
        `Couldn't delete preview deploy ${deployId} (exit ${result.exitCode}); \`sites deployments prune\` will catch it.\n${tail}`,
      );
      core.setOutput("deleted", "false");
      return;
    }

    const output = cli.parseDeleteOutput(result.stdout);
    core.setOutput("deploy-id", output.id);
    core.setOutput("deleted", output.deleted ? "true" : "false");

    const summary = output.deleted
      ? `bunny.net: deleted preview deploy \`${output.id}\` of \`${site}\`.`
      : `bunny.net: preview deploy \`${output.id}\` of \`${site}\` was already gone.`;
    core.info(summary);
    await core.summary.addRaw(summary).addEOL().write();

    if (output.deleted) {
      await upsertComment(
        octokit,
        ctx,
        site,
        buildCleanupCommentBody(site, output.id, new Date()),
      );
    }
  } catch (error: unknown) {
    core.warning(`Preview cleanup failed: ${(error as Error).message}`);
    core.setOutput("deleted", "false");
  }
}

// The deploy already succeeded by the time we get here, so comment failures
// are warnings, never a job failure.
async function postComment(
  githubToken: string,
  site: string,
  deployId: string,
  previewUrl: string,
): Promise<void> {
  try {
    const issueNumber = github.context.payload.pull_request?.number;
    if (issueNumber === undefined) {
      core.warning(
        "No pull request number in context; skipping preview comment.",
      );
      return;
    }

    if (githubToken === "") {
      core.warning("No github_token provided; skipping preview comment.");
      return;
    }

    const octokit = github.getOctokit(githubToken);
    await upsertPreviewComment(
      octokit,
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issueNumber,
      },
      {
        site,
        deployId,
        previewUrl,
        updated: new Date(),
      },
    );
  } catch (error: unknown) {
    core.warning(
      `Could not upsert preview comment: ${(error as Error).message}`,
    );
  }
}
