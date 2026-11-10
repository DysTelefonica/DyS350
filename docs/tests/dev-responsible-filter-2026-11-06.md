# DEV responsible filter: BLOCKED_FOR_RELEASE

## Current verdict: RF02 scalar PASS; related-row duplication FAIL

**BLOCKED_FOR_RELEASE.** RF01's new-record hierarchy remains a bounded **PASS**. The subsequent single-record RF02 update succeeded technically and updated the intended title/date in SharePoint and Dataverse, but created duplicate existing roles and a duplicate supplier. Green run status and `0 failed` do not establish business correctness or release readiness. DEV/CERT only; no code/mock change, replay, cleanup, permission change or PRO operation occurred in this diagnostic/report update.

November 7 follow-up: [parent snapshot completeness and current release HOLD](dev-parent-snapshot-completeness-2026-11-07.md). The published parent candidate passed bounded R04 runtime reconciliation: full current-fixture snapshots beyond 100 rows and count-guard success. This does not supersede RF02's related-row failure or establish idempotence.

### RF02: actual changed-data update

The new input selected only existing isolated leaf **900611367**, preserving its complete arrays/person objects and hierarchy. Exactly two scalar values changed: `titulo` and `fechaoferta`. The [fixture receipt](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-fixture-receipt.json) is historical preparation evidence; the later [native upload receipt](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-native-upload-receipt.json) proves **one submission**, item **221**, at `2026-11-06T18:48:41Z`, and content HTTP 200 matching **3749 bytes** and prepared SHA256 `e81acebc8a0a1deaa1c39bf3d9acd923d1f65227a37ee7506b1759f95f802c22`. This was not a blind replay of a failed/original production input.

| Check | Actual evidence / verdict |
| --- | --- |
| Runtime and counters | Parent and child `Succeeded`; parent numeric totals **1 total / 0 new / 1 updated / 0 failed**. Query **2 → 1**; one warning for the leaf, `Estado: Advertencia`, `Omitidos: 1`; Catch skipped. See [runtime responses](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-runtime-responses.json) |
| SharePoint scalars | Same staging item **313**; exact new title, SHA256 `5807f96d0f49f9b45d47f0303210cca7d2c9d001d1c188c32418f6153106095b`; date changed from null to stored `2026-11-06T23:00:00Z`. **PASS for intended November 7 date**: fresh field metadata declares DateOnly, DisplayFormat `0`, and stored instant converts to `2026-11-07` in Madrid. See [SharePoint readback](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-sharepoint-readback.json) and [date/key checks](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-duplicate-business-keys.json) |
| Dataverse scalars | Native GET HTTP 200, exactly one row, same GUID **77e5858d-f4d9-f111-a05b-000d3ad7fae2**; exact new title/hash matches SharePoint; date `2026-11-07T00:00:00Z`, formatted `07/11/2026`; no next page. **PASS**. See [Dataverse readback](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-dataverse-readback.json) |
| Existing roles | **3 → 6: FAIL.** Old **1677 / 1678 / 1679** remain; new **1680 / 1681 / 1682** repeat roles **4 / 2 / 5**. Scoped GET confirms three exact duplicate groups on `IDExpediente + IDRol + trimmed lower-case usuario`, not merely repeated role IDs; no contacts disclosed |
| Existing supplier | **1 → 2: FAIL.** Old **1827** remains, new **1828** added. Direct comparison confirms equality of all nine checked business fields: `Title`, `IDSuministrador`, `IDProyecto`, `Descripcion`, `ContratistaPrincipal`, `Subcontratista`, `IDPadre`, `EsJuridica`, `IDExpedienteSuministrador`. Values intentionally omitted; see [duplicate-key checks](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-duplicate-business-keys.json) |
| Milestone | **1 → 1**, **635** removed and **636** created; replacement evidence, not full semantic-field equality |
| Ancestor isolation | Root staging **311** and child staging **312** retain exact full-row baseline hashes; their **8 role rows and 3 supplier rows** also retain hashes. See [before baseline](../../.atl/project-title-sync/skip-empty-responsibles-20261106/rf02-before-baseline.json) and after readback |
| Disposition / membership | Scoped input/failed-library queries empty; processed **144**, log **100**; destination Expedientes query empty. Groups **35 / 36** remain **12 / 5** with retained-member flags, not full identity-set equality |

These exact native routes were opened and reported `Succeeded`; they do not replace persistence reconciliation:

| RF02 run | Link |
| --- | --- |
| Parent | [08584076159336251292056575922CU20](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/a9928111-cd13-f111-8341-7c1e5233f7d8/runs/08584076159336251292056575922CU20?v3=false) |
| Existing leaf | [08584076159230370786914499175CU26](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584076159230370786914499175CU26?v3=false) |

