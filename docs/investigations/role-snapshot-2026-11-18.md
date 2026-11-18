# Role snapshot, November 18: the whole role table against the JSON

One photo of every role row of `Roles_usuario` in DEV/CERT and in PROD, with the verdict the business asked for: **keep** the row, **change** the person, or **delete** the row. The row level tables are the two CSV files of this folder; this document explains how every verdict was obtained and what it means.

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
| Role rows in Roles_usuario | 1357 |
| Expedientes with role rows | 113 |
| Distinct (expediente, role, person) | 528 |
| Rows that are a repeated copy | 829 in 326 groups |
| JSON files processed | 180 |
| Expedientes with a processed JSON | 162 |
| Expedientes with an ingestion footprint | 125 |
| Verdict `MANTENER` | 636 |
| Verdict `CAMBIAR` | 216 |
| Verdict `BORRAR` | 485 |
| Verdict `SIN_JSON` | 3 |
| Verdict `SIN_JSON_VALIDO` | 17 |

### The rows that have to change

| Expediente | Role | Person in the list | Person the JSON puts | JSON |
| --- | --- | --- | --- | --- |
| 1001 | Jefe de proyecto | jesusmiguel.carrasquelcontreras@telefonica.com | jefe.proyecto1@empresa.com | `expedientes_sync_23-03-2026_03_29_05.json` |
| 2008 | Jefe de proyecto | laura.ecijalopez.ext@telefonica.com | enrique.hernandezsegura@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2008 | Tecnicos de documentacion | almudena.cardenasvelloso.ext@telefonica.com | responsable.seguridad.b2l2@empresa.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2010 | Tecnicos de documentacion | anamaria.rubiocanales@telefonica.com | responsable.seguridad.b4l2@empresa.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2001 | Jefe de proyecto | juanfelix.ruizteruel.ext@telefonica.com | jesusmiguel.carrasquelcontreras@telefonica.com,sergio.gutierrezcano@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2001 | Jefe de proyecto | martina.torralbarodriguez@telefonica.com | jesusmiguel.carrasquelcontreras@telefonica.com,sergio.gutierrezcano@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2001 | Jefe de proyecto | almudena.cardenasvelloso.ext@telefonica.com | jesusmiguel.carrasquelcontreras@telefonica.com,sergio.gutierrezcano@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2004 | Tecnicos de documentacion | almudena.cardenasvelloso.ext@telefonica.com | responsable.seguridad.b2l1@empresa.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2003 | Tecnicos de documentacion | laura.ecijalopez.ext@telefonica.com | responsable.seguridad.b1l1@empresa.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2005 | Jefe de proyecto | martina.torralbarodriguez@telefonica.com | enrique.hernandezsegura@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2001 | Tecnicos de calidad | laura.ecijalopez.ext@telefonica.com | sergio.gutierrezcano@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2003 | Tecnicos de calidad | ug03573@telefonica.com | responsable.calidad.b1l1@empresa.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2004 | Jefe de proyecto | jesusmiguel.carrasquelcontreras@telefonica.com | enrique.hernandezsegura@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2004 | Jefe de proyecto | ug03573@telefonica.com | enrique.hernandezsegura@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2001 | Tecnicos de calidad | ug03573@telefonica.com | sergio.gutierrezcano@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 2005 | Tecnicos de calidad | jesusmiguel.carrasquelcontreras@telefonica.com | responsable.calidad.b3l1@empresa.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1190 | Preventa | felix.sanchezpimentel@telefonica.com | alvaro.gonzalezcaballero@telefonica.com,santiago.sandovaligelmo@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Jefe de proyecto | manuel.fernandezgaspar@telefonica.com | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Preventa | manuel.fernandezgaspar@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Preventa | (empty) | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Preventa | tatiana.shulcaquinaupa@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1274 | Jefe de proyecto | (empty) | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1274 | Preventa | tatiana.shulcaquinaupa@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1337 | Preventa | felix.sanchezpimentel@telefonica.com | alvaro.gonzalezcaballero@telefonica.com,santiago.sandovaligelmo@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1026 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1027 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1035 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1093 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1108 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1109 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1154 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1163 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1187 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1192 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1214 | Preventa | juliobenedicto.vicariomancho@telefonica.com | cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com,marta.garridovaamonde@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 422 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1236 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1239 | Preventa | juliobenedicto.vicariomancho@telefonica.com | cristina.serranonunez@telefonica.com,marta.garridovaamonde@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1240 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1261 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1263 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1331 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1332 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 424 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 438 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 439 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 440 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 441 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 450 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 453 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 454 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 464 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 466 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 476 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1190 | Preventa | felix.sanchezpimentel@telefonica.com | alvaro.gonzalezcaballero@telefonica.com,santiago.sandovaligelmo@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Jefe de proyecto | manuel.fernandezgaspar@telefonica.com | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Preventa | manuel.fernandezgaspar@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Preventa | (empty) | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1231 | Preventa | tatiana.shulcaquinaupa@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1260 | Preventa | felix.sanchezpimentel@telefonica.com | alvaro.gonzalezcaballero@telefonica.com,santiago.sandovaligelmo@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1274 | Jefe de proyecto | (empty) | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1274 | Preventa | tatiana.shulcaquinaupa@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1337 | Preventa | felix.sanchezpimentel@telefonica.com | alvaro.gonzalezcaballero@telefonica.com,santiago.sandovaligelmo@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1026 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1027 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1035 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1036 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1039 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1093 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1108 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1109 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1149 | Preventa | juliobenedicto.vicariomancho@telefonica.com | cristina.serranonunez@telefonica.com,marta.garridovaamonde@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1151 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1154 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1155 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1158 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1160 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1161 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1163 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1187 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1192 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1196 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1214 | Preventa | juliobenedicto.vicariomancho@telefonica.com | cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com,marta.garridovaamonde@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 422 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1230 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1236 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1239 | Preventa | juliobenedicto.vicariomancho@telefonica.com | cristina.serranonunez@telefonica.com,marta.garridovaamonde@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1240 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1261 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1263 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1265 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1270 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1271 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1331 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1332 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1347 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 424 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 426 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 437 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 438 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 439 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 440 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 441 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 443 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 450 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 451 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 453 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 454 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 455 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 456 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 462 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 464 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 465 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 466 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 473 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 476 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 481 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | marta.garridovaamonde@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | juliobenedicto.vicariomancho@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 451 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 453 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 454 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 455 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 456 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 462 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 464 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 465 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 466 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 473 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 476 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 481 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | marta.garridovaamonde@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | juliobenedicto.vicariomancho@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 425 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 428 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 429 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 430 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 435 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 451 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 453 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 454 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 455 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 456 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 462 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 464 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 465 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 466 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 473 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 476 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 481 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | marta.garridovaamonde@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | juliobenedicto.vicariomancho@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 425 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 428 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 429 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 430 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 435 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 451 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 453 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 454 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 455 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 456 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 462 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 464 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 465 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 466 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 473 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 476 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 481 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com,aitor.solarazcona@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | marta.garridovaamonde@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1024 | Preventa | juliobenedicto.vicariomancho@telefonica.com | aitor.solarazcona@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1025 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1231 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 423 | Preventa | juliobenedicto.vicariomancho@telefonica.com | marta.garridovaamonde@telefonica.com,cristina.serranonunez@telefonica.com | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` |
| 1274 | Tecnicos de calidad | (empty) | natalia.casangarcia@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 2001 | Jefe de proyecto | laura.ecijalopez.ext@telefonica.com | jesusmiguel.carrasquelcontreras@telefonica.com,sergio.gutierrezcano@telefonica.com | `expedientes_relacion_07-07-2026_08_23_32.json` |
| 1274 | Jefe de proyecto | (empty) | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |
| 1367 | Jefe de proyecto | (empty) | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` |

