# Branch convention

The repository carries three branches with a strict scope each. The scope is decided by the **environment the change is verified in**, not by the team that writes it.

| Branch | Environment | Carries |
| --- | --- | --- |
| `main` | PROD | The released application, the shared operational reference and the PROD records. |
| `DEV/CERT` | DEV/CERT | The certification environment: flow definitions and their tooling, investigations, controlled test evidence and fixtures. |
| `develop` | application development | The SPFx web parts and extensions before they are released. |

## What belongs where

- **`main` (PROD).** `docs/manuals/` and `docs/reference/` (the shared operational reference), `docs/changes/` (the PROD change records) and the hub entries that describe them. The hub on this branch links only to files that exist here.
- **`DEV/CERT`.** `scripts/flow-title-sync/` (the flow candidate generators and the local test suite), `docs/investigations/` (the open questions and the design of a change) and `docs/tests/` (the before/after evidence of every applied change), plus the DEV fixtures under the ignored `.atl/` tree.

## How a change travels from DEV/CERT to PROD

1. The change is developed and measured in DEV/CERT, with the evidence written down in `docs/tests/`.
2. It is promoted to `main` deliberately, as its own reviewed change, with a PROD record in `docs/changes/`.
3. A PROD deployment needs its own explicit authorization. Applying something in DEV/CERT never authorizes the same change in PROD, and nothing is written to PROD without a separate instruction.

DEV/CERT work is never merged into `main` as a whole. If a fix has to reach PROD, the PROD branch receives the fix and its PROD record, not the DEV/CERT history that produced it. That keeps the PROD branch readable as the state that is actually released.

## Rules

- No PROD write, deployment or data change without explicit authorization for that specific action.
- Every applied change in DEV/CERT leaves a report in `docs/tests/` with the measured before/after values, so the claim can be checked without trusting the commit message.
- The documentation hub of a branch only links to files of that branch.
- Unrelated work in progress is never swept into a commit: commit the paths of the change, not the tree.
