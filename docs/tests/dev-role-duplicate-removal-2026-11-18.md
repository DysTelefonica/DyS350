# DEV role duplicate removal, November 18

The last gap of the role reconciliation: a row that is a **copy** of another row of the same
expediente, with the same person and the same kind of role, was never removed, because the key of
the desired set is `usuario + '-' + IDRol` and the copy answers the same key. The table of
DEV/CERT held 829 of those copies and PROD held 55.

## What was published

| | |
| --- | --- |
| Rule | a row of the same expediente with the same person and the same kind of role, and with a **lower** identifier, makes the row a copy; the copy is deleted and the person stays in the group |
| Generator | [prepare-role-duplicate-removal.cjs](../../scripts/flow-title-sync/prepare-role-duplicate-removal.cjs) (offline, deterministic) |
| Base | the published definition of the child of DEV/CERT, `E4E823CEFCFFCE844FA6590CF556AAAE4B48A3052FC02F8C4AEA01F6D4C40B6F` |
| Candidate | `177EC0C7D55D18A91504D9699227AD287FD6E58E926253AFAEF9A13F603C29C1` |
| Published in DEV/CERT | `177EC0C7D55D18A91504D9699227AD287FD6E58E926253AFAEF9A13F603C29C1` (read back by hash after the publish) |
| Offline suite | 277 tests, 271 passed, 0 failed, 6 skipped (17 of them are the new ones) |

The two new actions live in the same Foreach as the deletion of the rows the JSON does not describe
(`Por_cada_RolUsuario_Eliminar`):

- `Buscar_Copia_De_Una_Fila_Igual`: a query over the rows of the expediente that looks for a row
  with the same person and the same kind of role and a **lower** identifier.
- `Es_Copia_De_Una_Fila_Igual`: the guard that measures that query, and inside it
  `Eliminar_Copia_RolesUsuario`, a `DeleteItem` of the row.

Two details that the platform taught and that the definition has to respect:

1. In this flow `body()` of a query **is** the array (there is no `['value']`): the published
   definition measures it that way in three places.
2. The guard of the copy also requires that the key of the row is in `RolesUsuarioDeseados`, the
   same expression that the deletion of the undescribed rows negates. Without that condition the two
  guards would delete the same row and the ingestion of the expediente would break with a 404 of the
  second delete. The conditions are complementary, so every row is deleted exactly once.

The `Direccion` kind is protected by that same condition: the flow never writes it, so its key is
never in the desired set and no copy of it is ever deleted.

## What was measured

The controlled case is the payload of RF22 (three synthetic expedientes), uploaded to the library of
input of DEV/CERT and processed by the published parent:

1. The first ingestion created the four rows of expediente `900611981` that its JSON describes:
   `1915` (ug03573, calidad), `1916` (rosamaria, ingenieria), `1917` (tatiana, jefe de
   proyecto) and `1918` (martina, documentacion). The child run
   `08584066072489900132385283742CU06` finished **Succeeded** (69 s) with the new definition
   published.
2. A copy of `1917` was then inserted by hand (`1919`, the same person and the same kind of
   role) and the same JSON was processed again. The key of the JSON is the one already applied, so
   the guard of the order applies it (it only skips a JSON that is **older** than the applied one).
3. The child run `08584066070253147118317659680CU05` finished **Succeeded** (50 s) and the three new
   actions are **Succeeded**: `Buscar_Copia_De_Una_Fila_Igual`, `Es_Copia_De_Una_Fila_Igual` and
   `Eliminar_Copia_RolesUsuario`. No action of the run failed.

The result, read back from the list:

| Row | Before | After |
| --- | --- | --- |
| `1917` (tatiana, jefe) | the row the JSON describes | untouched, same `Modified` (11:01:21) |
| `1919` (tatiana, jefe) | the copy, inserted by hand | **deleted** |
| `1915`, `1916`, `1918` | the other rows of the JSON | untouched, same `Modified` |

The rows that the JSON describes were not rewritten: the rule only removes the copy.

## The data of the case was removed

| Store | What was removed | Read back |
| --- | --- | --- |
| `Roles_usuario` | 4 rows of 900611981 | 0 rows |
| `ExpedientesJSON` | 1 row of 900611981 | 0 rows |
| `Suministradores` | 1 row | 0 rows |
| `Hitos` | 0 rows | 0 rows |
| `Expedientes` | 0 rows | 0 rows |
| Dataverse (`cr435_expedientes`) | 1 row (DEV900611981) | 0 rows |
| Group `Calidad` | the member ug03573@telefonica.com that the case added | the group is back to its 7 members |

The group `Jefes de Proyecto` was not touched: tatiana.shulcaquinaupa@telefonica.com was already a
member before the case, so the ingestion added nothing.

## Open

The promotion of the rule to PROD is a port, not a copy: it is recorded in
[the change of PROD](../../changes/prod-role-duplicate-removal-2026-11-18.md) when it is measured
there.