### The rows without an origin

| Expediente | Role | Person in the list | Verdict | Why |
| --- | --- | --- | --- | --- |
| 1269 | Jefe de proyecto | andres.romandelperal@telefonica.com | SIN_JSON | no hay ningun JSON procesado para este expediente |
| 1269 | Ingenieros | martina.torralbarodriguez@telefonica.com | SIN_JSON | no hay ningun JSON procesado para este expediente |
| 1269 | Tecnicos de calidad | anamaria.rubiocanales@telefonica.com | SIN_JSON | no hay ningun JSON procesado para este expediente |
| 1309 | Jefe de proyecto | martina.torralbarodriguez@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1309 | Preventa | martina.torralbarodriguez@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1286 | Tecnicos de documentacion | almudena.cardenasvelloso.ext@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1286 | Tecnicos de calidad | martina.torralbarodriguez@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1286 | Preventa | laura.ecijalopez.ext@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1292 | Jefe de proyecto | martina.torralbarodriguez@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1293 | Tecnicos de documentacion | martina.torralbarodriguez@telefonica.com | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1159 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1225 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1159 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1225 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1159 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1225 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1159 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1225 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1159 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |
| 1225 | Tecnicos de calidad | (empty) | SIN_JSON_VALIDO | el JSON no declara ningun responsable con nombre y correo: el flujo no borra nada |

