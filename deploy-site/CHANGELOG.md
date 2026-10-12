# deploy-site

## 0.1.2

### Patch Changes

- 9c2a05c: Run `@bunny.net/cli` 0.19 by default. Newer CLI releases write site state in a format that 0.15 can't read, so deploying a site created or deployed with a newer CLI failed with `No site found` or `is not a bunny site`.

## 0.1.1

### Patch Changes

- 682945c: Pass the API key to the CLI as `BUNNYNET_API_KEY`. The action set `BUNNY_API_KEY`, which the CLI does not read, so every deploy failed with `Not logged in.`

## 0.1.0

### Minor Changes

- c6939fb: Add the `deploy-site` action: deploy a static site to bunny.net via the `@bunny.net/cli` `sites deploy` command
