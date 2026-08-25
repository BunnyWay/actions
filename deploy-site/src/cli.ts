import * as exec from "@actions/exec";

// Wraps the `@bunny.net/cli` `sites deploy` command. This is the only deploy
// path; the action never talks to the bunny API directly.

// The `sites deploy --output json` payload (verified against @bunny.net/cli
// 0.15). Deploying is publishing, so there is a single shape and `live` is
// always true; `unchanged` is true when the content was already uploaded, and
// the already-live no-op omits the upload counters entirely.
export type DeployOutput = {
  site: string;
  id: string;
  unchanged?: boolean;
  live?: boolean;
  production: string | null;
  source?: "git" | "content";
  files?: number;
  bytes?: number;
};

export function isUnchanged(output: DeployOutput): boolean {
  return output.unchanged === true;
}

export type DeployArgs = {
  cliVersion: string;
  directory: string;
  site: string;
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
  let stdout = "";
  let stderr = "";

  const exitCode = await exec.exec("npx", buildDeployArgs(opts), {
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
