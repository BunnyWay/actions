import { jest } from "@jest/globals";
import * as core from "@actions/core";
import * as fs from "fs";
import * as cli from "./cli";
import * as deployment from "./deployment";

jest.mock("@actions/core");
jest.mock("fs", () => ({
  ...(jest.requireActual("fs") as object),
  existsSync: jest.fn(),
}));
jest.mock("./cli");
jest.mock("./deployment");

// A mutable context we can reshape per test.
const context = {
  eventName: "push",
  payload: {} as Record<string, unknown>,
  repo: { owner: "acme", repo: "web" },
  sha: "a1b2c3d4",
  serverUrl: "https://github.com",
  runId: 7,
};

jest.mock("@actions/github", () => ({
  get context() {
    return context;
  },
  getOctokit: jest.fn(() => ({})),
}));

import { run } from "./action";

const DEPLOYED = {
  site: "my-site",
  id: "a1b2c3d4",
  source: "git",
  files: 3,
  bytes: 100,
  unchanged: false,
  live: true,
  production: "https://example.com",
};

type Inputs = Record<string, string>;
type Bools = Record<string, boolean>;

const BASE_INPUTS: Inputs = {
  site: "my-site",
  directory: "dist",
  api_key: "secret-key",
  github_token: "gh-token",
  environment: "production",
  cli_version: "0.15",
};

function setInputs(inputs: Inputs, bools: Bools) {
  (core.getInput as jest.Mock).mockImplementation(
    (name: unknown) => inputs[name as string] ?? "",
  );
  (core.getBooleanInput as jest.Mock).mockImplementation(
    (name: unknown) => bools[name as string] ?? false,
  );
}

function statusCalls(): Array<{ state: string; environmentUrl?: string }> {
  return (deployment.setDeploymentStatus as jest.Mock).mock.calls.map(
    (call) => (call as unknown[])[3] as { state: string },
  );
}

