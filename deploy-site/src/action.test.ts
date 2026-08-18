import { jest } from "@jest/globals";
import * as core from "@actions/core";
import * as fs from "fs";
import * as cli from "./cli";
import * as comment from "./comment";

jest.mock("@actions/core");
jest.mock("fs", () => ({
  ...(jest.requireActual("fs") as object),
  existsSync: jest.fn(),
}));
jest.mock("./cli");
jest.mock("./comment");

// A mutable context we can reshape per test.
const context = {
  eventName: "push",
  payload: {} as { action?: string; pull_request?: { number: number } },
  repo: { owner: "acme", repo: "web" },
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
  promoted: false,
  production: null,
  preview: "https://dpl-a1b2c3d4.preview.example.com",
};

type Inputs = Record<string, string>;
type Bools = Record<string, boolean>;

function setInputs(inputs: Inputs, bools: Bools) {
  (core.getInput as jest.Mock).mockImplementation(
    (name: unknown) => inputs[name as string] ?? "",
  );
  (core.getBooleanInput as jest.Mock).mockImplementation(
    (name: unknown) => bools[name as string] ?? false,
  );
}

describe("action run", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    context.eventName = "push";
    context.payload = {};

    setInputs(
      {
        site: "my-site",
        directory: "dist",
        api_key: "secret-key",
        github_token: "gh-token",
        cli_version: "0.13",
      },
      { production: false, comment: true, force: false, cleanup: true },
    );

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
    (comment.upsertPreviewComment as jest.Mock).mockResolvedValue(
      undefined as never,
    );

    (comment.findPreviewComment as jest.Mock).mockResolvedValue({
      id: 7,
      body: "<!-- bunny-sites:my-site -->\n<!-- bunny-sites-deploy:a1b2c3d4 -->\nbody",
    } as never);
    (comment.parseDeployId as jest.Mock).mockReturnValue("a1b2c3d4");
    (comment.buildCleanupCommentBody as jest.Mock).mockReturnValue(
      "cleanup body",
    );
    (comment.upsertComment as jest.Mock).mockResolvedValue(undefined as never);
    (cli.runDelete as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: "{}",
      stderr: "",
    } as never);
    (cli.parseDeleteOutput as jest.Mock).mockReturnValue({
      site: "my-site",
      id: "a1b2c3d4",
      deleted: true,
    });
  });

  test("masks the api key and deploys, setting the five outputs", async () => {
    await run();

    expect(core.setSecret).toHaveBeenCalledWith("secret-key");
    expect(cli.runDeploy).toHaveBeenCalledWith(
      {
        cliVersion: "0.13",
        directory: "dist",
        site: "my-site",
        production: false,
        force: false,
      },
      "secret-key",
    );
    expect(core.setOutput).toHaveBeenCalledWith("deploy-id", "a1b2c3d4");
    expect(core.setOutput).toHaveBeenCalledWith(
      "preview-url",
      DEPLOYED.preview,
    );
    expect(core.setOutput).toHaveBeenCalledWith("production-url", "");
    expect(core.setOutput).toHaveBeenCalledWith("promoted", "false");
    expect(core.setOutput).toHaveBeenCalledWith("unchanged", "false");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("promoted comes from the CLI output, not the production input", async () => {
    // The CLI reports what actually went live: a fresh deploy carries
    // `promoted`, a no-op carries `live`.
    (cli.parseDeployOutput as jest.Mock).mockReturnValue({
      ...DEPLOYED,
      promoted: true,
      production: "https://example.com",
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("promoted", "true");
    expect(core.setOutput).toHaveBeenCalledWith(
      "production-url",
      "https://example.com",
    );
  });

  test("an unchanged deploy that is already live reports promoted", async () => {
    (cli.parseDeployOutput as jest.Mock).mockReturnValue({
      site: "my-site",
      id: "a1b2c3d4",
      unchanged: true,
      live: true,
      production: "https://my-site.b-cdn.net",
      preview: null,
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("promoted", "true");
    expect(core.setOutput).toHaveBeenCalledWith("unchanged", "true");
  });

  test("fails early when the directory is missing, without deploying", async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("does not exist"),
    );
    expect(cli.runDeploy).not.toHaveBeenCalled();
  });

  test("fails with the stderr tail on non-zero exit and skips the comment", async () => {
    context.eventName = "pull_request";
    context.payload = { pull_request: { number: 42 } };
    (cli.runDeploy as jest.Mock).mockResolvedValue({
      exitCode: 2,
      stdout: "",
      stderr: "line1\nboom: deploy failed",
    } as never);

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("boom: deploy failed"),
    );
    expect(comment.upsertPreviewComment).not.toHaveBeenCalled();
  });

  test("upserts a PR comment on pull_request events with a preview URL", async () => {
    context.eventName = "pull_request";
    context.payload = { pull_request: { number: 42 } };

    await run();

    expect(comment.upsertPreviewComment).toHaveBeenCalledTimes(1);
    const [, ctxArg, inputArg] = (comment.upsertPreviewComment as jest.Mock)
      .mock.calls[0] as [
      unknown,
      { owner: string; repo: string; issueNumber: number },
      { site: string; previewUrl: string },
    ];
    expect(ctxArg.issueNumber).toBe(42);
    expect(inputArg.site).toBe("my-site");
    expect(inputArg.previewUrl).toBe(DEPLOYED.preview);
  });

  test("skips the comment on non-PR events", async () => {
    context.eventName = "push";

    await run();

    expect(comment.upsertPreviewComment).not.toHaveBeenCalled();
  });

  test("skips the comment when comment input is false", async () => {
    context.eventName = "pull_request";
    context.payload = { pull_request: { number: 42 } };
    setInputs(
      {
        site: "my-site",
        directory: "dist",
        api_key: "secret-key",
        github_token: "gh-token",
        cli_version: "0.13",
      },
      { production: false, comment: false, force: false },
    );

    await run();

    expect(comment.upsertPreviewComment).not.toHaveBeenCalled();
  });

  test("skips the comment when there is no preview URL", async () => {
    context.eventName = "pull_request";
    context.payload = { pull_request: { number: 42 } };
    (cli.parseDeployOutput as jest.Mock).mockReturnValue({
      site: "my-site",
      id: "a1b2c3d4",
      unchanged: true,
      live: false,
      production: null,
      preview: null,
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("preview-url", "");
    expect(core.setOutput).toHaveBeenCalledWith("unchanged", "true");
    expect(comment.upsertPreviewComment).not.toHaveBeenCalled();
  });

  test("passes --production/--force through to the CLI when requested", async () => {
    setInputs(
      {
        site: "my-site",
        directory: "dist",
        api_key: "secret-key",
        github_token: "gh-token",
        cli_version: "0.13",
      },
      { production: true, comment: true, force: true },
    );

    await run();

    expect(cli.runDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ production: true, force: true }),
      "secret-key",
    );
  });

  describe("closed PR cleanup", () => {
    beforeEach(() => {
      context.eventName = "pull_request";
      context.payload = { action: "closed", pull_request: { number: 42 } };
    });

    test("deletes the recorded preview deploy instead of deploying", async () => {
      await run();

      expect(cli.runDeploy).not.toHaveBeenCalled();
      expect(cli.runDelete).toHaveBeenCalledWith(
        { cliVersion: "0.13", site: "my-site", id: "a1b2c3d4" },
        "secret-key",
      );
      expect(core.setOutput).toHaveBeenCalledWith("deleted", "true");
      expect(comment.upsertComment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ issueNumber: 42 }),
        "my-site",
        "cleanup body",
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test("does nothing when cleanup input is false", async () => {
      setInputs(
        {
          site: "my-site",
          directory: "dist",
          api_key: "secret-key",
          github_token: "gh-token",
          cli_version: "0.13",
        },
        { production: false, comment: true, force: false, cleanup: false },
      );

      await run();

      expect(cli.runDelete).not.toHaveBeenCalled();
      expect(cli.runDeploy).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test("skips when no preview is recorded on the PR", async () => {
      (comment.findPreviewComment as jest.Mock).mockResolvedValue(
        undefined as never,
      );

      await run();

      expect(cli.runDelete).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith("deleted", "false");
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    test("a failed delete is a warning, never a job failure", async () => {
      (cli.runDelete as jest.Mock).mockResolvedValue({
        exitCode: 1,
        stdout: "",
        stderr: "boom: is the live production deploy",
      } as never);

      await run();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("boom: is the live production deploy"),
      );
      expect(core.setOutput).toHaveBeenCalledWith("deleted", "false");
      expect(comment.upsertComment).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  test("a comment failure is a warning, not a job failure", async () => {
    context.eventName = "pull_request";
    context.payload = { pull_request: { number: 42 } };
    (comment.upsertPreviewComment as jest.Mock).mockRejectedValue(
      new Error("api down") as never,
    );

    await run();

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("api down"),
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
