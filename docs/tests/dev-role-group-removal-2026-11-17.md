# The removal of the member of the group of a deleted role

Date: 2026-11-17 and 2026-11-18
Environment: DEV/CERT — `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF`
(environment `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`), and PROD for the promotion
Flow: the child `E2E_AltaExpedientes_Modulo1` (`1ca49582-ae1e-f111-8342-6045bde02c54`)
Status: **measured, it works.** The rule **R6** of the phase F is published in DEV/CERT and in PROD:
the person of a role row that the JSON no longer describes leaves the group of that kind, and only
when she holds no row of that kind in another expediente.

## The rule

The phase F made the JSON authoritative over the roles of an expediente: a role row the JSON does
not describe is deleted from `Roles_usuario`. The rule **R6** asks for one more thing: **the person
of that deleted row also leaves the group of the kind of that row** (the group `Calidad`, id 36 in
DEV/CERT and id 24 in PROD, for the quality kind; the group `Jefes de Proyecto` for the project
managers). The membership of a group is an access, and an access that belongs to a role that no
longer exists has to go with it.

## The endpoint

The member of a group is removed by **the identifier of the member**, not by the login:

```
DELETE /_api/web/sitegroups/getbyid(<groupId>)/users/getById(<id of the member>)
```

It answers 200 and the member leaves the group. The identifier is the identifier of the user in the
site, and the collection of the members of the group carries it. The login does not work in any
form, and the addition is the one of the flow (`POST .../users` with a `LoginName`, which answers
201).

The forms that were measured against the session of the team (the generic user) with the group
`Calidad` of DEV/CERT, and the answers:

| Request | Answer |
| --- | --- |
| `POST /_api/web/sitegroups(36)/removeUser` | 404 |
| `POST /_api/web/sitegroups/getbyid(36)/removeUser` | 404 |
| `POST /_api/web/sitegroups/getbyid(36)/users/removeUser` | 404 |
| `DELETE /_api/web/sitegroups/getbyid(36)/users('<login>')` | 404 (the collection is not keyed by the login) |
| `DELETE /_api/web/sitegroups/getbyid(36)/users/getByLoginName('<login>')` | 404 |
| `DELETE /_api/web/siteusers/getByName('<login>')/groups` | 404 |
| `POST /_api/web/PeopleManager/RemoveMembership?url=…` | 404 (the resource does not exist in this tenant) |
| **`DELETE /_api/web/sitegroups/getbyid(36)/users/getById(<id>)`** | **200, the member leaves the group** |

The identifier of the member is asked with the filter of the collection, and the filter that works
is by the **email** of the member:

```
GET /_api/web/sitegroups/getbyid(<groupId>)/users?$filter=Email eq '<login>'
```

Two details of the connector of SharePoint cost two of the attempts, and they are the reason why
this record is longer than the other ones:

- **The connector decodes the URI before it sends it.** A filter by the claim of the member
  (`i:0#.f|membership|<login>`) carries a `#`, and the decoded `#` cuts the query of the URI:
  SharePoint answers 400 and the action fails. The filter by the email has no character that the
  connector touches.
- **An expression inside a URI has to be wrapped in braces.** The value of a parameter that is a
  string is a literal: `@items('Por_cada_RolUsuario_Eliminar')?['usuario']` outside `@{…}` is sent as
  it is written, and the request fails in milliseconds, without reaching SharePoint.

## The case

The case is `scripts/flow-title-sync/prepare-rf15-role-authority-fixture.cjs`, over the payload of
the case of RF08. The controlled identifiers are new for each attempt (`900611931`, `900611941`,
`900611961` and `900611971` in DEV/CERT, `900611981` in PROD), and the data of every attempt was
removed before the next one, with a read before and a read after.

**The quality person of the controlled expediente is `enrique.hernandezsegura@telefonica.com`** in
DEV/CERT: he is the only member of the group `Calidad` that holds **no** row of the quality kind in
another expediente, so the cross check of the flow
(`Buscar_Otros_Expedientes_Con_El_Mismo_Rol`, the query that looks for another row of the same
person and the same kind in another expediente) lets the removal run.

