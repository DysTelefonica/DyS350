# DEV/CERT change trace, November 15 and 16

This is the record of the phase D of the reconciliation: the log of an ingestion has to say **what changed**, the field, the value it had and the value it has. It was started on 2026-11-15 and closed on 2026-11-16, in the branch `DEV/CERT`, against the environment `DyS350.cert.OCETF`.

**The phase is closed.** The live candidate is `062C26A1…` and the trace was measured with it: the log of an ingestion carries the fields that moved, with the value they had and the value they have.

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

## The bug that emptied the trace

The chunks were right all along and the log threw their answer away.

The log of the ingestion reads the three chunks to concatenate them, and it read them with `body('Calcular_Cambios_1')`. **A Compose action has no body**: the body of an action is the answer of a call to a service, and a Compose only has inputs and outputs. `body()` of a Compose answers nothing, and `concat` skips the arguments that are nothing, so the log wrote the empty string and the ingestion said that nothing had changed while it was changing two columns.

The diagnostic of the candidate with `TRACE_DIAGNOSTIC=1` proves both halves of that in one run:

```
c1=; ImporteContratacion: 555555.55 -> 111222.33   <- outputs('Calcular_Cambios_1'): the text arrives
b1=NUL                                             <- body('Calcular_Cambios_1'): there is nothing
```

The fix is to read the chunks with `outputs()`, the function that reads the result of another action, and the one the diagnostic already uses to read the two rows of the list:

```
Cambios: @concat(coalesce(outputs('Calcular_Cambios_1'),''),coalesce(outputs('Calcular_Cambios_2'),''),coalesce(outputs('Calcular_Cambios_3'),''))
```

The tests carry the regression: one of them evaluates the new expression and the other one evaluates the old one with the same values and proves that the old one writes nothing even when a column moved.

## The case

`900611801_26_20261115_RF13-update.json` and `900611801_26_20261116_RF14-update.json` are two payloads of the RF08a case with the two fields of the root expediente changed and nothing else. They are the same case with two different values, so applying one after the other is a real change every time:

| Field | Value in the list | Value in the case RF13 | Value in the case RF14 |
| --- | --- | --- | --- |
| `Observaciones` | `… que nos subcontrate. [RF12 2026-11-15: …]` | `… [RF13 2026-11-15: tercer cambio para medir la fase D]` | `… [RF14 2026-11-16: cuarto cambio para medir la fase D]` |
| `ImporteContratacion` | `123456.78` | `555555.55` | `111222.33` |

The two sibling expedientes of the payload (`900611802` and `900611803`) travel with it and are the control: they must not report any change.

## What was measured

Three runs of the case, all of them `Total 3, Nuevos 0, Actualizados 3, Fallidos 0`:

| Run | Candidate | File | Log | Trace of `900611801` | Controls |
| --- | --- | --- | --- | --- | --- |
| 2026-11-16 11:14 | `15D7995C…` (with diagnostic) | RF13 | item 128 | empty | empty |
| 2026-11-16 11:21 | `15D7995C…` (with diagnostic) | RF14 | item 129 | `; ImporteContratacion: 555555.55 -> 111222.33; Observaciones: …[RF13…] -> …[RF14…]` | empty |
| 2026-11-16 11:28 | `062C26A1…` (**live**) | RF13 | item 130 | `; ImporteContratacion: 111222.33 -> 555555.55; Observaciones: …[RF14…] -> …[RF13…]` | empty |

The first run is the control of the control: it replayed RF13 while the stored row already held the RF13 values, and an empty trace is the correct answer for a payload that changes nothing.

The third run is the proof of the phase, because it is the one that ran with the candidate that is live now. The log of the ingestion carries:

```
{"Log":"Expediente 900611801 existe - Actualizando campos",
 "Cambios":"; ImporteContratacion: 111222.33 -> 555555.55; Observaciones: El lote 2 lo ha ganado otra empresa, INTEGRACION TECNOLOGICA EMPRESARIAL, S.L., pero es posible que nos subcontrate. [RF14 2026-11-16: cuarto cambio para medir la fase D] -> El lote 2 lo ha ganado otra empresa, INTEGRACION TECNOLOGICA EMPRESARIAL, S.L., pero es posible que nos subcontrate. [RF13 2026-11-15: tercer cambio para medir la fase D]"}
```

and the two controls carry `"Cambios":""`, which is the answer for an expediente that did not move. The run of the parent flow is `08584067784027521304145420052CU07` (11:28:03 → 11:33:17) and the run of the child is `08584067781401885704455771848CU23`.

## The rules of the platform that shaped the candidate

