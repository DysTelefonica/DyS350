# Role table reconciliation, November 18 (DEV/CERT and PROD)

## What was applied

The role table of `Roles_usuario` now holds, for every expediente whose JSON was really ingested,
exactly the rows that the JSON describes: one row per (kind of role, person), with the name of the
JSON, and nothing else. The copies, the rows of a person that the JSON does not describe and the
rows left by an old ingestion are gone.

## Why

The inventory of November 18 (the [photo](../investigations/role-snapshot-2026-11-18.md)) showed that
the table had drifted away from the JSON in two ways:

- **Rows that contradict the JSON.** The rule R6 removes a row that the JSON no longer describes, but
  it only runs when the JSON is processed, and the rows of the old ingestions were never reconciled.
- **Repeated copies.** A copy of a row of the same expediente with the same person answers the same
  key of the desired set (`usuario + '-' + IDRol`), so the rule cannot remove it. The flow keeps
  appending the copy on every ingestion of the same JSON.

The decision of the business is that the JSON prevails, so the table was made to match it.

## How the authority was chosen

For each expediente, the authority is the most recent processed JSON that contains it **and** that
the flow really ingested. Two conditions decide that:

- the footprint of the ingestion in `ExpedientesJSON` (`IDResponsableCalidad` and
  `IDResponsableSeguridad`) has to agree with that JSON, and
- the JSON has to have been processed **before** the footprint was written, so a file that was
  processed later and never applied is not taken as the truth.

The mapping between a responsible of the JSON and a kind of role is the one of the published flow:
the comparison of the flags is against the literal `"No"`, so a null `esjefeproyecto` makes the
person a Jefe and a null `esPreventa` makes the person Preventa. The rows are matched by the key
`usuario + IDRol`, as the flow does, so a row with an empty user matches an entry of the JSON with
an empty user.

## What was applied, with numbers

| Measure | DEV/CERT | PROD |
| --- | --- | --- |
| Rows before | 1357 | 233 |
| Rows after | 317 | 136 |
| Expedientes with rows | 113 -> 107 | 42 -> 42 |
| Rows that match their JSON | 642 -> 314 | 108 -> 75 |
| Rows that contradicted their JSON | 695 | 63 |
| Rows of an JSON without a valid responsable | 17 | 0 |
| Rows that no JSON explains | 3 | 61 -> 60 |
| Manual rows (Direccion) | 0 | 1 |
| Repeated copies | 829 -> 0 | 55 -> 0 |
| Row updated | 6 | 7 |
| Row created | 19 | 14 |
| Row deleted | 1059 | 110 |
| Member added to a group | 20 | 8 |
| Member removed from a group | 5 | 7 |

Six expedientes of DEV/CERT lost all their rows: their last JSON declares no responsable at all, so
the rows they had were left by an ingestion older than that one.

## How it was applied

The correction was computed outside the environment, as a deterministic plan of row updates, row
creations, row deletions and group changes, and it was applied with the REST API of SharePoint
through the authenticated session of the generic account:

1. A pilot on one expediente (2001 of DEV/CERT: 11 rows -> the 5 rows of its JSON) was measured with
   a read-back before anything else was touched.
2. The rest of the plan was applied in batches, with the log of every action (status and error) kept
   in the scratch tree.
3. The state was read again after every batch and the photo was rebuilt from the live lists.

The first two batches were executed twice because the cursor of the batch did not persist between
calls: the second execution repeated the updates and the deletions (the deletion of a row that was
already deleted answers a 404 and changes nothing) and it created the 18 rows of the plan a second
time. The rebuilt plan, computed from the live state instead of the morning one, removed those
copies, and the final verification found no repeated copy in either environment.

## The rows that were not touched

- **DEV/CERT**: the 3 rows of expediente `1269` (April and May 2026). There is no processed JSON for
  that expediente at all, so nothing says what they should be.
- **PROD**: the 60 rows of the 22 expedientes whose JSON was never ingested
  (`402, 404, 414, 418, 419, 432, 436, 452, 457, 474, 480, 1072, 1073, 1190, 1195, 1222, 1223,
  1257, 1260, 1333, 1337`). Their JSON exists in the library of the processed files, but the flow
  never wrote their footprint, so the JSON does not speak for them. Those rows are older than the
  JSON that is in the library, which is why they were left.
- **PROD**: the `Direccion` row of expediente `1307`. The flow never writes that kind and never
  deletes it; the business keeps it by hand.
- One repeated copy was deleted anyway: expediente `2005` of PROD had two identical rows of the same
  person and the same kind. A copy is a defect with no ambiguity, so the copy with the higher
  identifier was removed, which is exactly what the new rule of the flow does.

## The groups of SharePoint

Only two kinds of role own a group in the flow: Jefe de proyecto and Calidad. The rule of the flow
is that a person leaves the group only when she holds no row of that kind in another expediente,
and that rule was applied: 5 removals in DEV/CERT and 7 in PROD, each one verified against the rows
of the whole table.

## The additions that failed, and why that is the right answer

14 of the 20 additions in DEV/CERT and the 8 of PROD answer a 404 of SharePoint: the JSON names
people who are not users of the tenant (`responsable.calidad.*@empresa.com`,
`responsable.seguridad.*@empresa.com`, `jefe.proyecto1@empresa.com`...). The row of the role exists
with the person of the JSON, and the person cannot become a member of the group because the
directory of the tenant does not know them. The flow fails in the same way when it tries, and the
ingestion of that expediente would be counted as failed. This is a fact about the data of the
JSON, not about the change.

## What is still open

The flow still does not remove a copy on its own: the rule that deletes a row whose key is not
wanted cannot delete a copy, because the copy answers the same key. The rule that closes that gap
is in [prepare-role-duplicate-removal.cjs](../../scripts/flow-title-sync/prepare-role-duplicate-removal.cjs).

## Evidence

- The photo with the verdict of every row, before and after:
  [role-snapshot-2026-11-18](../investigations/role-snapshot-2026-11-18.md) and its two CSV files.
- The deletions of SharePoint go to the recycle bin, so every removed row is recoverable.
- The snapshots of the live state and the log of every action are in the scratch tree (@.atl/`),
  which is not tracked.
