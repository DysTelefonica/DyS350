# Prepare the missing provisioned-expediente Title mapping

**Reviewed change applied and published in DEV. Final cloud checker: 0 errors, 5 existing Dataverse licensing warnings. No runtime integration pass or production approval.** The original Module1 flow already updates provisioned expedientes on JSON ingestion but omits `item/Title`; the DEV version adds that missing mapping to the existing update, not a second synchronization flow or an SPFx display workaround.

See the [durable investigation record](../../docs/investigations/expediente-title-sync.md) for incident evidence, provenance, verification history and release gates. The retrieved definition is a draft capture; published equivalence remains pending.

A successful historical Module1 run's embedded definition independently corroborates the missing destination Title mapping. Its business definition structurally matches the draft only after excluding root runtime metadata and 46 exact per-action authentication parameter entries. This is not byte equality, proof of the current published definition, proof the run processed expediente 1205, or runtime validation of this proposal. The original CLI baseline is unchanged.

## Review the narrow change

Action path: `actions/Try_-_Procesar_ExpedientesJSON/actions/Existe_ExpedienteJSON/actions/Expediente_ya_Aprovisionado/actions/Actualizar_Expediente_Sistema`.

The [generator](prepare.cjs) makes exactly three structural changes:

1. Add `Validate_Expediente_Title_Sync` after the existing `Obtener_Expediente_del_Sistema` lookup.
2. Run the existing provisioned-record condition only after that guard succeeds.
3. Add `item/Title` to the existing `PatchItem`, preserving every other mapping, connection, business-key lookup, downstream dependency and error handler.

The guard allows a missing/null/string source `titulo` and at most one destination match. It adds no business-ID restrictions. Missing/null/whitespace source preserves the current destination value; a valid title is copied verbatim, including its original whitespace, and can repair a null/missing destination title. Duplicate destination matches or invalid title types stop the destination update. No record is created for an empty lookup. No spelling substitution or incident ID is embedded in the patch.

**Not a transaction:** the guard runs after the existing `Actualizar_ExpedienteJSON` write. Rejection does not undo that write, and later processing can be skipped through existing failure handling. The same title is value-idempotent, not a zero-write guarantee: the original update still writes its other fields on each ingestion. Concurrency, event ordering and ETag conflict control are unchanged; an older concurrent replay can still win. For blank input the current title is re-sent, not omitted from the update.

## Source and offline preparation

[baseline.json](baseline.json) contains only reviewed action excerpts and the exact source-file SHA-256 `c584b6c9698a3d0627720eace374e8de0ed69f42b7d23e432beb1cee27b6c02e`. It is **not** a deployable flow. The source was returned by the authenticated Power Automate portal on 2026-10-30 with `draftFlow=true`; equality with the published definition remains unverified.

The CLI verifies the exact input bytes, then checks the relevant action structure. Any source drift, including whitespace or an unrelated upstream/environment change, is refused. A fresh export requires comparison against the published and DEV solution source, explicit review and a reviewed baseline update; never replace the hash just to bypass a refusal. The exported `prepare()` helper is the structural unit-test seam; production preparation must use the CLI/`prepareSource()` fingerprint boundary.

After the exact local tests passed on 2026-10-30, the following command ran successfully from the repository root with Node 18.20.4:

```powershell
.\v18.20.4\node.exe scripts/flow-title-sync/prepare.cjs .atl/project-title-sync/module1.definition.json .atl/project-title-sync/module1.review-v2.json
```

The generator performs no network/cloud operation. It writes a new file only under the ignored `.atl/project-title-sync/` directory and refuses to overwrite an existing file. Keep raw definitions and generated outputs out of version control; review them for secrets before sharing.

The new candidate `.atl/project-title-sync/module1.review-v2.json` has SHA-256 `45300f93bc1c7874aa34f4d483264e2bc6848fefc373bbbb21b729b8e2686317`. An independent structural comparison found only the three intended edits above: four leaf differences, because replacing `runAfter` removes one dependency key and adds another. Reversing those three edits in memory left zero unrelated structural differences. The bounded receipt is ignored `.atl/project-title-sync/module1.review-v2.comparison.json`. This is structural equality of the remaining JSON content, not byte equality or runtime certification.

