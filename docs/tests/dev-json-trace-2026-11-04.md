# DEV/CERT JSON trace: business failure despite successful run status

**Status: BUSINESS FAILURE.** The parent and three child runs display **Succeeded**, but independent CERT log item `97` reports schema-validation failure for **all three expedientes**: total `3`, new `0`, updated `0`, failed `3`. No metadata propagation or successful business processing is proved. No retry or additional upload has occurred.

**Remediation checkpoint: NOT FIXED.** A native designer Save appeared successful, but independent server read-back proves the intended schema change did not persist. Stop further save/retry attempts pending a fresh incident audit. The earlier verified Cliente correction remains present; this unresolved change concerns a different schema.

## Authorization and boundary

On November 4, 2026, the user explicitly approved testing the supplied production-origin JSON **only in DEV/CERT**, including input-file removal, replacement of related items and group-membership changes described before approval. **PRO is excluded.** This approval does not establish runtime success or permit production deployment.

The input contains three expediente IDs in source order: `1231 → 1274 → 1367`. Raw JSON, contact details and financial data are intentionally excluded from this report.

## Read-only preflight evidence

| Check | Observation | Limit |
| --- | --- | --- |
| Local input validation | Schema validation passed for the supplied input. | Structural validation only; not a connector or integration test. |
| Cliente coverage | All three `organocontratacion` values are null. | Original input cannot demonstrate propagation of a non-null Cliente value. |
| Ordinal field | Source uses `OrdinalE2E` capitalization. | Runtime parsing/mapping behavior remains to be observed. |
| Staging: `ExpedientesJSON` | ID `1231`: row `179`, Modified `2026-08-05T11:14:05Z`, Ordinal `72`. ID `1274`: row `182`, Modified `2026-08-05T11:18:14Z`, Ordinal `83`. No row found for `1367`. | Baseline from same-origin SharePoint read-only GET; not an execution result. |
| Provisioned destination: `Expedientes` | Query returned HTTP 200 and an empty result for all three IDs. | Original input does **not** test updating an existing provisioned destination. |
| Related items — corrected baseline | Correct joins use `IDProyecto = business ID`. These queries returned HTTP 200: **0 hitos and 17 suministradores**. | Earlier empty queries through `IDHitoExpediente` / `IDExpedienteSuministrador` used the wrong relationship and do **not** establish absence. |
| Roles | Related `Roles_usuario` query returned HTTP 200 with existing rows. | Baseline exists; personal fields are omitted. Compare replacement effects using retained receipts. |
| Module1 | Live definition GET returned HTTP 200, `state=Started`, `lastModified=2026-11-04T14:15:43Z`. Corrected Cliente mapping and Title-preservation expression are present. All SharePoint actions use the CERT environment parameter. | Embedded connections are not proof of effective generic-account runtime identity or execution entitlement. Initial run history was empty. |
| Parent flow and bindings | Live definition GET returned HTTP 200, `state=Started`; all SharePoint actions use `E2E_ConexionEntorno`, whose current value is CERT. Input-list GUID resolves with HTTP 200 to `cargaJSON_entrada`; staging/destination GUIDs resolve with HTTP 200 to the expected lists. | Definition/binding verification, not execution evidence. |
| Automatic trigger | Parent uses `GetOnNewFileItems` with a five-minute recurrence and references the identified Module1 child. | Await its ordinary trigger; no manual resubmit or duplicate upload. |
| Dataverse | Module1 uses current-environment actions on `cr435_expedientes`. | Actual Dataverse outcomes remain unobserved. |

The 17 baseline suministrador row IDs are `714`, `715`, `808`, `809`, `842`, `997`, `998`, `1031`, `1280`, `1281`, `1314`, `1489`, `1490`, `1523`, `1698`, `1699`, `1732`. Retain these identities when comparing replacement effects; do not mistake the earlier incorrect empty query for a clean baseline.

## Identified DEV resources

| Resource | ID |
| --- | --- |
| Environment | `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b` |
| Unmanaged BACK solution | `ce6666c9-103a-4290-a63d-d8432400a052` |
| Parent flow | `a9928111-cd13-f111-8341-7c1e5233f7d8` |
| Module1 | `1ca49582-ae1e-f111-8342-6045bde02c54` |
| SharePoint site | [CERT site](https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF) |

