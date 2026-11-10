# DEV parent snapshot completeness: release HOLD

**BLOCKED_FOR_RELEASE; bounded parent completeness unit PASS.** The published DEV candidate's R04 runtime reconciliation independently passed: the current fixture sees complete snapshots beyond 100 rows and successfully executes the count guard. This does not establish role/supplier idempotence or authorize destructive reconciliation. [RF01's bounded new-record PASS and RF02's scalar PASS / related-row FAIL](dev-responsible-filter-2026-11-06.md) remain unchanged: existing roles grew **3 → 6** and the supplier **1 → 2** after incomplete 100-row snapshots hid existing rows.

## Current checkpoint — November 7, 11:54:16 UTC

| Gate | Observed evidence / status |
| --- | --- |
| Published parent source | Fresh independent full-source comparison **PASS under the new fixed-19-path contract**; canonical SHA256 `5afafe770005ef524cde854c582e37331edc818a31665f749727c41f7cd031d0`. One restored candidate draft was source-verified, then published once at **11:42 UTC** |
| Permitted parent changes | Three `paginationPolicy.minimumItemCount: 5000` additions on `Obtener_Hitos`, `Obtener_Suministradores`, `Obtener_Roles_usuario`; new four-element integer-count guard **0..4999** after `Obtener_Roles_usuario`; only `JSON_Roles_Base64.runAfter` rewired through that guard. Existing staging pagination **5000** preserved |
| Protected scope | Child definition unchanged; generic-account connection references and actual CERT targets retained. Ten environment-variable panels, empty input queue and no in-flight parent/child runs checked before each smoke upload |
| Snapshot counts | R04 guard input and output both **[128, 51, 1171, 1371]**, respectively staging, milestones, suppliers and user roles; exact fresh CERT Site Contents counts agree. Role catalogue read **7** |
| Single R04 input | New empty-data file, **12 UTF-8 bytes with LF**, uploaded once at **11:47:48 UTC**. Native preview text is consistent with SHA256 `25ac29823ea32c588d7536a57d86d5eca0f9a65b9f951dabc9de7e8c6560ad90`; this is **not a raw transport checksum** |
| R04 parent run | Native ingestion run `08584075547843636916708547909CU20`, **Succeeded**, **11:48:21.5552933–11:50:51.9254555 UTC**; approximately **2m30s** observed duration, not a benchmark. The earlier Running checkpoint is superseded |
| R04 runtime gate | Independent review **PASS, bounded parent completeness unit only**: five CERT reads and guard succeeded; parsed `data: []`; zero loop iterations, child skipped, Catch paths skipped, all four totals **0**, no Failed/TimedOut actions |
| Post-run isolation | Six complete pre/post flow records unchanged, including bindings/state; parent **5 → 6** runs, only R04 added and old five unchanged; child **10** runs and **10** trigger histories unchanged. Business-list counts and displayed Modified values unchanged; input queue empty |
| Release gate | **HOLD**: known related-row duplication and unresolved role ownership/empty-input semantics remain; no child business branch, deduplication or failure-path acceptance |

Source/preflight evidence: [published source receipt](../../.atl/project-title-sync/read-completeness-20261107/candidate-published-source-and-runs.json), [final pre-smoke source and no-in-flight checks](../../.atl/project-title-sync/read-completeness-20261107/candidate-pre-smoke-final-source.json), [authoritative counts](../../.atl/project-title-sync/read-completeness-20261107/candidate-preflight-authoritative-counts.json), [single upload / preview receipt](../../.atl/project-title-sync/read-completeness-20261107/candidate-smoke-upload-and-preview.json). These are private ignored local review pointers, not committed or public evidence.

## Serialization incident and explicit acceptance boundary

The first native Publish at **10:58 UTC** failed the original strict parity gate: **12 injected authentication-placeholder properties and 7 empty `runAfter` objects were omitted**. A verified November 5 historical Restore + Publish recovered the baseline business logic, but the same 19 representation omissions remained. Its canonical baseline is `ad783a58ba367285b68baa6e19c5fbb47d40703103ba17040624360057afbbb8`; repeated Restore is not a byte-exact source recovery strategy.

**The original strict gate remains FAIL.** A separate, independently reviewed and root-accepted [normalization contract](../../.atl/project-title-sync/read-completeness-20261107/candidate-native-normalization-contract.json) permits only those exact 19 omissions under the existing DEV/CERT authority; all other protected source and bindings must remain exact. This is a new bounded acceptance contract, not a retrospective rewrite of the strict result or production authorization.

Microsoft's own [`stripInjectedAuthentication` change](https://github.com/microsoft/power-platform-skills/pull/393/files) supports treating injected authentication as a projected representation. It does **not** prove this flow's Publish behavior or runtime connection correctness. Actual runtime evidence is required separately. A historical candidate payload also had a `SUCCEEDED` case mismatch; the actual saved draft was independently observed with exact `Succeeded` and the accepted candidate hash. **No case-normalization exception was used.**

