Deploy Script to Bunny Edge Scripting
====
This GitHub Action automates the deployment of a script to Bunny.net Edge Scripting. Use this action to streamline your deployment process whenever changes are pushed to your repository.

## Usage Example

Below is an example of how to configure this action to deploy a script whenever there is a push to the `main` branch:


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

      - name: Deploy Script to Bunny Edge Scripting
        uses: BunnyWay/actions/deploy-script@main
        with:
          script_id: ${{ secrets.SCRIPT_ID }}
          deploy_key: ${{ secrets.DEPLOY_KEY }}
          file: "script.ts"
```

## Inputs
This action requires the following inputs:
- *script_id* (required): The ID of the script you want to deploy. This can be stored securely as a GitHub secret (SCRIPT_ID).
- *deploy_key*: The script deployment key used to authorize deployment. This should be stored securely as a GitHub secret (DEPLOY_KEY). If this is not filled, we'll try to use the Github Application to deploy the script. You'll need to associate your repository within Bunny.
- *file* (required): The script we are going to deploy.

## Setting Up Secrets
To securely store your script_id and deploy_key, follow these steps:
1. Navigate to your GitHub repository.
2. Click on Settings > Secrets and variables > Actions.
3. Click New repository secret.
4. Add SCRIPT_ID and DEPLOY_KEY as secrets with the respective values.