**PRO-derived review candidate, not a DEV import.** Read-only investigation located unmanaged DEV BACK version 1.0.0.10 and its Module1 draft, which also omits the destination Title mapping. However, the full DEV/PRO definitions have 22 leaf differences: environment defaults, schema requirements, security-condition placement and initial counters. DEV's site default points to CERT, but the effective binding is not yet verified. Do not copy/import this full PRO-derived candidate into DEV. Transfer only the three reviewed logical edits into the separately reviewed DEV source while preserving its settings and unrelated logic. Offline DEV preparation requires a separate source review and approved fingerprint/baseline; this generator must continue refusing DEV bytes. See [DEV evidence and comparison limits](../../docs/investigations/expediente-title-sync.md#dev-source-reconnaissance).

**Stale output:** `.atl/project-title-sync/module1.patched.review.json` predates the fingerprint enforcement and narrowed guard corrections. It remains obsolete and must not be used instead of the new candidate. Neither candidate is an importable solution package.

## Separate DEV preparation

The user subsequently authorized application and validation in **DEV only**, never PRO. The [DEV entry point](prepare-dev.cjs) accepts only the exact reviewed DEV snapshot SHA-256 `e8b962d9059c7fa1e557dd4e18c50747403dd8f176eca66cee3fb7f1358cf633` and asserts its CERT site default. It then reuses the existing structural checks and three-edit transformation on a clone of that DEV source. The original PRO entry point and fingerprint are unchanged; neither entry point accepts the other's source. A source change requires review, not an arbitrary replacement hash.

The [DEV tests](prepare-dev.test.cjs) check source separation, site/default drift and preservation of the actual DEV schema, counters, security-action placement and every other unrelated field. Run both suites from the repository root:

```powershell
$env:FLOW_DEFINITION_PATH='.atl/project-title-sync/module1.definition.json'
$env:FLOW_DEV_DEFINITION_PATH='.atl/project-title-sync/module1.dev.definition.json'
& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync/prepare.test.cjs' 'scripts/flow-title-sync/prepare-dev.test.cjs'
```

The initial normal combined run was blocked before either test file could launch (`spawn EPERM`); its two wrapper failures were not assertions. The root conversation then executed the unchanged command through the required approval path: exit 0, **31 tests passed, 0 failed, 0 skipped**, 0 cancelled and 0 todo; duration 268.4994 ms. Both real snapshots were exercised (DEV subtest 3, PRO subtest 31). No alternative runner was used.

The authorized DEV generator then exited 0:

```powershell
& '.\v18.20.4\node.exe' 'scripts/flow-title-sync/prepare-dev.cjs' '.atl/project-title-sync/module1.dev.definition.json' '.atl/project-title-sync/module1.dev.review-v1.json'
```

The new ignored DEV candidate has SHA-256 `0c22186ce4b424c06d54418ab2de91a46c3a8e5c0f02199f9811dfbde43a2432`. Its independent ignored receipt `.atl/project-title-sync/module1.dev.review-v1.comparison.json` confirms three logical edits/four leaf paths and zero unrelated structural differences after reversing only those edits. The source hash and CERT site default are unchanged. The DEV candidate preserves the DEV-specific schema, counters and security placement; it is not copied from the PRO candidate. Fresh review and a current-source recheck are required before any cloud save.