describe("action run", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    context.eventName = "push";
    context.payload = {};

    setInputs(BASE_INPUTS, { deployments: true, force: false });

    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // chainable summary
    const summary = {
      addRaw: () => summary,
      addEOL: () => summary,
      write: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (core as any).summary = summary;

    (cli.runDeploy as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: "{}",
      stderr: "",
    } as never);
    (cli.parseDeployOutput as jest.Mock).mockReturnValue(DEPLOYED);
    (cli.isUnchanged as unknown as jest.Mock).mockImplementation(
      (o: unknown) => (o as { unchanged?: boolean }).unchanged === true,
    );
    (cli.lastLines as jest.Mock).mockImplementation((t: unknown, n: unknown) =>
      String(t)
        .split("\n")
        .slice(-(n as number))
        .join("\n"),
    );

    (deployment.createDeployment as jest.Mock).mockResolvedValue(99 as never);
    (deployment.setDeploymentStatus as jest.Mock).mockResolvedValue(
      undefined as never,
    );
    (deployment.runLogUrl as jest.Mock).mockReturnValue(
      "https://github.com/acme/web/actions/runs/7",
    );
  });

  test("masks the api key, deploys, and sets the outputs", async () => {
    await run();

    expect(core.setSecret).toHaveBeenCalledWith("secret-key");
    expect(cli.runDeploy).toHaveBeenCalledWith(
      {
        cliVersion: "0.15",
        directory: "dist",
        site: "my-site",
        force: false,
      },
      "secret-key",
    );
    expect(core.setOutput).toHaveBeenCalledWith("deploy-id", "a1b2c3d4");
    expect(core.setOutput).toHaveBeenCalledWith("url", "https://example.com");
    expect(core.setOutput).toHaveBeenCalledWith("unchanged", "false");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("a deploy of unchanged content is still live", async () => {
    (cli.parseDeployOutput as jest.Mock).mockReturnValue({
      site: "my-site",
      id: "a1b2c3d4",
      unchanged: true,
      live: true,
      production: "https://my-site.b-cdn.net",
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("unchanged", "true");
    expect(core.setOutput).toHaveBeenCalledWith(
      "url",
      "https://my-site.b-cdn.net",
    );
    expect(statusCalls().map((s) => s.state)).toEqual([
      "in_progress",
      "success",
    ]);
  });

  test("a site with no hostname yet reports an empty url", async () => {
    (cli.parseDeployOutput as jest.Mock).mockReturnValue({
      ...DEPLOYED,
      production: null,
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("url", "");
    // No environment_url rather than an empty one.
    expect(statusCalls()[1].environmentUrl).toBeUndefined();
  });

  test("fails early when the directory is missing, without deploying", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("does not exist"),
    );
    expect(cli.runDeploy).not.toHaveBeenCalled();
    // Nothing was attempted, so nothing is recorded.
    expect(deployment.createDeployment).not.toHaveBeenCalled();
  });

  describe("deployment record", () => {
    test("opens the record before deploying and links the live URL on success", async () => {
      await run();

      const openCall = (deployment.createDeployment as jest.Mock).mock
        .calls[0] as unknown[];
      expect(openCall[1]).toMatchObject({
        owner: "acme",
        repo: "web",
        ref: "a1b2c3d4",
      });
      expect(openCall[2]).toMatchObject({ environment: "production" });

      expect(core.setOutput).toHaveBeenCalledWith("deployment-id", "99");
      expect(statusCalls()).toEqual([
        expect.objectContaining({ state: "in_progress" }),
        expect.objectContaining({
          state: "success",
          environmentUrl: "https://example.com",
        }),
      ]);
    });

    test("records a failed deploy as a failure", async () => {
      (cli.runDeploy as jest.Mock).mockResolvedValue({
        exitCode: 2,
        stdout: "",
        stderr: "line1\nboom: deploy failed",
      } as never);

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("boom: deploy failed"),
      );
      expect(statusCalls().map((s) => s.state)).toEqual([
        "in_progress",
        "failure",
      ]);
    });

    test("records an unexpected throw as an error", async () => {
      (cli.parseDeployOutput as jest.Mock).mockImplementation(() => {
        throw new Error("Could not parse CLI JSON output.");
      });

      await run();

      expect(statusCalls().map((s) => s.state)).toEqual([
        "in_progress",
        "error",
      ]);
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Could not parse"),
      );
    });

    test("skips recording when deployments is false", async () => {
      setInputs(BASE_INPUTS, { deployments: false, force: false });

      await run();

      expect(deployment.createDeployment).not.toHaveBeenCalled();
      expect(deployment.setDeploymentStatus).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test("skips recording when no github_token is provided", async () => {
      setInputs(
        { ...BASE_INPUTS, github_token: "" },
        { deployments: true, force: false },
      );

      await run();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("github_token"),
      );
      expect(deployment.createDeployment).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    // A repo that forgot `deployments: write` should still ship.
    test("a record that can't be opened is a warning, not a job failure", async () => {
      (deployment.createDeployment as jest.Mock).mockRejectedValue(
        new Error("Resource not accessible by integration") as never,
      );

      await run();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("deployments: write"),
      );
      expect(cli.runDeploy).toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test("a record that can't be closed is a warning, not a job failure", async () => {
      (deployment.setDeploymentStatus as jest.Mock).mockRejectedValue(
        new Error("api down") as never,
      );

      await run();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("api down"),
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test("uses the environment input", async () => {
      setInputs(
        { ...BASE_INPUTS, environment: "staging" },
        { deployments: true, force: false },
      );

      await run();

      const openCall = (deployment.createDeployment as jest.Mock).mock
        .calls[0] as unknown[];
      expect(openCall[2]).toMatchObject({ environment: "staging" });
    });
  });

  test("passes --force through to the CLI when requested", async () => {
    setInputs(BASE_INPUTS, { deployments: true, force: true });

    await run();

    expect(cli.runDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
      "secret-key",
    );
  });
});