## Completed evidence, with scope limits

| Check | Result | What it does not prove |
| --- | --- | --- |
| Local parent preparation | [Generator](../../scripts/flow-title-sync/prepare-related-read-completeness.cjs) and [synthetic tests](../../scripts/flow-title-sync/prepare-related-read-completeness.test.cjs) verified locally; writer **11/11**, independent run **10 pass / 0 fail / 1 junction skip** | Power Automate runtime execution or release readiness |
| Separate native guard helper | **4999 accepted; 5000 rejected as expected**, `ValidationFailed` / maximum **4999**; no 5000-row business input uploaded | Parent failure-path/authentication recovery, all limit cases or concurrent-list consistency |
| Baseline R03 smoke | Independent audit **PASS for authentication/read/log/archive only**; details below | Candidate pagination/guard execution, child business behavior or duplicate prevention |
| Candidate R04 smoke | Independent final review **PASS, bounded parent completeness unit**; exact snapshot counts above 100 and native guard success | Deduplication, child business branches, failure authentication, concurrent atomicity or global completeness |

### Candidate R04 — complete current-fixture visibility

[Runtime evidence](../../.atl/project-title-sync/read-completeness-20261107/candidate-smoke-runtime-evidence.json) records the native guard's exact four-integer schema (`minimum: 0`, `maximum: 4999`, `minItems: 4`, `maxItems: 4`) and matching input/output **[128, 51, 1171, 1371]**. In contrast to R03's **100 / 100**, R04 sees all **1371 user roles / 1171 suppliers** counted in fresh Site Contents. The empty-data fixture deliberately exercises no child business branch.

Input item **225** was deleted successfully; the parent created processed item **146**, **11 bytes**, and log **102**, **122 bytes**. [Post-run source and run evidence](../../.atl/project-title-sync/read-completeness-20261107/candidate-smoke-post-source-and-runs.json), captured **11:54:08 UTC**, preserves parent canonical SHA256 `5afafe770005ef524cde854c582e37331edc818a31665f749727c41f7cd031d0` and child `8b9a82f1ce6cdd71add147085bd50a437ccca1ec343446b3c192e435cfb73c32`; complete records, not only hashes, were independently compared unchanged.

[Post-run counts and queue](../../.atl/project-title-sync/read-completeness-20261107/candidate-smoke-post-counts-and-queue.json) retain role catalogue **7**, staging **128**, milestones **51**, suppliers **1171**, user roles **1371**, destination Expedientes **8**, and their displayed Modified values from November 6 or earlier. Log count **101 → 102**, processed-library count **119 → 120**, failed-library count **22 unchanged**, input count **0**. Item IDs and library counts are distinct measures. This is bounded count/metadata and execution-path isolation, **not an all-row byte audit**.

### Baseline R03 — before candidate publication

One newly uploaded empty-data input, item **223**, produced native parent run `08584075566328450079032255340CU08`, **Succeeded**, **11:17:33–11:17:49 UTC**. [Action evidence](../../.atl/project-title-sync/read-completeness-20261107/baseline-smoke-runtime-evidence.json) confirms all five CERT reads succeeded; parsed `data: []`; zero loop repetitions; child skipped; totals **0 total / 0 new / 0 updated / 0 failed**. The parent created only its processed file **145** and log **101**, then deleted its input; the post-run input queue was empty. This bounded audit is not an all-row database mutation audit.

The baseline still returned **100 user-role rows and 100 supplier rows**, versus the later authoritative **1371 / 1171** counts. Its green run status therefore does not close the read gap. R03 proves only the exercised baseline authentication, reads and own-file lifecycle; it cannot substitute for R04 evidence.

## Remaining decision before business-row reconciliation

Clarify whether the incoming roles collection is authoritative for **all** roles or only ingestion-managed roles, how manually maintained roles are protected, and whether an empty collection means **clear**, **leave unchanged**, or another business-defined operation. No answer is assumed here. Only then design and separately authorize identity-based reconciliation, including quality/security roles and supplier identity, and verify update/repeat behavior with exact related-row keys and ancestor isolation.

The **5000** policy is bounded, not unlimited: any returned guarded count **≥5000** must fail closed before child execution. Counts below the limit are not by themselves proof against concurrent changes or every connector truncation mode. The existing failure/archive path needs independent failure-path evidence; an outer handled `Succeeded` status alone is not acceptance.

No `Probar`, replay, manual trigger, cleanup, role/mock/permission change or PRO operation is part of these smoke checks. R04 is complete; do not replay business JSON, clean existing duplicate rows, or infer authorization for destructive replacement. Operational manual and reference snapshots remain unchanged.
