---
"deploy-site": minor
---

Delete a merged/closed PR's preview deploy: on `pull_request` `closed` events the action reads the deploy id from its sticky comment, runs `bunny sites deployments delete`, and rewrites the comment (opt out with `cleanup: false`; requires `@bunny.net/cli` >= 0.13.1, and cleanup failures warn instead of failing the job).
