import { jest } from "@jest/globals";
import * as exec from "@actions/exec";
import {
  buildDeployArgs,
  parseDeployOutput,
  isUnchanged,
  runDeploy,
  lastLines,
} from "./cli";

jest.mock("@actions/exec");

describe("buildDeployArgs", () => {
  const base = {
    cliVersion: "0.15",
    directory: "dist",
    site: "my-site",
    force: false,
  };

  test("builds the minimal deploy argv", () => {
    expect(buildDeployArgs(base)).toEqual([
      "--yes",
      "@bunny.net/cli@0.15",
      "sites",
      "deploy",
      "dist",
      "--site",
      "my-site",
      "--output",
      "json",
    ]);
  });

  test("adds --force only when force is true", () => {
    expect(buildDeployArgs({ ...base, force: true })).toContain("--force");
    expect(buildDeployArgs(base)).not.toContain("--force");
  });
});

describe("parseDeployOutput", () => {
  test("parses the deployed shape", () => {
    const json = JSON.stringify({
      site: "my-site",
      id: "a1b2c3d4",
      source: "git",
      files: 12,
      bytes: 34567,
      unchanged: false,
      live: true,
      production: "https://example.com",
    });

    const out = parseDeployOutput(json);
    expect(out.site).toBe("my-site");
    expect(out.id).toBe("a1b2c3d4");
    expect(out.production).toBe("https://example.com");
    expect(out.live).toBe(true);
    expect(isUnchanged(out)).toBe(false);
  });

  test("parses the unchanged (already live) shape", () => {
    const json = JSON.stringify({
      site: "my-site",
      id: "a1b2c3d4",
      unchanged: true,
      live: true,
      production: "https://my-site.b-cdn.net",
    });

    const out = parseDeployOutput(json);
    expect(isUnchanged(out)).toBe(true);
    expect(out.production).toBe("https://my-site.b-cdn.net");
  });

  test("tolerates leading noise before the first {", () => {
    const noisy = 'some progress line\n{"site":"s","id":"i","production":null}';
    expect(parseDeployOutput(noisy).site).toBe("s");
  });

  test("a null production URL stays null (caller maps to empty string)", () => {
    const out = parseDeployOutput(
      JSON.stringify({ site: "s", id: "i", production: null }),
    );
    expect(out.production).toBeNull();
  });

  test("throws on garbage stdout", () => {
    expect(() => parseDeployOutput("this is not json at all")).toThrow();
  });

  test("throws on malformed json", () => {
    expect(() => parseDeployOutput("{ not: valid")).toThrow();
  });

  test("throws when site/id are missing", () => {
    expect(() => parseDeployOutput(JSON.stringify({ foo: "bar" }))).toThrow();
  });
});

describe("runDeploy", () => {
  test("spawns npx with the argv and BUNNYNET_API_KEY in env, capturing stdout", async () => {
    (exec.exec as jest.Mock).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_cmd: any, _args: any, options: any) => {
        options.listeners.stdout(Buffer.from('{"site":"s","id":"i"}'));
        options.listeners.stderr(Buffer.from("progress\n"));
        return 0;
      },
    );

    const result = await runDeploy(
      {
        cliVersion: "0.15",
        directory: "dist",
        site: "my-site",
        force: true,
      },
      "secret-key",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"site":"s","id":"i"}');
    expect(result.stderr).toBe("progress\n");

    const call = (exec.exec as jest.Mock).mock.calls[0] as unknown[];
    expect(call[0]).toBe("npx");
    expect(call[1]).toContain("--force");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((call[2] as any).env.BUNNYNET_API_KEY).toBe("secret-key");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((call[2] as any).ignoreReturnCode).toBe(true);
  });

  test("returns a non-zero exit code without throwing", async () => {
    (exec.exec as jest.Mock).mockResolvedValue(1 as never);

    const result = await runDeploy(
      {
        cliVersion: "0.15",
        directory: "dist",
        site: "my-site",
        force: false,
      },
      "secret-key",
    );

    expect(result.exitCode).toBe(1);
  });
});

describe("lastLines", () => {
  test("returns the last n lines", () => {
    expect(lastLines("a\nb\nc\nd", 2)).toBe("c\nd");
  });

  test("trims trailing whitespace first", () => {
    expect(lastLines("a\nb\n\n", 1)).toBe("b");
  });
});
