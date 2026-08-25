import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as cli from "./cli";
import {
  createDeployment,
  runLogUrl,
  setDeploymentStatus,
  type DeploymentState,
  type RepoRef,
} from "./deployment";

// The open deployment record a run is writing its outcome to.
type Tracker = {
  octokit: ReturnType<typeof github.getOctokit>;
  ref: RepoRef;
  id: number;
};

export async function run() {
  try {
    const site = core.getInput("site", { required: true });
    const directory = core.getInput("directory", { required: true });
    const apiKey = core.getInput("api_key", { required: true });
    const environment = core.getInput("environment") || "production";
    const deployments = core.getBooleanInput("deployments");
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

    // Opened before the CLI runs so a failed deploy is recorded as a failed
    // deployment, rather than leaving the environment showing the last good one.
    const tracker = deployments
      ? await openDeployment(githubToken, environment, site)
      : undefined;

    try {
      const result = await cli.runDeploy(
        { cliVersion, directory, site, force },
        apiKey,
      );

      if (result.exitCode !== 0) {
        const tail = cli.lastLines(result.stderr, 20);
        await closeDeployment(tracker, "failure", `Deploy of ${site} failed.`);
        core.setFailed(`Deploy failed (exit ${result.exitCode}).\n${tail}`);
        return;
      }

      const output = cli.parseDeployOutput(result.stdout);
      const url = output.production ?? "";
      const unchanged = cli.isUnchanged(output);

      core.setOutput("deploy-id", output.id);
      core.setOutput("url", url);
      core.setOutput("unchanged", unchanged ? "true" : "false");

      const liveNote = url ? ` at ${url}` : "";
      const summary = unchanged
        ? `bunny.net: \`${site}\` already up to date (deploy \`${output.id}\`), live${liveNote}.`
        : `bunny.net: deployed \`${site}\` (deploy \`${output.id}\`), live${liveNote}.`;
      core.info(summary);
      await core.summary.addRaw(summary).addEOL().write();

      await closeDeployment(
        tracker,
        "success",
        `${site} is live (deploy ${output.id}).`,
        url || undefined,
      );
    } catch (error: unknown) {
      // Anything thrown past the deploy itself (unparseable output, a network
      // blip) still leaves the environment truthful.
      await closeDeployment(tracker, "error", `Deploy of ${site} failed.`);
      throw error;
    }
  } catch (error: unknown) {
    core.setFailed((error as Error).message);
  }
}

// Recording is best-effort: the deploy is what matters, and a repo that hasn't
// granted `deployments: write` should still be able to ship. Every failure
// here is a warning that degrades to "not recorded".
async function openDeployment(
  githubToken: string,
  environment: string,
  site: string,
): Promise<Tracker | undefined> {
  if (githubToken === "") {
    core.warning(
      "No github_token provided; this deploy won't be recorded in Environments.",
    );
    return undefined;
  }

  try {
    const octokit = github.getOctokit(githubToken);
    const ref: RepoRef = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: github.context.sha,
    };

    const id = await createDeployment(octokit, ref, {
      environment,
      description: `bunny.net deploy of ${site}`,
    });
    if (id === undefined) {
      core.warning(
        "GitHub created no deployment record for this run; continuing with the deploy.",
      );
      return undefined;
    }

    core.setOutput("deployment-id", String(id));
    await setDeploymentStatus(octokit, ref, id, {
      state: "in_progress",
      description: `Deploying ${site} to bunny.net.`,
      logUrl: runLogUrl(
        github.context.serverUrl,
        ref.owner,
        ref.repo,
        github.context.runId,
      ),
    });

    return { octokit, ref, id };
  } catch (error: unknown) {
    core.warning(
      `Couldn't record the deploy in Environments: ${(error as Error).message}. Does the job grant \`deployments: write\`?`,
    );
    return undefined;
  }
}

async function closeDeployment(
  tracker: Tracker | undefined,
  state: DeploymentState,
  description: string,
  environmentUrl?: string,
): Promise<void> {
  if (!tracker) return;

  try {
    await setDeploymentStatus(tracker.octokit, tracker.ref, tracker.id, {
      state,
      description,
      environmentUrl,
      logUrl: runLogUrl(
        github.context.serverUrl,
        tracker.ref.owner,
        tracker.ref.repo,
        github.context.runId,
      ),
    });
  } catch (error: unknown) {
    core.warning(
      `Couldn't update the deployment record: ${(error as Error).message}`,
    );
  }
}
