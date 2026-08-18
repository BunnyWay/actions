import * as exec from "@actions/exec";

// Wraps the `@bunny.net/cli` `sites deploy` command. This is the only deploy
// path; the action never talks to the bunny API directly.

// The two `sites deploy --output json` payloads (verified against
// @bunny.net/cli 0.13): a fresh deploy, and the no-op taken when the content
// is already uploaded.
export type DeployedOutput = {
  site: string;
  id: string;
  source: "git" | "content";
  files: number;
  bytes: number;
  promoted: boolean;
  production: string | null;
  preview: string | null;
};

export type UnchangedOutput = {
  site: string;
  id: string;
  unchanged: true;
  live: boolean;
  production: string | null;
  preview: string | null;
};

export type DeployOutput = DeployedOutput | UnchangedOutput;

export function isUnchanged(output: DeployOutput): output is UnchangedOutput {
  return (output as UnchangedOutput).unchanged === true;
}

export type DeployArgs = {
  cliVersion: string;
  directory: string;
  site: string;
  production: boolean;
  force: boolean;
};

// Inputs go in as argv elements, never concatenated into a command line, so
// nothing is shell-interpreted.
export function buildDeployArgs(opts: DeployArgs): string[] {
  const args = [
    "--yes",
    `@bunny.net/cli@${opts.cliVersion}`,
    "sites",
    "deploy",
    opts.directory,
    "--site",
    opts.site,
  ];

  if (opts.production) {
    args.push("--production");
  }

  if (opts.force) {
    args.push("--force");
  }

  args.push("--output", "json");

  return args;
}

export type DeleteArgs = {
  cliVersion: string;
  site: string;
  id: string;
};

// Deleting is always non-interactive here (--force skips the CLI's
// confirmation, never its current/previous guard).
export function buildDeleteArgs(opts: DeleteArgs): string[] {
  return [
    "--yes",
    `@bunny.net/cli@${opts.cliVersion}`,
    "sites",
    "deployments",
    "delete",
    opts.id,
    "--site",
    opts.site,
    "--force",
    "--output",
    "json",
  ];
}

export type DeleteOutput = {
  site: string;
  id: string;
  deleted: boolean;
};

export type DeployRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

// A non-zero exit is returned, not thrown, so the caller can surface the
// stderr tail.
async function runCli(args: string[], apiKey: string): Promise<DeployRun> {
  let stdout = "";
  let stderr = "";

  const exitCode = await exec.exec("npx", args, {
    ignoreReturnCode: true,
    env: {
      ...process.env,
      BUNNY_API_KEY: apiKey,
    },
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
      },
    },
  });

  return { exitCode, stdout, stderr };
}

export async function runDeploy(
  opts: DeployArgs,
  apiKey: string,
): Promise<DeployRun> {
  return runCli(buildDeployArgs(opts), apiKey);
}

export async function runDelete(
  opts: DeleteArgs,
  apiKey: string,
): Promise<DeployRun> {
  return runCli(buildDeleteArgs(opts), apiKey);
}

// Parse from the first `{` to tolerate any leading noise on stdout.
function parseJsonObject(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in CLI output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch {
    throw new Error("Could not parse CLI JSON output.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Unexpected CLI output: not a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function parseDeployOutput(stdout: string): DeployOutput {
  const obj = parseJsonObject(stdout);

  if (typeof obj.site !== "string" || typeof obj.id !== "string") {
    throw new Error("Unexpected CLI output: missing site/id.");
  }

  return obj as DeployOutput;
}

export function parseDeleteOutput(stdout: string): DeleteOutput {
  const obj = parseJsonObject(stdout);

  if (typeof obj.id !== "string" || typeof obj.deleted !== "boolean") {
    throw new Error("Unexpected CLI output: missing id/deleted.");
  }

  return obj as DeleteOutput;
}

export function lastLines(text: string, n: number): string {
  return text.trimEnd().split("\n").slice(-n).join("\n");
}