That cross check is also the reason why the case of the afternoon of 2026-11-17 (RF16,
`900611921`) never reached the action: its quality person was the generic user, and the generic user
holds two quality rows (the expedientes `2001` and `2003`), so the flow was right not to take him
out of the group. The reason of that failure was the cross check, not the queue of the environment.

**The rule of a case: one payload per run of the parent.** The parent takes one snapshot of
`Roles_usuario` per run and passes it to every call of the child, so two payloads that enter the
library in the same run are reconciled against the same snapshot. The second payload is only
uploaded when the run of the first one has finished.

## The measurement that works (DEV/CERT, case RF21, expediente `900611971`)

**Run 1 (the setup).** The JSON describes the root expediente with a quality person (Enrique), an
engineer, a project manager and a documentation person. The parent run and the three child runs
**succeeded**, and the log says `Total 3, Nuevos 1, Actualizados 0, Fallidos 0, Antiguos 0` (the two
sibling expedientes of the payload carry a parent that does not exist in the system: they are the
control of the case, not rows of it). The rows of the root expediente:

| Row | Kind | Person | Modified |
| --- | --- | --- | --- |
| 1873 | 4 (quality) | ENRIQUE HERNANDEZ SEGURA | 06:30:12 |
| 1874 | 3 (engineer) | ROSA MARIA FUENTES HERRERO | 06:30:13 |
| 1875 | 2 (project manager) | TATIANA SHULCAQUINAUPA | 06:30:14 |
| 1876 | 5 (documentation) | MARTINA TORRALBA RODRIGUEZ | 06:30:17 |

Before run 2 a row of the `Dirección` kind (`1877`, kind 7) was inserted by hand, the way the team
does it.

**Run 2 (the case).** The JSON of the root expediente no longer describes the quality role
(`responsableCalidad` with no user and no name). The parent run and the three child runs finished,
and the rows are:

| Row | Kind | Person | Modified | What happened |
| --- | --- | --- | --- | --- |
| 1873 | 4 (quality) | Enrique | — | **deleted.** The JSON does not describe the quality role any more. |
| 1874 | 3 (engineer) | Rosa María | 06:30:13 | **not written.** The person and the name did not change. |
| 1875 | 2 (project manager) | Tatiana | 06:30:14 | **not written.** |
| 1876 | 5 (documentation) | Martina | 06:30:17 | **not written.** |
| 1877 | 7 (Dirección) | Enrique | 06:31:48 | **untouched.** The kind is out of the scope of the flow. |

**And the person left the group.** The group `Calidad` (id 36) had six members before the case and
has **five** after it: the person of the deleted row is not a member any more. The log of the run
says `Total 3, Nuevos 0, Actualizados 1, Fallidos 0, Antiguos 0`: **the ingestion does not break**.

The actions of the run of the child (the root of the payload,
`08584066232251858774908675943CU21`) say where it happened:

| Action | State | What it means |
| --- | --- | --- |
| `Eliminar_RolesUsuario` | Succeeded | the row of the quality was deleted |
| `Buscar_Otros_Expedientes_Con_El_Mismo_Rol` | Succeeded | the cross check ran and found no other row of that kind |
| `Obtener_el_miembro_del_grupo_calidad` | Succeeded | the member of the group was found |
| `Obtener_el_miembro_del_grupo_jefes` | Succeeded | the member of the other group was found |
| `Quitar_el_miembro_del_grupo_calidad` | Succeeded | the condition of the removal was true and the request ran |
| `Quitar_el_miembro_del_grupo_jefes` | Succeeded | the condition was false: the row is not of that kind |

The membership of the group was put back as it was before the case (the addition of a member is a
`POST .../users`, which answers 201), so the environment was left as it was and the proof is the
record of this measurement.

## The attempts that did not work, and what each one taught