**Previous-round cloud attempts (historical):** a DEV draft save retained the original unpatched definition (`lastModified=2026-10-30T18:45:23Z`), not this candidate. Fresh audit conditionally required full-payload/ETag safety; guarded recovery then failed closed on unsupported read transport before forwarding PATCH. A native-SDK staging alternative forwarded zero matching writes and was aborted/cleaned. The existing October 19 version remained Published; that October 30 draft was separate. No functional patch, publication, run or PRO write occurred in that round. See the [incident and transport record](../../docs/investigations/expediente-title-sync.md#dev-draft-save-incident-and-transport-blocker). Its blocked DEV application state was subsequently superseded by the supported save below; local success alone still does not establish cloud runtime success.

That round's final server readback confirmed DEV still equaled the original source, with the same draft lastModified; PRO item 56 still had the typo and its original observed Modified timestamp. This is historical evidence, superseded for DEV by the supported application below.

**Current DEV application:** renewed DEV/CERT testing approval was followed by normal SDK Save draft with synchronous full-source/candidate checks, exact DEV/workflow targeting and only the three reviewed edits. Exactly one PATCH returned HTTP 204. Independent normal API GET 200 confirmed the DEV draft equals the reviewed candidate and not the original; `lastModified=2026-10-30T19:08:46Z`. Receipt: ignored `.atl/project-title-sync/dev-applied-draft-readback.json`. No unsupported read transport, host timer, manual authentication header or unrelated write was used; interception was cleaned up.

No additional ETag/CAS condition was added; native SDK conditions were preserved, so fresh source checks are **not an atomic concurrency guarantee**. That save/readback proved draft application only; publication was verified separately next.

**Current publication:** native DEV Publish was independently confirmed in version history: latest **Today 20:12** entry marked **Published**. Normal server GET 200 reports `state=Started` and the exact reviewed DEV candidate definition; `lastModified` remains `2026-10-30T19:08:46Z`. Receipt: ignored `.atl/project-title-sync/dev-published-readback.json`. Final checker is **0 errors, 5 warnings** concerning the owner's Power Automate Premium licensing for five existing Dataverse actions. The earlier zero-warning display was provisional. Warnings are not failed runtime evidence: confirm/resolve licensing status and prepare controlled disposable test data before end-to-end execution. Do not automatically buy a license, start a trial or change ownership. No full run, fixtures, real-ingestion replay or PRO write occurred.

**Runtime safety is separate:** the DEV snapshot contains no literal PRO site URL, but this alone does not prove safe effective bindings. All 41 SharePoint connector actions use the site environment parameter; existing operations include HTTP requests, item deletions, creates and updates. Five Dataverse operations also exist (one read, one update and three creates). The parent verified the actual SharePoint site value is CERT, inspected the generic SharePoint connection, and confirmed DEV environment metadata links its CRM instance; native current-environment Dataverse actions/tables were inspected. No full runtime-effects validation or flow run occurred. Verify controlled side effects before running the full flow; environment metadata is not a runtime test.

## Validation status

[Tests](prepare.test.cjs) cover structural preservation/refusals and a bounded local schema/title simulation. They do not implement the Power Automate runtime. An optional `FLOW_DEFINITION_PATH` checks the actual fingerprinted snapshot and complete unrelated-content preservation.

Exact test command on 2026-10-30, with repository-local runtime verified as `v18.20.4`:

```powershell
$env:FLOW_DEFINITION_PATH='.atl/project-title-sync/module1.definition.json'
& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync/prepare.test.cjs'
```

**Current result:** the root conversation subsequently executed this unchanged command through the required approval path: exit 0, **25 tests passed, 0 failed, 0 skipped**, 0 cancelled and 0 todo; duration 240.8516 ms. The actual-snapshot comparison was subtest 25 and passed, not skipped. The generator then ran normally and produced the distinct candidate above. No source-code change was needed.

A fresh independent review of that candidate reported PASS with no findings after verifying the source/candidate hashes, four leaf differences/three logical edits and preservation of unrelated structural content. It does not clear cloud validation or publication gates.

**History:** earlier sandbox attempts exited 1 before the test file could execute (`spawn EPERM`); their TAP failure was the runner wrapper, not a logical assertion failure. A child escalated retry returned `Rejected("rejected by user")`. The subsequent root approval resolved local execution; no alternative runner or permission workaround was used. Passing local assertions and the bounded simulation do **not** validate WDL expressions, connector behavior or Power Automate runtime execution.

## Release and rollback gates

1. The unmanaged DEV solution has been located. Confirm its release authority, compare current-published Module1 with the retrieved draft, and verify effective site/list/connection bindings. Review differences before a separate DEV baseline; do not bypass the original fingerprint. PRO is managed: do not edit its production layer directly.
2. Preserve the passing local test result and fresh review candidate; re-run against any subsequently reviewed source revision. Transfer only the three logical edits through the reviewed DEV source solution, preserving DEV settings and unrelated logic; validate/save there, and export the normal managed solution artifact. Do not import the full PRO-derived candidate into DEV. This script does not build an importable solution package.
3. Validate in CERT: changed/unchanged/blank/null/invalid source, null destination repair, duplicate/no destination, existing many-field updates, new provisioning, failure logging and unrelated permissions/folder fields. Check title-column constraints and concurrent-run/event-order behavior. Record actual results before claiming readiness.
4. Present the exact release and impact to the user and obtain explicit production approval before import/publication, enabling/reprocessing flows or changing any live item.
5. Treat the already-processed incident separately: only after approval, re-read the unique business-key match, current title/ETag and affected triggers. Review a single-item title repair with conflict detection; do not replay the entire ingestion solely to repair a name. No executable production repair is supplied here.

Rollback has two boundaries: revert the guard, condition dependency and added Title mapping in the authoritative DEV source and release a reviewed follow-up solution; separately restore an incident item's captured prior Title only with approval and a fresh concurrency check. Reverting flow logic does not undo previous list writes. Preserve baseline/release evidence and avoid blindly overwriting newer legitimate names.

## Microsoft references

- [SharePoint connector: Update item / PatchItem](https://learn.microsoft.com/en-us/connectors/sharepointonline/#update-item).
- [Workflow action schema: Parse JSON and runAfter](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers).
- [Power Automate/WDL expression functions](https://learn.microsoft.com/en-us/azure/logic-apps/expression-functions-reference): `coalesce`, `trim`, `empty`, `if`, and `first`.

These references describe the underlying operations; they do not certify this proposal or the deployed managed solution.

## Controlled retest fixtures (November 10)

[prepare-rf03-fixture.cjs](prepare-rf03-fixture.cjs) prepares the RF03 controlled cases for the DEV/CERT retest that follows the published parent read fix. It derives three payloads from the pinned November 6 RF01 payload (`A31CE6A43FD8BBABFafdBA3210FD406F49672D406648BA3BC4BBF50575D54ED7`) and refuses any base whose bytes differ:

- `rf03a-create.json` — a new disposable hierarchy (root `900611501`, child `900611502`, leaf `900611503`) with the RF01 shape, for the creation case.
- `rf03b-update.json` — the new leaf alone with only `titulo` and `fechaoferta` changed, for the changed-data update that exercises the existing-with-roles branch.
- `rf03c-replay` — the byte-identical resubmission of `rf03b-update.json`, for idempotence. It is the same file, not a new one.

Only identifier leaves (`idexpediente`, `idexpedientepadre`, `OrdinalE2E`, `nemotecnico`, `codexp`, `codexplargo`) differ from the base payload; persons, role flags, suppliers and milestones are preserved unchanged, and the hierarchy is preserved. Outputs go only to the ignored `.atl/project-title-sync/rf03-20261110/` directory and are never overwritten. The generator performs no network or cloud operation.

The [tests](prepare-rf03-fixture.test.cjs) cover the identifier allowlist, the preserved business content, the two allowed update leaves, the base fingerprint refusal and the output confinement. The Node test runner needs to spawn a child process per file, which the workspace sandbox blocks with `spawn EPERM`; the suite was executed through the approved path instead, with 10 tests passed and 0 failed.

The preparation does not authorize the upload, the run, any role deletion or any change to the child flow. See the [reconciliation record](../../docs/investigations/role-authoritative-reconciliation.md) for the execution constraints and the gates that stay closed.

## Role existence guards (phase 1 of the reconciliation)

[prepare-role-existence-guard.cjs](prepare-role-existence-guard.cjs) builds the phase 1 candidate of the child flow from the **published** DEV child source (`.atl/project-title-sync/skip-empty-responsibles-20261106/saved-source.json`, canonical definition SHA256 `8B9A82F1CE6CDD71ADD147085BD50A437CCCA1EC343446B3C192E435CFB73C32`, the source verified unchanged on November 7). The generator refuses any source whose environment, flow or definition hash differs, and refuses a source that no longer shows the three reviewed defects.

It applies exactly three changes: the quality technician existence check reads `RolesUsuarioPrevios` instead of the incompatible `ArrayResponsables`, the engineering role creation is guarded by the `usuario-IDRol` key of the existing roles, and the security role creation is guarded the same way. The candidate changes exactly five definition paths. The role deletion stays the reviewed static result `Eliminar_RolesUsuario0`, no existing row is rewritten, and no other branch, binding, parameter or connection is touched: phase 1 is the half that cannot lose a role.

The [tests](prepare-role-existence-guard.test.cjs) cover the source fingerprint and identity refusals, the exact set of changed paths, the content of the two new guards, the preserved original writes, the still-simulated deletion and the preservation of the published responsible filter and its four other consumers. The Node test runner needs to spawn a child process per file, which the workspace sandbox blocks with `spawn EPERM`; the suite was executed through the approved path instead, with 9 tests passed and 0 failed.

The candidate is **prepared, not applied**: no draft was saved, nothing was published and no flow was executed. Outputs go only to the ignored `.atl/project-title-sync/role-existence-guard-20261110/` directory and are never overwritten.

## Role title and user convergence (phase 2a)

[prepare-role-title-convergence.cjs](prepare-role-title-convergence.cjs) builds on the phase 1 candidate (pinned canonical hash `1184BEB7…`) and fills the branch each phase 1 guard leaves empty: when the role already exists, the stored row is looked up by the same normalized key and rewritten with the JSON title and user. It covers the five role kinds — project lead, Preventa, engineering, quality technician and security — and touches nothing else. The role deletion stays the reviewed static result. The [tests](prepare-role-title-convergence.test.cjs) check the pinned source, the exact set of changed paths, that the search key and the guard key are the same expression, that the write carries the JSON values, and that the creation branches are untouched: 8 tests passed and 0 failed. The candidate is **prepared, not applied**.

## The DEV run itself

[rf03-dev-run.cjs](rf03-dev-run.cjs) executes the controlled run against CERT with the tokens captured by the device code helper. It is pinned to the CERT site `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF` and to the reviewed flow identifiers, and it never touches PRO. Steps: `precheck` (identity, list reachability, scoped inventory), `upload <file>` (one submission to `cargaJSON_entrada`, with bytes and hash in the receipt), `runs` (the new parent and child runs with their outputs) and `readback` (the roles, suppliers and milestones of the controlled identifiers). Every step writes an evidence receipt under the ignored `.atl/project-title-sync/rf03-20261110/` directory.

The session itself comes from [.atl/rf03-token.cjs](../../.atl/rf03-token.cjs): it requests the device codes against the tenant, prints them for the operator, renews them when they expire and writes the tokens to an ignored local file. The tokens are never printed and never enter the repository.

## Scoped role deletion (phase 2b)

[prepare-role-scoped-delete.cjs](prepare-role-scoped-delete.cjs) builds the destructive half of the reconciliation on the phase 2a candidate (pinned canonical hash `E9916A53…`). It collects the desired role keys in a root variable while the flow already resolves the role identifiers, and turns the mocked deletion into a real `DeleteItem` that only runs for rows whose normalized key is not in that set. The delete **fails closed**: with fewer than one valid responsable in the JSON nothing is deleted. The deletion loop moves after the responsible loop, and the roles branch waits for the quality check, so the desired set is complete before the first deletion. Ten paths change; the [tests](prepare-role-scoped-delete.test.cjs) check the pinned source, the exact set of changed paths, the fail-closed condition, the real delete and the preserved phase 2a content: 9 tests passed and 0 failed.

The candidate is **prepared, not applied**, and it must not be applied before phases 1 and 2a have been measured in DEV: it is the first change that can remove a business row. Two business rules are implemented as safe defaults and still need confirmation — an empty responsible list deletes nothing, and the quality and security rows count as described by the JSON so they are never removed.
