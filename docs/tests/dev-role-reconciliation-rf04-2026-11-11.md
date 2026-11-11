# DEV role reconciliation RF04: phases 1 and 2a applied, the duplication is gone

**The role duplication of RF03 is fixed.** Phases 1 (role existence guard) and 2a (role title convergence) were applied to the DEV child on 2026-11-11 and measured on fresh controlled identifiers: an update and a rename of the same in-flight expediente now leave the role table exactly where it was, one row per role kind, with the display names taken from the JSON. The release still stays HOLD: the scoped deletion (phase 2b) is not applied, the supplier and milestone rows are still recreated on every ingestion, and re-provisioning on update is still undefined.

## Session and transport

| Item | Observed |
| --- | --- |
| Identity | `USUARIO GENERICO APLICACION DYS350 RTEL TF04622` (`ug03573@telefonica.com`) |
| Site | `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF` — the CERT site the DEV bindings point to |
| Environment | `DyS350_TF_E_DEV` (`aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`) — DEV/CERT only, PRO untouched |
| Flow under test | child `E2E_AltaExpedientes_Modulo1` (`1ca49582-ae1e-f111-8342-6045bde02c54`), called by parent `E2E_AltaExpedientes` (`a9928111-cd13-f111-8341-7c1e5233f7d8`) |
| Transport | Authenticated browser session; SharePoint REST with a request digest from `_api/contextinfo`; flow definition read, validated and written through the platform APIs with the Power Platform token held in the portal MSAL cache |
| Uploads | Three files, each HTTP 200, each byte identical to the prepared payload (SHA-256 `1882DBA4…`, `414AD60E…`, `FBA17FE5…`) |
| Trigger | SharePoint `GetOnNewFileItems` on `cargaJSON_entrada` (list id `b33c8a3e-7640-48fb-88a1-39b1a802bba0`), five minute recurrence — the delay between upload and processing is the trigger polling, not a failure |
| Identifiers | root `900611601`, child `900611602`, leaf `900611603`, confirmed absent in CERT before the first upload |

## What was applied, and how

