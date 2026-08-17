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

export type DeployRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

// A non-zero exit is returned, not thrown, so the caller can surface the
// stderr tail.
export async function runDeploy(
  opts: DeployArgs,
  apiKey: string,
): Promise<DeployRun> {
  const args = buildDeployArgs(opts);

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

// Parse from the first `{` to tolerate any leading noise on stdout.
export function parseDeployOutput(stdout: string): DeployOutput {
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

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.site !== "string" || typeof obj.id !== "string") {
    throw new Error("Unexpected CLI output: missing site/id.");
  }

  return obj as DeployOutput;
}

export function lastLines(text: string, n: number): string {
  return text.trimEnd().split("\n").slice(-n).join("\n");
}
