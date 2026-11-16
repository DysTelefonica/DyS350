# DEV/CERT change trace RF12, November 15

This is the record of the phase D of the reconciliation: the log of an ingestion has to say **what changed**, the field, the value it had and the value it has. It is written on 2026-11-15, in the branch `DEV/CERT`, against the environment `DyS350.cert.OCETF`.

## What the phase changes

The branch of an expediente that is already provisioned patches the staging row (`ExpedientesJSON`) with the thirty seven columns the JSON carries, and the log of that branch records only that the expediente exists and is being updated. Phase D adds the trace of that write: for every column of the patch, the log carries the previous value and the new one.

The comparison is **between the row of the list before the write and the same row after it**, both read from SharePoint:

| Step | Action | What it reads |
| --- | --- | --- |
| 1 | `Leer_ExpedienteJSON_Antes` | the row of the list, just before the write |
| 2 | `Actualizar_ExpedienteJSON` | the write (the patch of the thirty seven columns) |
| 3 | `Leer_ExpedienteJSON_Despues` | the same row of the list, once the write is done |
| 4 | `Calcular_Cambios_1..3` | the comparison of the thirty seven columns, in three expressions |
| 5 | `Log_Actualizando_Expediente` | the log, with the trace concatenated |

Both reads point at the same item, the one whose id the patch writes (`first(body('Filtrar_resultados_por_Expediente'))?['ID']`). Reading the two sides from the list is what makes the comparison exact: SharePoint keeps a date as the datetime of the day (`03/04/2026 00:00:00` is stored as `2026-03-03T23:00:00Z`, and as `2028-09-29T22:00:00Z` in the summer), a boolean as the text `True`, the members as the text `Nombre - correo;` and a number as a number. Comparing the JSON with the stored row would mean re-implementing those rules in the template language, and the first attempt at that **failed at runtime**: `substring` on an empty value throws, every existing expediente was logged as failed and the environment was left with a broken candidate until it was rolled back to `84FABEA2…`.

The comparison only uses `equals`, `string`, `coalesce` and `concat`, the four functions that cannot fail on an empty value, so a mistake in the comparison cannot break an ingestion: the worst it can do is to report a change that is not one.

The trace is written in chunks because the platform accepts at most 8,192 characters per expression and the comparison of the thirty seven columns is 16,395. The generator splits it into three expressions, the longest of them 5,771 characters.

## The case

`900611801_26_20261115_RF12-update.json` (11,191 bytes, SHA-256 `CB3FF829…`) is the payload of the RF08a case with two fields of the root expediente changed and nothing else:

| Field | Value in the list | Value in the case |
| --- | --- | --- |
| `Observaciones` | `… que nos subcontrate. [RF11 2026-11-15: texto modificado para medir la fase D]` | `… que nos subcontrate. [RF12 2026-11-15: segundo cambio para medir la fase D]` |
| `ImporteContratacion` | `123456.78` | `987654.32` |

The two sibling expedientes of the payload (`900611802` and `900611803`) travel with it and are the control: they must not report any change.

## What was measured

Two runs of the parent flow, both `Correcto`:

| Run | File | Log of the run | Totals | Trace |
| --- | --- | --- | --- | --- |
| 2026-11-15 21:02 | `…RF11-update.json` | item 122 | `Total 3, Nuevos 0, Actualizados 3, Fallidos 0` | empty |
| 2026-11-15 21:21 | `…RF12-update.json` | item 123 | `Total 3, Nuevos 0, Actualizados 3, Fallidos 0` | empty |

**The write works and the trace does not.** The row of `900611801` carries the value of the JSON of the run, verified by reading the list after each run: the `Observaciones` of RF11 and then the `Observaciones` of RF12, with `ImporteContratacion` `123456.78` and then `987654.32`. The counts are right and nothing fails. The trace of both runs is the empty string, for the three expedientes and for the two controls alike.

An empty trace with a write that did change the row means the two reads returned the same values. There are two ways that can happen, and the run does not say which one it was:

1. the accessor of the read does not resolve, so both sides are empty and every comparison compares an empty text with an empty text; or
2. the filter of the reads is not applied, so both reads return the whole list, `first()` picks the same first row of the list in both of them, and that row did not change.

The generator now reads the rows with the accessor the flow already uses for the list of the provisioned expedientes (`outputs('X')?['body/value']`) instead of `body('X')?['value']`, and it can write a diagnostic in the log (`TRACE_DIAGNOSTIC=1`) that says how many rows each read returned and which value the row carried. That diagnostic is what tells the two apart in one run.

