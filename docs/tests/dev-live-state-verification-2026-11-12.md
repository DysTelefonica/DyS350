# DEV live state verification, November 12

The DEV/CERT environment was read on 2026-11-12 with the corporate session, after the repository was split into the `DEV/CERT` and `main` branches. The purpose is to confirm that the reconciliation published on November 11 is still the published one and that nothing else in the environment moved.

## What was read

| Item | Value |
| --- | --- |
| Environment | `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b` (DEV/CERT) |
| Child flow | `E2E_AltaExpedientes_Modulo1`, `1ca49582-ae1e-f111-8342-6045bde02c54` |
| Child state | `Started` |
| Child published definition | `FDBC92DE821EA8A43530851B7AA167ACAA98459D60DCEDD14D1B86DD3C63F811` |
| Parent flow | `E2E_AltaExpedientes`, `a9928111-cd13-f111-8341-7c1e5233f7d8` |
| Parent state | `Started` |
| Parent published definition | `5AFAFE770005EF524CDE854C582E37331EDC818A31665F749727C41F7CD031D0` |
| Local suite | 131 cases: 125 passed, 6 skipped, 0 failed |

The hashes are computed the way the generators compute them: the published definition read back from the environment API, sorted by key and hashed with SHA-256.

## What it means

- The child hash equals the hash of the RF06 candidate exactly ([child table reconciliation RF06](dev-child-table-reconciliation-rf06-2026-11-11.md)). The three phases of the reconciliation (role update, scoped role deletion and child table reconciliation) are the published definition, not a candidate waiting to be applied.
- The parent hash is the baseline read before the child was changed. This work never wrote the parent.
- The published definition carries the phase 3 actions: `Buscar_Hitos_Existente` and `Es_Hitos_Existente` inside the milestone loop, `Buscar_Suministradores_Existente` and `Es_Suministradores_Existente` inside the supplier loop, and the guarded deletions inside the two delete loops.
- The portal shows the flow as `Activado` (enabled) with the last modification on November 11 at 20:42 local time, the moment the RF06 candidate was saved.

## Execution history

The flow ran successfully after the change: the last run of November 11 at 20:47 finished `Correcto` in 33 seconds, and the portal reports 13 runs on November 11 with a 0% error rate.

## Repository state

| Branch | Commit | Content |
| --- | --- | --- |
| `DEV/CERT` | this branch | everything verified in DEV/CERT: the flow tooling, the investigations and the test reports |
| `main` | `70713a0` | PROD: the released application, the shared operational reference and the PROD records |
| `develop` | `1ebf581` | the application development, untouched |

The convention is in [the branch convention](../branching-convention.md).

## What is still open

- The business decisions B1 to B5 of the [authoritative role reconciliation](../investigations/role-authoritative-reconciliation.md#business-decisions-still-open): the identity of a milestone, whether an update re-provisions an expediente that is already in flight, the group membership of a deleted role and the fate of the pre-existing duplicates.
- The controlled identifiers (`900611501` to `900611503` and `900611601` to `900611603`, with their rows) stay in CERT as evidence until that evidence is no longer needed.
- PROD was never read, written or authorized by this work.