### Proven cause versus separate remaining risks

The [parent source](../../.atl/project-title-sync/skip-empty-responsibles-20261106/parent-source.json) gives `Obtener_ExpedienteJSON` a `paginationPolicy.minimumItemCount` of **5000**. In contrast, `Obtener_Roles_usuario`, `Obtener_Suministradores` and `Obtener_Hitos` have **no pagination policy, explicit top, filter or order**. RF02's actual parent outputs returned **100 role rows with no leaf rows**, **100 supplier rows with no leaf rows**, and **51 milestones including 635**. The before baseline independently proves the leaf roles and supplier already existed.

The [saved child source](../../.atl/project-title-sync/skip-empty-responsibles-20261106/saved-source.json) filters those passed snapshots by `IDExpediente` for roles and `IDProyecto` for suppliers/milestones. Existing roles therefore appeared absent: **`Por_cada_Responsable_Sin_RolesUsuario` succeeded; `Por_cada_Responsable_2` was skipped**. The omitted supplier was not selected for deletion and remained while another was created; the included milestone was replaced. This directly establishes false absence from incomplete snapshots and observed related-row non-idempotence.

**Do not attribute this run's role duplicates to a failed/mock deletion:** the existing-with-roles branch/deletion loop was not exercised. Enabled `Eliminar_RolesUsuario0` remains a separate replacement-safety risk. Complete snapshots alone do not prove role idempotence: the quality guard reads current `ArrayResponsables`, and role/security creation needs independent reconciliation review. No mock was disabled or deletion retried.

Combined RF01/RF02 evidence covers **four of five Query consumers**: common membership, new-root, new-child and existing-without-roles. Only existing-with-roles **`Por_cada_Responsable_2`** remains unexercised. RF02 does not cover an intentionally empty-role baseline, provisioning propagation, changed responsible identities, malformed/missing collections, or a caught downstream failure.

### Minimal next fix plan — proposal only, not applied

1. **Close the parent read gap:** propose pagination on exactly `Obtener_Roles_usuario`, `Obtener_Suministradores`, `Obtener_Hitos`, using staging's **5000** minimum-item policy as a bounded starting point. Preserve bindings, payloads, child definition and enabled mock; require independent review before application. Verify actual target inclusion and completeness; 5000 is not unlimited. If supported list sizes exceed the bound, require complete per-expediente reads or an explicit fail-closed completeness check before destructive/recreate decisions. Pagination adds request/latency cost; scoped reads avoid whole-list growth but are a larger change.
2. **Reconcile role writes by identity:** independently review existing-role, quality and security paths against `IDExpediente + normalized usuario + IDRol`; define an approved idempotent upsert/diff policy. Verify supplier identity using `IDProyecto`, `IDSuministrador`, `IDPadre`, `IDExpedienteSuministrador`. Do not assume parent pagination fixes all role duplicates or silently disable the mock. Effective deletion/replacement requires separate explicit authorization and evidence.
3. **Verify before release:** use a newly approved controlled case, not automatic replay of the now-duplicated leaf. Prove complete snapshots, the fifth Query consumer, exact related-key equality/counts after update and repeat, scalar persistence, counters/warnings and ancestor isolation. Preserve RF01 and cover remaining failure/input/provisioning gates separately. Existing duplicates stay untouched pending approved remediation.

Receipts are private ignored local review evidence, not committed/public artifacts. Independent reconciliation used strict case-sensitive JSON parsing (`ConvertFrom-Json -AsHashtable`): legitimate receipts contain both `ID` and `id`, which default object parsing rejects. Failed inspection output was discarded.

## RF01 runtime status: PASS — new-record hierarchy only (preserved)

**The single controlled DEV/CERT submission passed its bounded runtime reconciliation: one new root and two new descendants, 3 new / 0 updated / 0 failed. This is not full requirement readiness.** The parent and all three child runs succeeded. Actual SharePoint and Dataverse readbacks agree on all three identities and their hierarchy; expected targets alone are not used as persistence evidence. This status supersedes the historical `SUBMITTED_RUNTIME_PENDING` checkpoint below. No PRO operation, replay, cleanup, code/mock change or permission change was performed.

### Observed runtime evidence