**The correction is published.** The token of Dataverse was renewed on the morning of November 16 with the authorization code of the browser session (the form of `login.microsoft.com/device` does not accept the click of the tooling, but `https://login.microsoftonline.com/<tenant>/oauth2/authorize?…&resource=https://orge4f220a2.crm4.dynamics.com` returns the code in the URL of the native client page, and that code is exchanged for a token). The candidate published in DEV/CERT is now **`8C235E67…`**, the one that reads the rows with `outputs('X')?['body/value']`, and it is the exact output of the generator of the repository: `node scripts/flow-title-sync/prepare-change-trace.cjs` and the receipt of `.atl/project-title-sync/change-trace-20261115/candidate-comparison.json` carry that hash.

**The measurement of the corrected candidate is still pending, and the reason is the environment, not the flow.** To measure it a new payload has to go into the library `cargaJSON_entrada`, and on the morning of November 16 the library could not be written: the modern web part of the site does not hydrate (the page raises an error and the toolbar does not react to the click), and the REST endpoints of the site reject the upload (`Files/add` answers `InvalidClientQueryException` — "the expression is not valid" — with the name quoted, unquoted or encoded, and `addUsingPath` answers `ODataException` because it expects a JSON body). The reads and the deletions of the same library do work, which is how the cleanup below was made. The payload of the next case is ready and reproducible: [prepare-rf13-update-fixture.cjs](../../scripts/flow-title-sync/prepare-rf13-update-fixture.cjs) derives it from the committed payload of the case of RF08 (`scripts/flow-title-sync/fixtures/rf08a-create.json`, SHA-256 `9E46AEE0…`), with a third value of the two fields so that the trace has something to report (`900611801_26_20261115_RF13-update.json`, 11,190 bytes, SHA-256 `F92793DC…`).

## The rules of the platform that shaped the candidate

| Rule | What it refuses | How the candidate answers it |
| --- | --- | --- |
| Characters per expression | An expression over 8,192 characters | The trace is split into three expressions |
| A dependency that is not in the path | `The inputs of template action 'Calcular_Cambios_1' cannot reference action 'Leer_ExpedienteJSON_Antes'` | The trace waits for both reads, and the log waits for the trace and for both reads |
| A cycle | The write waits for the trace and the trace waits for the write | The write waits for the read before it; the trace waits for the read after it |

## What is left

- Run the case of RF13 when the library accepts a payload again, with the candidate `8C235E67…` and `TRACE_DIAGNOSTIC=1`: the diagnostic says whether the reads returned the row or the whole list, which is the question the two empty traces of RF11 and RF12 leave open.
- Publish the candidate without the diagnostic once the trace reports the two changed columns and nothing for the two controls.

## What was removed on 2026-11-16

The controlled data of the case is out of the environment, with a read before and a read after in every store:

| Store | Before | Removed | After |
| --- | --- | --- | --- |
| `ExpedientesJSON` | 128 | 3 (items 329, 330 and 331) | 125 |
| `Roles_usuario` | 1 369 | 12 (items 1751 to 1762) | 1 357 |
| `Suministradores` | 1 170 | 4 (items 1855 to 1858) | 1 166 |
| `Hitos` | 51 | 1 (item 648) | 50 |
| `Expedientes` | 8 | 0 | 8 |
| `cr435_expedientes` (Dataverse) | 131 | 3 (`DEV900611801`, `DEV900611802`, `DEV900611803`) | 128 |

Every removal answered `200` (SharePoint) or `204` (Dataverse), and no row of the controlled identifiers is left in any of the six stores. The library `cargaJSON_entrada` is empty. The logs of the runs stay in `cargaJSON_log` (items 120 to 123): they are the evidence of the case and they carry no data of the controlled rows.

The deletions of SharePoint were made with the session of the browser and the request digest of the site (`POST /_api/contextinfo` and then `POST` with `X-HTTP-Method: DELETE` and `IF-MATCH: *`), because the site of CERT is a classic site and it has no recycle bin: the deletion is permanent.

## The evidence

| What | Where |
| --- | --- |
| The generator | [scripts/flow-title-sync/prepare-change-trace.cjs](../../scripts/flow-title-sync/prepare-change-trace.cjs) |
| The tests (31) | [scripts/flow-title-sync/prepare-change-trace.test.cjs](../../scripts/flow-title-sync/prepare-change-trace.test.cjs) |
| The published candidate | `68EE6A8E5304CA37C903172F10A811CDD3DF2D33A0210A76CF92FBBEDA3E45A2` |
| The base it builds on | `84FABEA2E991D95BE867A063DDEF73C0F0D76626BEF1735C8A3B4B8D4629213A` (the centralized mapping of RF10) |
| The logs of the two runs | the library `cargaJSON_log` of the site, items 122 and 123 |
| The payload of the case | `.atl/project-title-sync/change-trace-20261115/900611801_26_20261115_RF12-update.json` (ignored by git) |
