# Standalone Repository Setup

Agent Desktop Harness should be published from its own standalone repository. If the project directory currently lives inside a parent git repository, initialize or move it carefully before publishing.

## Check Current Git Root

```sh
git rev-parse --show-toplevel
```

If the output is not the `agent-desktop-harness` directory, the project is currently inside another git working tree.

## Initialize a Standalone Repo

Do not run destructive git commands automatically. From the intended project directory:

```sh
cd /path/to/agent-desktop-harness
git init
git status
```

## Check Before First Commit

```sh
git status --ignored
git diff --check
```

Confirm that generated evidence and screenshots are not tracked:

- `.desktop-harness/`
- generated screenshots
- generated annotation crops
- local logs
- secrets or tokens

Suggested first commit message:

```text
chore: prepare v0.1 release candidate
```

Before tagging v0.1.0, complete the release checklist and confirm the Apache-2.0 metadata.