| Check | Actual result |
| --- | --- |
| Single input | Input item 219; one native submission; content HTTP 200, 10941 bytes and prepared SHA256 confirmed by the [upload receipt](../../.atl/project-title-sync/skip-empty-responsibles-20261106/native-upload-receipt.json) |
| Parent business result | Succeeded; numeric totals `Total: 3`, `Nuevos: 3`, `Actualizados: 0`, `Fallidos: 0`; three successful child responses in [runtime responses](../../.atl/project-title-sync/skip-empty-responsibles-20261106/runtime-responses.json) |
| Query and warnings | Inputs → outputs **3 → 2, 3 → 2, 2 → 1**; each child appended one aggregate warning with its ID, `Estado: Advertencia` and `Omitidos: 1`, in [child action traces](../../.atl/project-title-sync/skip-empty-responsibles-20261106/child-runtime-traces.json) |
| Executed paths | Root: new-root SharePoint/Dataverse creation and `Por_cada_Responsable` succeeded. Both descendants: new-child creation and `Por_cada_Responsable_3` succeeded. Common `Por_cada_MiembroResponsable`, warning guards and responses succeeded for all three; Catch was skipped |
| SharePoint hierarchy | Staging items **311 / 312 / 313** map to **900611231 / 900611274 / 900611367**; parent IDs are **null / 900611231 / 900611274**; codes and nemotecnicos match the isolated fixture, in [SharePoint readback](../../.atl/project-title-sync/skip-empty-responsibles-20261106/sharepoint-runtime-readback.json) |
| Dataverse persistence | Native HTTP 200 GET returned exactly three distinct records, matching expediente IDs, both code fields, nemotecnicos and descendant parent IDs; no next page. A separate HTTP 200 query with the same code prefix and an explicit parent-null predicate returned **only root 900611231**, with no next page. Root null is therefore independently checked, not inferred from an omitted JSON property. See [Dataverse readback](../../.atl/project-title-sync/skip-empty-responsibles-20261106/dataverse-runtime-readback.json) |
| Related rows | Roles **4 / 4 / 3 = 11**, all with nonblank user/name flags; role IDs **4,3,2,5 / 4,3,2,5 / 4,2,5**, with no Preventa role 1. Suppliers **2 / 1 / 1 = 4**; milestones **0 / 0 / 1 = 1**, in the same SharePoint readback |
| File disposition | Scoped input and failed-library queries empty; processed item **143**, log item **99**; scoped destination/provisioned Expedientes query empty |
| Group membership | Groups **35 / 36** retained counts **12 / 5** and the retained-principal presence flags. Counts agree with the [preflight baseline](../../.atl/project-title-sync/skip-empty-responsibles-20261106/cert-group-preflight.json); this is bounded count/presence evidence, not a full identity-set comparison |

The observed role rows match the nominal **11-row** expectation rather than the alternative **14-row** projection below. This establishes the outcome for this fixture, not general property-case semantics. Query action receipts establish retained counts; they do not expose full retained-object/order equality in this sanitized evidence.

### Native run links

These exact native routes were opened and reported `Succeeded`; the local receipts above retain the sanitized action and business reconciliation evidence.

| Run | Link |
| --- | --- |
| Parent | [08584076289793170422982595887CU16](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/a9928111-cd13-f111-8341-7c1e5233f7d8/runs/08584076289793170422982595887CU16?v3=false) |
| Root 900611231 | [08584076289699793045758232040CU10](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584076289699793045758232040CU10?v3=false) |
| Child 900611274 | [08584076289458421610565017878CU07](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584076289458421610565017878CU07?v3=false) |
| Descendant 900611367 | [08584076289042549695442365355CU06](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/1ca49582-ae1e-f111-8342-6045bde02c54/runs/08584076289042549695442365355CU06?v3=false) |

### RF01 coverage boundary and then-remaining gates

This run exercised **three of five Query consumers: two of four responsible business-loop branches, plus the common membership loop**. The complete saved definition has exactly five `Foreach` inputs reading `body('Filtrar_Responsables_Validos')`: common `Por_cada_MiembroResponsable`, existing-with-roles `Por_cada_Responsable_2`, existing-without-roles `Por_cada_Responsable_Sin_RolesUsuario`, new-child `Por_cada_Responsable_3` and new-root `Por_cada_Responsable`. Traces show the common, new-child and new-root consumers succeeded; the two existing-record consumers remain unproven. `Por_cada_RolesUsuario` instead reads `body('Recoger_RolesUsuario')` and is not a Query consumer. Three records do not mean three distinct business branches. Existing/provisioned updates, title/responsible/date-change propagation, caught downstream failures, missing/malformed lists and effective role deletion remain unproven.

Meaningful next tests, not executed by this report update:

1. **Update/provisioned paths and propagation:** use controlled existing-record cases with and without prior roles to exercise `Por_cada_Responsable_2` and `Por_cada_Responsable_Sin_RolesUsuario`, the remaining two Query-consuming business branches. Separately verify provisioned updates and before/after title, responsible and date values and hierarchy propagation; reconcile intended SharePoint/Dataverse/related rows and counters, not just run status.
2. **Input boundaries:** exercise missing, null, empty and all-invalid responsible arrays, plus malformed non-array lists and non-string fields. Verify native Query status, exact retained objects/order where valid, warning count or absence, and that the warning tail does not read a failed/skipped Query body.
3. **Caught downstream failure:** after a successful Query, exercise a controlled downstream failure; verify Catch and the warning tail, returned counters/logs, and any partial persisted rows. Do not infer failure-path behavior from this success-only run.
4. **Role deletion and repeat/update safety:** the existing deletion mock is still enabled. Effective deletion/replacement, duplicate prevention and recovery behavior require separate evidence; this test neither disabled the mock nor proved those behaviors. No replay or cleanup is performed here.

**Pre-existing serialization caveat:** child counters are response strings (`"1"` / `"0"`); child result strings concatenate adjacent JSON objects and are not standalone valid JSON documents. The parent outer business-log array is valid JSON containing those strings. Numeric final totals and persisted rows agree for this run; no serialization repair or general strict-consumer compatibility claim is made.

The fresh local incident audit strictly parsed all seven runtime/preflight JSON receipts and reconciled their counts and identities. The Dataverse receipt SHA256 was `176b24564b2aa21527656f34d042a1f1cebfa50d70b8652f6d8ab91dfbb328bd` after its local receipt-format correction; the valid receipt contains one JSON document, not appended duplicate documents. That local correction did not constitute another cloud write or submission. The private ignored evidence links are local review pointers, not a claim that their contents are committed or publicly available.

## Historical submission checkpoint: SUBMITTED_RUNTIME_PENDING (superseded)

The following submission/expected-trace statements describe the earlier checkpoint before runtime reconciliation; they are preserved as history, not the current verdict.

**One controlled CERT input was uploaded; execution and business reconciliation are not yet proven.** Native file selection occurred at `2026-11-06T15:11:06.873Z`. The input library returned the isolated file as item **219**, created at `15:11:13Z`. A normal HTTP 200 content read at `15:11:31.882Z` confirmed **10941 bytes** and exact prepared SHA256 `a31ce6a43fd8bbabfafdba3210fd406f49672d406648ba3bc4bbf50575d54ed7`. There has been **one submission**, not a replay of the original production input.

The [native upload receipt](../../.atl/project-title-sync/skip-empty-responsibles-20261106/native-upload-receipt.json) proves the input and byte integrity, **not a successful parent or child run**. Its first library read found no matching processed, failed or log artifact yet. Parent monitoring is in progress; do not upload again while the result is pending.

### Expected trace — not actual runtime results

| Isolated expediente | Parent | Filter input → valid | Omitted / warnings | Suppliers / milestones | Nominal role rows including quality/security |
| --- | --- | --- | --- | --- | --- |
| 900611231 | none | 3 → 2 | 1 / 1 | 2 / 0 | 4 |
| 900611274 | 900611231 | 3 → 2 | 1 / 1 | 1 / 0 | 4 |
| 900611367 | 900611274 | 2 → 1 | 1 / 1 | 1 / 1 | 3 |

These are **success-only targets**, not observed counts. Each valid fixture has one project head; the first two also have one engineer. Every record has separate nonempty quality and security objects, each contributing one row outside the filtered array. Their expected role IDs are respectively 2, 3, 4 and the existing hardcoded security role 5, subject to effective role lookup/parameter values and successful actions.

**Role-count discriminator to check at runtime:** the existing new-record `No_es_Preventa` / `No_es_Preventa_3` guards read `espreventa`, whereas the fixture and inner engineer guards use `esPreventa`. Native property-case resolution has not been established by this local check. If resolved case-insensitively, nominal counts are **4 / 4 / 3** (11 total). Strict case-sensitive resolution instead selects the Preventa else branch for every retained responsible, producing **5 / 5 / 4** (14 total; two/two/one Preventa rows, no engineer rows). Inspect the native conditions and persisted role IDs rather than treating either projection as a passed assertion. No source or fixture change was made for this pre-existing discrepancy.

