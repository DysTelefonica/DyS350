# Make Thumbnail optional: offline DEV/CERT diagnostic

> **Historical bundle — November 4 snapshot.** The user manually saved the narrow correction on November 5, and independent non-draft server readback verified the complete reviewed schema (23 required members; Thumbnail property retained). The single retry cleared that parsing blocker but reached **PARTIAL BUSINESS SUCCESS / NOT READY**; see the [November 5 retest report](../dev-json-retest-2026-11-05.md). The original artifacts and unsuccessful-save history below are unchanged. This bundle remains non-deployable; complete runtime business success and PRO approval are not established.

**NOT APPLIED · NOT DEPLOYABLE FLOW · DEV/CERT ONLY · PRO EXCLUDED.** The saved `Obtener_ExpedientesSistema` Parse JSON schema still requires `{Thumbnail}`. This bundle proposes removing that single member from `items.required` (24 → 23), retaining its property definition and every other constraint. It does not save, publish, upload, retry or contact any service.

## Diagnosis and current checkpoint

- The [execution trace](../dev-json-trace-2026-11-04.md) records three business failures despite successful parent/child run statuses. The first child rejected 124 existing system-list records missing `{Thumbnail}`; parsing the incoming business JSON succeeded.
- Fresh sanitized server readback: checked `2026-11-04T22:03:33.759Z`, state `Started`, last modified `2026-11-04T18:33:58Z`. It still has 24 required members including `{Thumbnail}`; the corrected Cliente expression remains present. This is a point-in-time observation, not a current live check by this script.
- Renewed native keyboard paste produced malformed editor JSON. **No Save was performed**; immediate reload discarded it. The subsequent server readback above retained the same last-modified value and required Thumbnail. The earlier Save acknowledgement likewise did not establish a functional correction. **Editor transport/save binding is unreliable; its root cause is unverified. Stop editor automation writes and do not upload the input again.**

## Reproduce locally

From the repository root, using installed Node.js 18+ and no dependencies:

```powershell
& 'C:/Program Files/nodejs/node.exe' 'scripts/flow-title-sync/diagnose-thumbnail-schema.cjs'
& 'C:/Program Files/nodejs/node.exe' 'scripts/flow-title-sync/diagnose-thumbnail-schema.cjs' --write
```

The first command is read-only. `--write` writes only the four JSON artifacts in this directory; it never writes the source or README. Both run eight deterministic assertion groups in-process without subprocesses, installs or network access. The source must exist at `.atl/project-title-sync/schema-diagnostic-20261104/readback.json`; it is a sanitized schema receipt, **not the supplied business JSON**. The script pins its complete bytes to SHA-256 `b0dec474a25fa8c4f0a1c2d7db74155d0e7705ef6965268485ad204474e72e94`. Changed/missing source stops execution: obtain and review a new sanitized readback rather than weakening that guard.

| Artifact | Purpose |
| --- | --- |
| [observed-schema.json](observed-schema.json) | Exact schema extracted from the pinned readback. |
| [proposed-schema.json](proposed-schema.json) | Schema-only candidate, not a flow export or import package. |
| [required-thumbnail.patch.json](required-thumbnail.patch.json) | RFC 6902 `test` of the original required array, then `replace` of that array only. Do not submit it to a flow API. |
| [diagnostic.json](diagnostic.json) | Deterministic checks, provenance timestamps and SHA-256 receipts; no business records or credentials. |

## What the checks establish

The script proves the exact schema delta, retained Thumbnail definition, unchanged input, reversibility and all remaining required members (including ID and Title). Re-deriving from the original is deterministic; transforming or applying the guarded patch to the already-proposed schema **fails closed**, rather than silently succeeding. Re-running `--write` on the same pinned source produces identical JSON bytes.

Synthetic minimal records exercise **required-property presence only**. Their null placeholders are deliberately not full-schema-valid records. The presence probe ignores types and explicitly demonstrates that limitation; unchanged integer/string/object definitions are checked separately. Definition keys such as `@@odata.etag` are preserved literally; this script does not evaluate Workflow Definition Language escaping or equate them with runtime `@odata.etag` keys. **No full JSON Schema validator, WDL evaluation, connector behavior, runtime remediation, effective account identity, business success or deployment readiness is proved.** No original business input was copied into this bundle.

## Safe manual recovery — authorized operator only

1. Remain in the identified DEV environment with CERT bindings; exclude PRO. Obtain a fresh read-only server definition and confirm the exact action/schema, current Cliente correction and environment bindings. If they differ from this checkpoint, stop and review the new state before editing.
2. In the native designer's supported schema field, manually remove only the `{Thumbnail}` string from `items.required`. Keep `items.properties['{Thumbnail}']` and all other schema content. Do not regenerate the schema from an example, replace the whole flow, use automated JSON paste/model writes or retry an unreliable transport. If the editor cannot reliably represent the narrow change, discard it and escalate through supported platform administration.
3. Before saving, validate the editor JSON and compare the complete schema against the fresh baseline: exactly one required-array removal; 23 members; unchanged property definition and other constraints. Save once only when this is verified. The offline patch is a review aid, not an instruction to call any cloud API.
4. Independently retrieve the **persisted server definition** after saving. Check the complete delta, 23 required members without Thumbnail, its retained definition, Cliente correction and DEV/CERT bindings. A Saved badge or changed timestamp alone is insufficient. If persistence differs, stop; do not repeat automated writes.
5. Only after persisted verification and a separately controlled DEV/CERT test decision, plan the next execution without duplicate uploads. Reconcile business logs and target records, not merely Succeeded status or the processed library. Non-null Cliente propagation, existing-destination update, Ordinal casing and role/group effects remain unproved.

**Next step:** independent review of this offline bundle, then reliable supported manual recovery. No case is marked PASS at integration level and no PRO release is approved.
