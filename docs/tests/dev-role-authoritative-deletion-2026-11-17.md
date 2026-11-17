# DEV/CERT: the JSON is the authority over the roles of an expediente

Date: 2026-11-17
Environment: DEV/CERT — `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF`
(environment `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`)
Flow: the child `E2E_AltaExpedientes_Modulo1` (`1ca49582-ae1e-f111-8342-6045bde02c54`)
Status: **applied in DEV/CERT and measured.** The removal of the member of a group is **not**
published: the REST API of this tenant does not expose it.

## The decision

The owner of the product closed the open business decisions of the role reconciliation:

| Rule | Decision |
| --- | --- |
| R1 | A role row the JSON does not describe is **deleted** from `Roles_usuario`. The JSON is the authority. |
| R2 | The quality and the security rows are **not protected** any more: if the JSON does not describe them, their rows are deleted. |
| R3 | The `Dirección` kind is **out of scope**: the flow never creates, updates or deletes a row of that kind. It is set by hand. |
| R4 | A kind the JSON describes with another person ends up with the person of the JSON. |
| R5 | A row that already holds the person **and the name** of the JSON is not written again. |
| R6 | A deleted row also takes its person out of the group of its kind. |
| R7 | With no valid responsable in the JSON nothing is deleted: the deletion fails closed. |

## What was built

The generator is `scripts/flow-title-sync/prepare-role-authoritative-deletion.cjs`, over the
definition that was live in DEV/CERT (`062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD`,
the candidate of the change trace). It writes the candidate
`2D1C16687BB67BE45EE9A33AA6877B8DC25297C4E2515DC3F3290A372368C9D9` (18 changed paths) and its
receipt `candidate-comparison.json`. The published definition was read back by hash from the row
of Dataverse of the flow, which is the route the platform accepts for a solution-aware cloud flow.

| Rule | Where it lands in the definition |
| --- | --- |
| R1 | The guard `Es_Rol_No_Deseado` of the deletion loop already deleted the rows whose (person, kind) key is not in the desired set. |
| R2 | The quality row is only created when the JSON describes a quality person (`Si_el_JSON_trae_calidad`), the same guard the security path already had. Before this change the flow created a row with an empty user and added an empty login to the group when the JSON carried no quality person. |
| R3 | A new catalog lookup `Rol_Direccion` reads the kind by **title** (`Dirección`, never a literal) and a third condition of the guard of the deletion excludes it. |
| R4 | Unchanged: the row of the old person is deleted and the row of the new person is created. The identifier of the row still changes; the owner of the product was told and kept that behaviour for now. |
| R5 | The five branches that write a row that already holds the person (`Actualizar_Rol_Existente_*`) now also require that the name of the JSON is different. |
| R6 | **Not published.** See below. |
| R7 | The guard of the deletion keeps `length(body('Filtrar_Responsables_Validos')) >= 1`. |

## What was measured

The case is `scripts/flow-title-sync/prepare-rf15-role-authority-fixture.cjs`, over the payload of
the case of RF08. It uses three controlled identifiers (`900611901`, `900611902`,
`900611903`) that no other case used, and the two payloads carry the generation time of the JSON
(`2026-11-17T12:00:00.000Z` and `2026-11-17T13:00:00.000Z`) so the ordering guard of the parent
does not skip the case.

**Run 1 (the setup).** The JSON describes the root expediente `900611901` with a quality person
that no other expediente has (Martina), an engineer, a project manager and a security person. The
three child runs and the parent run **succeeded** (`14:33:50` … `14:35:23`), the log says
`Total 3, Nuevos 1, Actualizados 0, Fallidos 0, Antiguos 0` and the rows are:

| Row | Kind | Person | Modified |
| --- | --- | --- | --- |
| 1835 | 4 (quality) | Martina | 14:34:09 |
| 1836 | 3 (engineer) | Rosa María | 14:34:11 |
| 1837 | 2 (project manager) | Tatiana | 14:34:12 |
| 1838 | 5 (security) | Martina | 14:34:15 |

The two sibling expedientes of the payload were not created: they carry a parent that does not
exist in the system and the flow reports `no tiene ExpedientePadre en el sistema - Error`. They
are the control of the case, not rows of it.

