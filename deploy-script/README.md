Deploy Script
====
> This Github Action deploy a script to [Bunny](https://bunny.net).

## Example

```yaml
name: Deploy when pushing on main

on: 
  push:
    branches:
      - 'main'


jobs:
  publish:
    runs-on: ubuntu-latest

    name: 'Upload script'

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Publish the script to Bunny
        uses: BunnyWay/actions/deploy-script@latest
        with:
          script_id: ${{ secrets.SCRIPT_ID }}
          deploy_key: ${{ secrets.DEPLOY_KEY }}
          file: "script.ts"
```

## Inputs

- *token*: The GITHUB token.
- *script_id*: The associated ScriptId you want to deploy to.
- *deploy_key*: The DeployKey you are going to use to deploy it.
- *file*: The script we are going to deploy.