### Every expediente

| Expediente | Filas | MANTENER | CAMBIAR | BORRAR | Other | JSON that governs it | Ingestion footprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 402 | 10 | 1 | 0 | 9 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 404 | 9 | 4 | 0 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 405 | 25 | 12 | 0 | 13 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 414 | 17 | 4 | 0 | 13 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 418 | 9 | 4 | 0 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 419 | 44 | 21 | 9 | 14 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 422 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 423 | 35 | 17 | 7 | 11 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 424 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 425 | 9 | 6 | 2 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 426 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 428 | 11 | 8 | 2 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 429 | 11 | 8 | 2 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 430 | 9 | 6 | 2 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 432 | 5 | 2 | 0 | 3 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 435 | 9 | 6 | 2 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 436 | 5 | 2 | 0 | 3 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 437 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 438 | 13 | 6 | 2 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 439 | 13 | 6 | 2 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 440 | 13 | 6 | 2 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 441 | 13 | 6 | 2 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 443 | 9 | 4 | 1 | 4 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 450 | 13 | 6 | 2 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 451 | 17 | 12 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 452 | 5 | 2 | 0 | 3 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 453 | 22 | 15 | 5 | 2 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 454 | 22 | 15 | 5 | 2 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 455 | 21 | 16 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 456 | 21 | 16 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 457 | 9 | 1 | 0 | 8 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 462 | 21 | 16 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 464 | 27 | 20 | 5 | 2 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 465 | 17 | 12 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 466 | 22 | 15 | 5 | 2 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 473 | 21 | 16 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 474 | 9 | 1 | 0 | 8 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 476 | 22 | 15 | 5 | 2 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 480 | 20 | 2 | 0 | 18 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 481 | 21 | 16 | 4 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1001 | 3 | 0 | 1 | 2 | - | `expedientes_sync_23-03-2026_03_29_05.json` | yes |
| 1002 | 2 | 2 | 0 | 0 | - | `expedientes_sync_23-03-2026_03_29_05.json` | yes |
| 1024 | 25 | 16 | 8 | 1 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1025 | 40 | 19 | 8 | 13 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1026 | 17 | 8 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1027 | 16 | 8 | 2 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1035 | 16 | 8 | 2 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1036 | 10 | 4 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1039 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1072 | 8 | 1 | 0 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1073 | 8 | 1 | 0 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1093 | 14 | 6 | 2 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1108 | 16 | 8 | 2 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1109 | 14 | 6 | 2 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1149 | 10 | 4 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1151 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1154 | 14 | 6 | 2 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1155 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1158 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1159 | 5 | 0 | 0 | 0 | SIN_JSON_VALIDO 5 | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1160 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1161 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1163 | 17 | 8 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1187 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1190 | 17 | 6 | 2 | 9 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1192 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1195 | 8 | 1 | 0 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1196 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1214 | 17 | 8 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1222 | 8 | 1 | 0 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1223 | 8 | 1 | 0 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1225 | 5 | 0 | 0 | 0 | SIN_JSON_VALIDO 5 | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1230 | 10 | 4 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1231 | 26 | 7 | 17 | 2 | - | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` | yes |
| 1236 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1239 | 17 | 8 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1240 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1257 | 10 | 2 | 0 | 8 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1260 | 10 | 3 | 1 | 6 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1261 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1263 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1265 | 10 | 4 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1269 | 3 | 0 | 0 | 0 | SIN_JSON 3 | - | **no** |
| 1270 | 10 | 4 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1271 | 10 | 4 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1274 | 22 | 7 | 14 | 1 | - | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` | yes |
| 1286 | 3 | 0 | 0 | 0 | SIN_JSON_VALIDO 3 | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1292 | 1 | 0 | 0 | 0 | SIN_JSON_VALIDO 1 | `Expedientes_relacion_1201_27-05-2026_12_05_16.json` | yes |
| 1293 | 1 | 0 | 0 | 0 | SIN_JSON_VALIDO 1 | `Expedientes_relacion_1201_27-05-2026_12_05_16.json` | yes |
| 1296 | 2 | 1 | 0 | 1 | - | `Expedientes_relacion_1201_27-05-2026_12_05_16.json` | yes |
| 1297 | 5 | 3 | 0 | 2 | - | `expediente_1297 1_14-09-2026_01_43_27.json` | yes |
| 1298 | 2 | 1 | 0 | 1 | - | `Expedientes_relacion_1201_27-05-2026_12_05_16.json` | yes |
| 1305 | 2 | 1 | 0 | 1 | - | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1308 | 3 | 1 | 0 | 2 | - | `Expedientes_relacion_1200_27-05-2026_11_38_28.json` | yes |
| 1309 | 2 | 0 | 0 | 0 | SIN_JSON_VALIDO 2 | `Expedientes_relacion_1201_27-05-2026_11_48_01.json` | yes |
| 1310 | 2 | 1 | 0 | 1 | - | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1313 | 2 | 1 | 0 | 1 | - | `e2e_generado_14-05-2026_09_32_53.json` | yes |
| 1331 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1332 | 15 | 6 | 2 | 7 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1333 | 13 | 2 | 0 | 11 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1337 | 17 | 6 | 2 | 9 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1347 | 9 | 3 | 1 | 5 | - | `E2E_export_20260730_150041_compact_05-08-2026_11_20_48.json` | yes |
| 1367 | 3 | 2 | 1 | 0 | - | `1231_26_20261104084535_04-11-2026_07_49_53_05-11-2026_09_12_07.json` | yes |
| 2001 | 11 | 5 | 6 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2002 | 5 | 4 | 0 | 1 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2003 | 5 | 3 | 2 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2004 | 5 | 2 | 3 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2005 | 5 | 3 | 2 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2006 | 4 | 4 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2007 | 4 | 4 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2008 | 6 | 4 | 2 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2009 | 4 | 4 | 0 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |
| 2010 | 5 | 4 | 1 | 0 | - | `expedientes_relacion_07-07-2026_08_23_32.json` | yes |

