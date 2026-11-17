# PROD: the reconciliation of the ingestion, applied and verified

Date: 2026-11-17
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF` (environment
`DyS350_TF_E_PRO`, `80cfcc42-c966-ebc6-8934-9cd1802f9e53`)
Change type: Power Automate flow definitions (two cloud flows of the environment of PROD)
Status: **applied in PROD and verified.** The controlled data of the case was removed afterwards.

## Goal

The ingestion of the JSON of the expedientes was reconciled in DEV/CERT, in the phases A to E of the
gap analysis: the roles are reconciled by their identifiers, an unknown key of the JSON is rejected,
the parse requires the fifty keys of the exporter, the log says which fields changed, and an
ingestion whose JSON is older than the one already applied does not overwrite the expediente.

This record is the promotion of that work to PROD: what was published, with which values, how it was
verified and how it is undone. The evidence of the work is in the branch `DEV/CERT`, in
`docs/tests/`; this record does not repeat it.

## What was published

| Flow | Id of the row of Dataverse | Before | After |
| --- | --- | --- | --- |
| `E2E_AltaExpedientes` (the parent) | `a9928111-cd13-f111-8341-7c1e5233f7d8` | `202CDDC7805D042E44E4712810889730EED66569C8B5EB959CA12505A1C06117` | `2B056DD410ADF899AC53D8DC3C147A036A4D86E53C14B5602C776B7156026A66` |
| `E2E_AltaExpedientes_Modulo1` (the child) | `1ca49582-ae1e-f111-8342-6045bde02c54` | `DA35E32ACAC3DB676E748D828443A062EB52B64166625C20185C1B29BE333F4B` | `3BD8762BC20F828C15877FAE4C1769CCC964BFA1FA840097BFF60EE97B164C52` |

Both were published in the row of Dataverse of the flow, which is the route the platform accepts
for a solution-aware cloud flow, and both were read back by hash.

The definition that PROD runs now is the **candidate of the phase E** — the same content that was
published and measured in `DEV/CERT` (`6081A1D1…` for the parent, the exact output of the
generator) — carried over onto the definitions that were live in PROD. The value of the column
*Before* (`202CDDC7…`) is the starting point of the port, **not** the definition that was
published: the phases of the reconciliation are in what PROD runs now.

## The promotion is a port, not a copy

The definition of PROD was **not** the definition of DEV/CERT with the parameters changed: it was
the definition that is live in PROD with the phases applied on top of it. The difference matters,
and it was measured before publishing anything:

| What | In PROD | In the candidate of DEV/CERT |
| --- | --- | --- |
| The authentication of the actions | `@parameters('$authentication')` in 12 actions of the parent | the connection by name |
| The trigger of the parent | it polls the library every minute | every five minutes |
| `Validar_Limite_Snapshots` (a check that fails when a list brings more than 4999 items) | not present | present |
| The parameters of the environment | the values of PROD | the values of DEV/CERT |

A copy would have taken all of that away. The port keeps it: the parent changes in **20 paths**,
which are the guard, and the child changes in **211 paths**, which are the phases of the
reconciliation. The ported child differs from the candidate of DEV/CERT in **61 paths**: the six
parameters of PROD and the 55 blocks of authentication, and in nothing else.

## The values of the environment

They were read from the site of PROD on 2026-11-17 (read only, with the REST of the site) and they
are the values that the definitions of PROD already carried:

| Parameter | DEV/CERT | PROD |
| --- | --- | --- |
| `E2E_ConexionEntorno` | `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF` | `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF` |
| `E2E_ListaExpedientesJSON` | `39cc4d8f-f14e-45c1-9b0e-fe8eeed0167c` | `e5076497-ce45-41f1-852e-75deda0938db` |
| `E2E_ListaRolesUsuario` | `4f76ac2a-4e41-4eca-9f6c-6851ec3c09cc` | `b15bcf7c-b994-4e58-a541-61a9ebc160f0` |
| `E2E_ListaRoles` | `1e6f17dc-dfb4-49a1-b236-93708e5a9fc5` | `0472cfba-0b8d-469e-a8dc-ae1c6fae1ee1` |
| `E2E_ListaHitos` | `888881b8-1009-4ec0-ba9c-04ab387af903` | `bd50b05b-0d5d-4226-9638-3f25f6cbb100` |
| `E2E_ListaSuministradores` | `37b7ab15-3706-4694-b07e-0bfbb011d53c` | `b5757db4-7d8b-4ba6-bd8b-79ae84fcfe02` |
| `E2E_BibliotecaCargaExpedientesJSON` (`cargaJSON_entrada`) | `b33c8a3e-7640-48fb-88a1-39b1a802bba0` | `3f4ea36c-454a-49bc-98f2-adabca60e3cd` |
| `E2E_ListaExpedientes` (the child) | `d38eb17e-6b71-4100-85ab-26442190fb7f` | `4a4bb3ae-f9ff-4597-a15e-5d6c5b061db3` |
| `E2E_BibliotecaCargaJSON_Logs` | `/cargaJSON_log` | `/cargaJSON_log` |
| `E2E_BibliotecaCargaJSONFallidos` | `/cargaJSON_fallidos` | `/cargaJSON_fallidos` |
| `E2E_BibliotecaCargaJSONProcesados` | `/cargaJSON_procesados` | `/cargaJSON_procesados` |
| `E2E_GrupoJefesDeProyecto` | `Jefes de Proyecto` | `Jefes de Proyecto` (group 23) |
| `E2E_GrupoCalidad` | `Calidad` | `Calidad` (group 24) |
| `E2E_IDRol_Ingenieria` | `3` | `3` (the item of the role `Ingenieros`) |
| `E2E_Tabla_ExpedientesDataverse` | `cr435_expedientes` | `cr435_expedientes` |

The groups are used by name, so their different identifiers do not matter. The four libraries of the
JSON exist in the site of PROD, with the same relative names. **The environment of PROD has no
table of parameters** (there is no `cr435_E2E_*` table in its Dataverse), so the values of the
parameters are the defaults of the definitions, and the definitions of PROD already carried the
values of PROD.

## How it was verified

A controlled case of three expedientes (the payloads of RF15 and RF16) was ingested in PROD, with
the same protocol as in DEV/CERT: the new file, then the old one, then the cleanup.

| Run | File | Totals of the log |
| --- | --- | --- |
| `08584067014044690146522896920CU27` (08:51:21 → 08:53:24, Succeeded) | the new one | `Total 3, Nuevos 3, Actualizados 0, Fallidos 0, Antiguos 0` |
| `08584067011362258673835939597CU19` (08:55:49 → 08:56:06, Succeeded) | the old one | `Total 3, Nuevos 0, Actualizados 0, Fallidos 0, Antiguos 3` |

The log of the run of the old file carries the three expedientes with the state `Antiguo`:

    {"ID":900611801,"Estado":"Antiguo","Log":"El JSON es anterior al que ya se aplico a este expediente: no se aplica"}

**The row keeps the values of the new file**: `ImporteContratacion = 555555.55` and the observation
with the marker `[RF15 2026-11-16: fichero nuevo del guard de orden]`. The old file, which carries
`111222.33` and the marker `[RF16 ...]`, wrote nothing. The three state files
(`estado_900611801.json`, `...802`, `...803`) carry `20261116090000`, the key of the new file,
and the skipped run did not rewrite them.

The run of the old file took seventeen seconds and the run of the new one took two minutes: the
guard skips the whole branch of the expediente, so the child is not called.

The first run of the new file is the one where the read of the state fails (the file of the state
does not exist yet, because the state is written after the ingestion) and the comparison falls
into its catch, which applies the file: that is the answer for an expediente that has no state.

## What was left in the environment

Nothing of the controlled data. The rows of the case were removed with a read before and a read
after in the six stores (`ExpedientesJSON` 20 to 20, `Roles_usuario` 233 to 233,
`Suministradores` 78 to 78, `Hitos` 35 to 35, `Expedientes` 11 to 11, `cr435_expedientes` 46
to 43, three rows of the case), the three state files and the two log files of the case were
removed (the sixty-three other log files, which are the history of the team, were left untouched),
and the library of the input is empty.

## How to undo

Publish the definitions of the table above, the ones whose hash is in the column "Before", in the
same two rows of Dataverse, and read the hash back. The ordering guard does not change the data of
the expedientes: it only decides whether a file is applied, and it writes its state in a file of
the library of the logs, so undoing it leaves those files behind (they are harmless, and the next
ingestion overwrites the one of each expediente).

## Notes

- The environment of PROD carries a **copy of the child** (`be82f41f-ca1f-7e85-be11-600020c4bdc7`,
  the same definition as the child that is published). The parent calls `1ca49582...`, which is
  the row that was promoted, so the copy is not in the path of the ingestion. It was left as it is:
  removing it is a decision of the team.
- The check `Validar_Limite_Snapshots` (it fails when a list brings more than 4999 items) is in the
  parent of DEV/CERT and not in the parent of PROD. The port did not add it. The lists of PROD are
  small (20, 233, 78 and 35 rows), so adding it would not have broken anything either.
- The phase needs **no new column and no new list** in PROD. The column `ClaveGeneracionJSON` that
  the first design of the state used exists only in the staging list of DEV/CERT and it was not
  created in PROD.
- The `Dirección` role keeps being set by hand, by decision of the team.
- The consolidation of the `E2eBranding` extension into the web parts solution is a different
  change, with its own record
  ([app-extension-consolidation-2026-11-15.md](app-extension-consolidation-2026-11-15.md)). It is
  committed in the branch `develop`, not deployed in PROD.
