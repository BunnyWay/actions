# Deploy a static site to bunny.net

This GitHub Action deploys a built static site to [bunny.net](https://bunny.net)
with one `uses:` step. It wraps the [`@bunny.net/cli`](https://www.npmjs.com/package/@bunny.net/cli)
`sites deploy` command (the CLI is the single deploy path) and records each run
in the repository's **Environments** through the GitHub Deployments API.

- **Deploying is publishing.** Every run uploads an immutable deploy and points
  the site's router at it, so there is no flag to remember and no half-deployed
  state to reason about.
- Each run opens a GitHub deployment, moves it to `in_progress`, and closes it
  as `success` (with the live URL attached) or `failure`.
- Runs on `ubuntu-latest` and `macos-latest`. (Windows is not verified; the CLI
  ships per-platform binaries and Windows availability has not been confirmed.)

## Usage Example

```yaml
name: Deploy site
on:
  push:
    branches: [main]
  workflow_dispatch:

# Production deploys serialize across every ref; cancelling mid-upload would
# leave a half-written deploy directory behind.
concurrency:
  group: bunny-sites
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write # records the deploy in the repo's Environments
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - uses: BunnyWay/actions/deploy-site@deploy-site_0.1.1
        with:
          site: my-site
          directory: dist
          api_key: ${{ secrets.BUNNYNET_API_KEY }}
```

You can scaffold this workflow with `bunny sites ci init`. See the CLI repo's
framework examples (Next.js, Astro, Vite, SvelteKit) for per-framework build
commands and output directories.

> **Pull requests:** because a deploy goes live, the workflow above only runs on
> pushes to `main` and on demand. Don't wire this action to `pull_request` unless
> you want that PR's content served as the live site.

## Inputs

| Input          | Required | Default               | Description                                                                      |
| -------------- | -------- | --------------------- | -------------------------------------------------------------------------------- |
| `site`         | yes      |                       | Site name or storage zone ID.                                                    |
| `directory`    | yes      |                       | Built output directory to deploy (e.g. `dist`).                                  |
| `api_key`      | yes      |                       | bunny.net API key (store it as a repository secret).                             |
| `environment`  | no       | `"production"`        | GitHub Environment the deploy is recorded under.                                 |
| `deployments`  | no       | `"true"`              | Record the deploy in the repository's Environments (needs `deployments: write`). |
| `github_token` | no       | `${{ github.token }}` | Token used to write the deployment record.                                       |
| `cli_version`  | no       | `"0.15"`              | `@bunny.net/cli` version range to run (pin bumped per action release).           |
| `force`        | no       | `"false"`             | Redeploy even when content is unchanged.                                         |

The action always passes `site` explicitly (as `--site`) so CI never depends on
a `.bunny/site.json` manifest or `bunny.jsonc` being checked in, and it expects
`directory` to already be built: run your build as a previous workflow step
(the CLI's `deploy --build` convenience is for local use).

## Outputs

| Output          | Description                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `deploy-id`     | The deploy ID (git short sha on clean checkouts, else a content hash).                         |
| `url`           | The site's live URL (custom domain, else its b-cdn.net host; empty when the site has neither). |
| `unchanged`     | `"true"` when the content was already deployed and nothing was uploaded.                       |
| `deployment-id` | The GitHub deployment record for this run (empty when nothing was recorded).                   |

## How deploys behave

- **Every deploy publishes.** Files land in an immutable `deploys/<id>/`
  directory and the router is pointed at it. Going live is instant — it flips a
  router variable and purges the cache; no files move.
- **Deploys are immutable and content-addressed**: the deploy ID is the git
  short sha when the checkout is clean, otherwise an 8-char content hash.
  Re-deploying identical content is a no-op (the `unchanged` output is
  `"true"`) but the deploy is still the live one; set `force: true` to
  re-upload anyway. Dotfiles and `node_modules` are never uploaded.
- **Rollbacks** don't need this action: `bunny sites deployments publish
--previous --force` points the router back at the previous deploy instantly,
  without re-uploading a byte. Any earlier deploy ID works the same way.

## Deployment records

With `deployments: write` granted (see the example above), the action writes the
deploy into the repository's Environments tab, which becomes the deploy history:

- The record is opened **before** the CLI runs, so a failed deploy shows up as a
  failed deployment instead of leaving the last good one as the latest word.
- On success the status carries the site's live URL, so the environment's
  "View deployment" button goes to the site; `auto_inactive` retires the
  previous deploy of that environment.
- Recording is best-effort. A missing `deployments: write` scope, a missing
  `github_token`, or an API blip is a warning — the deploy itself still decides
  whether the job passes.
- Set `deployments: false` to skip it entirely, or `environment` to record under
  something other than `production`.

## Setting up the API key

Store your bunny.net API key as a repository secret named `BUNNYNET_API_KEY`:

```bash
gh secret set BUNNYNET_API_KEY
```

Or via the GitHub UI: **Settings → Secrets and variables → Actions → New
repository secret**.