## PROD

| Measure | Value |
| --- | --- |
| Role rows in Roles_usuario | 233 |
| Expedientes with role rows | 42 |
| Distinct (expediente, role, person) | 178 |
| Rows that are a repeated copy | 55 in 21 groups |
| JSON files processed | 61 |
| Expedientes with a processed JSON | 118 |
| Expedientes with an ingestion footprint | 20 |
| Verdict `MANTENER` | 143 |
| Verdict `CAMBIAR` | 25 |
| Verdict `BORRAR` | 39 |
| Verdict `REVISAR` | 25 |
| Verdict `MANUAL` | 1 |

### The rows that have to change

| Expediente | Role | Person in the list | Person the JSON puts | JSON |
| --- | --- | --- | --- | --- |
| 2001 | Tecnicos de documentacion | jesusmiguel.carrasquelcontreras@telefonica.com | responsable.seguridad.cm@empresa.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 2001 | Preventa | laura.ecijalopez.ext@telefonica.com | preventa.cm@empresa.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 2001 | Jefe de proyecto | katerynnatalia.gonzalezordonez.ext@telefonica.com | jesusmiguel.carrasquelcontreras@telefonica.com,sergio.gutierrezcano@telefonica.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 2001 | Tecnicos de documentacion | almudena.cardenasvelloso@telefonica.com | responsable.seguridad.cm@empresa.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 2001 | Tecnicos de calidad | martina.torralbarodriguez@telefonica.com | sergio.gutierrezcano@telefonica.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 2001 | Jefe de proyecto | juanfelix.ruizteruel.ext@telefonica.com | jesusmiguel.carrasquelcontreras@telefonica.com,sergio.gutierrezcano@telefonica.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 1274 | Jefe de proyecto | (empty) | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53.json` |
| 1274 | Preventa | tatiana.shulcaquinaupa@telefonica.com | rosamaria.fuentesherrero@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53.json` |
| 2002 | Tecnicos de documentacion | martina.torralbarodriguez@telefonica.com | responsable.seguridad.l1@empresa.com | `expedientes_relacion_24-07-2026_09_52_29.json` |
| 1307 | Preventa | katerynnatalia.gonzalezordonez.ext@telefonica.com | juanfelix.ruizteruel.ext@telefonica.com,anamaria.rubiocanales@telefonica.com | `E2E_export_20260819_085001_19-08-2026_07_59_25_copy_24-08-2026_09_32_54.json` |
| 1307 | Tecnicos de calidad | laura.ecijalopez.ext@telefonica.com | florentina.cuevascastano@telefonica.com | `E2E_export_20260819_085001_19-08-2026_07_59_25_copy_24-08-2026_09_32_54.json` |
| 1363 | Jefe de proyecto | jesusmiguel.carrasquelcontreras@telefonica.com | almudena.cardenasvelloso@telefonica.com | `expediente_1363_15-09-2026_07_37_33.json` |
| 1365 | Preventa | leticia.roldanmontero@telefonica.com | laura.ecijalopez@telefonica.com | `1365_18_20261029132154_29-10-2026_12_25_36.json` |
| 1365 | Preventa | joseluis.delgadomarin@telefonica.com | laura.ecijalopez@telefonica.com | `1365_18_20261029132154_29-10-2026_12_25_36.json` |
| 1365 | Tecnicos de calidad | anamaria.rubiocanales@telefonica.com | sergio.garciamontalvo@telefonica.com | `1365_18_20261029132154_29-10-2026_12_25_36.json` |
| 1365 | Tecnicos de documentacion | laura.ecijalopez.ext@telefonica.com | martina.torralbarodriguez@telefonica.com | `1365_18_20261029132154_29-10-2026_12_25_36.json` |
| 1365 | Tecnicos de documentacion | katerynnatalia.gonzalezordonez.ext@telefonica.com | martina.torralbarodriguez@telefonica.com | `1365_18_20261029132154_29-10-2026_12_25_36.json` |
| 1365 | Tecnicos de documentacion | almudena.cardenasvelloso@telefonica.com | martina.torralbarodriguez@telefonica.com | `1365_18_20261029132154_29-10-2026_12_25_36.json` |
| 1363 | Tecnicos de calidad | laura.ecijalopez.ext@telefonica.com | florentina.cuevascastano@telefonica.com | `expediente_1363_15-09-2026_07_37_33.json` |
| 1205 | Tecnicos de documentacion | almudena.cardenasvelloso@telefonica.com | martina.torralbarodriguez@telefonica.com | `1205_17_20261029124838_29-10-2026_11_51_06.json` |
| 1205 | Tecnicos de calidad | katerynnatalia.gonzalezordonez.ext@telefonica.com | beatriz.novalgutierrez@telefonica.com | `1205_17_20261029124838_29-10-2026_11_51_06.json` |
| 1367 | Jefe de proyecto | (empty) | tatiana.shulcaquinaupa@telefonica.com | `1231_26_20261104084535_04-11-2026_07_49_53.json` |
| 1205 | Jefe de proyecto | javier.mendozacano@telefonica.com | santiago.videgaingomez@telefonica.com | `1205_17_20261029124838_29-10-2026_11_51_06.json` |
| 1354 | Tecnicos de documentacion | martina.torralbarodriguez@telefonica.com | laura.ecijalopez@telefonica.com | `1354_21_20261103133803_03-11-2026_12_43_11.json` |
| 1205 | Tecnicos de documentacion | anamaria.rubiocanales@telefonica.com | martina.torralbarodriguez@telefonica.com | `1205_17_20261029124838_29-10-2026_11_51_06.json` |

