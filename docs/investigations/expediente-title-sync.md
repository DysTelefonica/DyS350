# Synchronize corrected names for provisioned expedientes

**Status — 2026-10-30: reviewed fix applied and published in DEV; 31 local tests passed. Cloud checker: 0 errors, 5 existing Dataverse licensing warnings. Runtime integration remains untested; PRO is unapproved and was not modified.** Independent readback confirms the DEV definition equals the reviewed candidate. Publication is not an end-to-end test or production readiness. Earlier failed attempts remain recorded below as superseded history.

**2026-11-03 runtime follow-up: [NOT RUN; deployment unverified](../tests/dev-title-sync-2026-11-03.md).** After normal generic sign-in, the native Run preflight opened without the earlier human-account Premium alert. Twelve local harness tests passed; the isolated CERT list is reconciled and empty. Native creation yielded no verified deployment. Captured BACK inventory has all 9 cloud-flow rows and no exact test-name match, but ordinary template creation remains unknown outside the bounded views. No reviewed substitution was sent, fixture row or Run reported, or actual Title update tested. This scoped boundary is not Module1 end to end; no PRO change was made.

## Read this first

1. Review the [evidence and root cause](#verified-evidence), then the [local proposal](#proposed-change).
2. Resolve the [verification and release gates](#release-gates) before considering production.
3. Obtain the user's explicit production approval. Permission to investigate or sign in is not publication approval.

This is an authored investigation record, separate from the development team's [operational manual](../manuals/guia-consulta-operativa.md#1-carga-del-json-y-roles-de-preventa). The manual's diagnostic procedure remains read-only. It directs investigators to the correct environment, `cargaJSON_entrada`, `E2E_AltaExpedientes` run history and `E2E_AltaExpedientes_Modulo1`; it does not itself prove this defect or the deployed flow's current definition.

## Verified evidence

The following observations were gathered through authorized read-only inspection on **2026-10-30**. They are point-in-time evidence, not an automatic monitor or proof of future state.

| Evidence | Observation | Limit |
| --- | --- | --- |
| Displayed incident | Project detail page uses business key `IDExpediente=1205`. The stored phrase must change from `intercambiod e voz` to `intercambio de voz`, preserving the rest of the full title. | Do not replace the entire long title with just the corrected phrase or change capitalization independently of the authoritative input. |
| Destination list | `Expedientes`: business key 1205, SharePoint item ID 56; old phrase remains. `Modified=2026-10-29T11:50:30Z`. | Business key and list item ID are different identifiers. Re-read before any eventual repair. |
| Staging list | `ExpedientesJSON`: business key 1205, item ID 83; corrected phrase is present and `esAprovisionado=true`. `Modified=2026-10-29T11:50:29Z`. | This shows staging/destination divergence. It does not identify the exact input file, prove a particular successful run, or establish safe replay. |
| Final read-only live recheck | GET-only inspection returned HTTP 200 and one match in each list: destination item 56 still has the old phrase; staging item 83 has the correction and `esAprovisionado=true`. Both Modified timestamps remain as recorded above. | The incident is still uncorrected; these observations do not authorize a repair or prove that unrelated production data never changed. |
| Destination schema | `Title` is Text, optional, maximum length 255; the full corrected source title is 169 characters. `IDExpediente` is Number, not indexed and not uniqueness-enforced. | The corrected title fits this column limit. One current match is not a uniqueness guarantee; duplicate handling remains relevant. Query-threshold/scale effects were not diagnosed and no index change is proposed. |
| Existing flow | The retrieved Module1 definition contains a provisioned-record lookup and many-field destination update. The update omits `item/Title`; the staging update maps `titulo` to `Title`. | Definition was retrieved with `draftFlow=true`; equality with the published definition is **pending**. |
| Historical run definition | A successful Module1 run's embedded definition independently omits destination `item/Title` and maps staging Title from `titulo`. The bounded structural comparison is described below. | This run is not yet proven to have processed expediente 1205. It does not establish the current published definition or validate the proposed patch. |
| Local UI | Earlier source inspection found the detail heading reads `Expedientes.Title`; new-project creation copies incoming title from staging. | Source code is not proof of the currently deployed SPFx package. No SPFx change is proposed. |

The precise finding is **an omitted field in an existing synchronization path**, not a complete absence of synchronization or a need to provision the project again. A display-only replacement would hide stale data and would not correct the ingestion path.

### Locations and provenance

- [Affected project detail](https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF/SitePages/detalle-proyecto.aspx?proyectoid=1205&tab=expedientes).
- Environment: `DyS350_TF_E_PRO`, ID `80cfcc42-c966-ebc6-8934-9cd1802f9e53`.
- Main flow: `E2E_AltaExpedientes`, ID `a915610c-3afe-92a6-e4b6-8d928d6df752`. The authenticated generic account was verified as primary owner; this is access evidence, not change approval.
- [Module1 flow details](https://make.powerautomate.com/environments/80cfcc42-c966-ebc6-8934-9cd1802f9e53/solutions/~preferred/flows/be82f41f-ca1f-7e85-be11-600020c4bdc7/details), flow ID `be82f41f-ca1f-7e85-be11-600020c4bdc7`.
- Managed PRO solution: `E2E_Portal_Gestion_Documental_BACK`, ID `e2d2d8cd-ba7e-4e8b-8df3-b4632a6ed3e1`. An unmanaged DEV counterpart has now been located; its release authority and current-published equivalence still require confirmation, as described below.
- Local UI references: [project summary](../../e2e-webparts/src/ui/projectSummary/ProjecSummary.tsx) and [new-project component](../../e2e-webparts/src/webparts/newProject/components/NewProject.tsx).
- Portable flow evidence: [reviewed action excerpts and fingerprint](../../scripts/flow-title-sync/baseline.json). This is not a full flow or an importable solution.

The raw Module1 definition is retained only in ignored local evidence storage, `.atl/project-title-sync/module1.definition.json`; it is intentionally not a portable documentation link or a committed artifact. Its exact-byte SHA-256 was rechecked on 2026-10-30:

```text
c584b6c9698a3d0627720eace374e8de0ed69f42b7d23e432beb1cee27b6c02e
```

The hash identifies the captured bytes, not their published status or suitability for another environment. Raw captures, credentials, tokens and run payloads must not be committed or copied into this record.

The final bounded live/schema recheck is retained only in ignored `.atl/project-title-sync/live-title-recheck.json`. No item was updated. The original mismatch remains; future-flow correction and any approved one-item repair are separate changes.

### Historical successful-run corroboration

On 2026-10-30, read-only inspection of [Module1 run 08584083322594445085377150151cU14](https://make.powerautomate.com/environments/80cfcc42-c966-ebc6-8934-9cd1802f9e53/solutions/~preferred/flows/be82f41f-ca1f-7e85-be11-600020c4bdc7/runs/08584083322594445085377150151cU14) showed **Your flow ran successfully**. The normal portal response exposed `properties.flow.properties.definition`; its embedded historical definition corroborates the destination Title omission. No Resubmit, Test or Edit operation was performed.

Definition-only evidence was retained in ignored local storage as `.atl/project-title-sync/module1.run-20261029.definition.json`, with root runtime metadata removed to omit user identifiers. Its SHA-256 was checked as:

```text
E042576C3C09F84CF4A32BF1F347A9D951F8D0D6946029448C50179AF536DF08
```

The scoped structural comparison against the original draft capture excluded root runtime metadata. Exactly **46** remaining differing paths were found: each was a per-action `/inputs/authentication` entry present in the run definition and absent in the draft, with the exact literal value `@parameters('$authentication')`. These entries are a parameter expression, not captured credentials. After only these precise exclusions, all remaining business actions, mappings, triggers, parameters, outputs and static results compared equal. A bounded comparison receipt is retained in ignored `.atl/project-title-sync/run-comparison.json`; neither raw evidence file is a portable deliverable or a replacement baseline for the CLI.

In the run-embedded definition, `Actualizar_Expediente_Sistema` has **no** `item/Title`, while `Actualizar_ExpedienteJSON` maps it to `@body('ExpedienteJSON')?['titulo']`.

**Limits:** this is structural correspondence after stated exclusions, **not byte equality**, and does not prove current-published/draft equality. The run has not yet been proven to process expediente 1205; matching nearby timestamps alone would not establish that link. A successful historical execution does not validate the new guard, Title expression or any patch behavior. Some auxiliary portal requests returned 403 even though run metadata was accessible; access to all run data is not established. No run was resubmitted, flow saved or cloud data changed.

### DEV source reconnaissance

Read-only inspection located the unmanaged `E2E_Portal_Gestion_Documental_BACK` solution, version **1.0.0.10**, in `DyS350_TF_E_DEV` (`aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`): [DEV solution overview](https://make.powerapps.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/overview), solution ID `ce6666c9-103a-4290-a63d-d8432400a052`. The solution lists Module1 and the main/provisioning flows. The top-level Power Apps solution view loaded while the embedded Power Automate solution widget remained loading; the limited My flows/shared views were not evidence that the solution flows were absent.

The [DEV Module1 details](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/1ca49582-ae1e-f111-8342-6045bde02c54/details) identify workflow `1ca49582-ae1e-f111-8342-6045bde02c54`. A normal authenticated portal GET with `draftFlow=true` returned HTTP 200, `isManaged=false` and `lastModified=2026-10-19T07:57:06Z`. Its primary owner is the developer, not the generic account; the owner list also includes the current user. Read access and owner-list visibility do not independently prove every edit/share permission or release authority.

The ignored DEV definition `.atl/project-title-sync/module1.dev.definition.json` has SHA-256 `e8b962d9059c7fa1e557dd4e18c50747403dd8f176eca66cee3fb7f1358cf633`. The bounded ignored receipt `.atl/project-title-sync/dev-pro-comparison.json` records the comparison with the original PRO draft capture. The existing destination update parameter objects compare equal and **both omit `item/Title`**; both staging updates map Title from `@body('ExpedienteJSON')?['titulo']`.

The **whole definitions differ at 22 leaf paths**, not just environment settings:

| Difference group | Verified extent and limit |
| --- | --- |
| Environment defaults | Six parameter defaults differ. DEV's `E2E_ConexionEntorno` default points to `DyS350.cert.OCETF`; PRO's points to `DyS350.prod.OCETF`. Defaults are not proof of the currently effective environment-variable binding. |
| Parsed system-item requirements | Ten array-index differences. DEV has 24 required entries versus PRO's 23; comparing sorted entries finds the additional DEV requirement `{Thumbnail}`. Therefore these differences are not solely ordering. |
| Security-responsible condition | Two placement paths: DEV's `Responsable_Seguridad_no_vacio_1` is inside `Por_cada_Responsable_2`; PRO's is outside that loop. Behavioral equivalence has not been established. |
| Initial counters | Four paths: DEV omits the initial `value` key; PRO explicitly sets each counter to `0`. No runtime-equivalence claim is made. |

**Do not copy or import the full PRO-captured candidate into DEV.** It preserves PRO defaults and unrelated PRO logic, including security-action placement. Transplant only the three proposed logical edits into the separately reviewed DEV source, preserving DEV-specific configuration and all unrelated logic. If preparing DEV offline, first review that source and create a separate approved fingerprint/baseline; the original PRO generator must continue refusing DEV bytes. Do not replace its existing PRO hash merely to bypass the refusal. Confirm effective site/list/connection bindings before any later CERT run. During this read-only reconnaissance, no flow was saved, published or tested in either cloud environment; the subsequent unchanged DEV draft save is recorded separately below.

### DEV-only approval and local preparation

The user subsequently authorized **application and validation in DEV only, never PRO**. This does not authorize production changes or uncontrolled writes through a DEV flow's external connections. The parent operator is responsible for cloud binding verification, save and controlled runtime validation; local preparation alone is not proof any cloud application occurred.

A separate [DEV preparation entry point](../../scripts/flow-title-sync/prepare-dev.cjs) binds the reviewed DEV hash above and its exact CERT site default before reusing the existing structural assertions and three-edit transformation. The PRO generator and baseline remain unchanged. The [DEV tests](../../scripts/flow-title-sync/prepare-dev.test.cjs) exercise actual DEV content preservation and cross-environment/source/binding refusal, alongside the existing suite. The initial combined local runner hit `spawn EPERM` before either test file launched; the root conversation subsequently executed the unchanged runner through the required approval path: **31 passed, 0 failed, 0 skipped**, 0 cancelled and 0 todo, exit 0, duration 268.4994 ms. Both actual-snapshot branches passed (DEV subtest 3, PRO subtest 31).

The authorized local generator then created ignored `.atl/project-title-sync/module1.dev.review-v1.json`, SHA-256 `0c22186ce4b424c06d54418ab2de91a46c3a8e5c0f02199f9811dfbde43a2432`. Independent comparison recorded three logical edits/four leaf paths and zero unrelated structural differences after reversing those edits; its ignored receipt is `.atl/project-title-sync/module1.dev.review-v1.comparison.json`. Fresh independent review reported PASS for this DEV candidate and the strict wrapper. The original DEV source hash and CERT site default are unchanged, with DEV-specific schema, counters and security-action placement preserved. The local candidate alone was not proof of application: a prior draft-save incident left the cloud unpatched, while the later supported save and independent readback below now establish DEV draft application.

A bounded local scan of the DEV snapshot found **zero literal PRO site URLs**. All 41 SharePoint connector actions use `E2E_ConexionEntorno`; existing operations comprise 3 deletes, 2 reads, 8 SharePoint HTTP requests, 2 updates and 26 creates. The snapshot also contains 5 Dataverse operations: 1 read, 1 update and 3 creates. No direct HTTP/child-workflow action type was found. These counts describe the captured definition, not effective bindings or actual runtime effects. Verify Dataverse connection/environment targeting as well as SharePoint site/list bindings before any controlled run; absent PRO literals and a CERT site default do not establish isolation.

The parent operator verified the current `E2E_ConexionEntorno` value points to CERT and inspected the generic SharePoint connection in the UI, then cancelled without saving. Subsequent environment metadata returned HTTP 200, identified the DEV environment and linked it to CRM instance `https://orge4f220a2.crm4.dynamics.com/` (resource ID `3019900e-ceeb-f011-872b-000d3a69d549`). Dataverse actions use the native current-environment target and their entity tables were inspected; these observations do not validate every runtime effect or full-flow execution. **Do not run the full flow until external effects and controlled test side effects are verified.** No full flow was run.

### DEV draft-save incident and transport blocker

The parent attempted a DEV **Save draft** operation with interception intended to apply only the three reviewed edits and verify source/candidate fingerprints. The browser-control runtime did not provide `setTimeout`; the timeout promise rejected and cleanup removed interception before its asynchronous handler finished. The UI subsequently reported **Draft saved**. Treat the UI message as evidence of a save, not proof that the patch was applied.

A subsequent server GET returned HTTP 200 and the parent verified that the DEV definition still matches the **original unpatched definition**, not the candidate. Its `lastModified` became `2026-10-30T18:45:23Z`; this metadata change reflects a draft save without the intended functional edits. Version history separately confirmed the October 19 09:57 version remains **Published**, while the new October 30 19:45 entry is a draft (portal-displayed times). No flow was run and no PRO operation occurred.

Fresh incident audit conditionally approved recovery only with full-payload source checks and ETag compare-and-swap. The guarded recovery failed closed: its read transport reported unsupported CDP `Storage.getCookies`, so the intended PATCH was aborted before forwarding. A same-origin native-SDK staging alternative forwarded **zero matching writes** and was aborted while form metadata was loading; its observer was cleaned up. No cross-origin credential transfer or authentication workaround was used. No further automatic retry is planned in this round.

**Previous-round outcome:** local code/candidate approval stood, but the functional cloud patch was **not applied**. The transport limitation was not a failed business assertion or evidence of a permission defect. The unchanged draft save was not successful patch application. The subsequent supported save below supersedes this blocked application state, not the history or its safety lessons.

**Previous-round final readback:** the parent retained a bounded ignored receipt `.atl/project-title-sync/dev-final-cloud-readback.json`. DEV GET returned HTTP 200, `isManaged=false`, workflow `1ca49582-ae1e-f111-8342-6045bde02c54`, and `lastModified` still `2026-10-30T18:45:23Z`. Its definition structurally equaled the reviewed **unpatched** DEV source, not the patched candidate. At that point no further mutation had followed the unchanged draft save. A PRO GET returned HTTP 200 and confirmed item 56 still contained `intercambiod e voz`, with `Modified=2026-10-29T11:50:30Z`. No Publish, Run or PRO write occurred; browser interception/dialog cleanup completed.

### Verified DEV save and publication — integration still pending

Following renewed DEV/CERT testing approval, the parent used the normal supported SDK **Save draft** path. Its synchronous request handler verified the exact host, workflow ID/name and DEV environment; compared the full source canonically with the reviewed original; applied only the three edits; and required the result to equal the reviewed DEV candidate. Exactly **one PATCH** was forwarded, returning **HTTP 204**. No unsupported `Route.fetch`, host timer, manual authentication header or unrelated write was used. Interception was cleaned up after leaving the editor.

An independent normal API GET then returned **HTTP 200**, with `lastModified=2026-10-30T19:08:46Z`: the actual DEV draft definition equals the reviewed DEV candidate and no longer equals the original source. The bounded ignored receipt is `.atl/project-title-sync/dev-applied-draft-readback.json`. This establishes **draft application**, not publication or runtime correctness. The previous original-only draft state is superseded.

**Concurrency limit:** no additional ETag/If-Match or compare-and-swap protection was added; native SDK conditions were preserved. Fresh source/candidate checks reduce accidental drift but are **not an atomic concurrency guarantee**. At this save stage no publication or run had occurred; DEV publication was independently verified next, not inferred from the 31 passing local tests.

The parent then used the native **Publish** UI in the approved DEV environment. Although an alert waiter timed out while the checker modal hid the main page, independent version history showed the newest **Today 20:12** entry marked **Latest version** and **Published** (portal-displayed time), incorporating the earlier drafts. A normal server GET returned HTTP 200, `state=Started`, and a definition exactly equal to the reviewed DEV candidate. `lastModified` remained `2026-10-30T19:08:46Z`; that unchanged field alone must not be used to infer publication failure. The bounded ignored receipt is `.atl/project-title-sync/dev-published-readback.json`.

The publish path returned HTTP 200 for `checkFlowErrors`, `checkFlowWarnings` and the DEV organization's batch operation. The final checker UI showed **Errors (0), Warnings (5)** and saved with warnings. An earlier zero-warning display was provisional, before backend checks completed. The five warnings concern pre-existing Dataverse actions: one lookup, one update and three creates. Their displayed warning says the owner needs Power Automate Premium; it is **not** a failed runtime execution or proof that a run will fail.

Confirm or resolve the owner's licensing status and prepare controlled disposable test data before end-to-end execution. Do not automatically purchase a license, start a trial or reassign ownership. No full flow was run, no fixtures were created and no real ingestion/expediente 1205 was replayed. **DEV publication is complete; runtime integration and PRO approval remain outstanding.** No PRO publication or write occurred.

## Proposed change

Action path in the retrieved definition:

```text
actions/Try_-_Procesar_ExpedientesJSON/actions/Existe_ExpedienteJSON/actions/
Expediente_ya_Aprovisionado/actions/Actualizar_Expediente_Sistema
```

The [offline preparation tool](../../scripts/flow-title-sync/README.md) is designed to make exactly three structural changes:

1. Add `Validate_Expediente_Title_Sync` after `Obtener_Expediente_del_Sistema`.
2. Make the existing provisioned-record condition wait for successful validation.
3. Add `item/Title` to the existing `PatchItem`, preserving all other mappings, connections, lookups, branches and downstream/error dependencies.

| Input / lookup case | Intended behavior; runtime validation still pending |
| --- | --- |
| Valid nonblank string and one destination | Copy the entire incoming title verbatim; repeating it preserves the same value. |
| Missing, null or whitespace-only title | Preserve the current destination title, including null/missing as null. |
| Valid title and null/missing destination title | Repair the destination with the incoming string. |
| Invalid title type or duplicate destinations | Reject before the destination update; do not arbitrarily select the first duplicate. |
| No destination | Preserve the existing condition's no-update behavior; the patch does not create a destination. |

No incident-specific ID or spelling substitution is embedded. The guard adds no new business-ID constraints. The CLI requires the exact reviewed source fingerprint and action structure, refuses source drift and existing output files, and only writes under ignored local evidence storage. Do not update the baseline hash merely to make a new export pass.

### Important limitations

- **Not transactional:** the existing `Actualizar_ExpedienteJSON` write precedes the new guard. A rejection does not undo that staging write; later processing can be skipped through existing failure handling.
- **Value-idempotent, not zero-write:** the original many-field update still runs and writes its other fields. Blank input re-sends the current title rather than omitting the field.
- **Concurrency unchanged:** ETag handling, ordering and parallel ingestion are not solved by this patch; an older replay may overwrite newer data. Title-column limits and real runtime expression/schema behavior require DEV/CERT validation.
- The preparation tool does not import/save/enable/reprocess a flow or produce a deployable managed solution.

## Verification record

| Check, 2026-10-30 | Result |
| --- | --- |
| Runtime identification | Repository-local Node reports `v18.20.4`. |
| Exact source fingerprint | Matches the baseline SHA-256 above. |
| Ignored capture/output | Git confirms original capture and old output are ignored. |
| Prior fresh static review | Reported PASS for the current narrowed guard and fingerprint-boundary revision. This is not execution evidence. |
| Historical sandbox test attempts | Exit 1 before the test file could start: `spawn EPERM`. TAP reported one failed runner wrapper and zero passes; this was **not** a logical test failure or a completed test suite. |
| Historical child escalation | Tool returned `Rejected("rejected by user")`. No alternative runner or workaround was used. |
| Subsequent root-approved exact test execution | The root conversation executed the unchanged command below through `require_escalated`: exit 0; 25 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; duration 240.8516 ms. This resolves the local execution blocker, not the cloud validation gates. |
| Actual snapshot test | Subtest 25 passed against the exact fingerprinted source; it was included through `FLOW_DEFINITION_PATH`, not skipped. |
| Current generator/candidate | Generator exited 0 and created new ignored `module1.review-v2.json`, SHA-256 `45300f93bc1c7874aa34f4d483264e2bc6848fefc373bbbb21b729b8e2686317`. Old `module1.patched.review.json` predates current fixes and remains stale. |
| Independent candidate comparison | Exactly three logical edits: guard addition, condition dependency replacement and existing destination Title mapping. These appear as four leaf paths because the dependency replacement removes the old key and adds the new one. Reversing only the three edits in memory leaves zero unrelated structural differences. Bounded ignored receipt: `.atl/project-title-sync/module1.review-v2.comparison.json`. |
| Fresh independent candidate review | PASS, no findings: independently verified both fingerprints, the four leaf differences/three logical edits and complete preservation of unrelated structural content. This is local review, not cloud/runtime certification. |
| Documentation checks | All 29 relative file-link targets across the hub, this record and the tool README exist. No trailing whitespace in these three documents; `git diff --check` reports no whitespace error on tracked changes (only the repository's LF/CRLF warning). These checks do not validate remote links or Power Automate behavior. |
| Editor diagnostics | Earlier parent diagnostics reported no document errors. The latest delegated diagnostics request again returned a host `unknown thread` error; it supplies no new editor result. This is document-only tooling, not script execution or Power Automate validation. |
| Power Automate runtime / DEV / CERT | DEV save and publication independently verified. Final checker has 0 errors and 5 pre-existing Dataverse licensing warnings. No full runtime execution, fixture creation or integration validation. |
| Historical run corroboration | Successful-run embedded definition confirms the omitted destination Title mapping. Scoped structural correspondence after excluding root runtime metadata and 46 exact authentication-expression entries; not a patch runtime test or proof this run processed 1205. |
| Published-definition comparison | Pending; draft capture must not be presented as published evidence. |
| DEV source discovery | Unmanaged BACK solution and Module1 located; its draft also omits destination Title. Source/PRO whole-definition comparison has 22 leaf differences, including non-environment logic. Confirm release authority and effective bindings before changes; see the bounded comparison above. |
| Final live/schema recheck | GET-only responses were HTTP 200. Incident 1205 remains one old destination/one corrected staging match with unchanged observed Modified timestamps. Full corrected title length 169 is within Title's 255-character limit; business-key uniqueness is not enforced. No list/flow mutation occurred. |
| DEV-only local suite/candidate | Subsequent combined exact runner passed 31/31, zero skipped; actual DEV and PRO branches both executed. DEV generator exited 0 and independent comparison confirmed only the three intended edits in a new DEV-specific candidate. This is not cloud runtime validation. |
| DEV candidate/wrapper fresh review | PASS for the separately fingerprinted DEV wrapper and candidate: only three intended logical edits; all unrelated DEV structure preserved. No cloud application implied. |
| DEV effective binding inspection | Current SharePoint site value is CERT. DEV environment metadata identifies its linked CRM host; current-environment Dataverse action targets/tables inspected. No full runtime-effects validation or flow run. |
| Historical DEV draft-save incident / recovery | Original-only DEV draft saved at `2026-10-30T18:45:23Z`; earlier guarded recovery failed closed and SDK staging forwarded zero matching writes. That blocked application state was later superseded by the supported draft save below. No historical failure is counted as patch success. |
| Previous-round cloud readback | DEV was still unpatched at `2026-10-30T18:45:23Z`; PRO item 56 still had the typo and its October 29 Modified timestamp. This is historical evidence, not the current DEV draft state. |
| DEV draft application/readback | Normal SDK Save draft: exactly one checked PATCH, HTTP 204. Independent GET 200 confirmed the draft equaled the reviewed DEV candidate, not original; `lastModified=2026-10-30T19:08:46Z`. No extra ETag/CAS added; publication was verified separately afterward. |
| Current DEV publication/checker | Native Publish plus independent version-history evidence: latest Today 20:12 version is Published. GET 200 confirms `state=Started` and definition equals reviewed DEV candidate; Modified remains `2026-10-30T19:08:46Z`. Final checker: 0 errors, 5 existing Dataverse licensing warnings. No run, fixtures, replay or PRO write. |

Exact passing command, from the repository root:

```powershell
$env:FLOW_DEFINITION_PATH='.atl/project-title-sync/module1.definition.json'
& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync/prepare.test.cjs'
```

The [test source](../../scripts/flow-title-sync/prepare.test.cjs) covers structural preservation/refusal cases, a bounded schema/title simulation and the actual-snapshot comparison. The 25 passing tests cover unchanged/repeated/blank/null/invalid titles, duplicate/no destination, null/missing destination repair and fail-closed source/action drift. The simulation is **not** a WDL/Power Automate runtime; passing it does not establish real connector behavior, successful DEV/CERT execution or production readiness. No application build is required for this local-only tooling/documentation scope; no SPFx code was changed.

The authorized generator command and candidate fingerprint are recorded in the [tool instructions](../../scripts/flow-title-sync/README.md#source-and-offline-preparation). Source and candidate are both ignored local evidence, not portable deliverables. The original source fingerprint and baseline were not changed, and no code change was needed after the passing assertions.

## Release gates

### Bounded non-production runtime plan — not executed

The user subsequently renewed DEV/CERT testing approval; PRO remains excluded. The next save attempt may use the supported normal DEV SDK/editor path with fresh full-source/candidate checks and preserved non-definition payload values. A fresh read is **not** atomic compare-and-swap: record ETag/If-Match only if actually used, and independently re-read the saved definition before reporting application.

The existing `Actualizar_Expediente_Sistema` action is a **many-field update**, not Title-only. Do not claim that running the full flow tests only the name, and do not assume the portal can execute an arbitrary selected action in isolation.

1. **Prove the saved and executed versions.** Record environment/workflow IDs, save response and independent definition comparison. Distinguish draft save from publication and verify which definition a later test actually executes; do not assume it uses the saved draft. An old-version successful run does not validate the new mapping. Stop if the source drifted or unrelated fields differ.
2. **Bound the effects.** Confirm actual CERT SharePoint bindings and native DEV Dataverse targeting again. Inspect fixture-related list triggers and downstream effects before creating records. Use dedicated disposable fixtures, never the production incident or a replay of a real ingestion run.
3. **Choose an explicitly isolated execution boundary.** Prefer a reviewed non-production harness containing the exact saved guard, lookup, condition and update, with controlled inputs/dependencies and an isolated schema-compatible test list. Preserve every mapping being tested; disclose any substituted bindings or omitted branches. Such a harness validates only that boundary, not the whole saved ingestion flow. Do not automatically run legacy delete/create/Dataverse/provisioning branches to test a name.
4. **Exercise the matrix below.** Capture input, unique business-key matches, action outcomes and destination values before/after. If using the exact many-field update, supply known fixture values for all mappings and verify their preservation; if testing a Title-only adaptation, explicitly label that narrower scope rather than claiming the original update was tested.
5. **Reconcile and clean up safely.** Inventory fixture IDs and created resources; remove only approved disposable fixtures after checking their current state and linked effects. Keep result receipts and separate planned cases from actual passes. Full-flow validation remains a later gate unless its complete side effects are independently controlled.

| Controlled case | Required observation; no live pass claimed |
| --- | --- |
| One match, corrected full title; then repeated input | Entire title copied verbatim; repeat preserves its value. Existing many-field writes may still occur. |
| Missing, null, empty or whitespace-only source | Current destination title retained, including a null/missing value as applicable. |
| Valid source, null/missing destination title | Destination repaired without an unrelated schema rejection. |
| Invalid source type or duplicate business-key matches | Guard rejects before destination update; earlier staging writes are not transactionally rolled back. |
| No matching destination | Existing no-update path preserved; no destination created by this patch. |
| Unrelated fields and downstream boundary | No unintended fixture-field change or execution outside the declared harness boundary. |

### Release checklist

- [x] Corroborate the omitted Title mapping against a successful historical run's embedded definition, retaining explicit structural-comparison limits. This does not clear the current-published comparison gate below.
- [x] Locate the unmanaged DEV BACK solution and Module1, corroborate the omitted mapping there and record the DEV/PRO differences without treating whole definitions as interchangeable.
- [ ] Confirm the authoritative release source, compare current-published Module1 with the captured draft and verify effective DEV/CERT site/list/connection bindings. Review drift without bypassing the fingerprint check. Do not edit the managed PRO layer directly.
- [x] Execute the exact local tests, including the real-snapshot branch; all 25 passed. Generate a new distinct review candidate and independently confirm only the three intended structural changes, with zero unrelated differences after reversing those changes.
- [x] Obtain DEV-only application/validation approval and prepare a separately fingerprinted DEV candidate; combined suite passed 31/31 with both real snapshots and zero skips. This is not production approval or proof of a cloud save.
- [x] Save the three-edit DEV draft through the supported normal SDK path and independently confirm its complete definition equals the reviewed DEV candidate. No atomic CAS guarantee or runtime pass is implied.
- [x] Publish in DEV and independently verify the latest published version and candidate equality. Record final checker result: 0 errors and 5 pre-existing licensing warnings; no runtime pass implied.
- [ ] Confirm/resolve the owner's reported Dataverse licensing warnings and prepare controlled disposable test inputs before end-to-end execution; no automatic purchase, trial or ownership reassignment.
- [ ] Transfer only the three reviewed logical edits into the reviewed DEV source, preserving DEV configuration and unrelated security logic; validate/save there and export the normal managed solution artifact. Do not import the full PRO-derived local candidate into DEV; it is not an import package.
- [ ] Validate in CERT: all cases above; existing many-field updates; new provisioning; failure logging; unrelated permissions/folder behavior; title constraints; concurrent and out-of-order input. Record actual outcomes and the exact version tested.
- [ ] Present the final release artifact, impact, test evidence and rollback to the user; obtain explicit approval before production import/publication, enabling/reprocessing flows or any live-data change.
- [ ] Handle the already-processed incident separately. With approval, re-read the unique business-key match, full current/source titles, ETag and affected triggers; review a conflict-aware single-item title repair. Do not replay full ingestion solely to fix a name.

### Rollback boundaries

**Flow behavior:** remove the added guard, restore the original condition dependency and remove only the added `item/Title` mapping in the authoritative DEV source; release a reviewed follow-up managed solution through the normal pipeline.

**Incident data:** reverting flow logic does not undo list writes. Restore a captured prior full title only after explicit approval and a fresh concurrency check, without overwriting a newer legitimate correction. No executable production repair is supplied.

### Next safe step

Confirm the owner's reported licensing status, prepare controlled disposable test inputs and execute only an explicitly bounded non-production validation after checking all runtime effects. DEV application/publication are independently verified, but runtime correctness, a managed release artifact and explicit production approval are not established. Preserve original source and previous receipts as rollback/history evidence. No real-ingestion replay, authentication workaround, automatic license/trial/owner change or automatic PRO package is proposed. Keep this record and the [tool status](../../scripts/flow-title-sync/README.md#validation-status) updated together; the original manual remains unchanged.
