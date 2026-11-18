# PROD: the removal of the copies of a role row

Date: 2026-11-18
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF`
(environment `80cfcc42-c966-ebc6-8934-9cd1802f9e53`)
Flow: the child `E2E_AltaExpedientes_Modulo1` (`1ca49582-ae1e-f111-8342-6045bde02c54`)
Status: **applied in PROD and measured with a controlled case.**

## What was published

The rule that closes the last gap of the reconciliation of the roles: a row of the same expediente
with the same person and the same kind of role, and with a **lower** identifier, is a **copy**, and
the copy is deleted. The person **stays** in the group of that kind, because a copy is not a change
of person.

| Flow | Before | After |
| --- | --- | --- |
| `E2E_AltaExpedientes_Modulo1` (the child) | `97D20BA24E01CEEB3DFF506C532FF3BE0F26C1EBE41E100AC73C0E0A51B5A1E9` | `A878F9225CD981149D1CF365D49FD884046F7C94358FEF06C02FB221F23A84E2` |

The promotion was a **port**, not a copy: the wiring of PROD (the twelve parameters of the
environment, the authentication of the actions and the schema of the trigger) was kept and the
difference against the definition that was live in PROD is exactly the two paths of the phase:

| Path | What it does |
| --- | --- |
| `…Por_cada_RolUsuario_Eliminar.actions.Buscar_Copia_De_Una_Fila_Igual` | the query that looks for a row of the same person and the same kind with a lower identifier |
| `…Por_cada_RolUsuario_Eliminar.actions.Es_Copia_De_Una_Fila_Igual` | the guard that measures the query and deletes the copy |

The guard of the copy also asks that the key of the row is in `RolesUsuarioDeseados`, the same
expression that the deletion of the undescribed rows negates: the two conditions are complementary,
so every row is deleted exactly once and the ingestion never deletes a row that is already gone.
The `Direccion` kind is protected by that same condition, because the flow never writes it.

The whole work, with the rule measured first in DEV/CERT, is in the branch `DEV/CERT`, in
`docs/tests/dev-role-duplicate-removal-2026-11-18.md`.

## The measurement

The case is the same payload of RF22 that was measured in DEV/CERT, with the controlled identifier
`900611981`.

**Run 1 (the setup).** The payload was uploaded to the library of input of PROD and the ingestion
created the four rows of the expediente that the JSON describes: `380` (ug03573, quality), `381`
(rosamaria, engineering), `382` (tatiana, project manager) and `383` (martina, documentation).
The child run finished **Succeeded**.

**The copy.** Row `384` was inserted by hand: the same person and the same kind of role as `382`,
which is exactly the shape that the rule has to remove.

**Run 2 (the rule).** The same JSON was processed again (the guard of the order applies a JSON whose
instant is not older than the applied one). The child run
`08584066061567280621962059561CU16` finished **Succeeded** (62 s) and the three new actions are
**Succeeded**: `Buscar_Copia_De_Una_Fila_Igual`, `Es_Copia_De_Una_Fila_Igual` and
`Eliminar_Copia_RolesUsuario`. No action of the run failed.

The result, read back from the list:

| Row | Before | After |
| --- | --- | --- |
| `382` (tatiana, project manager) | the row the JSON describes | untouched, same `Modified` (11:12:51) |
| `384` (tatiana, project manager) | the copy, inserted by hand | **deleted** |
| `380`, `381`, `383` | the other rows of the JSON | untouched, same `Modified` |

## The data of the case was removed

| Store | What was removed | Read back |
| --- | --- | --- |
| `Roles_usuario` | 4 rows of 900611981 | 0 rows |
| `ExpedientesJSON` | 1 row of 900611981 | 0 rows |
| `Suministradores` | 2 rows | 0 rows |
| `Hitos` | 0 rows | 0 rows |
| `Expedientes` | 0 rows | 0 rows |
| Dataverse (`cr435_expedientes`) | 0 rows | 0 rows |
| Groups | nothing to put back: the generic user and tatiana were already members of the groups of PROD | unchanged |

## What is left open

- The table of PROD was reconciled with the JSON on the same day (the record is in
  [the reconciliation of the table](role-table-reconciliation-2026-11-18.md)), but the **60 rows of
  the 22 expedientes whose JSON was never ingested** were left untouched: nothing in the environment
  says what they should be, and that needs a business criterion.
- The identifier of a role row still changes when the person of a role changes: the row is deleted
  and created again by the flow.