| Rule | What it refuses | How the candidate answers it |
| --- | --- | --- |
| Characters per expression | An expression over 8,192 characters | The trace is split into three expressions |
| A dependency that is not in the path | `The inputs of template action 'Calcular_Cambios_1' cannot reference action 'Leer_ExpedienteJSON_Antes'` | The trace waits for both reads, and the log waits for the trace and for both reads |
| A cycle | The write waits for the trace and the trace waits for the write | The write waits for the read before it; the trace waits for the read after it |
| The body of an action | Nothing: `body()` of a Compose is empty | The log reads the chunks with `outputs()` |

## How the case was run

The library of the environment **does accept a payload**: the web part of the site hydrates and the upload only needs the file, not the operating system dialog. With the session of the browser, open the library, open the menu "Crear o cargar" → "Carga de archivos" and set the file on the input `input[data-automationid="commandFileInput"]`; the toast reads "Cargado `<file>` en `cargaJSON_entrada`". The trigger of the parent flow polls, so the run of the parent starts about a minute later and the child runs once per expediente of the payload.

## What was removed on 2026-11-16

The controlled data of the case is out of the environment, with a read before and a read after in every store:

| Store | Before | Removed | After |
| --- | --- | --- | --- |
| `ExpedientesJSON` | 128 | 3 (items 332, 333 and 334) | 125 |
| `Roles_usuario` | 1 369 | 12 (items 1763 to 1774) | 1 357 |
| `Suministradores` | 1 170 | 4 (items 1859 to 1862) | 1 166 |
| `Hitos` | 51 | 1 (item 649) | 50 |
| `Expedientes` | 8 | 0 | 8 |
| `cr435_expedientes` (Dataverse) | 131 | 3 (`DEV900611801`, `DEV900611802`, `DEV900611803`) | 128 |

Every removal answered `200` (SharePoint) or `204` (Dataverse), and no row of the controlled identifiers is left in any of the six stores. The library `cargaJSON_entrada` is empty. The logs of the runs were in `cargaJSON_log` (items 128, 129 and 130) and were removed on 2026-11-16 with the rest of the controlled data of the cases: they carry the identifiers of the controlled expedientes. What the runs measured is in this report.

The deletions of SharePoint were made with the session of the browser and the request digest of the site (`POST /_api/contextinfo` and then `DELETE` on the item with `IF-MATCH: *` and `X-RequestDigest`), because the site of CERT is a classic site and it has no recycle bin: the deletion is permanent.

## What is left

- The phase D of the plan is **done**: the live candidate is `062C26A1…` and the trace is measured with it.
- The ordering guard (phase E) is not built. The three questions it needs are answered in [the gap analysis](../investigations/full-sync-gap-analysis-2026-11-14.md): the state lives in a column of the staging row of the expediente, the generation time reaches the child inside the record the parent already sends, and the comparison is per expediente, so a file that is partially newer and partially older is applied only where it is newer.
- The name of the field that breaks an ingestion (phase B) is still not in the log: the platform only says that the validation of the schema failed and the template language cannot enumerate the keys of the payload ([RF09](dev-exact-exporter-schema-rf09-2026-11-15.md)).
- The Dirección and the `responsableSeguridad` need a business answer and are left as they are by decision of the team.
- Promoting the trace to PROD is a separate decision and is **not** done. Everything above happened in DEV/CERT.

## The evidence

| What | Where |
| --- | --- |
| The generator | [scripts/flow-title-sync/prepare-change-trace.cjs](../../scripts/flow-title-sync/prepare-change-trace.cjs) |
| The tests (34) | [scripts/flow-title-sync/prepare-change-trace.test.cjs](../../scripts/flow-title-sync/prepare-change-trace.test.cjs) |
| The published candidate | `062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD` |
| The candidate with the diagnostic | `15D7995CD0E02543FF1CF50E252A4786BE71944F4D4CA5A95C64945ED3F87D54` |
| The base it builds on | `84FABEA2E991D95BE867A063DDEF73C0F0D76626BEF1735C8A3B4B8D4629213A` (the centralized mapping of RF10) |
| The logs of the runs | the library `cargaJSON_log` of the site, items 128, 129 and 130 |
| The payloads of the case | [prepare-rf13-update-fixture.cjs](../../scripts/flow-title-sync/prepare-rf13-update-fixture.cjs) and [prepare-rf14-update-fixture.cjs](../../scripts/flow-title-sync/prepare-rf14-update-fixture.cjs), derived from the committed payload of the case of RF08 (`scripts/flow-title-sync/fixtures/rf08a-create.json`, SHA-256 `9E46AEE0…`) |
