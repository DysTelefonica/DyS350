# DEV field completeness guard RF07: a partial JSON no longer wipes the fields

The last way in which the system could lose data is closed. A JSON that arrives **incomplete** is now rejected at the parse, before anything is written. The case was measured in DEV/CERT on 2026-11-14 with two controlled ingestions of the same expediente.

## The defect

The `ParseJson` action of the child flow declared the fifty keys of the exporter under a `content` property that the payload does not have: the parsed object is the expediente itself and the flow reads it at the root (`body('ExpedienteJSON')?['titulo']`). Nothing was required, so a JSON that arrived with forty-nine keys was parsed anyway and the patch, which always sends the thirty-seven fields, wrote `null` over the field the JSON did not carry.

## What was applied

| Item | Value |
| --- | --- |
| Source | the applied phase 3 definition, `FDBC92DE…` |
| Candidate | `A7CA118D769E696BF355960B3E0DACF2F40B39BEB464EB72915480FBC40BB13E`, 51 changed paths |
| The change | the `required` list with the fifty keys of the schema, and the same fifty keys declared at the root of the schema as any type |
| Generator | `scripts/flow-title-sync/prepare-field-completeness-guard.cjs`, seven local tests green |
| Published | the Dataverse `clientdata` of the child flow, read back with the same hash |
| Parent flow | untouched (`5AFAFE77…`) |

The keys are declared as any type on purpose: the guard checks the presence, not the value, because a `null` is a legitimate value for the twelve fields the exporter leaves empty.

## The case

Two controlled payloads of the same hierarchy `900611701` / `900611702` / `900611703`:

| Payload | Records | Keys of the leaf | Title of the leaf |
| --- | --- | --- | --- |
| `rf07a-create.json` | 3 | 50 | `DEV RF07 create validation - 900611703` |
| `rf07b-partial.json` | 1 (the leaf) | 49 (`garantiameses` absent) | `DEV RF07 partial must not apply - 900011703`, `fechaoferta` `2026-12-31` |

Both were uploaded to the input library of DEV/CERT on 2026-11-14.

## What was measured

| Step | Observation |
| --- | --- |
| Run of the complete payload | `Succeeded`. The parse of `ExpedienteJSON` succeeded, the staging rows `320` / `321` / `322` were created, twelve role rows (`1715` to `1726`), four supplier rows (`1843` to `1846`) and one milestone row were written, and the three rows of the Dataverse table were created. |
| Run of the partial payload | The parse failed, the `Catch` scope of the child took it and the flow ended without writing. `Actualizar_ExpedienteJSON`, `Actualizar_Expediente_-_Dataverse` and `Anexar_Resultado_Correcto` were skipped. |
| The row of the leaf after the partial payload | `Title` = `DEV RF07 create validation - 900611703`, `GarantiaMeses` = `72`, `FechaOferta` = null: the values of the **complete** payload. The title and the date of the partial payload are nowhere. |
| The queue | `cargaJSON_entrada` is empty and both files are in `cargaJSON_procesados`. |

The third row is the proof: without the guard the partial payload would have written `GarantiaMeses` as null and the title of the partial over the row of the expediente. With the guard the row is untouched.

## The cleanup of the case

The controlled data was removed with a read-back that proves the selection: twenty rows of the four SharePoint lists (`ExpedientesJSON` 128 to 125, `Roles_usuario` 1369 to 1357, `Suministradores` 1170 to 1166, `Hitos` 51 to 50) and the three rows of the Dataverse table (131 to 128). No row of the identifiers `900611701`, `900611702` or `900611703` is left in any of them.

## Limits

- The guard rejects the whole JSON when one of the fifty keys is missing. It does not apply the partial updates that section 6 of the specification describes for a JSON that carries only changes: the flow does not know which fields the sender meant to change, so refusing is the safe direction.
- A complete JSON with `null` values is written as before. The twelve fields the exporter leaves empty are legitimate nulls and are not touched by this change.
- The types of the values are not checked. The schema of the exporter declares them, but it was never enforced by the platform for this payload.
- DEV/CERT only. PROD was never read, written or authorized by this work.

## Rollback

The base is the applied phase 3 definition, `FDBC92DE…`, and its file is the one the generator reads. Restoring it is one write of the `clientdata` of the child flow with the same procedure that applied this change.
