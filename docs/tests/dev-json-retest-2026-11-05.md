# DEV/CERT retest: partial business success, not ready

**Status: PARTIAL BUSINESS SUCCESS / NOT READY.** The persisted schema correction cleared the previous parsing blocker, but the single controlled retry finalized only IDs `1231` and `1274`. ID `1367` failed after partial writes, at a project-head SharePoint group action. Related-row reconciliation is not a PASS. This supersedes the November 4 **unpersisted schema** checkpoint, not its failed execution receipts. **DEV/CERT only; PRO excluded. No replay or cleanup is planned.**

## Persisted correction

| Evidence | Verified observation |
| --- | --- |
| Supported manual edit | The user removed only `{Thumbnail}` from `Obtener_ExpedientesSistema.items.required` and saved. Before Save, the complete editor schema canonically matched the reviewed proposal. |
| Independent server readback | HTTP `200`, checked `2026-11-05T09:05:28.650Z`; non-draft request (`draftRequest=false`), flow `Started`, last modified `2026-11-05T09:03:24Z`. |
| Exact schema comparison | Complete returned schema matches the reviewed proposal: **23 required members**, `{Thumbnail}` not required, its property definition retained. |
| Preserved mapping and binding | Cliente remains `@body('ExpedienteJSON')?['organocontratacion']`; default site remains [CERT](https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF). |
| Local evidence | Sanitized readback and 12 bounded retest receipts retained in ignored local evidence storage; no raw business JSON, personal contacts, credentials, tokens or signed action URLs are reproduced here. |

Native resources in the same DEV environment: [parent flow](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/a9928111-cd13-f111-8341-7c1e5233f7d8/details) and [Module1](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/details).

## Identity, checker and input limits

- The Power Automate screenshot showed the human operator signed in. Flow checker showed **0 errors and 5 owner Premium warnings**, associated with Dataverse. This does **not** prove execution entitlement, resolve licensing, or authorize ownership/licensing changes.
- A new CERT browser tab showed the generic SharePoint account after normal SSO. No credentials were handled. SharePoint browser identity is not proof of the flow's effective runtime identity.
- The supplied original remains unchanged: SHA-256 `0e083cfc4b8aa3cbb05663ca311c516b1075aba3494a5b7bcdfa888d15b30f8e`. The prior processed-file receipt recorded **8,043 bytes** and the same hash.
- All three original `organocontratacion` values are null, and the November 4 baseline had no existing provisioned destination for these IDs. Even a successful retry cannot certify non-null Cliente propagation or existing-destination updates.

## Controlled runtime receipts

Fresh read-only preflight, one controlled native classic upload and automatic execution are complete. Do not duplicate uploads, overwrite an existing input, resubmit historical runs, or infer business success from top-level **Succeeded** or processed-library placement.

| Required evidence | Status |
| --- | --- |
| Persisted Thumbnail-only correction | Verified above. |
| Fresh input/log/target baseline and effective DEV/CERT bindings | Verified below; point-in-time preflight only. |
| Single new input receipt and byte identity | Native classic upload, overwrite unchecked; independent GET `200` confirms input item `217`, Created/Modified `2026-11-05T09:09:29Z`, with the original filename. Local input hash remains unchanged; processed item `142` independently matches its bytes, as recorded below. |
| Correlated new parent/child runs and independent business log | Log `98`: two finalized IDs, one failed ID; details below. |
| Staging, destination, related-item and group-effect reconciliation | Partial writes and group failure verified; related-row health is **not PASS**. |
| Non-null Cliente and existing-provisioned-destination coverage | Not covered by the original input. |

### Preflight and upload receipts

- Parent definition GET returned HTTP `200`, `Started`, last modified `2026-08-05T10:48:47Z`. The current `E2E_ConexionEntorno` value resolved to CERT with HTTP `200`; all parent SharePoint actions use that parameter. The five-minute trigger points to the known input library and the identified Module1 child.
- November 5 CERT baseline GETs returned HTTP `200`: staging rows `179`/`182` retain their August timestamps, no staging row exists for `1367`, and the provisioned destination has no matching rows. The **38 role rows** and **17 supplier rows** retain their prior IDs/timestamps; supplier joins use `IDProyecto`; there are **0 hitos**.
- Before upload, the original-prefix input query was empty; only November 4 business-log item `97` and processed item `141` remained, with no matching failed copy. This is the duplicate-prevention baseline, not a new execution result.
- The original file `1231_26_20261104084535_04-11-2026_07_49_53.json` was uploaded **once**, without overwrite, and independently confirmed as item `217` above. No manual resubmission or duplicate upload occurred.

### Execution and business outcome