The portal flow editor does not load in the embedded browser and the flow API refuses the published runtime definition, so the definition was written where the platform stores it: the Dataverse row of the flow. `workflows.clientdata` in the environment Dataverse holds `{ schemaVersion, properties: { connectionReferences, definition, templateName } }`; replacing only `properties.definition` and keeping `connectionReferences` and `templateName` untouched publishes the change, the flow API readback returns the new definition and the flow stays `Started`. The full reasoning, including the three API rejections, is in [the investigation record](../investigations/role-authoritative-reconciliation.md#how-the-definition-is-applied).

| Step | Definition hash (canonical, SHA-256) | Change | Validator | Bindings |
| --- | --- | --- | --- | --- |
| Published before | `8B9A82F1…` | — | — | CERT site, `E2E_ListaRolesUsuario` `4f76ac2a…` |
| Phase 1 applied | `B419F64A…` | 9 changed paths, all role existence checks, compared by the normalized key `toLower(trim(string(coalesce(usuario,'')))) + '-' + IDRol` | 0 errors, 0 warnings | unchanged |
| Phase 2a applied | `568D3028…` | 10 actions added: five `Buscar_Rol_Existente_<Kind>` + five `Actualizar_Rol_Existente_<Kind>` | 0 errors, 0 warnings | unchanged |

`staticResults` was not touched, so the role deletion stays the reviewed mock (`Eliminar_RolesUsuario0`): phase 2b is **not** applied by this change.

## What was measured

| Case | Input consumed | Processed | Log | Roles total | Leaf roles | Leaf split (jefe / ing / cal / seg) |
| --- | --- | --- | --- | --- | --- | --- |
| Precheck | — | 123 | 105 | 1391 | 0 | — |
| RF04a creation | yes | 124 | 106 | 1403 | **4** | 1 / 1 / 1 / 1 |
| RF04b update | yes | 125 | 107 | **1403** | **4** | 1 / 1 / 1 / 1 |
| RF04c rename | yes | 126 | 108 | **1403** | **4** | 1 / 1 / 1 / 1 |

**RF04a** created the hierarchy: each of the three expedientes ends with exactly four role rows, one per role kind (`IDRol` 2 project lead, 3 engineering, 4 quality technician, 5 security). The leaf rows are `1711` (quality, Natalia Casán García), `1712` (project lead, Tatiana Shulca Quinaupa), `1713` (engineering, Rosa María Fuentes Herrero) and `1714` (security, Martina Torralba Rodríguez). The parent run that processed it is `08584072083002793902021446117CU20`.

**RF04b** is the case RF03 failed: the same leaf ingested again with two changed scalars (`titulo`, `fechaoferta`). The role table did not move — 1403 rows before and after, the leaf still 1 / 1 / 1 / 1, no new row and no recreated row.

**RF04c** keeps every email and changes three display names. The three affected rows kept their ids (`1711`, `1712`, `1713`) and their Titles became `Natalia Casán García (TEST 2A)`, `Tatiana Shulca Quinaupa (TEST 2A)` and `Rosa María Fuentes Herrero (TEST 2A)`; the security row (`1714`) kept its Title. Still four rows, list total still 1403.

The prediction written down before the RF03 run (`1 / 1 / 1 / 1` after the fix) is now an observation.

## The data of an already ingested expediente is updated too

The staging record of the controlled leaf carries the values of the last ingestion: `Title` = `DEV RF03 update validation - 900611503` and `FechaOferta` = `2026-11-10`, the two scalars that RF04b changed. The action that patches it (`Actualizar_ExpedienteJSON`) carries `staticResultOptions: "Disabled"`, so the write is real. This is the record the flow reads to decide that the expediente already exists; the same ingestion also updates the roles.

The patch of the **provisioned** list (`Expedientes`, 36 fields including `Title`) was not re-exercised at runtime in this session. In this DEV copy the creation of a row in that list is mocked (`Create_item0`), so a JSON never creates one there: the list holds only the eight demo expedientes, and probing them would overwrite their `Miembros` and role state. That path stays unproven and is listed as open below.

## New defect measured: supplier and milestone rows are recreated on every ingestion

In the update branch the child flow deletes and re-creates both child tables. `Comprobar_que_hay_Hitos` (If `length(body('Recoger_Hitos_del_Expediente')) >= 1`) leads to `Por_cada_Hito_Eliminar` → `Eliminar_Hito` (DeleteItem), and `Comprobar_que_hay_Suministradores` leads to `Por_cada_Suministrador_Eliminar` → `Eliminar_Suministrador`; the creation (`Por_cada_Hito` → `Crear_Hitos`, `Por_cada_suministrador` → `Crear_Suministrador`) follows. Measured on the controlled leaf between two consecutive ingestions: the supplier row id went **1839 → 1840** and the milestone row id **641 → 642**.

The row count stays correct, the identifiers do not. Anything that points at those rows — a supply-expediente link, a milestone, a signature that references the row id — loses its target, and the previous values are gone. The same symmetric difference used for the roles has to be applied to both tables, keyed by `IDProyecto + IDSuministrador + IDPadre + IDExpedienteSuministrador` for suppliers and by `IDProyecto + IDHitoExpediente` for milestones. The milestone key needs a decision first: in the controlled fixture `IDHitoExpediente` is null, so the milestone identity has to come from another field.

## Limits

- DEV/CERT only. PRO was never read, written or authorized in this session.
- One controlled hierarchy (`900611601`/`900611602`/`900611603`) was created and ingested three times. No business JSON was replayed and no other expediente was touched.
- The role deletion stays disabled: the mock `Eliminar_RolesUsuario0` is still in place and phase 2b is not applied.
- The controlled test data stays in CERT on purpose as evidence: `900611501`–`900611503` (RF03, with the duplication that proves the pre-fix defect) and `900611601`–`900611603` (RF04, the post-fix evidence). Its cleanup is a separate decision and the row ids are in this report and in the RF03 one.
- The provisioned-list patch, the supplier/milestone identifiers, the scoped deletion and re-provisioning on update are not settled by this run.

## Next

1. Decide B1–B5 in the investigation record and apply phase 2b, or record that a role the JSON stops describing stays.
2. Build and measure the supplier and milestone reconciliation, after settling the milestone identity.
3. Confirm with the business whether an update is expected to re-provision (folders, permissions, groups) an expediente that is already in flight.
4. Probe the provisioned-list patch on a controlled expediente once one exists that can be modified without corrupting demo data.
5. Clean up the controlled identifiers when the evidence is no longer needed.

Receipt: ignored `.atl/project-title-sync/rf04-20261111/`.