The expected new-record branch is `Existe_ExpedienteJSON = false`. The first record takes `Tiene_ExpedientePadre = false` and `Por_cada_Responsable`; the next two take the live parent-found branch and `Por_cada_Responsable_3`. The common `Por_cada_MiembroResponsable` loop should iterate **2 / 2 / 1**, with the filtered Query bodies containing the same retained objects in order. Verify `Filtrar_Responsables_Validos`, both warning guards and `Anexar_Advertencia_Responsables` in each child; the warning must contain its isolated ID, `Estado = Advertencia` and `Omitidos = 1`. Catch should be skipped on a wholly successful child, but a caught downstream failure can still reach the warning tail after a successful Query.

On full success, reconcile one parent/three synchronous child calls, **3 new / 0 updated / 0 failed**, three staging and three Dataverse rows, four supplier rows, one milestone row and **zero destination Expedientes rows** for these IDs. Parent business logs and response bodies must confirm the warnings and counters; HTTP 200 or an archived input alone is insufficient. A failure may leave partial rows and overlapping counters. Full action names and these explicitly conditional targets are recorded in [sanitized expected trace](../../.atl/project-title-sync/skip-empty-responsibles-20261106/expected-runtime-trace.json).

**Next:** monitor the existing submission, reconcile actual runs/actions/logs/rows and group membership. No automatic retry, cleanup, mock change or PRO operation. This run does not cover existing/provisioned records, all five loops, or missing/malformed responsible lists.

## Historical Nov 6 checkpoint: saved definition independently verified

**PASS: the complete persisted DEV definition corresponds to the reviewed candidate. Runtime approval was pending at this checkpoint.** The parent performed one native Save. A normal authenticated resource GET after full page reload returned HTTP 200; its captured definition was independently compared in full, not inferred from UI tokens or a local draft.

| Evidence | Verified result |
| --- | --- |
| Saved readback | Checked `2026-11-06T13:41:31.293Z`; state `Started`; lastModified `2026-11-06T13:34:21Z`; draft flags empty, no `isDraft` property |
| Native checker before Save | 0 errors, 5 existing owner Premium-license warnings; green ready banner reported by parent |
| Save receipt limitation | Exactly one invocation; response listener captured no Save response. No claim of Save HTTP 200; durability evidence is the post-reload resource GET |
| Complete candidate-to-saved comparison | 10 raw JSON differences: 4 WDL whitespace-only differences outside quoted literals, 4 new-action operationMetadataId additions, 2 omitted empty else branches on the new If actions (no-op equivalent). No unexplained difference |
| Complete original-to-saved comparison | Exactly the same 11 reviewed add/remove/replace paths; no additional old-business-action drift |
| Protected content | All 94 old input objects, 151 old metadata objects and 46 entire connector actions unchanged. Connections/authentication references, schema, payload, counters, response inputs, quality/security inputs, static results and enabled role-deletion mock preserved |
| New behavior structure | Exact Query fallback quotes/predicate, all five Foreach targets/dependencies, Catch Failed-only behavior, nested success/count guards with numeric zero, and four-key warning object confirmed |

| Saved artifact | SHA256 |
| --- | --- |
| Complete saved-source snapshot | `DA8B9EC41B51E0C908E6DBE3691858C612D1E7324F6BB07784B6C4E28763C3BE` |
| Saved definition, recursively key-sorted canonical JSON | `8B9A82F1CE6CDD71ADD147085BD50A437CCCA1EC343446B3C192E435CFB73C32` |

The original/candidate hashes below remain unchanged. Private ignored evidence: [complete saved capture](../../.atl/project-title-sync/skip-empty-responsibles-20261106/saved-source.json), [bounded independent diff receipt](../../.atl/project-title-sync/skip-empty-responsibles-20261106/readback-review.json), [pre-save UI checks](../../.atl/project-title-sync/skip-empty-responsibles-20261106/pre-save-ui-checks.json) and [honest native Save receipt](../../.atl/project-title-sync/skip-empty-responsibles-20261106/native-save-receipt.json). Do not publish their contents.

At the saved-definition checkpoint, no runtime upload had occurred. The controlled submission above supersedes that upload status only; missing/malformed-input evaluation, success/downstream-failure behavior and business side effects remain unproven. No cleanup, mock change or PRO operation occurred; do not replay the previous partial input blindly.

## Isolated runtime fixture: preparation evidence before upload

**Local preparation passed at `2026-11-06T15:05:53.671Z`; the prepared copy was subsequently submitted once as recorded above.** The original input was not modified or replayed. A private temporary copy, outside the repository, contains three ordered test records with IDs `900611231`, `900611274` and `900611367` and remapped parent links. Exactly **17 leaf values** changed: three IDs, two non-null parent links, three nemotecnicos, three `OrdinalE2E` values and six `codexp`/`codexplargo` values. Local `ordinal`, complete responsible objects (including invalid entries), supplier identities/parent links, financial values and all other JSON content remain unchanged.

