# PROD: the JSON is the authority over the roles of an expediente

Date: 2026-11-17
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF` (environment
`DyS350_TF_E_PRO`, `80cfcc42-c966-ebc6-8934-9cd1802f9e53`)
Change type: the definition of the child flow `E2E_AltaExpedientes_Modulo1`
Status: **applied in PROD and verified.** The controlled data of the case was removed afterwards.

## Goal

The phase F of DEV/CERT: the JSON is the authority over the roles of an expediente. A role row
whose (person, kind) the JSON does not describe is deleted, the quality and the security rows are
not protected any more, the `Dirección` kind is out of the scope of the flow, a row that already
holds the person and the name of the JSON is not written again, and the deletion keeps failing
closed with no valid responsable in the JSON.

The decision, the implementation and the measurement in DEV/CERT are in the branch `DEV/CERT`: the
record is [dev-role-authoritative-deletion-2026-11-17.md](../tests/dev-role-authoritative-deletion-2026-11-17.md).
This record is the promotion of that work to PROD.

## What was published

| Flow | Id of the row of Dataverse | Before | After |
| --- | --- | --- | --- |
| `E2E_AltaExpedientes_Modulo1` (the child) | `1ca49582-ae1e-f111-8342-6045bde02c54` | `3BD8762BC20F828C15877FAE4C1769CCC964BFA1FA840097BFF60EE97B164C52` | `E61C0AD9C0524FAA6D030EABEBF26CDCF868D8F8B372D3C4889CA9D634D609D7` |

It was published in the row of Dataverse of the flow, which is the route the platform accepts for a
solution-aware cloud flow, and it was read back by hash. The parent of PROD is **not** touched: the
ordering guard is not part of this phase.

## The promotion is a port, not a copy

The definition of PROD was **not** the candidate of DEV/CERT with the parameters changed: it was the
definition that was live in PROD with the logic of the phase applied on top of it. The wiring of PROD
is kept: the eleven parameters of the environment, the authentication of the 55 actions (the
`@parameters('$authentication')` of PROD, not the connection by name of DEV/CERT) and the schema of
the trigger with its sixth file.

The difference against what was live in PROD is **exactly the 18 paths of the phase**, the same ones
that the phase changed in DEV/CERT, and nothing else. The generator
`prepare-prod-role-authoritative-deletion.cjs` refuses any other path, checks that the candidate
does not close a dependency cycle and writes the receipt `prod-child-comparison.json`.

## What was measured

The case is the same payload as the one of DEV/CERT (`prepare-rf15-role-authority-fixture.cjs`) with
three controlled identifiers that no real expediente of PROD uses (`900611901`, `900611902`,
`900611903`) and with a quality person that was **already a member** of the group of the quality
of PROD, so the case does not change the group.

**Run 1 (the setup).** The JSON describes the root expediente `900611901` with a quality person, an
engineer, a project manager and a security person. The rows are created and the log says
`Total 3, Nuevos 1, Actualizados 0, Fallidos 0, Antiguos 0`.

**Run 2 (the case).** The JSON of the root expediente no longer describes the quality role. The
parent run and the three child runs finished and the log says
`Total 3, Nuevos 0, Actualizados 1, Fallidos 0, Antiguos 0`, with the trace of the change
`IDResponsableCalidad: natalia.casangarcia@telefonica.com -> `. The rows are:

| Row | Kind | Person | Modified | What happened |
| --- | --- | --- | --- | --- |
| 356 | 4 (quality) | Natalia | — | **deleted.** The JSON does not describe the quality role any more. |
| 357 | 3 (engineer) | Rosa María | 15:13:42 | **not written.** The person and the name did not change. |
| 358 | 2 (project manager) | Tatiana | 15:13:42 | **not written.** |
| 359 | 5 (security) | Martina | 15:13:47 | **not written.** |
| 360 | 7 (Dirección) | Enrique | 15:14:04 | **untouched.** The kind is out of the scope of the flow. |

The two sibling expedientes of the payload were not created: they carry a parent that does not
exist in the system and the flow reports `no tiene ExpedientePadre en el sistema - Error`. They are
the control of the case.

## The residue of the case

The controlled data was removed with a read before and a read after: the four rows of
`Roles_usuario`, the row of `ExpedientesJSON`, the two rows of `Suministradores`, the row of
`cr435_expedientes` of Dataverse, the two logs of the ingestion, the three files of the state of the
ordering guard and the file of the input library. The counts of the lists are the ones of the
baseline (`Roles_usuario` 233, `ExpedientesJSON` 20, `Hitos` 35, `Suministradores` 78,
`Expedientes` 11) and the group of the quality has the same eight members it had before.

## What is left open

- **The removal of the person from the group of the role** is written in the generator of DEV/CERT
  but it is **not published in PROD**: with the session of the team every form of the endpoint answers 404
  or 400, although the addition of a member answers 201, so the 404 is most probably a permission of the
  session and not a missing endpoint. The action is published in DEV/CERT to be measured with the
  identity of the connection of the flow, and an action that fails would break the ingestion of every
  expediente whose role row is deleted. The membership of the group is changed by hand until it is
  measured.

## The files of the promotion

- `scripts/flow-title-sync/prepare-prod-role-authoritative-deletion.cjs` — the generator of the
  candidate of PROD (in the branch `DEV/CERT`).
- `.atl/project-title-sync/prod-role-authoritative-deletion-20261117/` — the ported candidate and its
  receipt (ignored by git).
