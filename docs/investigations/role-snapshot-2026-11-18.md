# Role snapshot, November 18: the whole role table against the JSON

One photo of every role row of `Roles_usuario` in DEV/CERT and in PROD, with the verdict the business asked for: **keep** the row, **change** the person, or **delete** the row. The row level tables are the two CSV files of this folder; this document explains how every verdict was obtained and what it means. The table was reconciled with the JSON on November 18, so the verdicts of this photo are the state of that day: every row matches its JSON except the ones that no JSON explains.

## Where the data comes from

| Source | What it gives | Read on |
| --- | --- | --- |
| `Roles_usuario` | the rows of the roles, one per (expediente, role, person) | 2026-11-18 |
| `cargaJSON_procesados` | the JSON files the flow has processed, whose name carries the instant of the processing | 2026-11-18 |
| `ExpedientesJSON` | the footprint of the ingestion: the `IDResponsableCalidad` and `IDResponsableSeguridad` the flow wrote for each expediente | 2026-11-18 |
| the published definition of the flow | how a responsible of the JSON becomes a role row | 2026-11-18 |

The rows were read from the live sites with the authenticated session of the generic account, and the canonical form of the five lists was hashed and compared with the dump of the same morning: the SHA-256 is identical in DEV/CERT (`afe4ad54ca1201523b67ead5feeadc2e0706a3bc044f920cd2c6d1c61b644ae1`) and in PROD (`fdf564efd3139592e81990d64dcfd7f9d3d5a7615e9fffe809e497588d824a78`), so the photo is the state of the lists and not an estimate.

## How a JSON becomes a role row

The mapping is the one of the published flow, read from its definition and not from the documentation:

| Role | How the JSON is recognized | Id |
| --- | --- | --- |
| Jefe de proyecto | `esjefeproyecto` **is not** `"No"` | 2 |
| Preventa | `esjefeproyecto` is `"No"` and `espreventa` **is not** `"No"` | 1 |
| Ingenieros | both flags are `"No"` | 3 |
| Tecnicos de calidad | `responsableCalidad.correousuario` | 4 |
| Tecnicos de documentacion | `responsableSeguridad.correousuario` | 5 |
| Personal externo | never written by the flow | 6 |
| Direccion | never written by the flow, and never deleted by it | 7 |

Two details of that table decide most of the verdicts:

- The comparison is against the literal `"No"`, so a **null** `esjefeproyecto` makes the person a **Jefe**, and a null `esPreventa` makes the person **Preventa**. Reading a null flag as "not specified" classified 1278 rows of DEV/CERT wrongly.
- The flow removes nothing when the JSON declares no responsable with **name and email** (`Filtrar_Responsables_Validos`), and it never touches the `Direccion` row. Those two rules are the difference between "delete" and "leave it", and they are applied here as well.

The authority of each expediente is the **most recent processed JSON that contains it**, and the footprint of `ExpedientesJSON` has to agree with that JSON on the quality and the security responsible. When there is no footprint, the flow never ingested that JSON for that expediente, so the JSON is not proof: the row is marked `REVISAR` instead of "change" or "delete".

## The verdicts

| Verdict | Meaning |
| --- | --- |
| `MANTENER` | the JSON declares exactly that person in that role: the row stays as it is |
| `CAMBIAR` | the JSON declares another person in that role: the row has to change |
| `BORRAR` | the JSON declares nobody in that role: the row goes away and the person leaves the group of that kind (rule R6) |
| `REVISAR` | the JSON exists but the flow never ingested it for this expediente: nobody can say what the row should be |
| `SIN_JSON` | there is no processed JSON at all for this expediente: the row has no origin |
| `SIN_JSON_VALIDO` | the JSON exists but declares no responsable with name and email: the flow fails closed and leaves the rows alone |
| `MANUAL` | `Direccion` (7) or `Personal externo` (6): the flow never writes them and never deletes them |

## DEV/CERT

| Measure | Value |
| --- | --- |
| Role rows in Roles_usuario | 317 |
| Expedientes with role rows | 107 |
| Distinct (expediente, role, person) | 317 |
| Rows that are a repeated copy | 0 in 0 groups |
| JSON files processed | 180 |
| Expedientes with a processed JSON | 162 |
| Expedientes with an ingestion footprint | 125 |
| Verdict `MANTENER` | 314 |
| Verdict `SIN_JSON` | 3 |

### The rows that have to change

| Expediente | Role | Person in the list | Person the JSON puts | JSON |
| --- | --- | --- | --- | --- |

### The rows without an origin

| Expediente | Role | Person in the list | Verdict | Why |
| --- | --- | --- | --- | --- |
| 1269 | Jefe de proyecto | andres.romandelperal@telefonica.com | SIN_JSON | no hay ningun JSON procesado para este expediente |
| 1269 | Ingenieros | martina.torralbarodriguez@telefonica.com | SIN_JSON | no hay ningun JSON procesado para este expediente |
| 1269 | Tecnicos de calidad | anamaria.rubiocanales@telefonica.com | SIN_JSON | no hay ningun JSON procesado para este expediente |

