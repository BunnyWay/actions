# deploy-site

## 0.1.1

### Patch Changes

- 682945c: Pass the API key to the CLI as `BUNNYNET_API_KEY`. The action set `BUNNY_API_KEY`, which the CLI does not read, so every deploy failed with `Not logged in.`

## 0.1.0

### Minor Changes

- c6939fb: Add the `deploy-site` action: deploy a static site to bunny.net via the `@bunny.net/cli` `sites deploy` command