| # | Candidate | What changed | What was measured | What it taught |
| --- | --- | --- | --- | --- |
| RF17 | `9C85364B…` | one `If` with an `and` of the cross check and an `or` of the two kinds, with two `If` actions inside | the deletion worked, the group did not change; the action `Quitar_el_miembro_del_grupo` failed without running any of its actions (RF17, `900611931`) | the request was the problem, not the deletion |
| RF18 | `1902B513…` | one `If` per kind, in the scope of the guard, with an `and` of two comparisons and no `or` | the `If` of the project managers was evaluated without any error in the same iteration of the loop and only the branch of the quality failed (RF18, `900611941`) | the shape of the condition was right; the endpoint of the request (`removeUser`) does not answer |
| RF19 | `B9A49D02…` | the removal by the identifier of the member, with the filter by the claim | the request of the member failed in 18 milliseconds, without reaching SharePoint (RF19, `900611961`) | the connector decodes the URI: the `#` of the claim cuts the query |
| RF20 | `67029121…` | the filter by the email of the member | the request of the member failed again in 18 milliseconds (RF20, `900611971`) | the expression of the login was in the URI without braces, so it was sent as a literal |
| **RF21** | **`E4E823CE…`** | **the same, with the expression wrapped in braces** | **the person left the group and the ingestion did not break** (RF21, `900611971`) | — |

The generator is `scripts/flow-title-sync/prepare-role-group-removal.cjs` (with its ten offline
tests) and the base it is built over is the released candidate of the phase F without the removal
(`2D1C1668…`), which `scripts/flow-title-sync/prepare-role-group-removal-base.cjs` rebuilds and
checks by hash.

## The promotion to PROD

The promotion is a **port**, not a copy: the definition that is published in PROD keeps its own
wiring (the parameters of the environment, the authentication of the actions and the schema of the
trigger) and receives the logic of the phase. The script is
`scripts/flow-title-sync/prepare-prod-role-group-removal.cjs`, the candidate moves the same five
paths and nothing else, and its hash is `97D20BA2…`. The measurement in PROD is in
[the record of the promotion](../changes/prod-role-group-removal-2026-11-18.md).

## The residues of the cases

The data of every case was removed with a read before and a read after: the rows of
`Roles_usuario`, the row of `ExpedientesJSON`, the two rows of `Suministradores`, the files of the
log of the ingestion and the state of the ordering guard, and the row of Dataverse of the
expediente. The counts of the lists are the ones of the baseline: `Roles_usuario` 1357,
`ExpedientesJSON` 125, `Suministradores` 1166, `Hitos` 50, `Expedientes` 8, and 128 rows of
`cr435_expedientes` in Dataverse.

The membership of the group was put back as it was before every case. The generic user, who was
added to the group of the quality of DEV/CERT by the case of the afternoon of 2026-11-17, was taken
out by hand on 2026-11-17 with the postback of the people page of the group.

## The defect of the parent that the case uncovered

The parent takes one snapshot of `Roles_usuario` per run and passes it to every call of the child,
so **two payloads that enter the library in the same run are reconciled against the same
snapshot**: the second one cannot see the rows that the first one just wrote, it writes them again
with new identifiers and it does not delete the rows that the JSON no longer describes. It is not a
defect of the phase F, it was already there, and it is written down in
[the investigation of the reconciliation](../investigations/role-authoritative-reconciliation.md).

## What is left open

- The identifier of a role row still changes when the person of a role changes (R4): the row is
  deleted and created again.
- The business decisions B5 (the duplicates of the leaf `900611367`) and B6 (the identity of a
  milestone) are still open.
- A member of a group whose row was deleted by other means (a row that was deleted before the rule
  was published) stays in the group: the flow only takes out the members of the rows it deletes.

## The files of the measurement

- `scripts/flow-title-sync/prepare-role-group-removal.cjs` — the generator (ten offline tests in
  `prepare-role-group-removal.test.cjs`).
- `scripts/flow-title-sync/prepare-role-group-removal-base.cjs` — rebuilds the base of the phase.
- `scripts/flow-title-sync/prepare-prod-role-group-removal.cjs` — the port of the candidate to PROD.
- `scripts/flow-title-sync/prepare-rf15-role-authority-fixture.cjs` — the two payloads of a case.
- `.atl/project-title-sync/role-group-removal-20261117/` — the candidate, its receipt and the base
  (ignored by git).
- `.atl/project-title-sync/prod-role-group-removal-20261117/` — the candidate of PROD and its receipt
  (ignored by git).