### Every expediente

| Expediente | Filas | MANTENER | CAMBIAR | BORRAR | Other | JSON that governs it | Ingestion footprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 402 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 404 | 2 | 2 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 405 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 414 | 2 | 2 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 418 | 2 | 2 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 419 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 422 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 423 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 424 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 425 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 426 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 428 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 429 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 430 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 432 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 435 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 436 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 437 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 438 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 439 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 440 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 441 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 443 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 450 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 451 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 452 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 453 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 454 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 455 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 456 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 457 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 462 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 464 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 465 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 466 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 473 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 474 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 476 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 480 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 481 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1001 | 3 | 3 | 0 | 0 | - | `expedientes_sync_23-03-2026_03_29_05.json` | yes |
| 1002 | 4 | 4 | 0 | 0 | - | `expedientes_sync_23-03-2026_03_29_05.json` | yes |
| 1024 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1025 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1026 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1027 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1035 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1036 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1039 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1072 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1073 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1093 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1108 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1109 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1149 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1151 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1154 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1155 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1158 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1160 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1161 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1163 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1187 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1190 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1192 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1195 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1196 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1214 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1222 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1223 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1230 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1231 | 5 | 5 | 0 | 0 | - | `1231_26_20261104084535_04-11-2026_07_49_53_04-11-2026_06_19_12.json` | yes |
| 1236 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1239 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1240 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1257 | 2 | 2 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1260 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1261 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1263 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1265 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1269 | 3 | 0 | 0 | 0 | SIN_JSON 3 | - | **no** |
| 1270 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1271 | 4 | 4 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1274 | 5 | 5 | 0 | 0 | - | `1231_26_20261104084535_04-11-2026_07_49_53_04-11-2026_06_19_12.json` | yes |
| 1296 | 1 | 1 | 0 | 0 | - | `Expedientes_relacion_1201_27-05-2026_12_05_16.json` | yes |
| 1297 | 5 | 5 | 0 | 0 | - | `expediente_1297 1_14-09-2026_01_43_27.json` | yes |
| 1298 | 1 | 1 | 0 | 0 | - | `Expedientes_relacion_1201_27-05-2026_12_05_16.json` | yes |
| 1305 | 3 | 3 | 0 | 0 | - | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1308 | 1 | 1 | 0 | 0 | - | `Expedientes_relacion_1200_27-05-2026_11_38_28.json` | yes |
| 1310 | 3 | 3 | 0 | 0 | - | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1313 | 2 | 2 | 0 | 0 | - | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1331 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1332 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1333 | 1 | 1 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1337 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1347 | 3 | 3 | 0 | 0 | - | `E2E_export_20260730_150041_compact_05-08-2026_09_50_37.json` | yes |
| 1367 | 4 | 4 | 0 | 0 | - | `1231_26_20261104084535_04-11-2026_07_49_53_04-11-2026_06_19_12.json` | yes |
| 2001 | 5 | 5 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2002 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2003 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2004 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2005 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2006 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2007 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2008 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_13_00.json` | yes |
| 2009 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_13_00.json` | yes |
| 2010 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |

## PROD

| Measure | Value |
| --- | --- |
| Role rows in Roles_usuario | 136 |
| Expedientes with role rows | 42 |
| Distinct (expediente, role, person) | 136 |
| Rows that are a repeated copy | 0 in 0 groups |
| JSON files processed | 61 |
| Expedientes with a processed JSON | 118 |
| Expedientes with an ingestion footprint | 20 |
| Verdict `MANTENER` | 75 |
| Verdict `REVISAR` | 60 |
| Verdict `MANUAL` | 1 |

### The rows that have to change

| Expediente | Role | Person in the list | Person the JSON puts | JSON |
| --- | --- | --- | --- | --- |

### The rows without an origin

| Expediente | Role | Person in the list | Verdict | Why |
| --- | --- | --- | --- | --- |
| 2005 | Tecnicos de calidad | responsable.calidad.b3l1@empresa.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 2005 | Jefe de proyecto | enrique.hernandezsegura@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 402 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 402 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 432 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 432 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 436 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 436 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 404 | Jefe de proyecto | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 404 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 404 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 404 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 452 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 452 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 457 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 457 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 474 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 474 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 480 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 480 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 414 | Jefe de proyecto | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 414 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 414 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 414 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1072 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1072 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1073 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1073 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 418 | Jefe de proyecto | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 418 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 418 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 418 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 419 | Jefe de proyecto | juliobenedicto.vicariomancho@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 419 | Preventa | marta.garridovaamonde@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 419 | Preventa | cristina.serranonunez@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1190 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1190 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1190 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1190 | Preventa | santiago.sandovaligelmo@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1195 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1195 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1222 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1222 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1223 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1223 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1257 | Jefe de proyecto | rosamaria.fuentesherrero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1257 | Preventa | rosamaria.fuentesherrero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1257 | Jefe de proyecto | manuel.fernandezgaspar@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1257 | Preventa | manuel.fernandezgaspar@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1260 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1260 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1260 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1260 | Preventa | santiago.sandovaligelmo@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1333 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1333 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1337 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1337 | Jefe de proyecto | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1337 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1337 | Preventa | santiago.sandovaligelmo@telefonica.com | REVISAR | el JSON existe pero el flujo no lo ingirio para este expediente |
| 1307 | Direccion | juanfelix.ruizteruel.ext@telefonica.com | MANUAL | el flujo nunca escribe el tipo 7 |

