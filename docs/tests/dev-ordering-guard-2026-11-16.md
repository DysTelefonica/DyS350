# DEV/CERT ordering guard, November 16

This is the record of the phase E of the reconciliation: an ingestion whose JSON is older than the one already applied to an expediente must not overwrite it. It was opened on 2026-11-16 in the branch `DEV/CERT`, against the environment `DyS350.cert.OCETF`.

**The phase is not closed.** The decision is built and measured; the state that the decision compares against cannot be written by the flows of the environment. What is written here is what was measured and what is left, so the next step does not have to be found again.

## The design

The guard lives in the **parent**, which orchestrates and decides whether an expediente is processed at all. The whole branch of the expediente is skipped when the file is old: the staging row, the application list, Dataverse, the roles, the milestones and the suppliers. The child flow, which reconciles, is not touched by the decision.

The comparison is **per expediente**, never per file: every expediente of a file shares the generation time of the export, but the state is the one of each expediente, so a file that is partially newer and partially older is applied only where it is newer.

The two instants are ISO 8601 UTC, so the comparison is made with their fourteen digits, as a number:

```text
int(concat(substring(<instant>,0,4),substring(<instant>,5,2),substring(<instant>,8,2),
           substring(<instant>,11,2),substring(<instant>,14,2),substring(<instant>,17,2)))
```

The comparison lives in a scope with a catch: when it cannot be made the file is applied (fail open), because a guard that breaks the ingestion is worse than a guard that does nothing.

## The case

Two payloads of the same case, derived from the committed payload of RF08, with two generation times and two values of the root expediente:

| Payload | Generation time | `ImporteContratacion` |
| --- | --- | --- |
| `900611801_26_20261116_RF15-new.json` | `2026-11-16T09:00:00.000Z` | 555555.55 |
| `900611801_26_20261116_RF16-old.json` | `2026-10-01T09:00:00.000Z` | 111222.33 |

The new file is applied and the old one must not overwrite it.

## What was measured

The run of the new file (`08584067715773976886235422295CU20`, 13:21:48 to 13:26:06) was `Succeeded` and the log of the ingestion says `Total 3, Nuevos 3, Actualizados 0, Fallidos 0, Antiguos 0`: the three expedientes of the file were applied, because nothing had been applied to them before.

The diagnostic of that run says, for each expediente, **`La comparacion no se pudo hacer y el JSON se aplica`**. The comparison did not fail because the file was old: it failed because there was nothing to compare with, the staging row of a new expediente does not exist yet.

The run of the new file that followed (`08584067708046419532473907678CU22`, 13:34:41 to 13:39:27) **failed**: the write of the state is the one part of the candidate that could not work, and it took the whole ingestion with it (the file of the failure is in `cargaJSON_fallidos`). The state was therefore never written and the old file could not be measured against it.

## The platform rules that shaped the candidate

| Rule | What it says | How the candidate answers it |
| --- | --- | --- |
| A dependency that is not in the path | `The inputs of template action 'Calcular_Cambios_1' cannot reference action 'Leer_ExpedienteJSON_Antes'` | The key of the file is computed before the loop and the loop waits for it |
| A dependency of another level | `The 'runAfter' property of template action 'Guardar_el_orden_del_JSON' ... the action 'Try_Comprobar_el_orden' must belong to same level as action 'Guardar_el_orden_del_JSON'` | The decision is a sibling of the try and of the catch, inside the scope of the guard |
| A cycle | The write waits for the trace and the trace waits for the write | The child is called only when the file is newer, and the state is written by the child with the file |
| The definition of the operations of a connection | `The API operation does not contain a definition for parameter 'item/ClaveGeneracionJSON'` | **Not solved**: the state cannot be written in a column of the list |

## What is not solved, and what it takes

**The state cannot be written in a column of the staging list.** The column `ClaveGeneracionJSON` exists (an integer, because SharePoint turns a text that looks like an instant into a date, and a date is what the platform compares badly), but the definition of the operations that both flows have is a copy of the connection, made when the column did not exist: the platform refuses the parameter of the write. The four shapes of the write (`item/<field>`, the name of the field, `values` and `body`) are all refused with the same message, and the connection of the child, which is the one of the trigger and writes the fields of the list without problem, has the same copy.

