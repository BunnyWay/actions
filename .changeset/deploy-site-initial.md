---
"deploy-site": major
---

Add the `deploy-site` action: deploy a static site to bunny.net via the `@bunny.net/cli` `sites deploy` command, with per-deploy preview URLs, a sticky pull request preview comment, and preview cleanup on PR close (`sites deployments delete` of the deploy recorded in the comment; opt out with `cleanup: false`).