| Evidence | Observation |
| --- | --- |
| Parent execution | [08584077370855706489097251946CU05](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/a9928111-cd13-f111-8341-7c1e5233f7d8/runs/08584077370855706489097251946CU05). |
| Child executions, oldest first | [08584077370744292384742423233CU15](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584077370744292384742423233CU15), [08584077370477265205564568630CU18](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584077370477265205564568630CU18), [08584077369988642628560557135CU30](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584077369988642628560557135CU30). The newest is confirmed for `1367`; the first two business-ID pairings are not independently established here. |
| Independent business log | CERT item `98`, Created `2026-11-05T09:12:05Z`: `1231` and `1274` have `Estado=Finalizado`; `1367` has `Estado=Fallido`, with the generic message `An action failed...`. Counters: `Total=3`, `Nuevos=1`, `Actualizados=2`, `Fallidos=1`. These counters are not disjoint success totals: the new record was partially created before failure. |
| Exact observed failure | In the confirmed `1367` child, `Obtener_ExpedientesSistema` succeeded. `Añadir_usuario_a_grupo_SP_Jefes_de_Proyecto_2` failed inside `Por_cada_Responsable_3` (two repetitions). The blank-responsible input and request expression are verified below; the failing repetition's exact HTTP response is unavailable. |
| Misleading run status | The `1367` child reports **Succeeded**, from `2026-11-05T09:11:26.7458428Z` to `2026-11-05T09:12:06.4137039Z`, despite the failed action and business log. |
| Input disposition | Input `217` removed; processed item `142` Created `2026-11-05T09:12:07Z`, Modified `2026-11-05T09:12:13Z`. Its independent GET returned HTTP `200`, **8,043 bytes**, SHA-256 `0e083cfc4b8aa3cbb05663ca311c516b1075aba3494a5b7bcdfa888d15b30f8e`: exact original-byte equality. Failed-library original-prefix query found no match. Retention is not evidence of complete business success. |

### Independent post-run reconciliation

All bounded SharePoint target readbacks below returned HTTP `200`.

| Area | Observed result and limit |
| --- | --- |
| Staging | Row `179` (`1231`) Modified `2026-11-05T09:10:15Z`, Ordinal `92`; row `182` (`1274`) Modified `2026-11-05T09:10:44Z`, Ordinal `93`; new row `310` (`1367`) Modified `2026-11-05T09:11:34Z`, Ordinal `94`. |
| Bounded core-field checks | **30 Boolean comparisons passed: ten per record** covering Title, Nemotecnico, three date-only fields normalized to Europe/Madrid, Estado, Cliente (null only), OrdinalE2E, and quality/security responsible IDs. This is not a complete 36-field mapping test or complete expediente processing. |
| Provisioned destination | All three IDs remain absent from `Expedientes`; existing-destination update behavior is not exercised. |
| Roles | **51 rows** after execution: the original **38 IDs all remain**, plus **13 new rows**. The executed flow mocked the role-delete action, as verified below; replacement semantics are not a PASS. |
| Suppliers | **18 rows** after execution. Of the original 17, only `714` and `715` disappeared; new rows `1821`/`1822` belong to `1231`, and `1823` to `1274`. Related-row health is **not PASS**. |
| Hitos | **0 rows**; the one supplied for `1367` was not created. |
| `1367` partial effects | Action receipts show staging and Dataverse creates succeeded; quality-role and quality-group creation succeeded; a project-head role was created before the project-head group action failed. Do not treat the failed item as rolled back or safe to replay. |
| Project-head group | The second, valid `1367` head is a member. The first source entry has an empty name and email; no registered-user claim is valid for it. An earlier empty-email site-user lookup matched unrelated blank Email fields and was discarded as identity evidence. No identities or contact data are reproduced. |

## Confirmed blockers and diagnostic limits

### Role deletion was mocked in the executed definition

The run's embedded source confirms that `Eliminar_RolesUsuario` used the enabled static result `Eliminar_RolesUsuario0`, with mocked `Succeeded` / `OK`. It was the executed definition's **only enabled static result**. The real role deletion did not execute, explaining retention of the old role IDs; a green action is not a deletion receipt. Microsoft's [static-result testing guidance](https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/test-cloud-flows#static-result-testing-with-mock-data) describes this mock behavior.

**Do not disable the mock unilaterally.** Doing so enables actual deletions and requires review of the intended replacement business rule, authorization, baseline and partial-write recovery plan. This finding does not explain every supplier discrepancy or prove all related-row behavior correct.

### A project-head entry has no usable principal

The original `1367` input's first responsible has `esjefeproyecto=Sí` but empty name and `correousuario`; the second entry is valid. The failed action's executed definition constructs `LoginName` as:

```text
i:0#.f|membership|@{items('Por_cada_Responsable_3')?['correousuario']}
```

That expression and the blank input establish an unusable principal on this path. **Inference:** this is the likely immediate reason the group addition failed; the exact failing repetition HTTP response was not obtained, so no specific status code, connector message or permissions cause is claimed. `1274` also includes an empty project-head entry; `1231` includes an empty non-head entry. Finalized status alone therefore does not certify every responsible/group operation.

Next remediation should define a business rule to validate or skip empty responsible entries with explicit logging, and review the deletion mock before enabling real deletion. No such change, cleanup or retry was performed in this retest.

### Coverage remains bounded

The uppercase input `OrdinalE2E` persisted as `92`, `93`, `94`: this observed case passed, but it does not establish a generalized casing rule. Non-null Cliente propagation and existing-provisioned-destination updates remain untested. Dataverse create succeeded for `1367`, but this does not certify licensing entitlement or resolve the five owner Premium warnings.

## History and next step

The [November 4 execution trace](dev-json-trace-2026-11-04.md) retains the original three business failures and unsuccessful save attempts. The [offline diagnostic bundle](dev-schema-diagnostics-2026-11-04/README.md) remains a historical, non-deployable review aid; its original schema JSON and receipts are unchanged.

**Next step:** agree the empty-responsible business rule and review the executed deletion mock plus partial-write recovery before any further mutation. Do not replay or clean up partial writes without a separately reviewed decision. No integration PASS or PRO release approval is established.
