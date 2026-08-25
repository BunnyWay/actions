---
"deploy-site": major
---

Add the `deploy-site` action: deploy a static site to bunny.net via the `@bunny.net/cli` `sites deploy` command. Deploying is publishing — every run uploads an immutable deploy and puts it live — and each run is recorded in the repository's Environments through the GitHub Deployments API, opened before the deploy so failures are recorded too and closed with the site's live URL attached (opt out with `deployments: false`, or retarget it with `environment`).
