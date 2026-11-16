# Full synchronization of expedientes: gap analysis against the specification

The role reconciliation that the specification demands is **built and measured** in DEV/CERT: the key is `Expediente + Rol + Usuario`, a user that disappears is deleted, a new one is added, and the identifiers of the rows survive. The synchronization of the **rest** of the expediente data exists for 40 of the 49 fields the JSON carries, but it is 40 hard-coded expressions repeated in three destinations, with no difference calculation, no field-level completeness guard, no detection of unknown fields and no per-synchronization trace. Two of the roles of the catalog are never written, and one of them is the Dirección, which the team sets by hand for now.

This document is the mandatory prior analysis (sections 2 and 12 of the specification). It is written from the published code and from the real JSONs, not from the manual.

## Quick path

1. Read the [status of every requirement](#status-of-every-requirement) and the [four P0 and P1 gaps](#the-gaps).
2. Check the [field mapping](#the-field-mapping) and the [role recognition](#the-role-reconciliation-as-it-is) against the real JSON.
3. Take the [plan](#the-plan) and decide the two business questions it raises.

## What was read

| Source | Identity |
| --- | --- |
| Published child flow `E2E_AltaExpedientes_Modulo1` | `FDBC92DE…`, `Started`, 161 actions |
| Published parent flow `E2E_AltaExpedientes` | `5AFAFE77…`, `Started`, 43 actions |
| Real JSONs of the controlled cases | 12 expedientes across 8 files |
| Environment | DEV/CERT, `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b` |

The child definition was read from the environment API and its hash was compared with the candidate of the phase 3: they are the same, so what follows describes the code that is running.

## The system as it is

```
Parent  E2E_AltaExpedientes  (trigger: a JSON file in /cargaJSON_entrada)
├── Comprobar_que_el_archivo_es_JSON
├── Try
│   ├── Get_file_content, Parse_JSON, Obtener_Roles            (the roles catalog)
│   ├── Obtener_ExpedienteJSON, Obtener_Hitos,
│   │   Obtener_Suministradores, Obtener_Roles_usuario          (the snapshots)
│   ├── Por_cada_Expediente
│   │   ├── Ejecutar_Flujo_E2E_Alta_Expedientes_Modulo1        (the child, with the snapshots as trigger files)
│   │   └── Append_ResultadoJSON, Increment_Nuevos/Actualizados/Fallidos
│   ├── Crear_Log_JSON                                          (the log, in /cargaJSON_log)
│   └── Anexar_Totales_a_ResultadoJSON, Validar_Limite_Snapshots
└── Catch: Crear_JSON_Fallido, Eliminar_JSON_despues_de_fallo

Child  E2E_AltaExpedientes_Modulo1  (trigger: the JSON + four snapshot files)
├── ExpedienteJSON (ParseJson), Obtener_ExpedientesSistema, Hitos,
│   Suministradores, RolesUsuario, Obtener_Roles, Filtrar_Responsables_Validos
├── Existe_ExpedienteJSON
│   ├── Actualizar_ExpedienteJSON            (staging list, 41 fields)
│   ├── Actualizar_Expediente_Sistema        (the application list, 36 fields)
│   ├── Obtener_Expediente_para_actualizar -> Existe_Expediente_en_DataVerse
│   │   └── Actualizar_Expediente_-_Dataverse (Dataverse, 37 fields)
│   ├── roles: Por_cada_Responsable_2 -> Jefe, Preventa, Ingenieria, Seguridad
│   ├── calidad: ResponsableCalidad, Rol_Tecnico_de_Calidad
│   ├── Por_cada_RolUsuario_Eliminar -> Es_Rol_No_Deseado -> Eliminar_RolesUsuario
│   ├── Por_cada_Hito_Eliminar -> Es_Hitos_No_Deseado -> Eliminar_Hito
│   └── Por_cada_Suministrador_Eliminar -> Es_Suministradores_No_Deseado -> Eliminar_Suministrador
└── Anexar_Resultado_Correcto
```

**The third flow.** The manual names a flow that this analysis did not see in the two published definitions: `E2E_AltaExpedientesAprovisionamiento` creates the folders and assigns the permissions, and it is **triggered by the creation of an item in the `Expedientes` list**. That is the mechanism behind the rule of section 7 of the specification: an update of the provisioned expediente does not re-provision it, because an update is not a creation.

**What belongs to whom.** The parent orchestrates and writes the log. The child reconciles. The `Expedientes` list is **not** created by the flow: the flow only reads it (`Obtener_Expediente_del_Sistema` filters by `IDExpediente`) and patches 36 of its columns. It is the application that owns those rows. The staging list `ExpedientesJSON` and the Dataverse table `cr435_expedientes` are created and owned by the flow.

## The field mapping

The JSON of an expediente carries 50 keys. The flow reads 41 of them and writes them to three destinations.

| Destination | Fields | Owner |
| --- | --- | --- |
| Staging `ExpedientesJSON` | 41 when it creates the row, 37 when it patches it | the flow |
| Application list `Expedientes` | 36 | the application (the flow only patches) |
| Dataverse `cr435_expedientes` | 37 when it creates the row, 32 when it patches it | the flow |
| `Roles_usuario` | `Title`, `usuario`, `IDRol`, `IDExpediente` | the flow |
| `Suministradores` | `Title`, `IDProyecto`, `IDSuministrador`, `IDPadre`, `IDExpedienteSuministrador` (+3 flags) | the flow |
| `Hitos` | `Title`, `IDProyecto`, `Importe`, `FechaHito`, `FechaGarantiaHito` | the flow |

The mapping is one to one and by name. Three details matter:

- The five fields the staging list has and the application list does not are `IDExpediente`, `IDExpedientePadre`, `Nemotecnico`, `Ordinal` and `organoContratacion`. They are written only when the flow creates the staging row.
- The Dataverse renames five of them (`Title` to `cr435_name`, `Estado` to `cr435_idestado`, `Observaciones` to `cr435_obser`, `Tipo` to `cr435_tipo`, `IDGradoClasificacion` to `cr435_gradoclasificacion`) and has no column for `Miembros`, `IDResponsableCalidad`, `IDResponsableSeguridad` or `OrdinalE2E`.
- `Estado` is a lookup in Dataverse: the flow writes the identifier, not the label.

### The JSON fields the flow never reads

| Field | Content in the real JSON | Consequence |
| --- | --- | --- |
| `anualidades` | `[]` | silently ignored |
| `lugaresEjecucion` | `[]` | silently ignored |
| `enperiododeadjudicacion` | `null` | silently ignored |
| `comerciales` | a list of commercial contacts | the commercial contacts of the expediente are never synchronized |
| `racs` | a list of name and email | the RACs are never synchronized |
| `objetocontrato` | free text | the purpose of the contract is never synchronized |
| `modificados` | `[]` | the list of modified fields is never read |
| `accesosharepoint` | the URL of the expediente in SharePoint | never read, so the flow cannot know which library to write to |
| `pecal` | the PECAL code of the expediente | never read: the flow writes `CadenaPecal`, a different key |

The specification asks explicitly for the unmapped fields to be **registered and notified**, never ignored in silence. They were ignored in silence until 2026-11-15: the schema of the parse does not accept a key the flow does not know, so a JSON that carries one of them is rejected, the file is kept for review and the log records that the expediente was not processed. The case is measured in [the RF08 report](../tests/dev-catalog-roles-and-unknown-fields-rf08-2026-11-15.md).

`OrdinalE2E` is **not** in this table: it is read, as `ordinale2e`, and the case of the template language resolves the difference. See [the disproven case](#disproven--the-case-of-ordinale2e).

### What the real JSONs prove about completeness

Across the 12 controlled expedientes of the eight case files, **no key is ever absent**: every field is either present with a value or present with `null`. Twelve fields are always `null` (`adjudicado`, `codproyecto`, `cods4h`, `enperiododeadjudicacion`, `fechacertificacion`, `fechadesestimada`, `fechaperdida`, `fechapreoferta`, `gradoclasificacion`, `importelicitacion`, `npedido`, `organocontratacion`).

That is the answer to the question of section 6: **the JSON is a complete state, and a `null` means that there is no value**. The flow writes the `null` as it is, which is correct for a complete JSON. The risk is the opposite case: a JSON that arrives **incomplete** would make the flow write `null` over the fields it does not carry, because the patch always sends all 37 fields. The roles have a guard for that (`Es_Rol_No_Deseado` fails closed when there is no valid responsable); **the fields have none**.

## The role reconciliation as it is

The key is exactly the one the specification asks for: `usuario + '-' + IDRol` inside the expediente, which is `Expediente + Rol + Usuario`. It is built into the variable `RolesUsuarioDeseados` and compared with the previous rows.

The catalog of the environment was read on 2026-11-14. It has seven roles:

| `IDRol` | Title |
| --- | --- |
| 1 | Preventa |
| 2 | Jefe de proyecto |
| 3 | Ingenieros |
| 4 | Técnicos de calidad |
| 5 | Técnicos de documentación |
| 6 | Personal externo |
| 7 | Dirección |

| Role | How the flow recognizes it | Identifier |
| --- | --- | --- |
| Jefe de proyecto | the flag `esjefeproyecto = Sí` of the responsible | read from the catalog by title (2) |
| Preventa | the flag `esPreventa = Sí` of the responsible | read from the catalog by title (1) |
| Calidad | the root object `responsableCalidad` | read from the catalog by title `Técnicos de calidad` (4) |
| Ingenieros | **every remaining responsible** (not jefe and not preventa) | the literal `3`, which is Ingenieros |
| Documentalistas | the root object `responsableSeguridad` | the literal `5`, which is Técnicos de documentación |
| Personal externo | **nothing** | 6, never written |
| **Dirección** | **nothing** | 7, never written |

Three findings come out of this table:

1. **Two roles of the catalog are never written: Personal externo (6) and Dirección (7).** A responsible of the `responsables` array that is neither jefe nor preventa becomes an Ingeniero, because that branch is the fallback of every remaining responsible. The JSON carries no flag for either role: the responsible only has `correosiempre`, `esjefeproyecto`, `esPreventa`, `correousuario` and `nombre`. The team sets the Dirección by hand for now, so the gap is accepted for the moment; Personal externo has no owner yet.
2. **The `responsableSeguridad` of the JSON is stored as documenters.** The root object `responsableSeguridad` is written with the literal `5`, which the catalog names `Técnicos de documentación`. The catalog has no security role at all, so either the field of the exporter is a legacy name or the model is missing a role. It is a business question of the same family as the Dirección.
3. **Two identifiers are literals.** The specification asks for the real identifiers and names of the existing list, resolved through the relations that already exist. `3` and `5` are hardcoded, so a change in the `Roles` list silently changes the meaning of the flow. The catalog reaches the child as a trigger file, so resolving the names against it is the same mechanism the flow already uses for the other three roles.

## Status of every requirement

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Synchronize all the fields of the expediente | partial | 41 of 50 fields; the 9 keys that are not read were ignored in silence until 2026-11-15, when the parse began to reject them |
| 2 | Prior analysis of the real structure | done | this document |
| 3 | Reconciliation of the roles by `Expediente + Rol + Usuario` | done | [RF04](../tests/dev-role-reconciliation-rf04-2026-11-11.md), [RF05](../tests/dev-role-reconciliation-rf05-2026-11-11.md) |
| 3 | The seven role kinds | partial | four written (Preventa, Jefe de proyecto, Calidad, Ingenieros), documenters by the `responsableSeguridad` field, Personal externo and Dirección never written |
| 4 | Update the data of an expediente that is already provisioned | done | [the provisioned row patch](../tests/dev-provisioned-row-patch-2026-11-12.md) |
| 5 | Centralized mapping, unknown fields registered | partial | the unknown fields are rejected and registered since 2026-11-15 ([RF08](../tests/dev-catalog-roles-and-unknown-fields-rf08-2026-11-15.md)); the mapping is still 40 expressions repeated three times |
| 6 | Tell a complete JSON from a partial one | done for the fields | the roles fail closed and the fields fail closed since 2026-11-14 ([RF07](../tests/dev-field-completeness-guard-rf07-2026-11-14.md)) |
| 7 | Provisioning and update without recreating | done | the identifiers survive every case; the parent does not re-provision on update |
| 8 | Centralized and reusable synchronization | partial | the reconciliation is centralized in the child; the field update is not |
| 9 | Safety: no loss, no overwrite of foreign data, no old update over a new one | partial | the application list is patched without checking which columns it owns; there is no ordering guard |
| 10 | Traceability of every synchronization | done for the fields | the log records the counters, the outcome and the fields that changed with their previous and new value since 2026-11-16 ([RF12](../tests/dev-change-trace-rf12-2026-11-15.md)) |
| 11 | The eighteen tests | partial | nine are measured, nine are not (the partial JSON is now measured in RF07) |

### The eighteen tests

| # | Test | Status |
| --- | --- | --- |
| 1 | identical JSON, no change | measured (RF03c and RF04) |
| 2 | change of the title | measured (RF04b) |
| 3 | change of the state | not exercised |
| 4 | several fields at once | partially (RF04b changed two scalars) |
| 5 | new users | measured (RF03a) |
| 6 | replacement of a jefe de proyecto | measured (RF04c) |
| 7 | several engineers | not exercised |
| 8 | replacement of a documentalista | not exercised |
| 9 | several roles for the same user | not exercised |
| 10 | removal of obsolete assignments | measured (RF05) |
| 11 | partial JSON without loss | measured (RF07): the partial JSON is rejected and the row keeps the values of the complete one |
| 12 | empty or wrong JSON | measured (RF05b, fail closed) |
| 13 | not provisioned expediente | measured (RF03a) |
| 14 | already provisioned expediente | measured (RF04b, RF06) |
| 15 | repeated processing | measured (RF03c) |
| 16 | concurrent or out of order updates | not exercised |
| 17 | errors of SharePoint during the update | not exercised |
| 18 | no other expediente is modified | measured (RF04, RF05, RF06) |

## The gaps

### Disproven — the case of `OrdinalE2E`

The exporter sends `OrdinalE2E` and the flow reads `ordinale2e`, which looked like a field that never reached SharePoint. **It was read on the nine controlled rows of the staging list on 2026-11-14, and the values are the ones of the JSON**: `990061`, `990062`, `990063`, `990064`, `990065`, `990066`, `990064`, `990065` and `990066` for `900611231`, `900611274`, `900611367`, `900611501`, `900611502`, `900611503`, `900611601`, `900611602` and `900611603`. The lookup of the template language resolves the case, so **there is no defect here**: this analysis was wrong on that point and the measurement corrects it.

### Closed — a partial JSON no longer wipes the fields it does not carry

The patch always sent the 37 fields, so a JSON that arrived with 30 of them wrote `null` over the other 7 columns of the staging list (the patch of the application list sends 36 and the patch of Dataverse 32, so 6 and 2 columns there). The roles were protected against exactly this; the fields were not. **It was closed on 2026-11-14**: the `ParseJson` action now requires the fifty keys of the exporter at the root of its schema, so a partial JSON fails the parse and nothing is written. The case is measured in [the RF07 report](../tests/dev-field-completeness-guard-rf07-2026-11-14.md).

### P1 — the application list is patched without checking its authority

The `Expedientes` list is created and maintained by the application. The flow patches 36 of its columns with the values of the JSON. The specification forbids overwriting the columns that the application owns without checking its authority. Today the flow cannot tell which columns are managed by the application and which are not.

### Closed — a field that the JSON adds is no longer ignored in silence

A new field of the exporter was ignored without a trace. **It was closed on 2026-11-15**: the schema of the parse declares exactly the fifty keys of the exporter and does not accept any other, so the JSON is rejected, the file is kept for review and the log records that the expediente was not processed. The columns are still never created automatically. The cases are measured in [the RF08 report](../tests/dev-catalog-roles-and-unknown-fields-rf08-2026-11-15.md) and in [the RF09 report](../tests/dev-exact-exporter-schema-rf09-2026-11-15.md), which also closes the two leftovers of the older shape that the schema still declared.

What the log does not say is the **name** of the field that broke the ingestion: the platform only says `The schema validation failed.` and the template language has no way to enumerate the keys of an object. Naming it is still open.

### Closed — the log of an ingestion says what changed

Every ingestion rewrites the 37 fields and the log records only the counters (`Nuevos`, `Actualizados`, `Fallidos`) and the outcome `Finalizado`. The specification asks for the fields that changed, their previous and new value, and the assignments that were added, removed and kept. The JSON already carries what is needed to start: `meta.generatedAt`, `meta.IDBatch` and `meta.IDExportacion`.

**The trace of the fields was closed on 2026-11-16** ([RF12](../tests/dev-change-trace-rf12-2026-11-15.md)): the log of the branch of an existing expediente carries the fields that moved, with the value they had and the value they have, and the two controls of the case carry an empty text. The trace of the assignments that were added, removed and kept is not part of this phase: the reconciliation of the roles already writes them and the log of the role branch says what it did.

### P2 — nothing prevents an old JSON from overwriting a new one

There is no comparison of the generation time of the JSON against the stored one. Two ingestions out of order end with the older one winning. The JSON carries `meta.generatedAt`, so the guard is one comparison. **The three things the guard needs were settled on 2026-11-16** (the state lives in a column of the staging row, the generation time travels inside the record the parent already sends, and the comparison is per expediente), so the phase can be built as it is: the next candidate, its case and its cleanup.

**The phase was opened on 2026-11-16 and it is not closed** ([the record](../tests/dev-ordering-guard-2026-11-16.md)). The decision is built: the parent compares the fourteen digits of the two instants, as numbers, and skips the whole branch of the expediente when the file is older. What is not solved is where the state lives: **no flow of the environment can write a new column of the list**, because the definition of the operations of its connection is a copy made before the column existed, and the platform refuses the parameter of the write. The state has to be a file of the library of the logs, which the parent writes without problem.

**The phase was opened on 2026-11-16 and it is not closed** ([the record](../tests/dev-ordering-guard-2026-11-16.md)). The decision is built: the parent compares the fourteen digits of the two instants, as numbers, and skips the whole branch of the expediente when the file is older. What is not solved is where the state lives: **no flow of the environment can write a new column of the list**, because the definition of the operations of its connection is a copy made before the column existed, and the platform refuses the parameter of the write. The state has to be a file of the library of the logs, which the parent writes without problem.

### Partly closed — the two role identifiers are resolved by name

`3` and `5` were written in the flow instead of being resolved from the `Roles` list, and Seguridad and Documentalistas share the `5`. **The identifiers were closed on 2026-11-15**: both now come from the catalog by name, the same mechanism the flow already uses for the other three roles, and the case proved that the identifiers do not change. What remains is the name of the role: the `responsableSeguridad` of the JSON is stored as `Técnicos de documentación` because the catalog has no security role, and the team has to say whether that is the intent.

### P2 — Dirección does not exist

The sixth role of the specification has no representation in the JSON schema and none in the flow. A responsible that is not jefe and not preventa becomes an Ingeniero, so a Dirección person would be given the wrong role. This needs a business answer: how does the exporter mark a Dirección?

## The plan

Each phase is a candidate built by a generator in `scripts/flow-title-sync/`, published in DEV/CERT and measured with a controlled case, exactly like the phases 1, 2a, 2b and 3.

| Phase | What it closes | How it is measured |
| --- | --- | --- |
| A | The completeness guard of the fields | **done on 2026-11-14** ([RF07](../tests/dev-field-completeness-guard-rf07-2026-11-14.md)) |
| B | The detection of the unknown fields | **done on 2026-11-15** ([RF08](../tests/dev-catalog-roles-and-unknown-fields-rf08-2026-11-15.md)): the JSON is rejected and nothing is created. The log records the failure but **not the name of the field**: the platform only says that the schema validation failed, and the template language cannot enumerate the keys of the payload ([RF09](../tests/dev-exact-exporter-schema-rf09-2026-11-15.md)) |
| C | The centralized mapping | **done on 2026-11-15** ([RF10](../tests/dev-centralized-mapping-rf10-2026-11-15.md)): one table drives the seven destinations, the generator rebuilds them and refuses a candidate that does not match the published one, and the case proved that the three destinations carry the same values |
| D | The difference calculation and the trace | **done on 2026-11-16** ([RF12](../tests/dev-change-trace-rf12-2026-11-15.md)): the candidate compares the row of the list before the write with the same row after it, in three expressions, because the platform accepts 8,192 characters per expression, and the log reads the three results with `outputs()`. The live candidate is `062C26A1…` and the trace was measured with it: `; ImporteContratacion: 111222.33 -> 555555.55; Observaciones: …[RF14…] -> …[RF13…]` |
| E | The ordering guard | **the decision is built and measured, the state is not**: the guard lives in the parent and compares the generation time of the file with the one of the expediente, but the state cannot be written in a column of the list, because the definition of the operations of the connection of both flows is a copy that does not know the new column ([the record of the phase](../tests/dev-ordering-guard-2026-11-16.md)) |
| F | The role identifiers by name | **done on 2026-11-15** ([RF08](../tests/dev-catalog-roles-and-unknown-fields-rf08-2026-11-15.md)) |

Phase E can be built without any business decision. D traces the columns of the staging list and writes the trace in chunks, and it was measured on 2026-11-16. The Dirección and the `responsableSeguridad` stay as they are for now, by decision of the team.

Phase E needs three things that the plan does not say yet. They were answered on 2026-11-16, reading
the published parent and child, and the answers are:

1. **Where the generation time of the last ingestion is kept.** In the staging row of the expediente,
   in a column of its own. The staging list is created and owned by the flow, the row is patched by
   the child on every ingestion, and the column is the only place that answers "when was this
   expediente last written by a file". It has to be a column and not one of the thirty seven
   business columns, because the generation time is not a datum of the expediente.
2. **How the generation time reaches the child.** Inside the record the parent already sends. The
   parent reads the envelope (`meta.generatedAt` and `meta.IDBatch`) of the uploaded file and calls
   the child once per expediente with the record of that expediente; the child's schema of the
   record does not have the envelope, so the parent adds the generation time to the record it
   builds and the child reads it from there. The parent does not need a new input and the child
   does not need a new parameter, only one property in the schema of the record.
3. **What "older" means.** Per expediente, and never per file. The `meta.generatedAt` is the
   generation time of the whole export, so all the expedientes of a file share it, but the state is
   the one of each expediente: a file that is partially newer and partially older is applied only to
   the expedientes whose stored generation time is older, and the others are rejected and logged.
   Two files with the same generation time are not a conflict: the second one is applied, because
   the export is a complete state and the order of two exports of the same instant is not defined.

## Checklist

A reviewer can confirm, without trusting this document:

- [ ] The published child hashes to `7E52849F…` (the candidate of RF08, applied on 2026-11-15) and the parent to `5AFAFE77…`, both `Started`.
- [ ] The staging list receives 41 fields when the row is created and 37 when it is patched, the application list 36 and Dataverse 37 when the row is created and 32 when it is patched, and the sets are the ones of the tables above.
- [ ] Nine keys of the real JSON are not read by the flow (`pecal` among them), and `OrdinalE2E` reaches the staging list with the value of the JSON.
- [ ] The Ingenieros branch is the fallback of every responsible that is not jefe and not preventa, and no branch recognizes a Dirección.
- [ ] The patch of the staging list always sends the 37 fields, so an absent key becomes a `null` in the column.
- [x] The log of the parent records the counters and the outcome, and the log of the branch of an existing expediente records the fields that changed with their previous and their new value (since 2026-11-16).

## Next step

Phase C, the centralized mapping, came first, because the mapping is what the difference calculation needed, and phase D, the trace, is closed and measured. **Phase E, the ordering guard, is the next one**: its three open questions are answered above, and it is measured with a controlled case, with the SharePoint session and the JSON of the cases.