## Input upload receipt

| Check | Verified result |
| --- | --- |
| Native submission | Classic SharePoint `Upload.aspx` succeeded; overwrite was unchecked. The modern UI had an invalid-action state. |
| Input identity | Original supplied filename `1231_26_20261104084535_04-11-2026_07_49_53.json`; input item ID `215`. |
| Persistence | Subsequent same-origin GET returned HTTP 200 and confirmed the exact filename and Created/Modified timestamp `2026-11-04T18:18:07Z`. |
| Duplicate prevention | Initial keyboard attempt did not upload. Absence in input/log/failed/processed locations was verified before the single successful native submission. No overwrite or resubmission occurred. |

## Runtime receipts and reconciliation

| Evidence | Actual result |
| --- | --- |
| Parent execution | Run [08584077905674725878537383599CU31](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/a9928111-cd13-f111-8341-7c1e5233f7d8/runs/08584077905674725878537383599CU31) displays **Succeeded**, duration **42 seconds**. |
| Child executions, oldest first | [08584077905564980699380261555CU29](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584077905564980699380261555CU29): **Succeeded**, 7 seconds; [08584077905484542199662839986CU18](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584077905484542199662839986CU18): **Succeeded**, 8 seconds; [08584077905405333625238887774CU03](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584077905405333625238887774CU03): **Succeeded**, 6 seconds. Individual business-ID/run pairing is not yet established here. |
| Independent business log | CERT output-log item `97`, Created `2026-11-04T18:19:12Z`: IDs `1231`, `1274`, `1367` each have `Estado=Fallido` and `Log=The schema validation failed.` Totals: `Total=3`, `Nuevos=0`, `Actualizados=0`, `Fallidos=3`. |
| Input disposition | Input item `215` was removed by the flow. Processed-library item `141` was created at `2026-11-04T18:19:12Z`, modified at `2026-11-04T18:19:20Z`, with original prefix plus `_04-11-2026_06_19_12.json`. Failed-library prefix query found no match. |
| Staging reconciliation | GET returned HTTP 200. Rows `179` and `182` retain exactly their August Modified timestamps; no staging row for `1367`. |
| Destination reconciliation | GET returned HTTP 200; `Expedientes` still has no matching rows. |
| Related-item reconciliation | GETs returned HTTP 200: 38 role rows with unchanged timestamp list; 17 supplier rows with unchanged IDs/timestamps; 0 hitos. |

**Interpretation:** top-level **Succeeded** and placement in the processed library do not mean business success. The parent failure counter correctly reports `3`; no counter defect is established. The observed business rows are unchanged; do not extrapolate this bounded reconciliation to unobserved Dataverse or group effects.

## Exact failure and unsuccessful remediation

| Evidence | Verified result | Meaning |
| --- | --- | --- |
| First child action | `Obtener_ExpedientesSistema` (`ParseJson`) failed. Parsing the supplied `ExpedienteJSON` succeeded. | The supplied business JSON's syntax was not the cause of this failure. |
| Action outputs | HTTP 200 retrieval returned **124 required-property errors** for missing `{Thumbnail}`, paths `[0]` through `[123]`, schema `#/items`. | Existing system-list rows were rejected by an overly strict `required` constraint. Signed action-input/output URLs are intentionally omitted. |
| Independent review | Only `{Thumbnail}` needs to become optional in this schema; no business logic uses it. | Preserve the property definition and all other constraints. This is the reviewed narrow remediation, not a completed fix. |
| Native classic designer attempt | Public Monaco model edit removed only `{Thumbnail}` from `required` (24 → 23), retained its property, and reverse-canonical comparison matched the original. Native Save displayed Saved/ready. | Editor-model validation and UI acknowledgement alone do not establish persisted behavior. |
| Independent post-save read-back | Native server GET returned HTTP 200, `state=Started`, `lastModified=2026-11-04T18:33:58Z`, but the schema still had **24 required members**, including `{Thumbnail}`. | Metadata changed, but the functional schema correction **did not persist**. Do not call this fixed or republished. |

