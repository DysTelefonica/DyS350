# PROD: the removal of the member of the group of a deleted role

Date: 2026-11-18
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF`
(environment `80cfcc42-c966-ebc6-8934-9cd1802f9e53`)
Flow: the child `E2E_AltaExpedientes_Modulo1` (`1ca49582-ae1e-f111-8342-6045bde02c54`)
Status: **applied in PROD and measured with a controlled case.**

## What was published

The rule **R6** of the phase F: **the person of a role row that the JSON no longer describes
leaves the group of that kind**, and only when she holds no row of that kind in another
expediente (the check that stops the flow from taking the access away from a person who is still
the quality person somewhere else).

| Flow | Before | After |
| --- | --- | --- |
| `E2E_AltaExpedientes_Modulo1` (the child) | `E61C0AD9C0524FAA6D030EABEBF26CDCF868D8F8B372D3C4889CA9D634D609D7` | `97D20BA24E01CEEB3DFF506C532FF3BE0F26C1EBE41E100AC73C0E0A51B5A1E9` |

The promotion was a **port**, not a copy: the wiring of PROD (the eleven parameters of the
environment, the authentication of the actions and the schema of the trigger) was kept and the
difference against the definition that was live in PROD is exactly the five paths of the phase:

| Path | What it does |
| --- | --- |
| `…Es_Rol_No_Deseado.actions.Buscar_Otros_Expedientes_Con_El_Mismo_Rol` | the query that looks for another row of the same person and the same kind in another expediente |
| `…Es_Rol_No_Deseado.actions.Obtener_el_miembro_del_grupo_calidad` | the member of the group of the quality, with the filter of the collection by the email |
| `…Es_Rol_No_Deseado.actions.Obtener_el_miembro_del_grupo_jefes` | the member of the group of the project managers |
| `…Es_Rol_No_Deseado.actions.Quitar_el_miembro_del_grupo_calidad` | the removal of the member of the group of the quality |
| `…Es_Rol_No_Deseado.actions.Quitar_el_miembro_del_grupo_jefes` | the removal of the member of the group of the project managers |

The request of the removal is `DELETE /_api/web/sitegroups/getbyid(<group>)/users/getById(<id of the
member>)`: the member is removed by **the identifier of the member of the group**, and not by the
login, which is the form that answers. The whole work, with the five attempts that it took to get
there, is in the branch `DEV/CERT`, in `docs/tests/dev-role-group-removal-2026-11-17.md`.

## The measurement

The case is the same one that was measured in DEV/CERT, with the controlled identifier
`900611981` and the **generic user** (`ug03573@telefonica.com`) as the quality person of the
controlled expediente: he is a member of the group `Calidad` of PROD (id 24) and he holds **no**
row of the quality kind in another expediente, so the cross check of the flow lets the removal run.

**Run 1 (the setup).** The parent run and the three child runs **succeeded**. The log says
`Total 3, Nuevos 1, Actualizados 0, Fallidos 0, Antiguos 0` (the two sibling expedientes of the
payload carry a parent that does not exist in the system: they are the control of the case). The
rows of the root expediente are `361` (quality, the generic user), `362` (engineer), `363` (project
manager) and `364` (documentation).

Before run 2 a row of the `Dirección` kind (`365`, kind 7) was inserted by hand, the way the team
does it.

**Run 2 (the case).** The parent run `08584066228274402867789255707CU29` and the three child runs
**succeeded**. The rows are:

| Row | Kind | Person | What happened |
| --- | --- | --- | --- |
| 361 | 4 (quality) | the generic user | **deleted.** The JSON does not describe the quality role any more. |
| 362 | 3 (engineer) | Rosa María | **not written.** The person and the name did not change. |
| 363 | 2 (project manager) | Tatiana | **not written.** |
| 364 | 5 (documentation) | Martina | **not written.** |
| 365 | 7 (Dirección) | the generic user | **untouched.** The kind is out of the scope of the flow. |

**And the person left the group.** The group `Calidad` of PROD had **eight** members before the
case and has **seven** after it. The log of the run says `Total 3, Nuevos 0, Actualizados 1,
Fallidos 0, Antiguos 0`: **the ingestion does not break**.

The actions of the run of the child (the root of the payload,
`08584066228211311581065711305CU05`) say where it happened: `Eliminar_RolesUsuario` **Succeeded**,
`Obtener_el_miembro_del_grupo_calidad` **Succeeded**, `Obtener_el_miembro_del_grupo_jefes`
**Succeeded**, `Quitar_el_miembro_del_grupo_calidad` **Succeeded**,
`Quitar_el_miembro_del_grupo_jefes` **Succeeded**, and the `Catch` of the flow was **Skipped** (there
was no failure to catch).

## The cleanup

The data of the case was removed with a read before and a read after: the four rows of
`Roles_usuario`, the row of `ExpedientesJSON`, the two rows of `Suministradores`, the files of the
log of the ingestion and the state of the ordering guard, and the row of Dataverse of the
expediente. The membership of the group was put back as it was before the case (the addition of a
member is a `POST .../users`, which answers 201), so the group has its eight members again.

The counts of the lists of PROD are the ones of the baseline: `Roles_usuario` 233,
`ExpedientesJSON` 20, `Suministradores` 78, `Hitos` 35, `Expedientes` 11, and 43 rows of
`cr435_expedientes` in Dataverse.

## What is left

- A member of a group whose row was deleted by other means (a row deleted before the rule was
  published) stays in the group: the flow only takes out the members of the rows it deletes.
- The identifier of a role row still changes when the person of a role changes, and the business
  decisions B5 and B6 are still open.