**The state is a file of the library of the logs, and it works.** The parent writes a file `estado_<id>.json` with the key of the generation time of the file (the fourteen digits of the instant, as a number) for every expediente it applies, and the guard reads that file before the ingestion to compare it with the key of the file that arrives. The keys were measured: the three files of the case carried `20261116090000`, the key of `2026-11-16T09:00:00.000Z`.

**What is not solved is how the file of the state is found.** The read of the library returns the files (140 of them, with the pagination the flow already uses), but the name of a file is not in any of the fields the connector returns (`FileLeafRef`, `Name`, `Title`), so the filter of the guard finds nothing and the comparison cannot be made. The guard then applies the file (fail open) and the log says so, which is the right answer for an expediente that is new and the wrong one for an expediente that already has a state. The three ways that were measured:

| What was tried | What happened |
| --- | --- |
| `FileLeafRef eq 'estado_<id>.json'` in the filter of the read | The read answers with the error of the platform: the string character `"` is not expected. The template language only accepts single quotes |
| The name built with `concat()` and a filter of the REST | The platform reads the expression without taking the escapes of the JSON out, so the quotes of the REST cannot be built |
| A query over the files of the library, with the name built with `concat()` (single quotes only) | The query returns nothing: the name of the file is not in any field that the connector returns |

**⇒ The next step is one measurement**: print the whole first item of the library (the candidate with the diagnostic of the first item is published and run, and the diagnostic that prints it is in the generator) and read the field that carries the name of the file. The rest of the phase is measured: the comparison is made with the digits of the instants, the decision skips the whole branch of the expediente, the state is written with the key of the file and the log says `Antiguos`.


**The two forms of the REST that were tried.** The state is read with the REST of the site, because the connector of the library answers with the items without the name of the file in any field (the diagnostic that prints the first item says which fields it does return: ``@odata.etag``, ``ItemInternalId``, ``ID``, ``Modified``, ``Editor`` and ``Editor#Claims``).

| The form of the path | What the site answered |
| --- | --- |
| ``GetFileByServerRelativePath(decodedurl='<url completa del fichero>')`` | ``400``: *El parametro serverRelativePath no admite el valor especificado* (the path of the server relative cannot have the host) |
| ``lists/getByTitle('<biblioteca>')/RootFolder/Files/<nombre del fichero>/$value`` | ``404``: the form of the path is not the one the REST expects |

The form that is left to try is the server relative path of the file (``/sites/<sitio>/cargaJSON_log/estado_<id>.json``) in ``GetFileByServerRelativePath`` or ``GetFileByServerRelativeUrl``, built from the parameter of the site of the environment.
## What was left in the environment

Nothing of the controlled data. The rows of the case were removed with a read before and a read after in the six stores (`ExpedientesJSON` 128 to 125, `Roles_usuario` 1 369 to 1 357, `Suministradores` 1 170 to 1 166, `Hitos` 51 to 50, `Expedientes` 8 without rows, `cr435_expedientes` 131 to 128), the file of the failure was removed, the library of the input is empty, and the column `FechaGeneracionJSON`, created by mistake, was deleted. The column `ClaveGeneracionJSON` is left, empty, because it is the column of the design.

The parent flow is back to its published definition (`2A2E04E4...`, the one it had before this phase) and the child keeps the candidate of the phase D (`062C26A1...`).

## The evidence

| What | Where |
| --- | --- |
| The generator of the decision | [scripts/flow-title-sync/prepare-ordering-guard.cjs](../../scripts/flow-title-sync/prepare-ordering-guard.cjs) |
| The generator of the state of the child | [scripts/flow-title-sync/prepare-ordering-state.cjs](../../scripts/flow-title-sync/prepare-ordering-state.cjs) |
| The tests (18 and 5) | [scripts/flow-title-sync/prepare-ordering-guard.test.cjs](../../scripts/flow-title-sync/prepare-ordering-guard.test.cjs) and [scripts/flow-title-sync/prepare-ordering-fixture.test.cjs](../../scripts/flow-title-sync/prepare-ordering-fixture.test.cjs) |
| The payloads of the case | [scripts/flow-title-sync/prepare-ordering-fixture.cjs](../../scripts/flow-title-sync/prepare-ordering-fixture.cjs) |
| The base of the parent | `2A2E04E46A5350C9D35D74E2C3F12CC7F61A3D03F6A70FECD366434EFD2FF1E3` |
| The base of the child | `062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD` |
