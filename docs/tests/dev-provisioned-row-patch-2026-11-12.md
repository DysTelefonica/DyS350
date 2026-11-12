# DEV provisioned row patch, November 12

The last open item of the reconciliation checklist (V13) is now measured. A JSON that is ingested again **updates the row of the expediente that is already provisioned**, not only the staging row.

## What was checked

| Item | Value |
| --- | --- |
| Environment | DEV/CERT, Dataverse `orge4f220a2.api.crm4.dynamics.com` |
| Table | `cr435_expedientes` (the provisioned expedientes) |
| Row | `cr435_expedienteid = 2657d454-c8dd-f111-84e8-000d3ad88970`, `cr435_idexpediente = 900611603` |
| Read | 2026-11-12, corporate session, `GET /api/data/v9.2/cr435_expedientes?$filter=cr435_idexpediente eq 900611603` |

The row was created by the RF04 creation case (`rf04a-create.json`) and was ingested again by the update, rename, drop-role, fail-closed and child-table cases (`rf04b`, `rf04c`, `rf05a`, `rf05b`, `rf06a`). The values of the JSON and the values of the row are compared below.

| Field | Value in the creation JSON | Value in the row today | Value in the last ingested JSON |
| --- | --- | --- | --- |
| `cr435_titulo` | `Basado 1 del Lote 1. Puesto de mando CIS desplegables tipo Pelotón. Estación Almería` | `DEV RF03 update validation - 900611503` | `DEV RF03 update validation - 900611503` |
| `cr435_importecontratacion` | `4030050.72` | `4030050.72` | `4030050.72` |
| `cr435_fechainiciocontrato` | `2026-11-03` | `2026-11-03` | `2026-11-03` |
| `cr435_fechafincontrato` | `2028-09-30` | `2028-09-30` | `2028-09-30` |
| `cr435_esbasado` | `Sí` | `Sí` | `Sí` |
| `cr435_codexp` | `DEV900611603` | `DEV900611603` | `DEV900611603` |
| `cr435_idexpedientepadre` | `900611602` | `900611602` | `900611602` |

## Result

**The provisioned row carries the values of the last ingestion.** The title is the discriminating field: the row was created with the title of the creation case and today it carries the title that only appears in the later JSONs. The other fields coincide because the later fixtures did not change them.

The update action of the child flow (`Actualizar_Expediente_-_Dataverse`) and its read (`Obtener_Expediente_para_actualizar_-_Dataverse`) are enabled in this environment: both carry `staticResultOptions: Disabled`, so the row is really read from and written to the Dataverse table.

## Why the checklist said it was not exercised

The RF03 precheck of November 11 recorded `expedientesForControlledIds: 0` and a total of eight rows in the table: at that moment the controlled identifiers had no provisioned row, so there was nothing to update. The RF04 creation case created the `900611601` / `900611602` / `900611603` hierarchy afterwards, and the later ingestions updated its leaf. The note was true when it was written and is superseded by this measurement.

## Limits

- Only the controlled leaf `900611603` was re-ingested. The row of the parent `900611501` still carries its creation values because no later JSON re-ingested it; that is a property of the test data, not of the flow.
- The rows of the eight demo expedientes were read but not written, and they were not modified.
- DEV/CERT only. PROD was never read, written or authorized by this work.