### The rows without an origin

| Expediente | Role | Person in the list | Verdict | Why |
| --- | --- | --- | --- | --- |
| 402 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 432 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 436 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 404 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 404 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 452 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 457 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 474 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 480 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 414 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 414 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1072 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1073 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 418 | Preventa | alvaro.gonzalezcaballero@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 418 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 419 | Preventa | juliobenedicto.vicariomancho@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1190 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1195 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1222 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1223 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1257 | Preventa | rosamaria.fuentesherrero@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1257 | Preventa | manuel.fernandezgaspar@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1260 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1333 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1337 | Preventa | felix.sanchezpimentel@telefonica.com | REVISAR | el JSON no tiene huella de ingesta: el flujo no lo proceso para este expediente |
| 1307 | Direccion | juanfelix.ruizteruel.ext@telefonica.com | MANUAL | el flujo nunca escribe el tipo 7 (se pone a mano) |

### Every expediente

| Expediente | Filas | MANTENER | CAMBIAR | BORRAR | Other | JSON that governs it | Ingestion footprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 402 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 404 | 4 | 2 | 0 | 0 | REVISAR 2 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 414 | 4 | 2 | 0 | 0 | REVISAR 2 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 418 | 4 | 2 | 0 | 0 | REVISAR 2 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 419 | 4 | 3 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 432 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 436 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 452 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 457 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 474 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 480 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1072 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1073 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1190 | 4 | 3 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1195 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1205 | 8 | 3 | 4 | 1 | - | `1205_17_20261029124838_29-10-2026_11_51_06.json` | yes |
| 1222 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1223 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1231 | 4 | 3 | 0 | 1 | - | `1231_26_20261104084535_04-11-2026_07_49_53.json` | yes |
| 1257 | 4 | 2 | 0 | 0 | REVISAR 2 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1260 | 4 | 3 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1274 | 20 | 12 | 2 | 6 | - | `1231_26_20261104084535_04-11-2026_07_49_53.json` | yes |
| 1292 | 5 | 4 | 0 | 1 | - | `1292_20_20261103124955_03-11-2026_11_52_19.json` | yes |
| 1297 | 5 | 3 | 0 | 2 | - | `expediente_1297 1_16-09-2026_11_15_32.json` | yes |
| 1307 | 8 | 4 | 2 | 1 | MANUAL 1 | `E2E_export_20260819_085001_19-08-2026_07_59_25_copy_24-08-2026_09_32_54.json` | yes |
| 1333 | 2 | 1 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1337 | 4 | 3 | 0 | 0 | REVISAR 1 | `E2E_export_20260723_142133 (2).fixed_12-08-2026_07_47_11.json` | **no** |
| 1354 | 4 | 3 | 1 | 0 | - | `1354_21_20261103133803_03-11-2026_12_43_11.json` | yes |
| 1363 | 7 | 4 | 2 | 1 | - | `expediente_1363_15-09-2026_07_37_33.json` | yes |
| 1365 | 31 | 17 | 6 | 8 | - | `1365_18_20261029132154_29-10-2026_12_25_36.json` | yes |
| 1366 | 28 | 16 | 0 | 12 | - | `1365_18_20261029132154_29-10-2026_12_25_36.json` | yes |
| 1367 | 17 | 10 | 1 | 6 | - | `1231_26_20261104084535_04-11-2026_07_49_53.json` | yes |
| 2001 | 10 | 4 | 6 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2002 | 4 | 3 | 1 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2003 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2004 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2005 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | **no** |
| 2006 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2007 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2008 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2009 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |
| 2010 | 3 | 3 | 0 | 0 | - | `expedientes_relacion_24-07-2026_09_52_29.json` | yes |

