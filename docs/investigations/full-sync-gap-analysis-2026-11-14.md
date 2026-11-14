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

The JSON of an expediente carries 49 keys. The flow reads 40 of them and writes them to three destinations.

| Destination | Fields | Owner |
| --- | --- | --- |
| Staging `ExpedientesJSON` | 41 | the flow |
| Application list `Expedientes` | 36 | the application (the flow only patches) |
| Dataverse `cr435_expedientes` | 37 | the flow |
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
| `OrdinalE2E` | `990064` | read as `ordinale2e`: the case does not match the key the exporter sends |

The specification asks explicitly for the unmapped fields to be **registered and notified**, never ignored in silence. Today they are ignored in silence, and the ninth one is read with a different case than it is sent, which makes it suspect that its value never reaches SharePoint.

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
| 1 | Synchronize all the fields of the expediente | partial | 40 of 49 fields; the 9 keys that are not read are ignored in silence |
| 2 | Prior analysis of the real structure | done | this document |
| 3 | Reconciliation of the roles by `Expediente + Rol + Usuario` | done | [RF04](../tests/dev-role-reconciliation-rf04-2026-11-11.md), [RF05](../tests/dev-role-reconciliation-rf05-2026-11-11.md) |
| 3 | The six role kinds | partial | four written (Preventa, Jefe de proyecto, Calidad, Ingenieros), documenters by the `responsableSeguridad` field, Personal externo and Dirección never written |
| 4 | Update the data of an expediente that is already provisioned | done | [the provisioned row patch](../tests/dev-provisioned-row-patch-2026-11-12.md) |
| 5 | Centralized mapping, unknown fields registered | pending | the mapping is 40 expressions repeated three times; the unknown fields are silent |
| 6 | Tell a complete JSON from a partial one | done for the fields | the roles fail closed and the fields fail closed since 2026-11-14 ([RF07](../tests/dev-field-completeness-guard-rf07-2026-11-14.md)) |
| 7 | Provisioning and update without recreating | done | the identifiers survive every case; the parent does not re-provision on update |
| 8 | Centralized and reusable synchronization | partial | the reconciliation is centralized in the child; the field update is not |
| 9 | Safety: no loss, no overwrite of foreign data, no old update over a new one | partial | the application list is patched without checking which columns it owns; there is no ordering guard |
| 10 | Traceability of every synchronization | pending | the log records the counters and the outcome, not the fields that changed |
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

The patch always sent the 37 fields, so a JSON that arrived with 30 of them wrote `null` over the other 7 columns of the staging list, of the application list and of Dataverse. The roles were protected against exactly this; the fields were not. **It was closed on 2026-11-14**: the `ParseJson` action now requires the fifty keys of the exporter at the root of its schema, so a partial JSON fails the parse and nothing is written. The case is measured in [the RF07 report](../tests/dev-field-completeness-guard-rf07-2026-11-14.md).

### P1 — the application list is patched without checking its authority

The `Expedientes` list is created and maintained by the application. The flow patches 36 of its columns with the values of the JSON. The specification forbids overwriting the columns that the application owns without checking its authority. Today the flow cannot tell which columns are managed by the application and which are not.

### P1 — nothing detects a field that the JSON adds

A new field of the exporter is ignored without a trace. The specification asks for the unknown fields to be registered and notified, and for the columns not to be created automatically.

### P1 — there is no difference calculation and no trace of what changed

Every ingestion rewrites the 37 fields and the log records only the counters (`Nuevos`, `Actualizados`, `Fallidos`) and the outcome `Finalizado`. The specification asks for the fields that changed, their previous and new value, and the assignments that were added, removed and kept. The JSON already carries what is needed to start: `meta.generatedAt`, `meta.IDBatch` and `meta.IDExportacion`.

### P2 — nothing prevents an old JSON from overwriting a new one

There is no comparison of the generation time of the JSON against the stored one. Two ingestions out of order end with the older one winning. The JSON carries `meta.generatedAt`, so the guard is one comparison.

### P2 — two role identifiers are literals and two roles share one

`3` and `5` are written in the flow instead of being resolved from the `Roles` list, and Seguridad and Documentalistas share the `5`. The catalog is already received by the flow as a trigger file; resolving the names against it is the same mechanism the flow uses for Jefe de proyecto, Preventa and Calidad.

### P2 — Dirección does not exist

The sixth role of the specification has no representation in the JSON schema and none in the flow. A responsible that is not jefe and not preventa becomes an Ingeniero, so a Dirección person would be given the wrong role. This needs a business answer: how does the exporter mark a Dirección?

## The plan

Each phase is a candidate built by a generator in `scripts/flow-title-sync/`, published in DEV/CERT and measured with a controlled case, exactly like the phases 1, 2a, 2b and 3.

| Phase | What it closes | How it is measured |
| --- | --- | --- |
| A | The completeness guard of the fields | **done on 2026-11-14** ([RF07](../tests/dev-field-completeness-guard-rf07-2026-11-14.md)) |
| B | The detection of the unknown fields | a JSON with one extra key is logged with the key, and nothing is created |
| C | The centralized mapping | one table drives the three destinations, and the generator proves the three are equivalent |
| D | The difference calculation and the trace | the log of a case lists the fields that changed with their previous and new value |
| E | The ordering guard | an older JSON is rejected and logged |
| F | The role identifiers by name | `3` and `5` are resolved from the catalog instead of being written by hand |

Phases B, C, E and F can be built without any business decision. D needs the shape of the log that the team wants. The Dirección and the `responsableSeguridad` stay as they are for now, by decision of the team.

## Checklist

A reviewer can confirm, without trusting this document:

- [ ] The published child hashes to `FDBC92DE…` and the parent to `5AFAFE77…`, both `Started`.
- [ ] The staging list receives 41 fields, the application list 36 and Dataverse 37, and the three sets are the ones of the tables above.
- [ ] Nine keys of the real JSON are not read by the flow, and `OrdinalE2E` reaches the staging list with the value of the JSON.
- [ ] The Ingenieros branch is the fallback of every responsible that is not jefe and not preventa, and no branch recognizes a Dirección.
- [ ] The patch of the staging list always sends the 37 fields, so an absent key becomes a `null` in the column.
- [ ] The log of the parent records the counters and the outcome, and not the fields that changed.

## Next step

Phase B, the detection of the unknown fields, is the first one, because it is the cheapest way to know what the exporter is sending that the flow does not understand. Phase C, the centralized mapping, comes after it, because the mapping is what the detection and the difference calculation need. Both are measured with a controlled case, with the SharePoint session and the JSON of the cases.
