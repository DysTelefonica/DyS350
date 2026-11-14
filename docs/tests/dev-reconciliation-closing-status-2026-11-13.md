# DEV/CERT reconciliation: closing status

This record closes the work of the authoritative reconciliation in DEV/CERT: what was applied, how it was measured, what is still a business decision and what is left to clean in the environment. It is written on 2026-11-13, after the repository was split into the `DEV/CERT` and `main` branches.

## What is applied and published

| Phase | What it changes | Published definition | Measured by |
| --- | --- | --- | --- |
| 1 | The role rows of an expediente are written once, keyed by the role of the JSON | `B419F64A…` | [RF04](dev-role-reconciliation-rf04-2026-11-11.md) |
| 2a | The names of the role rows converge to the names of the JSON | `568D3028…` | [RF04](dev-role-reconciliation-rf04-2026-11-11.md) |
| 2b | A role the JSON no longer describes is deleted, and only that one | `9FD60833…` | [RF05](dev-role-reconciliation-rf05-2026-11-11.md) |
| 3 | The supplier and milestone rows are patched instead of deleted and re-created, so their identifiers survive | `FDBC92DE…` | [RF06](dev-child-table-reconciliation-rf06-2026-11-11.md) |

The live state of 2026-11-12: the child flow `E2E_AltaExpedientes_Modulo1` is `Started` and its published definition hashes to `FDBC92DE…`, the parent flow `E2E_AltaExpedientes` is `Started` and hashes to `5AFAFE77…` (never written by this work), and the last run of November 11 at 20:47 finished `Correcto`. See [the live state verification](dev-live-state-verification-2026-11-12.md).

## The checklist is closed

