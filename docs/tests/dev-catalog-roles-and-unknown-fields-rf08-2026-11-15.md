# DEV catalog roles and unknown fields RF08: the roles by name and no silent field

Two gaps of the [gap analysis](../investigations/full-sync-gap-analysis-2026-11-14.md) are closed. The identifiers of the roles that the flow wrote as literals now come from the roles catalog by name, and a JSON that carries a key the flow does not know is rejected instead of being accepted with that field silently dropped.

## What was applied

| Item | Value |
| --- | --- |
| Source | the applied completeness guard, `A7CA118D…` |
| Candidate | `7E52849F87E08FF8DE252C8F865841607E0B4002430F3BB2397E138246E6AE04`, 19 changed paths |
| The schema | `additionalProperties: false`: the fifty keys of the exporter are required and no other key is accepted |
| The roles | two new lookups at the scope of the child flow, `Rol_Ingenieros` and `Rol_Documentacion`, that filter the catalog by title, the same mechanism the flow already uses for Jefe de proyecto, Preventa and Calidad |
| The identifiers | the eight writes of a role identifier and the six comparisons of a role now use the catalog instead of the parameter that held 3 and the literal 5 |
| Generator | `scripts/flow-title-sync/prepare-catalog-roles-and-unknown-fields.cjs`, eight local tests green |
| Published | the Dataverse `clientdata` of the child flow, read back with the same hash |
| Parent flow | untouched (`5AFAFE77…`) |

The platform rejected the first candidate with `TemplateValidationError`: the expression of an identifier was nested inside a `concat` and carried the `@` that only belongs at the start of an expression. The rejection left the published definition untouched, and the candidate was regenerated with the two shapes the template language distinguishes.

## What was measured

The case used the hierarchy `900611801` / `900611802` / `900611803` and two payloads: the complete one, and the leaf alone with one extra key (`campo_desconocido`) and a different title.

| Step | Observation |
| --- | --- |
| The complete payload | Three staging rows (`323`, `324`, `325`) with `GarantiaMeses` 72, twelve role rows, four supplier rows, one milestone row (`646`) and three rows of the Dataverse table. The role rows carry `IDRol` 4 (calidad), 3 (ingenieros), 2 (jefe de proyecto) and 5 (documentación): **the same identifiers as before the change**, now resolved from the catalog. |
| The payload with the unknown key | Nothing was written: the staging list stayed at 128 rows, the roles at 1369 and the suppliers at 1170. The row of the leaf kept the title of the complete payload and its `GarantiaMeses`, so the unknown key did not overwrite anything. |
| The retry of the payload with the unknown key | The file was queued again and the flow executed a third time on 2026-11-15 at 00:16:39. The read-back after it found the leaf exactly as the complete payload had left it: the title `DEV RF08 create validation - 900611803` and `GarantiaMeses` 72, with the counts of the three lists unchanged. The rejection is reproducible, not a one-off of the first upload. |

The three executions of the day are in the flow counters of `cargaJSON_log`: the entries of 00:12:14, 00:13:24 and 00:16:39.

## What it means

- The flow no longer depends on a copy of the catalog: when the `Roles` list changes the identifier of Ingenieros or of the documentation role, the flow follows it. The parameter `E2E_IDRol_Ingenieria` stays in the definition but no action uses it.
- A field that the exporter adds is no longer ignored in silence. The JSON is rejected, the file is kept for review in the library of processed files and the log records that the expediente was not processed. The cost is deliberate: an ingestion that carries an unknown field does not complete, so the team sees the new field instead of losing it.
- The rejections of the platform are part of the method: nothing was ever half applied, and the read-back always proved what was really published.

## Limits

- The rejection of an unknown key is the strict reading of the specification. If the exporter adds a field that the business wants to keep ignoring, the flow has to be changed before the next ingestion of that expediente.
- The identifiers are resolved by title, so the title of the catalog has to stay the one the flow knows (`Ingenieros`, `Técnicos de documentación`).
- The Dirección and Personal externo roles of the catalog are still not written: the team sets the Dirección by hand.
- DEV/CERT only. PROD was never read, written or authorized by this work.

## The cleanup of the case

The data of the case was removed on 2026-11-15, with a read before and a read after, exactly as the previous cases were.

| Store | Before | Removed | After |
| --- | --- | --- | --- |
| SharePoint `ExpedientesJSON` | 128 | 3 (`323`, `324`, `325`) | 125 |
| SharePoint `Roles_usuario` | 1369 | 12 (`1727`–`1738`) | 1357 |
| SharePoint `Suministradores` | 1170 | 4 (`1847`–`1850`) | 1166 |
| SharePoint `Hitos` | 51 | 1 (`646`) | 50 |
| SharePoint `Expedientes` | 8 | 0 | 8 |
| Dataverse `cr435_expedientes` | 131 | 3 | 128 |

The final read-back finds no row of the three identifiers `900611801`, `900611802` and `900611803` in any of the five lists nor in the Dataverse table, and the counts are the ones the cleanup of 2026-11-14 left.

The removal of a SharePoint row of the classic site of CERT is **permanent**: the site has no recycle bin, so `recycleObject()` answers `404`. The working recipe is `DELETE` on the item uri with `X-RequestDigest` (taken from `POST /_api/contextinfo`) and `IF-MATCH: *`, and the read-back of the item answers `404` afterwards. Without the digest the endpoint answers `403`.

The counters of `cargaJSON_log` and `cargaJSON_procesados` keep the three executions of the case, as they keep every ingestion of the environment. They are the history of the flow and were not removed.

## Rollback

The base is the applied completeness guard, `A7CA118D…`, and its file is the one the generator reads. Restoring it is one write of the `clientdata` of the child flow.
