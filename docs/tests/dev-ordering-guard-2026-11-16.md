# DEV/CERT ordering guard, November 16

This is the record of the phase E of the reconciliation: an ingestion whose JSON is older than the
one already applied to an expediente must not overwrite it. It was opened on 2026-11-16 in the
branch `DEV/CERT`, against the environment `DyS350.cert.OCETF`.

**The phase is closed.** The guard is built, published and measured: the file that is older does
not overwrite the expediente, and the log of the ingestion says how many expedientes were skipped
because of it.

## The design

The guard lives in the **parent**, which orchestrates and decides whether an expediente is
processed at all. The whole branch of the expediente is skipped when the file is old: the staging
row, the application list, Dataverse, the roles, the milestones and the suppliers. The child flow,
which reconciles, is not touched by the decision.

The comparison is **per expediente**, never per file: every expediente of a file shares the
generation time of the export, but the state is the one of each expediente, so a file that is
partially newer and partially older is applied only where it is newer.

The two instants are ISO 8601 UTC, so the comparison is made with their fourteen digits, as a
number:

    int(concat(substring(<instant>,0,4),substring(<instant>,5,2),substring(<instant>,8,2),
               substring(<instant>,11,2),substring(<instant>,14,2),substring(<instant>,17,2)))

The comparison lives in a scope with a catch: when it cannot be made the file is applied (fail
open), because a guard that breaks the ingestion is worse than a guard that does nothing.

## The state: a file of the library of the logs

