# DEV exact exporter schema RF09: the schema accepts the fifty keys and nothing else

The schema of the parse in the child flow of DEV/CERT still carried two properties of an older
shape: `content`, a nested copy of the fifty keys, and `schema`, a description of the old schema.
They were not keys of the exporter, and because the schema declares them, a JSON that carried one of
them was **accepted** even though the flow does not know them. This phase removes the two leftovers,
so the schema declares the fifty keys of the exporter and nothing else, and it measures what the
change does to a rejected ingestion.

## What was applied

| Item | Value |
| --- | --- |
| Source | the published roles by name and unknown fields, `7E52849F87E08FF8DE252C8F865841607E0B4002430F3BB2397E138246E6AE04` |
| Candidate | `B9B70E5D38E20C954CB552BCA8B57497208C819C47078232DC1D03FFF1855EE8`, **2 changed paths** |
| The change | the root `properties` of the schema of `ExpedienteJSON` lose `content` and `schema` |
| The rest of the schema | the fifty keys stay declared, `required` stays the same fifty, `additionalProperties` stays `false` |
| Generator | `scripts/flow-title-sync/prepare-exact-exporter-schema.cjs`, seven local tests green |
| Published | the Dataverse `clientdata` of the child flow, read back with the same hash |
| Parent flow | untouched (`5AFAFE77…`) |

The change is two paths and nothing else: no action is added, no expression changes, and the
dependency graph is untouched (the generator proves it).

## What was measured

One file with two records was uploaded to the input library of DEV/CERT: the complete record of the
leaf of the case of RF08 with a new identifier and one extra key (`campo_desconocido`), and the same
record with the new identifier `900611902` and the legacy key `content`.

| Step | Observation |
| --- | --- |
| The record with the unknown key | rejected: `"Estado":"Fallido"` and `"Log":\nThe schema validation failed.` |
| The record with the legacy key `content` | rejected the same way. Before this change it was accepted, because `content` was declared at the root of the schema |
| The log of the case | two records, both `Fallido`, and the counters `{"Total":2,"Nuevos":0,"Actualizados":0,"Fallidos":2}` |
| The data | nothing was written: `ExpedientesJSON` 125, `Roles_usuario` 1357, `Suministradores` 1166, `Hitos` 50 and Dataverse `cr435_expedientes` 128, the same values as before the case, and no row of `900611901` or `900611902` in any of them |
| The environment | the input library is empty and the file is in `cargaJSON_procesados`, as in every case |

The rejection is therefore unchanged for the unknown key and new for the two leftovers of the old
shape: a JSON that carries `content` or `schema` is now rejected like any other key the exporter
does not send.

## The first candidate, and why it was not published

The first candidate of this phase did more: it added an action that reads the keys of the payload and
a field in the log with the names of the keys the exporter does not send, so the log would name the
field that broke the ingestion. The platform **accepted the definition** (the write of the
`clientdata` answered `204` and the read-back returned the candidate hash), and the action failed
at runtime.

The failure was not harmless. The action had been placed at the flow level, before the scope that
does the work, and the scope waits for it. When the action failed, the scope was **skipped**, the
scope that catches the failure was skipped as well, and the flow answered with an empty result: the
log of the case carried two empty strings and `"Fallidos":0`. The ingestion was still rejected and
nothing was written, but the log stopped saying why.

The published definition was rolled back to `7E52849F…` within the same session, the candidate was
reduced to the schema, and the measurement above was made against `B9B70E5D…`.

The finding is worth keeping: **the platform's validator does not prove that a template expression
runs.** It accepted `keys()`, a function the template language of the platform does not support, and
the action failed only when the flow ran. The lesson for the next phases is that any new action has
to be measured in a run, and that an action that the rest of the flow waits for must not be able to
skip the work.

## What the log can and cannot say

The platform says `The schema validation failed.` and nothing more: it does not name the property
that is not allowed. The template language has no way to enumerate the keys of an object either, so
the flow cannot name the field that broke the ingestion.

What the team has today:

- the ingestion **fails** and the log records that it failed, with the counters of the case;
- the rejected file is **kept** in `cargaJSON_procesados` for review, so the field that broke it is
  in that file;
- the schema declares the fifty keys of the exporter, so the field that is not allowed is the one
  that is not in that list.

Naming the field in the log is still open. It needs a way to enumerate the keys of the payload that
the platform supports, and the first candidate shows that the functions of the reference library are
not all there.

## Limits

- DEV/CERT only. PROD was never read, written or authorized by this work.
- The two records of the case carry one unknown key each; a JSON that carries several unknown keys is
  rejected the same way.
- The Dirección and Personal externo roles of the catalog are still not written: the team sets the
  Dirección by hand.

## Rollback

The base is the published roles by name and unknown fields, `7E52849F…`, and its file is the one
the generator reads. Restoring it is one write of the `clientdata` of the child flow, and it was
done once during this phase.
