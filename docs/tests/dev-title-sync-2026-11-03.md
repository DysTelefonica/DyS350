# DEV title-sync validation: scoped harness prepared, runtime pending

**Current result — 2026-11-03: runtime NOT RUN, not PASS or a failed flow run.** An initial Premium block applied to the human account; after normal generic sign-in, the native Run panel opened without that alert. A scoped real-SharePoint harness was prepared locally and an isolated empty CERT list created. Native creation did not yield a verified deployment. Captured BACK and My flows inventories are bounded views; ordinary manual/Compose template creation remains **unknown** outside them. No reviewed harness substitution was sent, no fixture row or Run was reported, and actual Title persistence remains **untested**. PRO remains unapproved and was not modified.

## Initial human-account preflight — historical

| Check | Actual observation | What it establishes |
| --- | --- | --- |
| Environment and flow | DEV `aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`; Module1 `1ca49582-ae1e-f111-8342-6045bde02c54`, in unmanaged BACK solution `ce6666c9-103a-4290-a63d-d8432400a052`. | Non-production target identified; [open flow details](https://make.powerautomate.com/environments/aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b/solutions/ce6666c9-103a-4290-a63d-d8432400a052/flows/1ca49582-ae1e-f111-8342-6045bde02c54/details). |
| Fresh normal server GET | Definition canonically equals the reviewed DEV candidate; `state=Started`, `userType=Owner`; `lastModified=2026-10-30T19:08:46Z` unchanged. | Candidate persistence and owner access, not runtime success. DEV publication was verified separately on October 30. |
| Native Run panel | Six required file inputs appeared, together with the alert quoted below. No files were supplied. | An actual pre-execution licensing block, beyond the earlier checker warnings. |
| Account context | This initial session was a human account, not the previously authorized generic/service account. Account menu exposed profile/account access and sign-out, with no cached generic-account selector. | This observation did not establish the generic account's Premium entitlement. |
| Execution and data | At this initial checkpoint, run history remained empty; no run, fixture, input payload file, harness or cleanup had been created/executed. | The initial result was BLOCKED before execution, not a failed flow run. Later preparation is recorded separately below. |

Observed alert:

> A premium Power Automate license is required to run this flow.

Automation did not sign the account out, change ownership, buy a license, start a trial or attempt an authentication workaround. The user later established the generic session through normal sign-in. Account identifiers, credentials and tokens are intentionally omitted.

The reviewed candidate's exact-byte SHA-256 is:

```text
0c22186ce4b424c06d54418ab2de91a46c3a8e5c0f02199f9811dfbde43a2432
```

Raw candidate/evidence storage remains ignored local material, not a portable flow package. The deployed Module1 definition and original preparation baselines were not modified in this round.

## Later generic-account preparation — still no execution

| Check | Actual observation | Limit |
| --- | --- | --- |
| Generic session and native preflight | Generic account verified through the normal account UI. Module1 server GET returned 200 with `userType=Owner`, `state=Started`. Editor Test → Manual → Test opened the native Run panel with all six inputs and no Premium alert. | This is not a license-entitlement certificate or a successful run. No Module1 files were submitted. |
| Scoped execution boundary | Original Module1 was not run: its quality-role/group and Dataverse side effects would exceed the chosen test boundary. A new-list SharePoint/WDL harness copies the exact saved lookup, title guard, existing-record condition and all 36 update mappings. | Only isolated site/list bindings and controlled dependency wiring change. Staging, Dataverse, role/security, provisioning and original error/response branches are omitted; this is **not Module1 end to end**. |
| Isolated CERT list | Created `TitleSyncTest_20261103_1045_v0169g`, ID `979f7383-2aa5-499c-bcf7-7d2098ec0f63`, with REST 201. Reconciliation at `2026-11-03T11:16:11.456Z` returned 200/200, verified GUID/title and all 37 expected optional/writable field names/types with SchemaXml, and `ItemCount=0`. | Field definitions only were cloned; no source business records, permissions or workflows were copied. The reconciliation receipt is retained in ignored local evidence. |
| Bounded field-constraint review | Static comparison matched all 11 DateOnly fields, both plain-text Note fields and custom Text limits. Built-in Title SchemaXml omitted MaxLength; independent REST 200 at `2026-11-03T11:18:21.344Z` confirmed Title `MaxLength=255`, optional and writable, retained in ignored `test-title-constraint.json`. | Resolves the specific Title-limit uncertainty; not a claim of complete schema parity or runtime validation. |
| Connection reference | Normal native flow details and GET verified an existing SharePoint reference owned by the generic account; only its four essential reference properties were copied to the ignored local review configuration. | No credentials, connection sharing or ownership changes. Its effective binding in a future saved harness must still be verified. |
| Local builder verification | Parent-approved exact post-fix test command passed **12/12**, zero failed/skipped/cancelled, duration **227.5795 ms**, including the exact candidate and metadata-bearing regression. Fresh review's environment-variable metadata issue was corrected. | Local structural tests, not connector/runtime passes. Earlier child sandbox `spawn EPERM` and rejected escalation were superseded by this approved execution. |
| Local review bundle | Generator exited 0 and produced ignored `harness.review.json`, SHA-256 below, with a 37-field preseed and seven planned trigger cases. | Local preparation only; no reviewed definition was sent for substitution and no case is marked executed. See the subsequent creation attempt below. |

```text
b4931f5b2a19eb48afa60783fac196ba2319dce1de08797523b4a06dbd959187
```

The [local-only builder](../../scripts/flow-title-sync/runtime-harness.cjs) and [tests](../../scripts/flow-title-sync/runtime-harness.test.cjs) preserve the copied action expressions. Harness site/list parameter metadata is deliberately detached from the business environment variables; independently verify **effective saved values**, not only defaults, before any execution. Planned cases are corrected title, repeat, whitespace, null, absent title, invalid type and no match. Duplicate matching remains a secondary unexecuted case, not a claimed pass.

Exact passing local command, from the repository root:

```powershell
$env:FLOW_HARNESS_DEFINITION_PATH='.atl/project-title-sync/module1.dev.review-v1.json'
& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync/runtime-harness.test.cjs'
```

## Native creation attempt — no verified deployment or run

| Step | Actual observation | Limit |
| --- | --- | --- |
| New designer | New v3 canvas remained empty; its GET returned 403 `InvalidPath` for `GET/FLOW`. A native switch without saving loaded the classic designer. | A designer/API-path failure, not evidence of a Premium block. |
| First two Save attempts | Native validation required Compose Inputs; the registered creation handler matched no POST. | No creation receipt; client validation is not a runtime test. |
| Third Save attempt | Native expression insertion/deletion cleared template validation. Save then remained “Saving” at `/flows/new`; the handler's `/flows\?/` POST count stayed 0 with `applied=false`. Retries stopped. | The reviewed harness substitution was not sent. An unmatched handler does **not** prove that no ordinary manual/Compose template was created through another request shape. |
| Fresh read-only audit | Native Power Apps BACK inventory displayed all 9 cloud-flow rows with no exact test display-name match. My flows displayed only Firmas; the first captured flow-list GET returned 200 with an empty array and no `nextLink`. | BACK scope only, and the GET was only one of the UI queries: neither proves whole-environment absence. Ordinary template creation remains **unknown** outside these bounded views; no successful deployment or execution is claimed. |

### Resource inventory and cleanup review

| Resource | Last established state | Required follow-up |
| --- | --- | --- |
| Isolated CERT list `979f7383-2aa5-499c-bcf7-7d2098ec0f63` | Retained empty: reconciliation at `2026-11-03T11:16:11.456Z` confirms 37 optional/writable fields and count 0. | Reconciliation captured; re-read current state and inspect dependencies before any approved cleanup. |
| Reviewed harness bundle | Ignored local artifact only; no reviewed substitution sent. | Do not label it deployed or executed. |
| Possible ordinary manual/Compose flow | Creation unconfirmed; no verified resource ID or success receipt. | Reconcile normal read-only environment and solution inventories before retrying creation or proposing removal; preserve uncertainty if inventory remains incomplete. |
| Fixture rows / test runs | None reported in this attempt. | Obtain actual resource/run receipts before claiming execution or cleanup. |

No cleanup was performed. Any later cleanup must identify exact disposable resource IDs, current state and dependencies; never delete an inferred or unrelated resource.

Final ignored receipts under `.atl/project-title-sync/live-test-20261103/`: `list-reconciliation.json` (200/200 schema/list verification), `back-inventory.txt` (all 9 BACK rows), `my-flows-inventory.txt` (bounded first GET) and `create-attempt.txt` (`seen=0`, `applied=false`). No further cloud mutations, fixture creation or runs followed the third Save attempt.

## Safe resumption

1. Resolve possible template creation beyond the captured bounded inventories before another create. List reconciliation is captured; fresh review must verify any saved harness's exact definition, effective CERT/new-list bindings and approved connection reference. The generic no-alert preflight does not guarantee execution.
2. Seed only the isolated list with the synthetic values and unique business key after reviewing its subscriptions and effects. Do not write existing business lists or replay incident 1205. Retain a fresh persisted baseline, not assumed seed literals.
3. After each permitted execution, retain the run/version identity, action outcomes and independent persisted Title before/after. Compare all 35 other mapped columns plus the business ID by exact raw values, explicitly distinguishing missing from null. Report non-title changes, partial writes and failed actions rather than silently normalizing them into a pass.

The unchanged Module1 performs many-field SharePoint updates and Dataverse operations. Static inspection also shows that empty `responsables` with an absent/null quality responsible **may select quality-role creation and SharePoint group writes**; empty arrays are not a blanket safe full-flow payload. Fixture accounts, Dataverse records and cleanup boundaries require explicit review before execution.

The live schema defines `CadenaPecal` as Text while the unchanged mapping returns boolean `false` for empty `pecal`. The synthetic preseed uses text `false`; actual connector coercion must be observed. Empty `Miembros` may persist as null. These are explicit runtime checks, not permission to overlook non-title drift. Inventory the isolated flow/list/rows before any approved cleanup; no cleanup was executed.

## Evidence limits and release decision

- The **31 passing local tests are historical October 30 results**, not rerun on November 3 and not Power Automate integration evidence.
- The separate **12 post-fix harness tests did run locally on November 3**; none is a real SharePoint or Power Automate case result.
- October 30 publication/checker evidence remains historical: 0 errors and 5 pre-existing Dataverse licensing warnings. The November 3 alert is a preflight block, not a failed action result.
- Runtime integration, the broader regression matrix and managed release verification remain outstanding. This round does **not** establish production readiness or grant PRO approval.

See the [investigation and release gates](../investigations/expediente-title-sync.md#release-gates) and the [documentation hub](../README.md). The team's original operational manual was not changed; current DOC IT revision freshness was not rechecked in this round.