| Preflight | Bounded evidence |
| --- | --- |
| Effective resource bindings | Normal Maker HTTP 200 responses at `14:57:36Z` show current CERT site and distinct staging/destination list GUIDs; staging, role, milestone, supplier and input-library bindings match the checked CERT resources. Dataverse entity set remains `cr435_expedientes`. No configuration was changed |
| Downstream isolation | The captured provisioning trigger watches destination Expedientes, not staging ExpedientesJSON. The daily reminder reads Revisiones/TareasDocumentales, not these newly staged records. This bounds the known BACK flow paths; it does not prove the absence of every external automation |
| Synthetic codes | `DEV900611231`, `DEV900611274`, `DEV900611367` fit checked SharePoint text limits (255) and Dataverse limits (4000). Exact SharePoint queries for both code fields and Dataverse prefix queries for both fields returned zero rows; these are observations, not namespace reservations |
| Expected filter counts | `3 → 2`, `3 → 2`, `2 → 1`: one omitted responsible and one aggregate warning expected per record; not yet observed at runtime |
| Byte integrity | Original SHA256 remains `0e083cfc4b8aa3cbb05663ca311c516b1075aba3494a5b7bcdfa888d15b30f8e`; private fixture SHA256 `a31ce6a43fd8bbabfafdba3210fd406f49672d406648ba3bc4bbf50575d54ed7`, 10941 bytes |

Sanitized evidence: [effective bindings](../../.atl/project-title-sync/skip-empty-responsibles-20261106/effective-environment-bindings.json), [reminder reads](../../.atl/project-title-sync/skip-empty-responsibles-20261106/reminder-read-bindings.json), [code collision checks](../../.atl/project-title-sync/skip-empty-responsibles-20261106/replacement-code-preflight.json) and [fixture receipt with exact allowed paths](../../.atl/project-title-sync/skip-empty-responsibles-20261106/fixture-preparation-receipt.json). No raw contacts or financial payload were copied into the repository, report or memory.

The preparation receipt's `PREPARED_NOT_UPLOADED` / `uploaded: false` fields are historical as-of-preparation facts, not current status; the later native upload receipt is authoritative for submission. Next: reconcile the existing parent and three child runs, warning counts, logs and persisted rows. Do not replay on a pending or failed run. This fixture exercises new-record hierarchy paths, not all five responsible loops, update/provisioned cases, missing-list or malformed-input behavior; the existing deletion mock remains enabled.

## Earlier Nov 6 checkpoint: paused, no save or runtime (superseded)

The following incident history predates the successful saved-definition verification above; it is not the current deployment status.

A fresh normal authenticated DEV read at `2026-11-06T10:30:58.257Z` remained `Started`, with `lastModified` `2026-11-05T09:03:24Z`; its complete canonical definition still matched the pinned baseline `EF64CD4D4809031CA9B5F8D35EBCDC7FCA9203C93A786F165BB994351C0DF1D5`. The ignored receipt is `preapply-source.json` beside the candidate. This is evidence from before the UI incident below, not a post-incident comparison.