The cause of the editor-model/save-binding discrepancy is unverified. No second upload, resubmission or runtime retest occurred. Further mutation attempts are stopped at this checkpoint pending fresh incident audit.

## Required execution evidence

- [x] Verify effective parent/child SharePoint targets and capture the input baseline before upload.
- [x] Upload once without overwrite and independently confirm the input receipt.
- [x] Record input identity, parent/child run IDs, summary outcomes and business failures.
- [x] Re-read staging, destination and related rows; compare persisted values and input-file disposition against the baseline.
- [x] Inspect the exact failing schema/action and identify the missing required `{Thumbnail}` constraint.
- [ ] Resolve the unsuccessful functional save through fresh incident audit; independently read back the corrected saved schema before any retry.
- [ ] Observe Ordinal casing behavior and role/group effects rather than infer them from a successful top-level run.
- [ ] Run a controlled non-null Cliente case and an existing-provisioned-destination update case before claiming those requirements pass.

**Next step:** fresh incident audit of the unsuccessful schema save. Do not retry execution until the persisted schema correction is independently verified. No case is marked PASS and no PRO release is approved.

For historical context only, see the [November 3 title-sync report](dev-title-sync-2026-11-03.md). Its isolated-harness preparation and local tests are not evidence for this execution.

## Renewed diagnostic checkpoint — 22:03 UTC

**Still NOT FIXED / NOT APPLIED.** Renewed native keyboard paste produced malformed editor JSON; no Save was performed, and immediate reload discarded the unsaved edit. Fresh sanitized server readback at `2026-11-04T22:03:33.759Z` still reports `Started`, last modified `2026-11-04T18:33:58Z`, and 24 required members including `{Thumbnail}`. The corrected Cliente expression remains present. Editor transport/save binding is unreliable; its root cause remains unverified. Stop editor automation writes; no second JSON upload or runtime retry occurred.

The [offline schema diagnostic bundle](dev-schema-diagnostics-2026-11-04/README.md) contains observed/proposed schema-only artifacts, a guarded required-array patch and a machine-readable receipt. Eight built-in Node assertion groups pass locally: the sole proposed change is removing `{Thumbnail}` from `items.required` (24 → 23), preserving its definition and all other constraints. Required-presence probes use synthetic records only and are **not full JSON Schema or runtime validation**. The bundle is **NOT DEPLOYABLE FLOW / NOT APPLIED**; it contains no supplied business JSON and performs no cloud operations.

Fresh CERT read-only reconciliation returned HTTP 200: staging rows `179`/`182` still retain their August timestamps, no row exists for `1367`, the input is empty, and only existing log item `97` remains (Modified `2026-11-04T18:19:12Z`). Processed item `141` returned HTTP 200 with 8,043 bytes; its WebCrypto SHA-256 matches the supplied original's local hash exactly: `0e083cfc4b8aa3cbb05663ca311c516b1075aba3494a5b7bcdfa888d15b30f8e`. This proves byte-identical processed-file retention, **not business success**. No original file copy or content is stored in this report or bundle.

**Next step:** independently review the bundle, then use a reliable supported manual schema-edit path with full independent persisted readback before any separately controlled DEV/CERT execution. Historical failure receipts above remain unchanged. No integration PASS or PRO approval is established.

## Superseding schema checkpoint — November 5

**SCHEMA FIX PERSISTED; RETRY PARTIALLY SUCCESSFUL / NOT READY.** After the user's narrow manual edit and Save, independent non-draft server GET at `2026-11-05T09:05:28.650Z` returned HTTP `200`, flow `Started`, last modified `2026-11-05T09:03:24Z`. The complete schema equals the reviewed proposal: 23 required members, `{Thumbnail}` optional, its property definition retained. The corrected Cliente expression and CERT default site remain present.

This supersedes the **unpersisted schema** status above; the November 4 business failures and original receipts remain historical facts. The single November 5 retry is now **PARTIAL BUSINESS SUCCESS / NOT READY**: input `217` was processed, log `98` finalized `1231`/`1274` but failed `1367` after partial writes at a project-head group action. Related-row health is not a PASS. Continue with the [November 5 retest report](dev-json-retest-2026-11-05.md) for current receipts and limits. No replay or cleanup is planned. **DEV/CERT only; PRO excluded.**
