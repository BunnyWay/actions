import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as cli from "./cli";
import { upsertPreviewComment } from "./comment";

export async function run() {
  try {
    const site = core.getInput("site", { required: true });
    const directory = core.getInput("directory", { required: true });
    const apiKey = core.getInput("api_key", { required: true });
    const production = core.getBooleanInput("production");
    const comment = core.getBooleanInput("comment");
    const githubToken = core.getInput("github_token");
    const cliVersion = core.getInput("cli_version");
    const force = core.getBooleanInput("force");

    // Mask the API key before spawning anything.
    core.setSecret(apiKey);

    if (site.trim() === "") {
      core.setFailed("Input `site` must not be empty.");
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
