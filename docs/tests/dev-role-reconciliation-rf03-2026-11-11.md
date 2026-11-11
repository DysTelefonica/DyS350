# DEV role reconciliation retest RF03: read fix confirmed, three defects measured

**The November 7 parent read fix works; the child flow is not idempotent.** Three controlled submissions in DEV/CERT reproduced exactly the role counts predicted before the run: **4 → 8 → 12** rows on the controlled leaf, split **1/2/2/3** and then **1/3/3/5** across project lead, engineering, quality technician and security. The release stays HOLD: the phase 1 candidate that removes the duplicate creation is built and reviewed but **not applied**.

## Session and transport

| Item | Observed |
| --- | --- |
| Identity | `USUARIO GENERICO APLICACION DYS350 RTEL TF04622` (`ug03573@telefonica.com`) |
| Site | `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF` — the CERT site the DEV bindings point to |
| Transport | Authenticated browser session on the SharePoint site; REST with a request digest obtained from `_api/contextinfo` |
| Uploads | Three files, each HTTP 200, each byte identical to the prepared payload (SHA-256 `31FDF9A7…`, `84CF4BEA…`, `84CF4BEA…`) |
| Trigger | SharePoint `GetOnNewFileItems` on `cargaJSON_entrada` (list id `b33c8a3e-7640-48fb-88a1-39b1a802bba0`), five minute recurrence — the delay between upload and processing is the trigger polling, not a failure |

## What was measured

| Case | Input consumed | Processed | Log | Failed | Roles total | Leaf roles | Leaf split (jefe / ing / cal / seg) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Precheck | — | 120 | 102 | 22 | 1371 | 0 | — |
| RF03a creation | yes | 121 | 103 | 22 | 1383 | **4** | 1 / 1 / 1 / 1 |
| RF03b update | yes | 122 | 104 | 22 | 1387 | **8** | 1 / **2** / **2** / **3** |
| RF03c replay | yes | 123 | 105 | 22 | 1391 | **12** | 1 / **3** / **3** / **5** |

The split was written down before the run, and it matched: the project lead stays at one row, the engineering role, the quality technician and the security role are the ones that grow.

## The three defects, with the rows that prove them

**1. The read fix works.** The project lead row `1692` was created at 08:53:52Z and was **not** recreated on either later submission. The key check found it, which means the parent's snapshot now reaches the rows of the expediente. The RF02 absence was a read problem and it is closed.

**2. The engineering role is created without an existence check.** Row `1697` at 08:58:21Z and row `1701` at 09:02:58Z: one extra row per ingestion, role `IDRol` 3, for the same person.

**3. The quality technician check compares two incompatible key formats.** It reads `ArrayResponsables` (`nombre - correo;`) and compares it against `correo-idRol`, so it can never match: row `1695` at 08:58:13Z and row `1699` at 09:02:38Z, role `IDRol` 4, same person each time.

**4. The security role is created once per valid responsible, without a check.** Rows `1696` and `1698` at 08:58:20–21Z and rows `1700` and `1702` at 09:02:56–59Z: two extra rows per ingestion because the creation sits inside the responsible loop and always writes the same person, role `IDRol` 5.

## What already works

- **The title synchronization.** The leaf's staging row `316` now carries `DEV RF03 update validation - 900611503` and `2026-11-09T23:00:00Z`, which is `2026-11-10` in Madrid. The role rows carry the same names as the JSON.
- **The hierarchy.** RF03a produced the three staging rows `314`, `315`, `316`, four roles for each expediente, the suppliers and the milestone of the leaf.
- **Isolation.** No role row was created outside the three controlled identifiers, the failed library stayed at 22, and the destination `Expedientes` list did not move.

## What the churn shows

The supplier and the milestone of the leaf are deleted and recreated on every ingestion: `1832 → 1833 → 1834` and `637 → 638 → 639`. The count stays right, but the row identity changes each time, which breaks any downstream reference to a row id.

## Limits of this evidence

- The evidence is read from the SharePoint side: input consumption, the processed, log and failed libraries, and the business rows. The run identifiers were not read from the portal.
- One controlled hierarchy and its leaf were exercised. No business JSON was replayed and no other expediente was touched.
- The role duplication measured here is the **published** behaviour. The phase 1 candidate was not applied, so the expected `1 / 1 / 1 / 1` after the fix is still a prediction, not an observation.
- The phase 2a and phase 2b candidates remain unmeasured for the same reason.

## Next

1. Apply the phase 1 candidate to the DEV child only, after a fresh source check, and publish it.
2. Replay the same three cases on **new** controlled identifiers, because the duplicates accumulated here are not removed by the non destructive phase 1. The expected result is one row per role on the update and replay.
3. Apply phase 2a and re-measure the title convergence, then decide on phase 2b.

Receipt: ignored `.atl/project-title-sync/rf03-20261110/rf03-evidence.json`.