No flow of the environment can write a column of the staging list: the definition of the
operations of the connection of both flows is a copy made before the column existed, and the
platform refuses the parameter of the write ("The API operation does not contain a definition for
parameter 'item/ClaveGeneracionJSON'"). The state therefore lives in a **file** of the library of
the logs, one file per expediente: `estado_<idexpediente>.json`, whose content is the key of the
generation time of the file that was applied to that expediente, bare (fourteen digits, no quotes,
no JSON around it, so the answer of the REST is a number that the platform compares without
failing).

The parent writes the file after the ingestion, for the expedientes it applied, and reads it
before the ingestion, for every expediente of the file that arrives.

## The form of the path that reads the state

This was the measurement that closed the phase. The connector of the library answers with the
items of the library **without the name of the file in any field** (`FileLeafRef`, `Name`,
`Title` are empty), so the file cannot be looked up with a filter. It is asked by its name, with
the REST of the site:

    _api/web/lists/getByTitle(<biblioteca>)/RootFolder/Files('<nombre del fichero>')/$value

| The form of the path | What the site answered |
| --- | --- |
| `RootFolder/Files('<nombre>')/$value` | **200**, with the content of the file |
| `GetFileByServerRelativePath(decodedurl='/sites/<sitio>/cargaJSON_log/<nombre>')` | **200**, with the content of the file |
| `GetFileByServerRelativePath(decodedurl='<url completa>')` | 400: the path of the server relative cannot have the host |
| `RootFolder/Files/<nombre>/$value` (without the parenthesis) | 404: the form of the path is not the one the REST routes |
| `lists/getByTitle(<biblioteca>)/RootFolder/Files/<nombre>/$value` | 404 |

The parenthesis is what makes the difference: SharePoint routes `Files('<nombre>')` and does not
route `Files/<nombre>`. A file that does not exist answers 404, which is what the catch of the
guard expects for an expediente that has no state yet.

The content that came back in that measurement was `20261001090000`, the key of the **old** file of
the case: it was the state file `estado_900611802.json` that the run of the previous session had
left behind. The three state files of this case carried `20261116090000`, the key of the new file.

## The case

Two payloads of the same case, derived from the committed payload of RF08, with two generation
times and two values of the root expediente:

| Payload | Generation time | `ImporteContratacion` |
| --- | --- | --- |
| `900611801_26_20261116_RF15-new.json` | `2026-11-16T09:00:00.000Z` | 555555.55 |
| `900611801_26_20261116_RF16-old.json` | `2026-10-01T09:00:00.000Z` | 111222.33 |

The new file is applied and the old one must not overwrite it.

## What was measured

Both runs are of the published candidate of the phase (`6081A1D1...`), against the environment
`DyS350.cert.OCETF`:

| Run | File | Totals of the log |
| --- | --- | --- |
| `08584067379191507757838953232CU27` (22:42:46 → 22:46:53, Succeeded) | the new one | `Total 3, Nuevos 3, Actualizados 0, Fallidos 0, Antiguos 0` |
| `08584067376400085426236131879CU15` (22:47:25 → 22:50:07, Succeeded) | the old one | `Total 3, Nuevos 0, Actualizados 0, Fallidos 0, Antiguos 3` |

The log of the run of the old file carries the three expedientes, each one with the state
`Antiguo` and the reason:

    {"ID":900611801,"Estado":"Antiguo","Log":"El JSON es anterior al que ya se aplico a este expediente: no se aplica"}

The two totals, read from the log files of the two runs, are:

    900611801_26_20261116_RF15-new_2026-11-16T22_46_45.7450812Z.json
    {"Total":3,"Nuevos":3,"Actualizados":0,"Fallidos":0,"Antiguos":0}

    900611801_26_20261116_RF16-old_2026-11-16T22_49_59.7841982Z.json
    {"Total":3,"Nuevos":0,"Actualizados":0,"Fallidos":0,"Antiguos":3}

**The row of the staging list keeps the values of the new file.** After the run of the old file,
`ExpedientesJSON` still carries `ImporteContratacion = 555555.55` and the observation with the
marker `[RF15 2026-11-16: fichero nuevo del guard de orden]`; the old file, which carries
`111222.33` and the marker `[RF16 ...]`, wrote nothing. The three state files carry
`20261116090000`, the key of the new file, and the skipped run did not rewrite them.

**The state file is written again, not duplicated.** The name of the file only depends on the
expediente, so there is one state file per expediente and not one per ingestion. The case
measured both branches: the root expediente of the case had no state file and it was created, and
the two sibling expedientes had the state file that the run of the previous session had left,
with the key of the old file, and the run of the new file **overwrote** them (their content went
from `20261001090000` to `20261116090000` and their date went from 21:56 to 22:34). A second
ingestion of the same expediente, with a newer JSON, therefore updates the state instead of
failing.

The same measurement was made before with the candidate that carried the diagnostic
(`7F1A63E0...`, run `08584067382194290226488571584CU27`, 22:37:46 → 22:40:23), with the same
totals.

## The bug that the measurement found

The platform does not refuse an expression with an unbalanced parenthesis when the flow is
published: it refuses it when the expression is evaluated, in the run, and it says

    The template language function 'if' expects three parameter ... The function was invoked with '1' parameter(s).

The decision of the first candidate had the comparison inside the condition of the `if`, and the
parenthesis of `or(...)` was closed one level too late, so the `or` received four arguments and
the `if` received one. The comparison is now in its own action (`Calcular_la_clave_guardada`,
a Compose that reads the stored key as a number) and the decision only compares two numbers:

    @int(coalesce(string(coalesce(body('Leer_el_Estado_del_Expediente'),'0')),'0'))
    @if(or(equals(outputs('Calcular_la_clave_del_JSON'),0),not(greater(outputs('Calcular_la_clave_guardada'),outputs('Calcular_la_clave_del_JSON')))),1,0)

The tests of the generator now check the number of arguments of every function of the guard, so the
mistake is caught before it reaches the environment. The check is proven against the expression that
the platform refused, which is kept as a fixture in the test file: it reports `if with 1` and
`or with 4`, and the decision of the candidate passes the same check.

## The platform rules that shaped the candidate

| Rule | What it says | How the candidate answers it |
| --- | --- | --- |
| A dependency that is not in the path | `The inputs of template action 'Calcular_Cambios_1' cannot reference action 'Leer_ExpedienteJSON_Antes'` | The key of the file is computed before the loop and the loop waits for it |
| A dependency of another level | `The 'runAfter' property of template action 'Guardar_el_orden_del_JSON' ... the action 'Try_Comprobar_el_orden' must belong to same level as action 'Guardar_el_orden_del_JSON'` | The decision is a sibling of the try and of the catch, inside the scope of the guard |
| A cycle | The write waits for the trace and the trace waits for the write | The child is called only when the file is newer, and the state is written by the parent with the file |
| The definition of the operations of a connection | `The API operation does not contain a definition for parameter 'item/ClaveGeneracionJSON'` | The state is a file of the library of the logs, which the parent writes without problem |
| The number of arguments of a function | `The template language function 'if' expects three parameter ... invoked with '1' parameter(s)` | The comparison is in its own action and the tests count the arguments of every function |
| The form of the path of the REST | `El parametro serverRelativePath no admite el valor especificado` (400) and 404 for the name without the parenthesis | The file is read with `RootFolder/Files('<nombre>')` |

## What was left in the environment

Nothing of the controlled data. The rows of the case were removed with a read before and a read
after in the six stores (`ExpedientesJSON` 128 to 125, `Roles_usuario` 1 381 to 1 357,
`Suministradores` 1 174 to 1 166, `Hitos` 52 to 50, `Expedientes` 8 without rows,
`cr435_expedientes` 134 to 128), the three state files and the log files of the case were removed
(the five log files that the phase of RF08 had left, which carried the identifiers of the controlled
expedientes, were removed too), and the library of the input is empty.

The counts before the removal are the ones of the end of this phase, and they are higher than the
ones of the end of the phase of RF08 because the case was applied twice here (once with the
candidate that carried the diagnostic and once with the final one): the staging list has one row
per expediente (3) and the list of the roles has one row per role and per expediente (24). The
counts after the removal are the ones of the end of the phase of RF08: `ExpedientesJSON` 125,
`Roles_usuario` 1 357, `Suministradores` 1 166, `Hitos` 50, `Expedientes` 8 and
`cr435_expedientes` 128.

The column `ClaveGeneracionJSON` (an integer) is still in the staging list of DEV/CERT and it is
empty: it is the column of the first design of the state, the one that was retired because no flow
of the environment can write it. **PROD does not need it**: the state of this phase is a file, so
the promotion does not add any column.

## The state of the flows

| Flow | Hash | What it is |
| --- | --- | --- |
| `E2E_AltaExpedientes` (the parent) | `6081A1D10C88F3E0698F5C8A3664D881961AB18A0DFADBFDA65F7DE48637FDA7` | the candidate of the phase E, published and measured |
| `E2E_AltaExpedientes_Modulo1` (the child) | `062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD` | the candidate of the phase D (the trace), unchanged by this phase |

The base of the parent, the one it had before the phase, is
`2A2E04E46A5350C9D35D74E2C3F12CC7F61A3D03F6A70FECD366434EFD2FF1E3`. That base is only the input of
the generator: **the definition to promote to PROD is the candidate of the phase, `6081A1D1...`**,
published in PROD with the parameters of PROD.

## The promotion to PROD

The flows of PROD are other instances, so the promotion is not a copy of a file: the candidate of
the parent is published there with the parameters of PROD (`E2E_ConexionEntorno`,
`E2E_BibliotecaCargaJSON_Logs`, the rest), the libraries and the lists of PROD are checked, and an
ingestion is made with the log reviewed. The phase needs no new column and no new list, only the
file of the state in the library of the logs of PROD. The generator of the retired design of the
state in a column ([scripts/flow-title-sync/prepare-ordering-state.cjs](../../scripts/flow-title-sync/prepare-ordering-state.cjs))
is not published and does not travel to PROD. **No write in PROD was made.**

## The evidence

| What | Where |
| --- | --- |
| The generator of the decision | [scripts/flow-title-sync/prepare-ordering-guard.cjs](../../scripts/flow-title-sync/prepare-ordering-guard.cjs) |
| The tests (22) | [scripts/flow-title-sync/prepare-ordering-guard.test.cjs](../../scripts/flow-title-sync/prepare-ordering-guard.test.cjs) |
| The payloads of the case | [scripts/flow-title-sync/prepare-ordering-fixture.cjs](../../scripts/flow-title-sync/prepare-ordering-fixture.cjs) |
| The base of the parent | `2A2E04E46A5350C9D35D74E2C3F12CC7F61A3D03F6A70FECD366434EFD2FF1E3` |
| The candidate of the phase | `6081A1D10C88F3E0698F5C8A3664D881961AB18A0DFADBFDA65F7DE48637FDA7` |
| The base of the child | `062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD` |
