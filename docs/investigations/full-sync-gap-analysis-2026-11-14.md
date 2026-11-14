# Full synchronization of expedientes: gap analysis against the specification

The role reconciliation that the specification demands is **built and measured** in DEV/CERT: the key is `Expediente + Rol + Usuario`, a user that disappears is deleted, a new one is added, and the identifiers of the rows survive. The synchronization of the **rest** of the expediente data exists for 40 of the 49 fields the JSON carries, but it is 40 hard-coded expressions repeated in three destinations, with no difference calculation, no field-level completeness guard, no detection of unknown fields and no per-synchronization trace. Two role kinds of the six that the specification names are not recognized as such, and one JSON field is read with a different case than the one the exporter sends.

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

| Role of the specification | How the flow recognizes it | Identifier of the role |
| --- | --- | --- |
| Jefe de proyecto | the flag `esjefeproyecto = Sí` of the responsible | read from the catalog by title |
| Preventa | the flag `esPreventa = Sí` of the responsible | read from the catalog by title |
| Calidad | the root object `responsableCalidad` | read from the catalog by title `Técnicos de calidad` |
| Ingenieros | **every remaining responsible** (not jefe and not preventa) | the parameter `E2E_IDRol_Ingenieria`, the literal `3` |
| Seguridad | the root object `responsableSeguridad` | the literal `5` |
| Documentalistas | the branch `Crear_Tecnico_Documentacion_Sin_RolesUsuario` | the literal `5` |
| **Dirección** | **nothing** | **nothing** |

Three findings come out of this table:

1. **Dirección does not exist in the flow.** A responsible that the JSON marks as such would become an Ingeniero, because the Ingenieros branch is the fallback of every responsible that is not jefe and not preventa. The JSON has no flag for Dirección either: the responsible only carries `correosiempre`, `esjefeproyecto`, `esPreventa`, `correousuario` and `nombre`.
2. **Two different roles share the identifier `5`.** Seguridad and Documentalistas are written with the same `IDRol`. One of the two is mislabelled, and the flow never asks the catalog which one it is.
3. **The identifiers of two roles are literals.** The specification asks for the real identifiers and names of the existing list, resolved through the relations that already exist. `3` and `5` are hardcoded, so a change in the `Roles` list silently changes the meaning of the flow.

## Status of every requirement

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Synchronize all the fields of the expediente | partial | 40 of 49 fields; 9 ignored, one of them for a case mismatch |
| 2 | Prior analysis of the real structure | done | this document |
| 3 | Reconciliation of the roles by `Expediente + Rol + Usuario` | done | [RF04](../tests/dev-role-reconciliation-rf04-2026-11-11.md), [RF05](../tests/dev-role-reconciliation-rf05-2026-11-11.md) |
| 3 | The six role kinds | partial | four recognized by name, Ingenieros by fallback, Dirección absent, two roles share `5` |
| 4 | Update the data of an expediente that is already provisioned | done | [the provisioned row patch](../tests/dev-provisioned-row-patch-2026-11-12.md) |
| 5 | Centralized mapping, unknown fields registered | pending | the mapping is 40 expressions repeated three times; the unknown fields are silent |
| 6 | Tell a complete JSON from a partial one | pending | the roles are guarded, the fields are not |
| 7 | Provisioning and update without recreating | done | the identifiers survive every case; the parent does not re-provision on update |
| 8 | Centralized and reusable synchronization | partial | the reconciliation is centralized in the child; the field update is not |
| 9 | Safety: no loss, no overwrite of foreign data, no old update over a new one | partial | the application list is patched without checking which columns it owns; there is no ordering guard |
| 10 | Traceability of every synchronization | pending | the log records the counters and the outcome, not the fields that changed |
| 11 | The eighteen tests | partial | eight are measured, ten are not |

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
| 11 | partial JSON without loss | not exercised |
| 12 | empty or wrong JSON | measured (RF05b, fail closed) |
| 13 | not provisioned expediente | measured (RF03a) |
| 14 | already provisioned expediente | measured (RF04b, RF06) |
| 15 | repeated processing | measured (RF03c) |
| 16 | concurrent or out of order updates | not exercised |
| 17 | errors of SharePoint during the update | not exercised |
| 18 | no other expediente is modified | measured (RF04, RF05, RF06) |

## The gaps

### P0 — a field of the JSON is read with the wrong case

`OrdinalE2E` is sent by the exporter and read by the flow as `ordinale2e`. Depending on the case sensitivity of the property lookup, the column `OrdinalE2E` of the staging list and of the application list is written with an empty value on every ingestion. It has to be read on a controlled row and compared with the value of the JSON before anything else.

### P0 — a partial JSON wipes the fields it does not carry

The patch always sends the 37 fields. A JSON that arrives with 30 of them writes `null` over the other 7 columns of the staging list, of the application list and of Dataverse. The roles were protected against exactly this; the fields are not. The protection is cheap: the flow knows the 49 keys, it can compare them with the received ones and fail closed, exactly as it does with the responsible.

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
| A | The case of `OrdinalE2E` | read the column of a controlled row and compare it with the JSON |
| B | The completeness guard of the fields | a partial JSON changes nothing and is logged as such |
| C | The detection of the unknown fields | a JSON with one extra key is logged with the key, and nothing is created |
| D | The centralized mapping | one table drives the three destinations, and the generator proves the three are equivalent |
| E | The difference calculation and the trace | the log of a case lists the fields that changed with their previous and new value |
| F | The ordering guard | an older JSON is rejected and logged |
| G | The roles by name, including Dirección | the identifiers come from the catalog; the six kinds are covered |

Phases A, B, C, F and G can be built without any business decision. D and E need the shape of the log that the team wants, and G needs to know how the exporter marks a Dirección.

## Checklist

A reviewer can confirm, without trusting this document:

- [ ] The published child hashes to `FDBC92DE…` and the parent to `5AFAFE77…`, both `Started`.
- [ ] The staging list receives 41 fields, the application list 36 and Dataverse 37, and the three sets are the ones of the tables above.
- [ ] Nine keys of the real JSON are not read by the flow, and `OrdinalE2E` is read as `ordinale2e`.
- [ ] The Ingenieros branch is the fallback of every responsible that is not jefe and not preventa, and no branch recognizes a Dirección.
- [ ] The patch of the staging list always sends the 37 fields, so an absent key becomes a `null` in the column.
- [ ] The log of the parent records the counters and the outcome, and not the fields that changed.

## Next step

Phase A (the case of `OrdinalE2E`) and phase B (the completeness guard of the fields) are the first two, because they are the two ways in which the system can lose data today. They need a live SharePoint session to read the schema of the lists and to measure the cases.
