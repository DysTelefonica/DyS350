# DEV child table reconciliation RF06: the supplier and milestone identifiers survive

**The churn is fixed.** On 2026-11-11 the child flow was changed so that the supplier and milestone rows of an expediente are no longer deleted and re-created on every ingestion. A controlled ingestion that changes a supplier name and a milestone date now **keeps the row identifiers** and writes the new values on the same rows. Before the change the same ingestion moved the identifiers (supplier `1840` → `1841`, milestone `642` → `643`).

## What was applied

| Item | Value |
| --- | --- |
| Source | the applied phase 2b definition, `9FD60833…` |
| Candidate | `FDBC92DE821EA8A43530851B7AA167ACAA98459D60DCEDD14D1B86DD3C63F811`, 12 changed paths (six per table) |
| Validator | `checkFlowErrors` → `[]`, `checkFlowWarnings` → `[]` on the published definition |
| State | `Started`, last modified `2026-11-11T19:42:19Z` |
| Parent flow | untouched (`5AFAFE77…`) |

The change is the same shape as the role reconciliation, applied to the two child tables:

- **Supplier.** Business key `(IDSuministrador, IDPadre, IDExpedienteSuministrador)` — the three fields the JSON carries and the flow writes, with `IDProyecto` implicit because both sides belong to the expediente being ingested. A row the JSON still describes is **patched** with the JSON values instead of being recreated; a row the JSON no longer describes is deleted; an empty `suministradores` array deletes nothing.
- **Milestone.** Business key `(descripcion, importe)`. The JSON carries no milestone identifier and the same description can repeat inside one project (rows `631`–`634` of the project `1297` carry the same title, the same date and a null amount), so a content key is the only key available. A row the JSON still describes is patched with the JSON values; a row the JSON no longer describes is deleted; an empty `hitos` array deletes nothing.
- The patch writes only the fields the JSON carries. The three flags the create writes (`ContratistaPrincipal`, `Subcontratista`, `EsJuridica`) are **not** in the JSON, so they are left untouched on a row that already exists.

## What was measured

The case is the controlled leaf `900611603` ingested again with a new supplier name (`… (TEST 3)`) and a new milestone date (`2026-12-20`). Neither change touches the business key of its row, so the identifiers have to survive.

| Row | Before | After | Result |
| --- | --- | --- | --- |
| Supplier | id `1842`, title `…S.A.U. ` | id **1842**, title `…S.A.U. (TEST 3)` | identifier kept, value written |
| Milestone | id `644`, `FechaHito` `2026-12-14T23:00:00Z` | id **644**, `FechaHito` `2026-12-19T23:00:00Z` | identifier kept, value written |
| Roles of the leaf | 3 rows (`1711`, `1712`, `1714`) | 3 rows (`1711`, `1712`, `1714`) | untouched by the change |
| Supplier rows of the other controlled expedientes | `1835`, `1836`, `1837` | `1835`, `1836`, `1837` | untouched |

Counters: `cargaJSON_procesados` 128 → 129, `cargaJSON_log` 110 → 111, the input queue back to 0, `Roles_usuario` still 1402. The stored rows carry the modification time of the ingestion (19:47:38Z and 19:47:40Z), so what happened is a **write on the existing rows**, not a delete and a create.

## Limits

- DEV/CERT only. PRO was never read, written or authorized.
- The milestone key is content based, so a milestone whose **description or amount changes** is a different key: the old row is deleted and a new one is created, and the identifier changes again. The stable identity of a milestone needs an identifier the JSON does not carry today; that is a business decision, not an engineering one.
- Rows that share the same description and amount inside one expediente share a key: none of them is deleted and no row is created, but only one of them is rewritten. The four identical milestones of the project `1297` are that case, and the count is preserved.
- The controlled identifiers of RF03, RF04, RF05 and RF06 stay in CERT as evidence.

## Next

1. Settle the milestone identity with the business: an identifier in the JSON, or the acceptance that a renamed milestone is a new row.
2. Confirm whether an update is expected to re-provision (folders, permissions, groups) an expediente that is already in flight.
3. Decide the group membership of a deleted role (B4) and the fate of the pre-existing duplicates (B5).
4. Clean up the controlled identifiers when the evidence is no longer needed.

Receipt: ignored `.atl/project-title-sync/rf06-20261111/` and `.atl/project-title-sync/child-table-reconciliation-20261111/`.