Before run 2 a row of the `Dirección` kind (`1839`, id 7) was inserted by hand, the way the team
does it.

**Run 2 (the case).** The JSON of the root expediente no longer describes the quality role
(`responsableCalidad` with no user and no name). The parent run and the three child runs
**succeeded** and the rows are:

| Row | Kind | Person | Modified | What happened |
| --- | --- | --- | --- | --- |
| 1835 | 4 (quality) | Martina | — | **deleted.** The JSON does not describe the quality role any more. |
| 1836 | 3 (engineer) | Rosa María | 14:34:11 | **not written.** The person and the name did not change. |
| 1837 | 2 (project manager) | Tatiana | 14:34:12 | **not written.** |
| 1838 | 5 (security) | Martina | 14:34:15 | **not written.** |
| 1839 | 7 (Dirección) | Enrique | 14:38:09 | **untouched.** The kind is out of the scope of the flow. |

No row with an empty user was created, which is what the old flow did when the JSON carried no
quality person.

## The rule that could not be published: the removal from the group

The rule R6 asks the deletion to take the person out of the group of the role. The code is written
and ready (`GROUP_REMOVAL_ENABLED` in the generator), including the check that the person holds no
row of that kind in another expediente, so that a person who is still the quality person of
another expediente does not lose the access. **It is not published** because the REST API of this
tenant does not expose the removal of a member of a group. Measured on 2026-11-17 against the group
of the quality of DEV/CERT (id 36) with the session of the team:

| Request | Answer |
| --- | --- |
| `POST /_api/web/sitegroups(36)/removeUser` | 404 |
| `POST /_api/web/sitegroups/getbyid(36)/removeUser` | 404 |
| `POST /_api/web/sitegroups/getbyid(36)/users/removeUser` | 404 |
| `DELETE /_api/web/sitegroups/getbyid(36)/users('<login>')` | 400 (the raw login) and 500 (the encoded one) |
| `DELETE /_api/web/sitegroups(getbyid(36))/users(<id>)` | 404 |

The addition to a group works (it is a `POST .../users` with a `LoginName`) and the flow already
uses it, but the symmetric removal does not exist: an action that fails would break the ingestion of
every expediente whose role row is deleted. **Until the endpoint is available, the membership of a
group is changed by hand.**

The case also showed that the check is necessary: Martina is the quality person of the expediente
`1286` as well, so the flow must not take her out of the group when the row of the root
expediente is deleted.

## The residues of the case

The controlled data was removed with a read before and a read after: the four rows of
`Roles_usuario`, the row of `ExpedientesJSON`, the two rows of `Suministradores`, the five
files of the log library (the two logs and the three files of the state of the ordering guard) and
the file of the input library. The counts of the lists are the ones of the baseline
(`Roles_usuario` 1357, `ExpedientesJSON` 125, `Suministradores` 1166, `Expedientes` 8).

Two residues are left, both because the platform has no endpoint for them:

1. **Martina is still a member of the group of the quality of DEV/CERT.** The setup run added her
   (that is what the flow does when it creates a quality row) and the deletion did not take her
   out. The group had five members before the case and has six now. **It has to be removed by
   hand.**
2. The row of Dataverse of the expediente `900611901` is not removed: the case created it and the
   cleanup of the Dataverse was not run in this session.

## What is left open

- The removal from the group of the role (R6) waits for an endpoint that removes a member of a
  group.
- The identifier of a role row still changes when the person of a role changes (R4): the row is
  deleted and created again.
- The business decisions B5 (the duplicates of the leaf `900611367`) and B6 (the identity of a
  milestone) are still open.
- The promotion to PROD is a separate step and needs its own authorization.

## The files of the phase

- `scripts/flow-title-sync/prepare-role-authoritative-deletion.cjs` — the generator (10 tests).
- `scripts/flow-title-sync/prepare-role-authoritative-deletion.test.cjs` — the tests.
- `scripts/flow-title-sync/prepare-rf15-role-authority-fixture.cjs` — the two payloads of the case.
- `.atl/project-title-sync/role-authoritative-deletion-20261117/` — the candidate, the receipt and
  the payloads (ignored by git).

## The removal from the group: what was checked in the afternoon of 2026-11-17