The delegated writer lacked browser tools; the parent therefore performed only native designer navigation. Microsoft documents the classic [My clipboard code-snippet paste workflow](https://www.microsoft.com/en-us/power-platform/blog/power-automate/introducing-clipboard-in-flow-designer-and-three-new-user-experience-updates/). The parent confirmed an existing Query in My clipboard, but clicking its nested information control selected the enclosing entry and inserted an unintended copied Query in the draft. **Save and execution were never clicked.** A fresh incident audit recommended exactly one native Undo when enabled; that removed the duplicate. However, the rendered original action order then differed, so complete draft restoration is unproven. Editing stopped. Explicit user approval is required before a reload that could discard pre-existing unsaved changes; a fresh saved-definition comparison must follow. Disabled Undo/Redo is not proof of draft cleanliness.

The runtime safety review also rejected blind replay of the original three-expediente input: prior partial rows and the still-enabled deletion mock could make roles additive. A collision-free isolated identity set, parent remapping, retained-principal membership and downstream side-effect checks are required before uploading a new test input. No runtime test, cleanup, mock disabling or PRO change occurred.

At that earlier checkpoint, the approved responsible-array filter was prepared locally and **no cloud save or runtime retest had yet been performed**. Fresh DEV comparison and local review had passed. The saved/readback evidence above supersedes only the application/validation status; controlled runtime evidence remains required.

## Local artifacts

- [Generator](../../scripts/flow-title-sync/prepare-responsible-filter.cjs) — no authentication, cloud client or deployment path; DEV identity, exact CLI source SHA256 and an independently pinned complete-definition digest are checked. Writes are confined to the ignored candidate subtree; existing files are not overwritten.
- [Synthetic tests](../../scripts/flow-title-sync/prepare-responsible-filter.test.cjs) — behavioral model and generated-structure assertions, not a WDL interpreter.
- [Ignored candidate definition](../../.atl/project-title-sync/skip-empty-responsibles-20261106/candidate-definition.json) — private local artifact; do not commit or publish its contents.

| Artifact | SHA256 |
| --- | --- |
| Nov 5 source snapshot, unchanged | `AA66FE1070CBF3BF03BA89450DE0D8AE3B7E1350D84AEA8630BD341728672EE4` |
| Nov 6 candidate definition | `E5A3D27CE7C99A69E6B2DC297FF261984109A56487AA064E7B45919E08B15FF5` |

The original source was checked at `2026-11-05T10:08:45.902Z`. The parent independently obtained a fresh authenticated DEV read at `2026-11-06T10:05:35.724Z`; its `Started` state and `lastModified` `2026-11-05T09:03:24Z` are unchanged. The complete old/fresh definitions match after recursive object-key sorting (array order retained), independently recomputed here as canonical SHA256 `EF64CD4D4809031CA9B5F8D35EBCDC7FCA9203C93A786F165BB994351C0DF1D5`. The original snapshot remains unchanged. The CLI still pins its original source bytes; the API pins the complete canonical definition, not metadata timestamps.

## Bounded behavior

1. `Filtrar_Responsables_Validos` runs after `ExpedienteJSON`; `Obtener_ExpedientesSistema` now depends on its success. Its source is `coalesce(body('ExpedienteJSON')?['responsables'],json('[]'))`.
2. The predicate requires both `nombre` and `correousuario` to remain nonempty after `trim(coalesce(field,''))`. It filters, rather than maps: valid entries retain their fields, values, order and duplicates. No `string()` or `array()` coercion is added.
3. Exactly five known `Foreach` consumers are rewired to the Query body. Unexpected consumer counts, paths, expressions, dependencies, DEV identities or conflicting existing patches fail closed. Canonical reapplication is idempotent.
4. A common final `If` runs after Catch `Succeeded`/`Skipped`, before the unchanged response body. It checks `actions('Filtrar_Responsables_Validos')?['status']` against `Succeeded`. **Only inside that true branch** does another `If` evaluate original length minus filtered length. A positive count appends one aggregate warning object to `Resultado`, following its existing object-append convention, with expediente ID and omission count, not contacts.

Missing/null/empty lists yield no warning. All-empty arrays produce an empty filtered list and a warning with their omitted count. Malformed non-array collections and non-string field values are not deliberately normalized; the local model rejects them. Exact native failure behavior remains unproven.

Catch's existing overwrite expression, response outputs/counters, separate `responsableCalidad`/`responsableSeguridad`, all static results and the enabled `Eliminar_RolesUsuario0` mock are preserved. The existing ParseJSON schema wraps constraints under root `content`/`schema`, while consumers read root `responsables`; this mismatch is intentionally NOT repaired.

## Verification evidence

Native command (Node `v18.20.4`):

```powershell
& 'C:/Users/tfx0596/AppData/Local/Author Software/nvm/.nodejs/node.exe' --test 'scripts/flow-title-sync/prepare-responsible-filter.test.cjs'
```

- Initial sandbox execution: `spawn EPERM` before test execution. The exact escalated retry was accepted under the current auto-review context; no permission configuration was changed and no alternate test runner was used.
- RED: the initial current-behavior stand-in retained a blank entry and failed a real equality assertion (0/1 passed). After correcting a full-suite fixture syntax error, full RED was 1/11 passed, 10 failed; stand-ins were removed when implementation was added.
- Initial GREEN: 11/11 passed; strengthened generated-tree guard traversal and omission-count coverage then passed 12/12. An independent reviewer reran that pre-remediation suite: **12/12 passed**, but review still correctly failed the generator safety contract (details below).
- Coverage: missing/blank/whitespace/name-only/mail-only fields; valid objects, order, duplicates and immutability; missing/null/empty lists; invalid types; all five rewires; dependency swap; post-Catch nested guard; omission counts; unchanged response/Catch/schema/mocks; bounded diff; idempotence and conflict rejection.
- Snapshot structural audit: candidate equals generated definition and canonical reapplication; exactly **11 JSON add/remove/replace paths**, representing nine conceptual changes (five loop expressions, two dependency replacements, Query addition and warning-tail addition). Enabled role-deletion mock, static results and definition outputs are unchanged. Source hash is unchanged.
- CodeGraph status/explore completed within the bounded attempt; the indexed results concerned webparts, not the ignored flow snapshot. Only the specific supplied snapshot was read for flow action discovery; no broad filesystem traversal or contact/runtime dumps.

## Fresh-review findings and scoped remediation

The initial generated candidate was correct, but the generator was unsafe for reuse: reconstructing a baseline from an untrusted already-patched input accepted unrelated output drift and disabling the role-deletion mock. The CLI also allowed arbitrary output destinations.

- `prepare()` now compares the complete unpatched definition with an independently hardcoded canonical baseline fingerprint. Idempotence reconstructs only the known inverse patch, validates that reconstruction against the independent pin, and compares the candidate with the resulting canonical patch. Both patched and unpatched output drift/mock disabling are rejected; no caller-supplied trust-anchor argument exists. Hash comparisons avoid dumping private definitions in errors.
- CLI and exported writer resolve output containment under the fixed ignored `.atl/project-title-sync/skip-empty-responsibles-20261106/` subtree before reading the source. Existing ancestors are inspected with `lstat`/`realpath`; live and dangling junction/symlink paths, escapes, sibling-prefix tricks, stream aliases and Windows reserved-device names are rejected. Ancestors are rechecked after directory creation; exclusive `wx` creation remains. This is practical local protection, not an atomic defense against hostile concurrent filesystem changes.
- Regression-first RED: **12 passed, 4 failed**, including real missing-exception assertions reproducing already-patched output drift and disabled-mock acceptance. Additional dangling-junction and Windows-device regressions each reached **15 passed, 1 failed** before their narrow corrections. Final self-run native GREEN: **16/16 passed**, zero failures/skips.
- Tests use synthetic in-memory module copies with fixture-specific hardcoded test pins, plus temporary synthetic files solely inside the ignored subtree. The production API has no digest override and rejects that synthetic baseline. No private flow is written into tracked files or external temporary paths. Only test-owned synthetic directories are removed.
- The candidate was **not rewritten**; its SHA256 remains `E5A3D27CE7C99A69E6B2DC297FF261984109A56487AA064E7B45919E08B15FF5`. A fresh post-fix independent review returned **PASS, no blocking local safety findings**, and independently reran the exact native suite: **16/16 passed**, zero failures/skips. Separate read-only checks against the actual pinned source rejected **4/4** tamper cases (output drift and disabled deletion mock, each patched/unpatched); source/candidate hashes, fresh-definition equality, generation and exact idempotence were independently confirmed. The earlier 12/12 receipt applies only to the pre-remediation version. This local PASS is not cloud-service or runtime approval.

## Microsoft reference check and remaining risk

Microsoft documents the [Query action](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#query-action) as filtering an array. Its [expression reference](https://learn.microsoft.com/en-us/azure/logic-apps/expression-functions-reference) documents `actions()` as returning the action object, including `status`, `coalesce()` as null fallback, and `trim()` as string-only; the reference explicitly applies to Power Automate as well. [Run-after documentation](https://learn.microsoft.com/en-us/azure/logic-apps/error-exception-handling#manage-the-run-after-behavior) explains predecessor status gates. These support the design; they do not validate this candidate in the Power Automate service.

The separate nested `If` is a design inference to avoid evaluating omitted-count/body expressions when the Query failed or was skipped; it does not rely on `and()` short-circuiting. Local guard traversal is only a structural model, not native branch-evaluation proof. Likewise, warning-object serialization follows existing flow structure but needs service/runtime confirmation.

The complete post-save DEV comparison and native checker evidence are recorded above. RF01's controlled new-record success remains verified; RF02's scalar update passes but related-row duplication blocks release, as recorded in the current verdict. Downstream-failure/Catch, missing-list, malformed-input and other explicitly listed coverage gates remain pending. Before any further edit or execution, recheck the saved definition if it may have changed; stop on unexplained drift. Do not clean partial business data, disable the mock, change permissions, or touch PRO under this task.

## Native-UI handoff capability check

The delegated UI writer on November 6 could not access the parent's browser tools: `readPage`, `runPlaywrightCode` and `toolSearch` were unavailable in its tool runtime, and the available Computer Use inventory contained no browsers or apps. This is an agent capability limitation, not evidence of a Power Automate permission failure. The writer made no browser edits, reload, save or runtime attempt; it did not fresh-read the definition, run the native checker or create a draft. Application remained pending at that earlier handoff; the current saved-definition verification above supersedes this limitation. The handoff itself supplied no deployment or validation evidence.
