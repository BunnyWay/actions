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
    cliVersion: "0.10",
    directory: "dist",
    site: "my-site",
    production: false,
    force: false,
  };

  test("builds the minimal preview argv", () => {
    expect(buildDeployArgs(base)).toEqual([
      "--yes",
      "@bunny.net/cli@0.10",
      "sites",
      "deploy",
      "dist",
      "--site",
      "my-site",
      "--output",
      "json",
    ]);
  });

  test("adds --production only when production is true", () => {
    expect(buildDeployArgs({ ...base, production: true })).toContain("--production");
    expect(buildDeployArgs(base)).not.toContain("--production");
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
      promoted: false,
      production: null,
      preview: "https://dpl-a1b2c3d4.preview.example.com",
    });

    const out = parseDeployOutput(json);
    expect(out.site).toBe("my-site");
    expect(out.id).toBe("a1b2c3d4");
    expect(out.preview).toBe("https://dpl-a1b2c3d4.preview.example.com");
    expect(isUnchanged(out)).toBe(false);
  });

  test("parses the unchanged (no-op) shape", () => {
    const json = JSON.stringify({
      site: "my-site",
      id: "a1b2c3d4",
      unchanged: true,
      live: true,
      production: "https://my-site.b-cdn.net",
      preview: null,
    });

    const out = parseDeployOutput(json);
    expect(isUnchanged(out)).toBe(true);
    expect(out.production).toBe("https://my-site.b-cdn.net");
    expect(out.preview).toBeNull();
  });

  test("tolerates leading noise before the first {", () => {
    const noisy = 'some progress line\n{"site":"s","id":"i","preview":null,"production":null}';
    const out = parseDeployOutput(noisy);
    expect(out.site).toBe("s");
  });

  test("null URLs stay null (caller maps to empty string)", () => {
    const out = parseDeployOutput(
      JSON.stringify({ site: "s", id: "i", preview: null, production: null }),
    );
    expect(out.preview).toBeNull();
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
  test("spawns npx with the argv and BUNNY_API_KEY in env, capturing stdout", async () => {
    (exec.exec as jest.Mock).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_cmd: any, _args: any, options: any) => {
        options.listeners.stdout(Buffer.from('{"site":"s","id":"i"}'));
        options.listeners.stderr(Buffer.from("progress\n"));
        return 0;
      },
    );

    const result = await runDeploy(
      { cliVersion: "0.10", directory: "dist", site: "my-site", production: true, force: false },
      "secret-key",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"site":"s","id":"i"}');
    expect(result.stderr).toBe("progress\n");

    const call = (exec.exec as jest.Mock).mock.calls[0] as unknown[];
    expect(call[0]).toBe("npx");
    expect(call[1]).toContain("--production");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((call[2] as any).env.BUNNY_API_KEY).toBe("secret-key");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((call[2] as any).ignoreReturnCode).toBe(true);
  });

  test("returns a non-zero exit code without throwing", async () => {
    (exec.exec as jest.Mock).mockResolvedValue(1 as never);

    const result = await runDeploy(
      { cliVersion: "0.10", directory: "dist", site: "my-site", production: false, force: false },
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
