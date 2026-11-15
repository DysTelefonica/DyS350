# DEV centralized mapping RF10: the table that drives the destinations

The mapping of the fields of an expediente was written by hand in seven places: the staging list
when the row is created (two branches), the staging list when it is patched, the application list
when it is patched, and the Dataverse table when the row is created (two branches) and when it is
patched. Two of those places already derived the same field in two different ways, and the seven
copies of the mapping could drift without anything noticing. This phase puts the mapping in one
table and makes the generator build the destinations from it.

## What was applied

| Item | Value |
| --- | --- |
| Source | the published exact exporter schema, `B9B70E5D38E20C954CB552BCA8B57497208C819C47078232DC1D03FFF1855EE8` |
| Candidate | `84FABEA2E991D95BE867A063DDEF73C0F0D76626BEF1735C8A3B4B8D4629213A`, **2 changed paths** |
| The table | `scripts/flow-title-sync/mapping-table.json`: 41 logical fields, 5 groups, 7 destination actions |
| The generator | `scripts/flow-title-sync/prepare-centralized-mapping.cjs`, nine local tests green |
| Published | the Dataverse `clientdata` of the child flow, read back with the same hash |
| Parent flow | untouched (`5AFAFE77…`) |

The table holds, for every logical field, the source it comes from and the column of each
destination that carries it. The generator rebuilds the seven destination actions from the table,
and the rebuild has to reproduce the published definition. It does, with one exception, and that
exception is the drift itself:

| Destination | The PECAL chain before | After |
| --- | --- | --- |
| `Crear_Expediente_Sharepoint_2` and `Crear_Expediente_-_Dataverse_2` (the branch of an expediente with a parent) | `or(empty(...), equals(...), 'n/a')`, with spaces | the one spelling of the table |
| The other five destinations | the same expression without spaces | unchanged |

The two expressions were the same value written in two ways. Now there is one, and it is the one
the table carries.

## What the table also made visible

The table is the first place where the whole mapping can be read. It showed two things that were
hidden in the flow:

- **The Dataverse table carries the title in two columns.** The create writes `cr435_name` and
  `cr435_titulo` with the same value, and the patch writes only `cr435_titulo`. The staging list
  writes the `organoContratacion` in two columns too (`Cliente` and `organoContratacion`). That is
  how the published flow is; the table makes it visible instead of hiding it in seven blocks.
- **The title of the application list is not the same rule as the others.** When the JSON carries no
  title, the application list keeps the title it had, and the expression that does it is its own
  source in the table (`tituloConFallback`). The staging list and the Dataverse table take the empty
  value. It is the rule of the gap analysis about the authority of the application list, and it was
  invisible until the table was written.

## What was measured

The case of RF08 was run again, with the same file, the same bytes and the same identifiers
(`900611801`, `900611802`, `900611803`), so the values can be compared with the ones of November 15.

| Step | Observation |
| --- | --- |
| The log of the case | the three expedientes inserted and finished, with the same warning about the omitted responsible, and the counters `{"Total":3,"Nuevos":3,"Actualizados":0,"Fallidos":0}`: the same log as the case of RF08 |
| The staging list | 125 to 128 (3 rows) |
| The roles | 1357 to 1369 (12 rows), with the identifiers 4, 3, 2 and 5 in each expediente |
| The suppliers | 1166 to 1170 (4 rows) |
| The milestones | 50 to 51 (1 row), `1er CdC: Entrega de documentación de diseño y 1 plataforma vehicular`, 332 364,53 |
| The Dataverse table | 128 to 131 (3 rows) |

Every count is the count of the case of RF08. The values are the values too: the title, the
`GarantiaMeses` of 72, the type, the state, the `Esam` flag and the `Ordinal` of every expediente
are the ones of the previous case, and the milestone is the same row with the same amount.

The three destinations were also compared with each other on the rows the case wrote:

| Field | Staging list | Dataverse table |
| --- | --- | --- |
| Title | `Suministro de puestos de mando de UDRUME…` | `cr435_titulo` and `cr435_name`, the same |
| PECAL chain | `True` | `cr435_cadenapecal`: `true` |
| `Ordinal` | null, 1, 1 | `cr435_ordinal`: null, 1, 1 |
| `GarantiaMeses` | 72 | `cr435_garantiameses`: 72 |
| Type | Acuerdo Marco, Lote, Contrato Basado de Lote | `cr435_tipo`: the same three |
| State | Ejecución | `cr435_idestado`: Ejecución |
| `Esam` | Sí, No, No | `cr435_esam`: Sí, No, No |
| Parent | the hierarchy of the case | `cr435_idexpedientepadre`: the same hierarchy |

The destinations carry the same values, and the field that was derived in two ways carries the same
value in the two destinations that write it. That is the equivalence of the plan, measured on the
rows of a real ingestion.

## The cleanup of the case

The rows of the case were removed on 2026-11-15 with a read before and a read after: three rows of
the staging list (`326`, `327`, `328`), twelve role rows (`1739`–`1750`), four supplier rows
(`1851`–`1854`), one milestone row (`647`) and three rows of the Dataverse table. The read-back
finds no row of the three identifiers in any of the five lists nor in the Dataverse table, and the
counts are the ones the cleanup of November 14 left: 125, 1357, 1166, 50, 8 and 128.

## What it means

- A field that changes changes in one place. The next change of the mapping is a row of the table
  and a generator that rebuilds the seven destinations from it.
- The generator proves that the destinations are equivalent: it rebuilds them from one table, and
  the rebuilt definition has to match the published one. A drift between the table and the flow
  fails the test instead of reaching the environment.
- The flow does not change what it writes. The case wrote the same values as the case of RF08, in
  the same rows, with the same counters.

## Limits

- DEV/CERT only. PROD was never read, written or authorized by this work.
- The table was extracted from the published flow, so it is faithful to it by construction. The
  change it brings is the removal of the drift, not a new mapping.
- The two columns that carry the same value in the Dataverse table and in the staging list are
  described by the table, but they are not changed: whether the Dataverse table should carry the
  title in two columns is a question for the team.

## Rollback

The base is the published exact exporter schema, `B9B70E5D…`, and its file is the one the
generator reads. Restoring it is one write of the `clientdata` of the child flow.
