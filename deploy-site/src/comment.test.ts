import { jest } from "@jest/globals";
import {
  marker,
  formatUpdated,
  buildCommentBody,
  upsertPreviewComment,
} from "./comment";

describe("marker", () => {
  test("uses the exact bunny-sites format", () => {
    expect(marker("my-site")).toBe("<!-- bunny-sites:my-site -->");
  });
});

describe("formatUpdated", () => {
  test("formats as YYYY-MM-DD HH:MM UTC", () => {
    expect(formatUpdated(new Date("2026-07-13T14:02:31.000Z"))).toBe("2026-07-13 14:02 UTC");
  });
});

describe("buildCommentBody", () => {
  const body = buildCommentBody({
    site: "my-site",
    deployId: "a1b2c3d4",
    previewUrl: "https://dpl-a1b2c3d4.preview.example.com",
    updated: new Date("2026-07-13T14:02:00.000Z"),
  });

  test("starts with the marker", () => {
    expect(body.startsWith("<!-- bunny-sites:my-site -->")).toBe(true);
  });

  test("contains the deploy id, preview URL and timestamp", () => {
    expect(body).toContain("`a1b2c3d4`");
    expect(body).toContain("https://dpl-a1b2c3d4.preview.example.com");
    expect(body).toContain("2026-07-13 14:02 UTC");
  });
});

describe("upsertPreviewComment", () => {
  const ctx = { owner: "acme", repo: "web", issueNumber: 42 };
  const input = {
    site: "my-site",
    deployId: "a1b2c3d4",
    previewUrl: "https://preview.example.com",
    updated: new Date("2026-07-13T14:02:00.000Z"),
  };

  function makeOctokit(existing: Array<{ id: number; body: string }>) {
    const listComments = jest.fn();
    const updateComment = jest.fn();
    const createComment = jest.fn();
    const paginate = jest.fn<() => Promise<typeof existing>>().mockResolvedValue(existing);

    return {
      octokit: {
        paginate,
        rest: { issues: { listComments, updateComment, createComment } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      updateComment,
      createComment,
      paginate,
    };
  }

  test("creates a comment when none matches the marker", async () => {
    const { octokit, createComment, updateComment } = makeOctokit([
      { id: 1, body: "unrelated comment" },
    ]);

    await upsertPreviewComment(octokit, ctx, input);

    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
    const arg = createComment.mock.calls[0][0] as { issue_number: number; body: string };
    expect(arg.issue_number).toBe(42);
    expect(arg.body.startsWith("<!-- bunny-sites:my-site -->")).toBe(true);
  });

  test("updates the existing comment when the marker is found", async () => {
    const { octokit, createComment, updateComment } = makeOctokit([
      { id: 7, body: "<!-- bunny-sites:my-site -->\nold body" },
    ]);

    await upsertPreviewComment(octokit, ctx, input);

    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(createComment).not.toHaveBeenCalled();
    const arg = updateComment.mock.calls[0][0] as { comment_id: number };
    expect(arg.comment_id).toBe(7);
  });

  test("does not confuse a different site's marker", async () => {
    const { octokit, createComment, updateComment } = makeOctokit([
      { id: 9, body: "<!-- bunny-sites:other-site -->\nother" },
    ]);

    await upsertPreviewComment(octokit, ctx, input);

    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
  });
});