The first conclusion ("the REST API of this tenant does not expose the removal of a member of a
group") was too quick, and it was wrong in the way that matters. **The session of the team can add
members of a group and cannot take them out**: the addition answers 201 and leaves the group as it
was, and every form of the removal answers 404 or 400. SharePoint answers 404 where it would
answer 403, so the most probable reading is a **permission of the session** and not a missing
endpoint.

### Every form that was tried with the session of the team

Against the group of the quality of DEV/CERT (id 36), with the session of the generic user:

| Request | Answer |
| --- | --- |
| `POST /_api/web/sitegroups(36)/removeUser` | 404 |
| `POST /_api/web/sitegroups/getbyid(36)/removeUser` | 404 |
| `POST /_api/web/sitegroups/getbyid(36)/users/removeUser` | 404 |
| `DELETE /_api/web/sitegroups/getbyid(36)/users('<login>')` | 400 (raw) and 500 (encoded) |
| `DELETE /_api/web/sitegroups(getbyid(36))/users(<id>)` | 404 |
| `DELETE /_api/web/sitegroups/getbyid(36)/users('i:0%23.f\|membership\|…')` | 500 |
| `POST /_api/web/sitegroups/getbyid(36)/removeUser` with the body as form | 404 |
| `DELETE /_api/web/siteusers/getById(<id>)/groups` | 400 |
| `POST /_api/web/sitegroups/getbyid(36)/users` with a `LoginName` (the addition) | **201, and the group does not change** |

The portal of Power Automate in DEV/CERT was also opened to look for a native operation of the
connector that removes a member: the catalogue of operations of the connector does not offer one
for groups, which is why the flow does the addition with a raw request.

### The action is published in DEV/CERT to be measured with the identity of the connection

The flow runs with the identity of the connection, not with the session of the team, so the flag
`GROUP_REMOVAL_ENABLED` of the generator is now **true** and the candidate `9C85364B…` (the same
one that was published before, with the removal inside) is live in DEV/CERT. **It is not in PROD**:
PROD keeps `E61C0AD9…`, the version without the removal, which is the one that was measured.

The measurement of the removal is **pending**: the case of the afternoon (the controlled
expediente `900611921`, whose quality person is the generic user, which holds no row of that kind
in any other expediente, so that the cross check of the flow lets the removal run) did not reach
the action. Two reasons, both measured:

1. **The parent takes one snapshot of the roles per run.** The parent reads the rows of
   `Roles_usuario` once (`Obtener_Roles_usuario`) and passes that snapshot to every call of the
   child. When the two payloads of the case entered the **same** run of the parent, the second one
   worked with a snapshot taken before the first one had written its rows: the deletion saw nothing
   to delete and the rows of the kinds that the JSON describes were written again, with new
   identifiers. The actions of the deletion loop appear as `Skipped` in the run.
2. **The environment queues the runs.** With the recurrence of five minutes and several runs in
   flight, the same payload was processed more than once (the logs of the case are four: the setup
   and the removal, each one twice) and the rows of the case ended up duplicated.

The rule for a case is therefore: **one payload per run of the parent**, and the second payload
only when the run of the first one has finished. The measurement of the removal has to be repeated
that way.

### A defect that the case uncovered

The snapshot of the roles is taken once per run of the parent, so **two payloads that enter the
library in the same run are reconciled against the same snapshot**: the second one cannot see the
rows that the first one just wrote, it writes them again with new identifiers and it does not
delete the rows that the JSON no longer describes. It is not a defect of the phase F (it was
already there), but it is a defect of the flow and it is worth writing down: in production the
library is fed by hand, one file at a time, and the window is narrow, but it exists.

### What is left of the removal

- The action is written, published in DEV/CERT and waiting for a clean measurement.
- **The membership of the group is changed by hand** in the meantime. The people page of the group
  (`/_layouts/15/people.aspx?MembershipGroupId=<id>`) lists the members and the removal is done
  from there.
- Two members are left in the group of the quality of DEV/CERT by these cases and they have to be
  taken out by hand: Martina (the case of the morning, which added her when the quality row was
  created and could not take her out because she is the quality person of the expediente `1286`
  as well) and the generic user (the case of the afternoon, which added him as the quality
  person of the controlled expediente).
