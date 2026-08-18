# Deploy a static site to bunny.net

This GitHub Action deploys a built static site to [bunny.net](https://bunny.net)
with one `uses:` step. It wraps the [`@bunny.net/cli`](https://www.npmjs.com/package/@bunny.net/cli)
`sites deploy` command (the CLI is the single deploy path) and owns the sticky
pull request preview comment.

- Deploys a **preview** by default; publishes to **production** when asked.
- On `pull_request` events it upserts one sticky comment with the preview URL,
  updated on every commit.
- Runs on `ubuntu-latest` and `macos-latest`. (Windows is not verified; the CLI
  ships per-platform binaries and Windows availability has not been confirmed.)

## Usage Example

```yaml
name: Deploy site
on:
  push:
    branches: [main]
  pull_request:
    # `closed` lets the action delete the PR's preview deploy on merge/close.
    types: [opened, synchronize, reopened, closed]

concurrency:
  group: bunny-sites-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - uses: BunnyWay/actions/deploy-site@deploy-site_1.0.0
        with:
          site: my-site
          directory: dist
          production: ${{ github.event_name == 'push' }}
          api_key: ${{ secrets.BUNNY_API_KEY }}
```

> **Fork PRs:** pull requests from forks do not have access to repository
> secrets, so the deploy (and its preview comment) cannot run for them. The
> `if:` condition above skips fork PRs; pushes and same-repo PRs still deploy.

You can scaffold this workflow with `bunny sites ci init`. See the CLI repo's
framework examples (Next.js, Astro, Vite, SvelteKit) for per-framework build
commands and output directories.

## Inputs

| Input          | Required | Default               | Description                                                                      |
| -------------- | -------- | --------------------- | -------------------------------------------------------------------------------- |
| `site`         | yes      |                       | Site name or storage zone ID.                                                    |
| `directory`    | yes      |                       | Built output directory to deploy (e.g. `dist`).                                  |
| `api_key`      | yes      |                       | bunny.net API key (store it as a repository secret).                             |
| `production`   | no       | `"false"`             | Publish this deploy as the live site (`"true"`/`"false"`, default preview only). |
| `comment`      | no       | `"true"`              | Upsert a sticky PR comment with the preview URL on `pull_request` events.        |
| `cleanup`      | no       | `"true"`              | Delete the PR's preview deploy on `pull_request` `closed` events (see below).    |
| `github_token` | no       | `${{ github.token }}` | Token for the PR comment (needs `pull-requests: write`).                         |
| `cli_version`  | no       | `"0.13"`              | `@bunny.net/cli` version range to run (pin bumped per action release).           |
| `force`        | no       | `"false"`             | Redeploy even when content is unchanged.                                         |

The action always passes `site` explicitly (as `--site`) so CI never depends on
a `.bunny/site.json` manifest or `bunny.jsonc` being checked in, and it expects
`directory` to already be built: run your build as a previous workflow step
(the CLI's `deploy --build` convenience is for local use).

## Outputs

| Output           | Description                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `deploy-id`      | The deploy ID (git short sha on clean checkouts, else a content hash).                                   |
| `preview-url`    | Immutable preview URL for this deploy (empty when the preview zone is not ready yet).                    |
| `production-url` | The site's live URL (custom domain, else its b-cdn.net host; empty when the site has neither).           |
| `promoted`       | `"true"` when this deploy is the live production deploy — use this rather than assuming `production` decided it. |
| `unchanged`      | `"true"` when the content was already deployed and nothing was uploaded.                                 |
| `deleted`        | `"true"` when a closed PR's preview deploy was deleted by cleanup.                                        |

## How deploys behave

- **Every deploy gets its own preview URL** (`https://sites-dpl-<id>-<suffix>.b-cdn.net`):
  root-served on its own host with HTTPS out of the box, so client-side routers
  and root-absolute assets behave exactly as in production. Previews never need
  a custom domain, and preview responses carry `X-Robots-Tag: noindex`.
- **Publishing is explicit**: previews are the default, and `production: true`
  publishes the deploy as the live site. Promoting is instant — it flips a
  router variable and purges the cache; no files move.
- **Deploys are immutable and content-addressed**: the deploy ID is the git
  short sha when the checkout is clean, otherwise an 8-char content hash.
  Re-deploying identical content is a no-op (the `unchanged` output is
  `"true"`); set `force: true` to redeploy anyway. Dotfiles and `node_modules`
  are never uploaded.
- **Rollbacks** don't need this action: `bunny sites deployments publish
  --previous --force` flips production back instantly.

## Preview cleanup on PR close

When the workflow subscribes to the `closed` pull request type (as in the
example above), a merged or closed PR triggers a cleanup run instead of a
deploy: the action reads the deploy id from its own sticky comment, runs
`bunny sites deployments delete`, and rewrites the comment to say the preview
was deleted. Details worth knowing:

- The sticky comment is the source of truth — the deploy id can't be
  recomputed at close time (PR runs deploy the merge-ref checkout, whose sha
  isn't in the closed event). No comment (or `comment: false` on deploys)
  means nothing to clean; `sites deployments prune` remains the catch-all.
- Only the **last** preview is deleted. Earlier per-commit previews on the
  same PR stay until a `prune`.
- The CLI refuses to delete the live production deploy or the rollback
  target, so a fast-forward merge (where the preview's id just went live)
  degrades to a warning, never an outage.
- Cleanup never fails the job — failures are warnings, since a red run on a
  closed PR blocks nothing and `prune` catches leaked previews later.
- Requires `@bunny.net/cli` >= 0.13.1 (the release that ships
  `sites deployments delete`); the default `cli_version` pin resolves it.
  With an older pinned CLI, cleanup warns and leaves the preview in place.

## Setting up the API key

Store your bunny.net API key as a repository secret named `BUNNY_API_KEY`:

```bash
gh secret set BUNNY_API_KEY
```

Or via the GitHub UI: **Settings → Secrets and variables → Actions → New
repository secret**.