## What the photo says about the assumption that everything comes from the JSON

The assumption does not hold, and the evidence is in the tables above:

- **DEV/CERT**: 829 of the 1357 rows are a repeated copy of another row of the same expediente (326 groups in 98 expedientes). The flow is not idempotent for the role rows (the same defect measured in RF03 and RF04), so the list accumulates copies of the same person.
- **PROD**: 55 of the 233 rows are a repeated copy (21 groups in 14 expedientes).
- **PROD**: 25 rows of 21 expedientes (`402, 404, 414, 418, 419, 432, 436, 452, 457, 474, 480, 1072, 1073, 1190, 1195, 1222, 1223, 1257, 1260, 1333, 1337`) belong to expedientes whose JSON was never ingested: there is no footprint of the ingestion, so the JSON does not speak for them. Those are the rows that were put in by hand, or that come from a JSON that never arrived.
- **DEV/CERT**: the 3 rows of expediente `1269` (April and May 2026) have no processed JSON at all, and the 17 rows of the `SIN_JSON_VALIDO` kind are in expedientes whose JSON declares no valid responsable, where the flow is not allowed to delete anything.
- **PROD**: one `Direccion` row (expediente `1307`), the manual one that the business decided to keep.

Everything else is drift against a JSON that **was** ingested: those rows are the ones that the rule R6 would clean up the next time the JSON of their expediente is processed.

## Open

The photo is an inventory, not a change. The decisions that belong to the business are:

1. Whether the rows that contradict an ingested JSON are fixed by **processing the JSON again** (the flow does the work, and it is the path that was measured in DEV/CERT and in PROD) or by a **direct correction of the list**.
2. Whether the repeated copies are removed, and whether the flow is made idempotent so they do not come back.
3. What happens to the rows that no JSON explains (`REVISAR`, `SIN_JSON`): they need a business criterion, because nothing in the environment can say what they should be.

## Files

- `dev-roles.csv` — every role row of DEV/CERT with its verdict.
- `prod-roles.csv` — every role row of PROD with its verdict.

Both files carry the corporate email of the people of the roles, so they belong to the internal repository of the team and not to a public channel.

