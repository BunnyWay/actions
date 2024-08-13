Github actions
====

This is the repository where we put actions to use with
[Bunny](https://bunny.net)!

The repository is made to support many actions, each folder is corresponding to
an action.

## Actions

Each action can be used in your workflow this way: 

```yaml
steps:
    - uses: BunnyWay/actions/<action>@<actions@ref>
```

Each action will have it's own documentation, you can check the associated documentation
in each folder.

It contains: 

- [`BunnyWay/actions/deploy-script`](./deploy-script) 

## Development

We are using [Javascript
actions](https://help.github.com/en/articles/about-actions#types-of-actions)
which need to be pushed. We handle the build of each actions with 
[ncc](https://github.com/vercel/ncc).

We handle versionning with [changeset](https://github.com/changesets/changesets), each time you do a change, you'll need
to indicate the kind of changes you are doing so we can have the auto-release
process ongoing by doing:

```
pnpm changeset
```
