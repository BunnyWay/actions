

## Example

```yaml
name: Deploy on 

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
          token: ${{ secrets.GITHUB_TOKEN }}
          script_id: ${{ secrets.SCRIPT_ID }}
          access_key: ${{ secrets.ACCESS_KEY }}
          file: "script.ts"
```
