# Branch convention

The repository separates the work that is **developed and tested in DEV** from the work that is
**applied in PROD**, and it versions what is released. The scope of each branch is decided by the
**environment the change is verified in**, not by the team that writes it.

| Branch | Environment | Carries |
| --- | --- | --- |
| `DEV/CERT` | DEV/CERT | The development branch: the flow definitions and their tooling, the SPFx application code, the investigations, the controlled test evidence and the fixtures. |
| `prod` | PROD | What is **applied and verified in PROD**: the promotions of the development branch and the hot changes made directly in the PROD environment. |
| `main` | PROD | The released state. It mirrors PROD and carries the release notes of each version. |

`main` is the real one: **it is read before any modification**, and every change that reaches PROD
ends up there with a version.

## What belongs where

- **`DEV/CERT` (the development branch).** `scripts/flow-title-sync/` (the flow candidate
  generators and the local test suite), `docs/investigations/` (the open questions and the design
  of a change) and `docs/tests/` (the before/after evidence of every applied change), plus the DEV
  fixtures under the ignored `.atl/` tree.
- **`prod` (what is in PROD).** The definitions that are published in the environment of PROD and
  the records of the changes applied there, in `docs/changes/`.
- **`main` (what is released).** The released application, the shared operational reference
  (`docs/manuals/` and `docs/reference/`), the PROD records (`docs/changes/`) and the notes of
  the releases (`docs/releases/`). The hub of this branch links only to files that exist here.

The `develop` branch was the branch of the SPFx application before the consolidation of the
`E2eBranding` extension (2026-11-17). It was merged into `DEV/CERT`, which is now the single
branch of the development, and it is kept only as history: no new work is pushed to it.

## How a change travels from DEV to PROD

1. **It is developed and measured in DEV/CERT**, with the evidence written down in `docs/tests/`.
   Nothing is written in PROD while it is developed there.
2. **It is consolidated and tested in PROD**: the candidate is published in the environment of PROD
   and a controlled case is ingested there, with the log reviewed and the data of the case removed
   afterwards.
3. **If the test passes**, the definition that is published in PROD is committed to the `prod`
   branch, with its PROD record in `docs/changes/`.
4. **A release is cut**: `main` is brought to the state of `prod`, a tag (`v0.0.1`, `v0.0.2`,
   `v0.0.3`…) is created on it and a release is published with the notes of what changed and what
   was attempted.

**If the test in PROD does not pass**, nothing is released: the attempt is written down in the
record (what was changed, what was measured and what was left) and the version is not increased.
The next release says what was attempted and what the outcome was.

## The hot changes of PROD

A change made directly in the environment of PROD (a fix done in the portal, a parameter changed by
the team) is committed to the `prod` branch, in its own commit, with the evidence of what was
measured. It reaches `main` with the next release. `main` is never ahead of the PROD environment:
what is in PROD is always the last version.

## The versions

- The version lives in the tags and the releases of the repository: `v0.0.1` is the first release,
  `v0.0.2` the next one.
- The notes of a release say **exactly what was modified** and **what was attempted**, with the
  measured values, so the release can be read without trusting the commit messages.
- A version is only cut when the state of `main` is the state of PROD.

## Rules

- No PROD write, deployment or data change without explicit authorization for that specific action.
- Every applied change in DEV/CERT leaves a report in `docs/tests/` with the measured before/after
  values, so the claim can be checked without trusting the commit message.
- The documentation hub of a branch only links to files of that branch.
- Unrelated work in progress is never swept into a commit: commit the paths of the change, not the
  tree.
- The development branch is never merged into `main` as a whole. The PROD branch receives the fix
  and its PROD record, not the DEV/CERT history that produced it. That keeps the released branch
  readable as the state that is actually released.
