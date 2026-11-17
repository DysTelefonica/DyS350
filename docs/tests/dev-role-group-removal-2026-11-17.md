# DEV/CERT: the removal of the member of the group of a deleted role

Date: 2026-11-17
Environment: DEV/CERT — `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF`
(environment `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`)
Flow: the child `E2E_AltaExpedientes_Modulo1` (`1ca49582-ae1e-f111-8342-6045bde02c54`)
Status: **measured twice, and it does not work.** The deletion of the role row is the part of the
phase F that is released; the removal of the person from the group of the role is **not published
in any environment**, because the request of the removal answers an error with the identity of the
connection of the flow.

## The question

The phase F made the JSON authoritative over the roles of an expediente: a role row the JSON does
not describe is deleted from `Roles_usuario`. The rule **R6** of that phase asks for one more
thing: **the person of a deleted row also leaves the group of the kind of that row** (the group
`Calidad`, id 36, for the quality kind; the group `Jefes de Proyecto` for the project managers).

The code was written and published in DEV/CERT, and the case of the afternoon of 2026-11-17 did
not reach the action. This report closes that measurement with two controlled cases and states
what the result is.

## How the case is built

The controlled identifiers are new (`900611931` for the first attempt and `900611941` for the
second one), so the case starts with no state of a previous case: the ordering guard of the parent
keeps the generation time of the JSON and a file with an older instant is skipped as `Antiguo`.
The fixture is `scripts/flow-title-sync/prepare-rf15-role-authority-fixture.cjs`, over the payload
of the case of RF08.

**The quality person of the controlled expediente is `enrique.hernandezsegura@telefonica.com`.**
He is the only member of the group `Calidad` of DEV/CERT that holds **no** row of the quality kind
in another expediente, so the cross check of the flow
(`Buscar_Otros_Expedientes_Con_El_Mismo_Rol`, the query that looks for another row of the same
person and the same kind in another expediente) lets the removal run.

That cross check is also the reason why the case of the afternoon (RF16, `900611921`) never
reached the action: its quality person was the generic user, and the generic user holds two
quality rows (the expedientes `2001` and `2003`), so the flow was right not to take him out of the
group. The reason of that failure was the cross check, not the queue of the environment.

**The rule of the case: one payload per run of the parent.** The parent takes one snapshot of
`Roles_usuario` per run and passes it to every call of the child, so two payloads that enter the
library in the same run are reconciled against the same snapshot. The second payload is only
uploaded when the run of the first one has finished.

## Run 1 (the setup)

The JSON describes the root expediente with a quality person (Enrique), an engineer, a project
manager and a documentation person. The parent run and the three child runs **succeeded**, and the
log says `Total 3, Nuevos 1, Actualizados 0, Fallidos 0, Antiguos 0` (the two sibling expedientes
of the payload carry a parent that does not exist in the system: they are the control of the case,
not rows of it). The rows of the root expediente are:

| Row | Kind | Person | Modified |
| --- | --- | --- | --- |
| 1858 | 4 (quality) | ENRIQUE HERNANDEZ SEGURA | 22:24:30 |
| 1859 | 3 (engineer) | ROSA MARIA FUENTES HERRERO | 22:24:31 |
| 1860 | 2 (project manager) | TATIANA SHULCAQUINAUPA | 22:24:32 |
| 1861 | 5 (documentation) | MARTINA TORRALBA RODRIGUEZ | 22:24:35 |

Before run 2 a row of the `Dirección` kind (`1862`, kind 7) was inserted by hand, the way the team
does it.

## Run 2 (the case)

The JSON of the root expediente no longer describes the quality role (`responsableCalidad` with no
user and no name). The parent run and the three child runs finished, and the rows are:

| Row | Kind | Person | Modified | What happened |
| --- | --- | --- | --- | --- |
| 1858 | 4 (quality) | Enrique | — | **deleted.** The JSON does not describe the quality role any more. |
| 1859 | 3 (engineer) | Rosa María | 22:24:31 | **not written.** The person and the name did not change. |
| 1860 | 2 (project manager) | Tatiana | 22:24:32 | **not written.** |
| 1861 | 5 (documentation) | Martina | 22:24:35 | **not written.** |
| 1862 | 7 (Dirección) | Enrique | 22:26:02 | **untouched.** The kind is out of the scope of the flow. |

**The group did not change.** The group `Calidad` (id 36) had seven members before the case and has
seven members after it: the person of the deleted row did **not** leave the group. The log of the
run says `Total 3, Nuevos 0, Actualizados 1, Fallidos 1, Antiguos 0`: the scope of the child
failed, so the ingestion of that expediente is recorded as **failed** even though the row was
deleted.

## The first attempt (RF17, expediente `900611931`)

The removal was written as one `If` (`Quitar_el_miembro_del_grupo`) whose condition was an `and` of
the cross check and an `or` of the two kinds that own a group, with two `If` actions inside it. The
run (parent `08584066536885792658508958632CU05`, child `08584066535441836257817154313CU19`) shows:

| Action | State | What it means |
| --- | --- | --- |
| `Eliminar_RolesUsuario` | Succeeded | the row of the quality was deleted |
| `Buscar_Otros_Expedientes_Con_El_Mismo_Rol` | Succeeded | the cross check ran and found no other row of that kind |
| `Quitar_el_miembro_del_grupo` | **Failed** (five repetitions) | the removal did not happen |
| `Quitar_del_grupo_de_jefes`, `Quitar_del_grupo_de_calidad` | Skipped | the branch was not entered |

The measured rows are the same as in the table above (rows `1853` to `1857` in that case): the
quality row was deleted, the row of the `Dirección` kind survived, the three rows that did not
change kept their `Modified`, and the group did not change either.

## The second attempt (phase F2, flat conditions)

The generator `scripts/flow-title-sync/prepare-role-group-removal.cjs` (with its ten offline tests)
rewrites the removal with the vocabulary the flow itself uses for the same job in the milestones
and in the suppliers: **one `If` per kind**, in the scope of the guard of the deletion, with an
`and` of two comparisons and **no `or`**, and the request derived from the addition of the member
that the flow already does. The candidate moves three paths and nothing else; its hash is
`1902B513EE8A9221B380674F0BF3F51B47044F1BEE37E0D8208BBD5BF003B879` and it was published in DEV/CERT,
read back by hash.

The measurement of the second attempt is the case RF18 above (expediente `900611941`). The run
(parent `08584066525105096075610376529CU02`, child `08584066523656237877220996087CU13`) shows:

| Action | State | What it means |
| --- | --- | --- |
| `Eliminar_RolesUsuario` | Succeeded | the row of the quality was deleted |
| `Buscar_Otros_Expedientes_Con_El_Mismo_Rol` | Succeeded | the cross check ran and found no other row of that kind |
| `Quitar_el_miembro_del_grupo_jefes` | Succeeded | the condition of the project managers is false (the row is not of that kind) and the shape of the condition is right |
| `Quitar_el_miembro_del_grupo_calidad` | **Failed** | the request of the removal of the quality group failed |
| `Quitar_a_la_calidad_del_grupo` | Skipped | the branch was not entered |

## The conclusion

The deletion of the role row works and is released. **The removal of the member of the group does
not work.** The request is

```
POST /_api/web/sitegroups/getbyid(<groupId>)/removeUser
body: {userLoginName: i:0#.f|membership|<login>}
```

and it answers an error **with the identity of the connection of the flow**, the same way it
answers 404 with the session of the team (nine forms of the endpoint were measured against the
session of the team: 404, 400 and 500). The symmetric addition (`POST .../users` with a
`LoginName`) answers 201 and the flow already uses it, so the flow can put a person in a group but
cannot take one out.

Two details of the measurement are worth keeping:

- The condition of the removal is not the problem. In the second attempt the `If` of the project
  managers, with the same shape and the same kind of comparison, was evaluated without any error
  in the same iteration of the loop; only the branch that asks for the group of the quality failed.
- A failed removal **breaks the ingestion**: the scope of the child fails, the log records the
  expediente as `Fallido` and the counters of the run add it to the failed ones. A change that
  fails cannot be published.

**Until the endpoint answers, the membership of a group is changed by hand**, from the people page
of the group (`/_layouts/15/people.aspx?MembershipGroupId=<id>`), which is a postback of the page
and not a REST call.

## What was put back

DEV/CERT was put back to the released candidate: the definition of the child flow reads back with
the hash `2D1C16687BB67BE45EE9A33AA6877B8DC25297C4E2515DC3F3290A372368C9D9`, the same candidate that
is live in PROD (`E61C0AD9C0524FAA6D030EABEBF26CDCF868D8F8B372D3C4889CA9D634D609D7` in the
environment of PROD, with the wiring of PROD). The removal is not published anywhere.

## The residues of the cases

The setup runs added two members to the group `Calidad` of DEV/CERT (id 36) that the flow could not
take out, and the state of the group was checked and cleaned by hand afterwards:

- **The generic user** (`ug03573@telefonica.com`) was added by the setup of the case of the
  afternoon (RF16), when it was the quality person of the controlled expediente. He is a test
  account and his membership was a residue of the case: **he was removed by hand on 2026-11-17**,
  from the people page of the group, with the postback of the page. The group has six members now,
  and they were read back with the REST API.
- **Martina** was added by the setup of the case of the morning (RF15). **She stays in the group**:
  she is the quality person of the expediente `1286`, so her membership is what the rule of the
  flow produces for a quality person. Removing her would leave the group less consistent than the
  flow, not more.

The removal by hand is a postback of the people page of the group, not a REST call: the form of the
page is posted with `__EVENTTARGET=ctl00$PlaceHolderMain$BtnRemoveUsersFromGroup`, the digest and
the view state, and the hidden field `HdnUsersToRemove` carries the identifier of the member.

The data of the cases was removed with a read before and a read after: the four rows of
`Roles_usuario`, the row of `ExpedientesJSON`, the two rows of `Suministradores`, the files of the
log of the ingestion and the state of the ordering guard, the file of the input library and the row
of Dataverse of the expediente. The counts of the lists are the ones of the baseline:
`Roles_usuario` 1357, `ExpedientesJSON` 125, `Suministradores` 1166, `Hitos` 50, `Expedientes` 8,
and 128 rows of `cr435_expedientes` in Dataverse.

## The defect of the parent that the case uncovered

The parent takes one snapshot of `Roles_usuario` per run and passes it to every call of the child,
so **two payloads that enter the library in the same run are reconciled against the same
snapshot**: the second one cannot see the rows that the first one just wrote, it writes them again
with new identifiers and it does not delete the rows that the JSON no longer describes. It is not a
defect of the phase F, it was already there, and it is written down in
[the investigation of the reconciliation](../investigations/role-authoritative-reconciliation.md).

## What is left open

- The removal of the member of the group waits for an endpoint that answers. Until then the
  membership is changed by hand.
- The identifier of a role row still changes when the person of a role changes (R4): the row is
  deleted and created again.
- The business decisions B5 (the duplicates of the leaf `900611367`) and B6 (the identity of a
  milestone) are still open.

## The files of the measurement

- `scripts/flow-title-sync/prepare-role-group-removal.cjs` — the generator of the second attempt
  (ten offline tests in `prepare-role-group-removal.test.cjs`). **Its candidate is not published.**
- `scripts/flow-title-sync/prepare-rf15-role-authority-fixture.cjs` — the two payloads of the case.
- `.atl/project-title-sync/role-group-removal-v2-20261117/` — the candidate of the second attempt
  and its receipt (ignored by git).
- `.atl/project-title-sync/role-authoritative-deletion-20261117/` — the payloads of the cases
  (ignored by git).
