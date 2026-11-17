# PROD: the reconciliation of the ingestion, prepared for promotion

Date: 2026-11-17
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF`
Change type: Power Automate flow definitions (two cloud flows of the environment of PROD)
Status: **prepared, not applied. Nothing was written in PROD.**

## Goal

The ingestion of the JSON of the expedientes was reconciled in DEV/CERT, in the phases A to E of the
gap analysis: the roles are reconciled by their identifiers, an unknown key of the JSON is
rejected, the parse requires the fifty keys of the exporter, the log says which fields changed,
and an ingestion whose JSON is older than the one already applied does not overwrite the
expediente.

This record is the promotion of that work to PROD: what is published, with which values, how it is
verified and how it is undone. The evidence of the work is in the branch `DEV/CERT`, in
`docs/tests/`; this record does not repeat it.

## What is published

| Flow | Hash in DEV/CERT | Hash of the candidate of PROD |
| --- | --- | --- |
| `E2E_AltaExpedientes` (the parent) | `6081A1D10C88F3E0698F5C8A3664D881961AB18A0DFADBFDA65F7DE48637FDA7` | `068598C84E0CF6A8C5FC084E3DB037C1B19EB696CC538B7FEA6B535EBD656E9E` |
| `E2E_AltaExpedientes_Modulo1` (the child) | `062C26A11FAB4AA8B0E44441C13E739F28EBD28FD072BCCD0AB5E904BF6856BD` | `462489447BB9457CDCCCC80B2F3E7BE8EA307ABCFF8AA5E9CB51629C63ABED11` |

The candidate of PROD is the candidate of DEV/CERT with **nothing changed but the default value of
the parameters of the environment**. The generator that builds it
(`scripts/flow-title-sync/prepare-prod-candidates.cjs`, in the branch `DEV/CERT`) refuses to
write a candidate that differs in any other path, and its tests check that no parameter of the
definition keeps the value of DEV/CERT.

The candidate is built on the definitions of DEV/CERT, so it carries them: the parent on
`2A2E04E4...` (the parent before the phase E) and the child on `84FABEA2...` (the child before the
phase D, which is the centralized mapping of RF10). That is why the definitions that are live in
PROD have to be compared with those bases **before** the publication: a difference that is not
part of the work measured in DEV/CERT would be lost by it.

## The parameters: this is the part that breaks a promotion

A flow carries, for every parameter of the environment, a **default value**. The defaults of the
candidates of DEV/CERT point at the site of DEV/CERT, so a definition copied as it is would make
the flow of PROD write in the site of DEV/CERT. The values of PROD were read from the site of PROD
on 2026-11-17 (read only, with the REST of the site) and are in the table of the generator:

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
| `E2E_Tabla_ExpedientesDataverse` | `cr435_expedientes` | to confirm in the Dataverse of PROD |

The groups are used by name, so their different identifiers do not matter. The four libraries of the
JSON exist in the site of PROD, with the same relative names.

**Two values could not be read from here and have to be confirmed before publishing**: the table of
the Dataverse of PROD (`cr435_expedientes`) and the **effective binding** of every parameter in
the environment of PROD. The definition carries the defaults and the environment carries the
values, and the one that wins is what the flow uses: the portal has to show the PROD values as the
effective ones, not the defaults of DEV/CERT.

## How to publish

1. Read the definition that is live in PROD of the two flows and write down its hash. That is the
   rollback. Compare it with the base of DEV/CERT (`2A2E04E4...` for the parent, `84FABEA2...` for
   the child): every difference has to be a difference already measured in DEV/CERT, or a change
   that has to be ported to DEV/CERT first.
2. Check the effective bindings of the parameters of the environment of PROD (the values of the
   table above).
3. Publish the candidate of PROD in the two flows. The definition is written in the row of
   Dataverse of the flow (`workflows(clientdata)`), which is the route the platform accepts for a
   solution-aware cloud flow, and the read-back by hash is the proof of what is live.
4. Read back the hash of the two flows and compare it with the table above.
5. Make an ingestion with a JSON of a real expediente and read the log of it in
   `cargaJSON_log`.

## How to verify

| Check | What is expected |
| --- | --- |
| Hash of the parent after the publication | `068598C8…` |
| Hash of the child after the publication | `46248944…` |
| Effective binding of `E2E_ConexionEntorno` | the site of PROD |
| The log of the ingestion | the counters of the totals and, for an expediente that already existed, the fields that changed with their previous and new value |
| The state of the ordering guard | the file `estado_<idexpediente>.json` appears in `cargaJSON_log` with the fourteen digits of the generation time of the JSON applied |

## How to undo

Publish the definitions of step 1, the ones whose hash was written down, and read the hash back.
The ordering guard does not change the data of the expedientes: it only decides whether a file is
applied, and it writes its state in a file of the library of the logs, so undoing it leaves those
files behind (they are harmless, and the next ingestion overwrites the one of each expediente).

## Notes

- The phase needs **no new column and no new list** in PROD. The column `ClaveGeneracionJSON` that
  the first design of the state used exists only in the staging list of DEV/CERT and it must not be
  created in PROD.
- The `Dirección` role keeps being set by hand, by decision of the team.
- The consolidation of the `E2eBranding` extension into the web parts solution is a different
  change, with its own record
  ([app-extension-consolidation-2026-11-15.md](app-extension-consolidation-2026-11-15.md)).
- The environment of PROD could not be read from the session that prepared this record: the account
  used only reaches the environment of DEV/CERT. The identifiers of the flows of PROD and their
  current hashes have to be read by whoever has access to that environment.
