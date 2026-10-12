---
"deploy-site": patch
---

Run `@bunny.net/cli` 0.19 by default. Newer CLI releases write site state in a format that 0.15 can't read, so deploying a site created or deployed with a newer CLI failed with `No site found` or `is not a bunny site`.
