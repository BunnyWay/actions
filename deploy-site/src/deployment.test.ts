import { jest } from "@jest/globals";
import {
  createDeployment,
  runLogUrl,
  setDeploymentStatus,
  truncate,
} from "./deployment";

const REF = { owner: "acme", repo: "web", ref: "a1b2c3d4" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function octokitWith(createResult: any) {
  const createDeploymentMock = jest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue(createResult);
  const createDeploymentStatus = jest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue({ data: {} });

  return {
    octokit: {
      rest: {
        repos: {
          createDeployment: createDeploymentMock,
          createDeploymentStatus,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    createDeploymentMock,
    createDeploymentStatus,
  };
}

describe("createDeployment", () => {
  test("opens a production deployment with no required contexts", async () => {
    const { octokit, createDeploymentMock } = octokitWith({
      data: { id: 99 },
    });

    const id = await createDeployment(octokit, REF, {
      environment: "production",
      description: "bunny.net deploy of my-site",
    });

    expect(id).toBe(99);
    const body = createDeploymentMock.mock.calls[0][0];
    expect(body).toMatchObject({
      owner: "acme",
      repo: "web",
      ref: "a1b2c3d4",
      environment: "production",
      auto_merge: false,
      required_contexts: [],
      production_environment: true,
      transient_environment: false,
    });
  });

  // A 202/409 body carries a message and no deployment; guessing an id would
  // make every later status write 404.
  test("returns undefined when GitHub answers without a deployment", async () => {
    const { octokit } = octokitWith({ data: { message: "Conflict" } });

    await expect(
      createDeployment(octokit, REF, {
        environment: "production",
        description: "d",
      }),
    ).resolves.toBeUndefined();
  });

  test("truncates an over-long description", async () => {
    const { octokit, createDeploymentMock } = octokitWith({ data: { id: 1 } });

    await createDeployment(octokit, REF, {
      environment: "production",
      description: "x".repeat(400),
    });

    expect(createDeploymentMock.mock.calls[0][0].description).toHaveLength(140);
  });
});

describe("setDeploymentStatus", () => {
  test("sends the live URL and the run log, and supersedes the last deploy", async () => {
    const { octokit, createDeploymentStatus } = octokitWith({
      data: { id: 1 },
    });

    await setDeploymentStatus(octokit, REF, 99, {
      state: "success",
      description: "my-site is live",
      environmentUrl: "https://example.com",
      logUrl: "https://github.com/acme/web/actions/runs/7",
    });

    expect(createDeploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        deployment_id: 99,
        state: "success",
        environment_url: "https://example.com",
        log_url: "https://github.com/acme/web/actions/runs/7",
        auto_inactive: true,
      }),
    );
  });

  // An empty environment_url renders an environment with a dead link.
  test("omits environment_url when there is no live URL", async () => {
    const { octokit, createDeploymentStatus } = octokitWith({
      data: { id: 1 },
    });

    await setDeploymentStatus(octokit, REF, 99, {
      state: "failure",
      description: "failed",
    });

    const body = createDeploymentStatus.mock.calls[0][0];
    expect(body).not.toHaveProperty("environment_url");
    expect(body).not.toHaveProperty("log_url");
  });
});

describe("runLogUrl", () => {
  test("points at this run's actions page", () => {
    expect(runLogUrl("https://github.com", "acme", "web", 7)).toBe(
      "https://github.com/acme/web/actions/runs/7",
    );
  });
});

describe("truncate", () => {
  test("leaves short text alone", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  test("caps at the limit", () => {
    expect(truncate("abcdef", 4)).toHaveLength(4);
  });
});