Every check of the [authoritative role reconciliation](../investigations/role-authoritative-reconciliation.md#technical-checks-of-the-apply) is measured. The two that were open when that record was written are now closed:

| Check | Was | Now |
| --- | --- | --- |
| V12 | The staging row of an ingested expediente carries the values of the last ingestion | done on 2026-11-11 |
| V13 | The row of the expediente that is already provisioned carries the values of the last ingestion | done on 2026-11-12: the Dataverse row of the controlled leaf `900611603` carries the title of the last ingested JSON, see [the provisioned row patch](dev-provisioned-row-patch-2026-11-12.md) |

## What a JSON now does to an expediente that is already provisioned

- The **staging record** (`ExpedientesJSON`) is patched with the 37 fields the JSON carries.
- The **provisioned row** (the Dataverse table `cr435_expedientes`) is patched with the same values.
- The **roles** of the expediente are written once, with the names of the JSON, and a role the JSON no longer describes is deleted.
- The **suppliers** and the **milestones** keep their row identifiers and are rewritten with the values of the JSON; a row the JSON no longer describes is deleted, and an empty collection deletes nothing.
- What is **not** touched: the permissions, the folders and the group memberships of the expediente. The parent flow never ran, because the JSON of the controlled cases points its `accesosharepoint` at another site.

## The business decisions that remain

None of them is an engineering defect: in every case the flow behaves in a defined way and that behaviour is measured. They need a business answer to change.

| # | Question | What the flow does today | What changes if the answer is the other one |
| --- | --- | --- | --- |
| B1 | A role row whose kind the JSON does not describe | The row is deleted (the literal reading of "the JSON is authoritative") | The deletion has to be scoped to the kinds the JSON may not touch |
| B2 | A JSON with no valid responsable | Nothing is deleted (fail closed) | Nothing to change: the safe direction is already the one in force |
| B3 | The quality and security rows | Counted as described by the JSON, so they are never deleted | The guard that protects them has to be relaxed explicitly |
| B4 | The group membership when a role row is deleted | The membership is left as it is, so a person keeps the group even without the role | A removal action has to be added to the deletion branch, mirroring the two actions that add members today (`Añadir_usuario_a_grupo_SP_Jefes_de_Proyecto` and `Crear_Tecnico_de_Calidad_en_Grupo_Sharepoint`) |
| B5 | The duplicates of the leaf `900611367` (`1677–1682`, `1827–1828`) | Left untouched; they are the artifact of the duplication that phase 1 fixed | The rows of that leaf are deleted, which the cleanup of the controlled data does anyway |
| B6 | The identity of a milestone | The key is the description and the amount, because the JSON carries no milestone identifier | A milestone whose description or amount changes stays the same row only if the JSON starts carrying an identifier |

## The controlled test data that is left in CERT

The controlled identifiers were created by the DEV work and are still in the environment. The evidence of every case is in the reports, with the values before and after, so the data is no longer needed as evidence.

| Case | Identifiers | Where the rows are |
| --- | --- | --- |
| RF01 and RF02 | `900611231`, `900611274`, `900611367` | staging items `311` / `312` / `313`, role rows `1677–1682` and `1827–1828` on the leaf |
| RF03 | `900611501`, `900611502`, `900611503` | staging items `314` / `315` / `316` |
| RF04, RF05 and RF06 | `900611601`, `900611602`, `900611603` | staging items and role rows `1711` / `1712` / `1714` |

The rows to remove, with the key that identifies them and nothing else:

| Store | Key | Rows |
| --- | --- | --- |
| SharePoint `Roles_usuario` (`4f76ac2a-4e41-4eca-9f6c-6851ec3c09cc`) | `IDExpediente` in the nine identifiers | the role rows of the nine expedientes — **removed on 2026-11-14** |
| SharePoint `Suministradores` (`37b7ab15-3706-4694-b07e-0bfbb011d53c`) | `IDProyecto` in the nine identifiers | the supplier rows of the nine expedientes — **removed on 2026-11-14** |
| SharePoint `Hitos` (`888881b8-1009-4ec0-ba9c-04ab387af903`) | `IDProyecto` in the nine identifiers | the milestone rows of the nine expedientes — **removed on 2026-11-14** |
| SharePoint `ExpedientesJSON` (`39cc4d8f-f14e-45c1-9b0e-fe8eeed0167c`) | `IDExpediente` in the nine identifiers | the staging rows of the nine expedientes — **removed on 2026-11-14** |
| SharePoint `Expedientes` (`d38eb17e-6b71-4100-85ab-26442190fb7f`) | `IDExpediente` or `CodExp` of the nine identifiers | the provisioned rows of the nine expedientes: **there were none**, the list only holds the eight demo expedientes |
| Dataverse `cr435_expedientes` | `cr435_idexpediente` in the nine identifiers | the nine rows `77e5858d…` (367), `e0166c21…` (501), `138c6765…` (503), `19f69a30…` (601), `a7909742…` (602), `2657d454…` (603), `abc38d6b…` (231), `021a127e…` (274), `98c21539…` (502) — **removed on 2026-11-13** |

The SharePoint deletion goes to the recycle bin (`POST _api/web/lists/getbyid('<list>')/items(<id>)/recycleObject()` with a request digest), so it is recoverable. The Dataverse deletion is permanent, which is why it is done with a read-back that proves the row belongs to the controlled set.

### What was removed on 2026-11-13

The Dataverse table was read before and after. Before: 137 rows, of which exactly nine carried a `DEV9006…` code and belonged to the nine controlled identifiers. The deletion aborted on the first attempt because the row identifier written by hand did not match the row of `900611274`, so the selection is now derived from the table itself: the nine rows whose `cr435_idexpediente` is one of the controlled identifiers, verified to be exactly the nine rows with a `DEV9006…` code, with no coded row outside that set.

| Step | Result |
| --- | --- |
| Read before | 137 rows, 9 controlled, every one with a `DEV9006…` code, no coded row outside the set |
| Deletion | 9 requests, all `204 No Content` |
| Read after | 128 rows, 0 controlled rows, 0 rows with a `DEV9006…` code |

The other 128 rows, which are the real expedientes of the environment, were not touched.

### What was removed on 2026-11-14

The SharePoint side needed a session of the site, which had expired. With the session back on 2026-11-14 the five lists were read, the selection was proved against the keys of the inventory and the rows were removed.

| Store | Before | Removed | After |
| --- | --- | --- | --- |
| `ExpedientesJSON` | 134 | 9 | 125 |
| `Roles_usuario` | 1402 | 45 | 1357 |
| `Suministradores` | 1179 | 13 | 1166 |
| `Hitos` | 53 | 3 | 50 |
| `Expedientes` | 8 | 0 | 8 |

The application list `Expedientes` had **no row of the controlled identifiers**: it only holds the eight demo expedientes (`2001` to `2010`). That is also the reason why the patch of the provisioned row could only be measured against the Dataverse table. The read-back after the removal finds no row of the nine identifiers in any of the five lists.

The removal is **permanent**: the site is a classic site and it has no recycle bin, so the endpoint `recycleObject()` answers `404` and the only way to remove an item is `DELETE` with `IF-MATCH: *`. The content of the removed rows is in the reports of RF01 to RF06.

### What is left in CERT

Nothing of the controlled test data. The only trace of the DEV work left in the environment is the counters of the log library (`cargaJSON_procesados`, `cargaJSON_log`), the processed files of the cases and the flow runs, which are part of the history of the flow. The case of the completeness guard (RF07, 2026-11-14) removed its own data the same way: twenty rows of the four lists and three rows of the Dataverse table.

## The repository

| Branch | Commit | Content |
| --- | --- | --- |
| `DEV/CERT` | this branch | the flow tooling, the investigations, the test reports and this record |
| `main` | `8fa9386` | PROD: the released application, the shared operational reference, the PROD change records and the branch convention |
| `develop` | `f5a2db7` | the application development: the shared permission model of the functional roles, with its 17 unit tests |

The convention is in [the branch convention](../branching-convention.md).

## Limits

- DEV/CERT only. PROD was never read, written or authorized by this work.
- The child flow of the certification environment is the one that carries the reconciliation; the same change in PROD is a promotion with its own record and its own authorization.
- The milestone has no identity in the JSON, so a milestone whose description or amount changes is a different row. That is B6 and it is a business decision, not a defect of the implementation.