### Every expediente

| Expediente | Filas | MANTENER | CAMBIAR | BORRAR | Other | JSON that governs it | Ingestion footprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 402 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 404 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 414 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 418 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 419 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 432 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 436 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 452 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 457 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 474 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 480 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1072 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1073 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1190 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 1195 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1205 | 3 | 3 | 0 | 0 | - | `1205_16_20261028131242_29-10-2026_07_34_08.json` | yes |
| 1222 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1223 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1231 | 5 | 5 | 0 | 0 | - | `1231_22_20261103153554_04-11-2026_06_42_17.json` | yes |
| 1257 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 1260 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 1274 | 5 | 5 | 0 | 0 | - | `1231_22_20261103153554_04-11-2026_06_42_17.json` | yes |
| 1292 | 5 | 5 | 0 | 0 | - | `1292_20_20261103124955_03-11-2026_11_52_19.json` | yes |
| 1297 | 5 | 5 | 0 | 0 | - | `expediente_1297_10-09-2026_09_10_54.json` | yes |
| 1307 | 6 | 5 | 0 | 0 | MANUAL 1 | `E2E_export_20260819_085001_19-08-2026_07_59_25_copy_24-08-2026_09_32_54.json` | yes |
| 1333 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 1337 | 4 | 0 | 0 | 0 | REVISAR 4 | - | **no** |
| 1354 | 3 | 3 | 0 | 0 | - | `1354_10_20261028090515_28-10-2026_08_11_16.json` | yes |
| 1363 | 5 | 5 | 0 | 0 | - | `expediente_1363_15-09-2026_07_37_33.json` | yes |
| 1365 | 3 | 3 | 0 | 0 | - | `1365_15_20261028095948_28-10-2026_09_04_13.json` | yes |
| 1366 | 2 | 2 | 0 | 0 | - | `1365_15_20261028095948_28-10-2026_09_04_13.json` | yes |
| 1367 | 5 | 5 | 0 | 0 | - | `1231_22_20261103153554_04-11-2026_06_42_17.json` | yes |
| 2001 | 5 | 5 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2002 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2003 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2004 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2005 | 2 | 0 | 0 | 0 | REVISAR 2 | - | **no** |
| 2006 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2007 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2008 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2009 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2010 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |

## What the photo says about the assumption that everything comes from the JSON

The assumption did not hold on the morning of November 18, and this photo is the state **after** the table was reconciled with the JSON that governs each expediente (the record of that change is [role-table-reconciliation](../changes/role-table-reconciliation-2026-11-18.md)).

What was found and what was done:

- **The table had drifted**: in DEV/CERT 709 of the 1357 rows did not match the JSON of their expediente and in PROD 63 of the 233 did not. The rule R6 removes those rows when the JSON is processed, but the historical rows were never reconciled.
- **The table had copies**: 829 rows in DEV/CERT (326 groups in 98 expedientes) and 55 in PROD (21 groups in 14 expedientes) were a repeated copy of another row of the same expediente with the same person. The flow cannot remove a copy, because the key of the desired set is `usuario + '-' + IDRol` and the copy answers the same key.
- **Both are now gone**: every row of the table matches the JSON of its expediente, except the three rows of expediente `1269` in DEV/CERT, the 61 rows of the 22 expedientes of PROD whose JSON was never ingested and the `Direccion` row of PROD, which the business keeps by hand.

The rows that no JSON explains are the ones that were put in by hand, or that come from a JSON that never arrived. They are listed in the tables above with the verdict `REVISAR` or `SIN_JSON`, and they were left untouched: nothing in the environment can say what they should be.

## Open

The photo is an inventory, not a change. The decisions that belong to the business are:

1. Whether the rows that contradict an ingested JSON are fixed by **processing the JSON again** (the flow does the work, and it is the path that was measured in DEV/CERT and in PROD) or by a **direct correction of the list**.
2. Whether the repeated copies are removed, and whether the flow is made idempotent so they do not come back.
3. What happens to the rows that no JSON explains (`REVISAR`, `SIN_JSON`): they need a business criterion, because nothing in the environment can say what they should be.

## Files

- `dev-roles.csv` — every role row of DEV/CERT with its verdict.
- `prod-roles.csv` — every role row of PROD with its verdict.

Both files carry the corporate email of the people of the roles, so they belong to the internal repository of the team and not to a public channel.

