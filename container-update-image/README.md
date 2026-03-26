# Update a container image in Magic Containers

This GitHub Action allows you to automate the update for image tags for containers deployed in Magic Containers.

## Usage Example

The workflow below will build a Docker image, push it to GitHub Container Registry and then trigger the update on Magic Containers.

```yaml
name: Update container image when pushing to main

on:
  push:
    branches:
      - 'main'

jobs:
  build:
    name: Build and deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: docker login
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: docker build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: update container image on Magic Containers
        uses: BunnyWay/actions/container-update-image@main
        with:
         app_id: ${{ vars.APP_ID }}
         api_key: ${{ secrets.BUNNYNET_API_KEY }}
         container: app
         image_tag: "${{ github.sha }}"
```

## Inputs

This action requires the following inputs:

- *app_id* (required): The App ID for your Magic Containers App;
- *api_key* (required): The [API Key](https://dash.bunny.net/account/api-key) for your Bunny account. Team accounts are not supported at the moment;
- *container* (required): The name of the container within the Magic Containers App;
- *image_tag* (required): The new image tag;
- *image_digest* (required): The digest of new image;
