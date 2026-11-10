# Authoritative role reconciliation: design and DEV/CERT retest plan

**Status: prepared, not executed.** No DEV/CERT row was written and no cloud flow was changed while producing this record. The controlled payloads for the retest exist locally and are fingerprinted; the runtime evidence does not.

## Business decision that drives the design

On 2026-11-10 the product owner confirmed the rule that was left open since November 7: **the incoming JSON is authoritative for every role of the expediente**. It carries the real information, and the rest of the state is what has to be adjusted to match it. Manual assignments and Preventa rows are therefore not protected by default; the system converges to the JSON.

That decision answers the semantic question but not the engineering one. Convergence still has to be expressed as a **keyed** operation, because the current flow reconciles by *delete-all-then-create* and by *create-if-absent*, which are different operations with different data-loss profiles.

## What the published DEV child actually does today

Read from the local DEV child source (`.atl/project-title-sync/skip-empty-responsibles-20261106/candidate-definition.json`, flow `1ca49582-ae1e-f111-8342-6045bde02c54`):

| Branch | Condition | Write behaviour |
| --- | --- | --- |
| `Por_cada_Responsable` / `_3` | New expediente, with or without parent | Creates the role rows without any existence check |
| `Por_cada_Responsable_Sin_RolesUsuario` | Expediente exists, **no roles found** | Creates every role row, without any existence check |
| `Por_cada_Responsable_2` | Expediente exists, **roles found** | Runs a role deletion loop, then creates only the role keys that were *not* in the previous set |
| `Comprobar_que_hay_Suministradores` | Suppliers found for the project | Deletes every supplier row and recreates them from the JSON |
| `Comprobar_que_hay_Hitos` | Milestones found for the project | Deletes every milestone row and recreates them from the JSON |

Three findings matter for the reconciliation:

1. **Only the role deletion is simulated.** `Eliminar_RolesUsuario` carries `runtimeConfiguration.staticResult` with name `Eliminar_RolesUsuario0`, so it returns a static result instead of calling SharePoint. The milestone and supplier deletions are real `DeleteItem` calls.
2. **The existing-with-roles branch was never exercised by RF02.** The November 6 run read a truncated snapshot, so the roles of the expediente looked absent and the flow took `Por_cada_Responsable_Sin_RolesUsuario`, which creates without existence checks. That false absence — not a failed deletion — is the proven cause of the roles growing **3 → 6** and the supplier **1 → 2**.
3. **The role creation key is inverted with respect to an authoritative source.** `Contiene_Usuario_ya` skips creation when the key `usuario-idRol` was already present, while `Por_cada_RolUsuario_Eliminar` is supposed to remove the previous rows. With the deletion simulated, the pair is harmless. With a real deletion it would delete exactly the rows it then refuses to recreate.

### Existence checks that cannot match

| Creation | Existence check | Effect |
| --- | --- | --- |
| `Crear_elemento` / `Crear_Ingeniería` (engineering role) | none | One more row per ingestion |
| `_Crear_Tecnico_Documentacion*` (security role) | none | One more row per ingestion |
| `Responsable_de_Calidad_ya_Existente` (quality role) | `contains(variables('ArrayResponsables'), 'correo-idRol')` | `ArrayResponsables` stores `nombre - correo;`, the check compares `correo-idRol`; the formats cannot match, so the check is always false |
| `Contiene_Usuario_ya` / `_2` (project lead, Preventa) | `contains(variables('RolesUsuarioPrevios'), 'correo-idRol')` | Correct key format, but the semantics are "skip what existed", not "converge to the JSON" |

The quality check is a pure format mismatch between two variables; it is a defect independent of the truncation bug.

### Role identifiers observed in CERT

From the November 6 readback of the roles created by RF01: `IDRol` **4** is *Jefe de proyecto*, **3** is the engineering role, **2** is *Técnicos de calidad* and **5** is the security/documentation role. The Preventa role was never exercised by that fixture. These identifiers are what the existence keys have to compare against, and they are the reason the security key is the literal `correo-5` while the engineering key uses the `E2E_IDRol_Ingenieria` parameter.

## Target reconciliation

The authoritative behaviour is a symmetric difference over an explicit business key, applied to the rows the ingestion owns for that expediente:

```
D = desired set built from the JSON
E = existing rows for the expediente, read complete (parent pagination fix already published)

create  D \ E      (key absent in the system)
update  D ∩ E      (same key, title or other field changed)
delete  E \ D      (row the JSON no longer describes)
```

Key definitions, from the evidence already collected:

- Role: `IDExpediente` + `IDRol` + normalized `usuario` (the RF02 duplicate analysis already grouped by `IDExpediente + IDRol + trimmed lower-case usuario`).
- Supplier: `IDProyecto` + `IDSuministrador` + `IDPadre` + `IDExpedienteSuministrador`.
- Milestone: `IDProyecto` + `IDHitoExpediente`.

`D` is not only `responsables`: it also includes the roles derived from `responsableCalidad`, `responsableSeguridad` and the `esjefeproyecto` / `esPreventa` flags, because the flow creates those rows today. Leaving them out of `D` would make the delete step remove rows the JSON still implies.

Ordering constraint: the parent read fix must stay in place. The reconciliation is only as complete as the snapshot it diffs against, and the published pagination is bounded at 5000 items with a fail-closed count guard, not unlimited.

The deletion step stays simulated until the keyed creation and update paths are proven. Turning the real deletion on while the creation key is still "skip what existed" would delete roles that are never recreated — the precise failure mode the current design hides.

## Prepared controlled cases (RF03)

Prepared locally by [prepare-rf03-fixture.cjs](../../scripts/flow-title-sync/prepare-rf03-fixture.cjs) from the pinned November 6 RF01 payload (`A31CE6A43FD8BBABFafdBA3210FD406F49672D406648BA3BC4BBF50575D54ED7`), with 10 local tests passing. Output and provenance: ignored `.atl/project-title-sync/rf03-20261110/`.

| Case | File | Shape | Purpose |
| --- | --- | --- | --- |
| RF03a | `rf03a-create.json` (10 941 bytes, SHA256 `7FC366518D43F846A55F3EEC77BA335CB71AEC132CC7613EE35CF1ACB11035BA`) | 3 records: root `900611501`, child `900611502`, leaf `900611503` | Creation case against the fixed parent: confirms complete snapshots and the new-record hierarchy |
| RF03b | `rf03b-update.json` (3 749 bytes, SHA256 `00773C160683ADF54D281921885D45FBA2A6EAA0065CCE75DF08EE8B903B74C7`) | Leaf `900611503` alone, only `titulo` and `fechaoferta` changed | Changed-data update: exercises `Por_cada_Responsable_2`, the fifth Query consumer, still unexercised |
| RF03c | `rf03b-update.json` resubmitted unchanged | — | Idempotence: the second submission must not change any count |

The identifiers are new, so the run starts from clean rows and does not replay the duplicated leaf `900611367` or touch the existing duplicates `1677–1682` / `1827–1828`. Only identifier leaves differ from the base payload; every person, role flag, supplier and milestone is preserved byte for byte.

### What each case must prove

1. **RF03a** — the parent snapshot for the new expediente contains its roles and supplier, and the flow creates one row per JSON role. No duplicate quality, security or engineering row.
2. **RF03b** — the parent snapshot now includes the existing rows, so `Comprobar_que_hay_RolesUsuario` is true and `Por_cada_Responsable_2` runs. The role count for `900611503` stays equal to the JSON-derived count: no **3 → 6** duplication, and no row deleted without recreation.
3. **RF03c** — resubmitting the same payload changes nothing: same role rows, same keys, same supplier, same milestone, same counters.
4. **Isolation** — the ancestors `900611501` / `900611502`, the destination `Expedientes` list and the other flow runs keep their previous values; the input queue ends empty and the processed/log libraries grow by exactly one entry per submission.

### Expected role counts, stated before the run

The controlled leaf carries two valid responsible: the project lead and the engineering one copied from the base root. With the published code the prediction is:

| Role | After RF03a | After RF03b, published code | After RF03b, phase 1 candidate |
| --- | --- | --- | --- |
| Project lead (IDRol 4) | 1 | 1 — the key check already skips it | 1 |
| Engineering (IDRol 3) | 1 | **2** — created without any existence check | 1 |
| Quality technician (IDRol 2) | 1 | **2** — the quality check compares incompatible formats | 1 |
| Security (IDRol 5) | 1 | **3** — created once per responsible, without a check | 1 |

The security row grows once per valid responsible because the creation sits inside the responsible loop and writes the same person every time. A run that matches this table confirms both the defects and the completeness of the read fix; a run that shows one row instead of two or three means the snapshot was still incomplete, which is the more important signal.

## Phase 1 candidate: role existence guards

[prepare-role-existence-guard.cjs](../../scripts/flow-title-sync/prepare-role-existence-guard.cjs) patches the **published** DEV child (`8B9A82F1CE6CDD71ADD147085BD50A437CCCA1EC343446B3C192E435CFB73C32`, the source verified unchanged on November 7) with six changes, 12 local tests passing:

1. The role key index is built trimmed and lower-cased, so one key format is used everywhere.
2. The project lead check compares that normalized key.
3. The Preventa check compares that normalized key.
4. The quality technician existence check reads `RolesUsuarioPrevios` instead of `ArrayResponsables` and compares the normalized key.
5. The engineering role creation is guarded by the normalized `usuario-IDRol_Ingenieria` key of the existing roles.
6. The security role creation is guarded by the normalized `usuario-5` key of the existing roles.

The candidate changes exactly nine definition paths and nothing else. The role deletion stays the reviewed static result, no existing row is rewritten, and the responsible filter and the other four branches are untouched. Candidate SHA256 `90B70386E15D088B91D265462941E02C2E44CF87D1CF3FDEF82D6ED3E2FEC389`, canonical definition hash `1184BEB7A8F3743383964FDF20D58D48DD915041390C49B4C3C5078E2E41A770`, ignored at `.atl/project-title-sync/role-existence-guard-20261110/`.

Normalization is not cosmetic. The RF02 duplicate analysis grouped the rows by trimmed lower-case user, so a raw comparison would miss real matches and the guard would protect nothing. Normalizing the index and the three checks together is what makes the guard effective; normalizing only one side would silently break the two checks that already existed.

## Phase 2a candidate: title and user convergence

[prepare-role-title-convergence.cjs](../../scripts/flow-title-sync/prepare-role-title-convergence.cjs) builds on the phase 1 candidate (pinned canonical hash `1184BEB7…`) and fills the empty branch that each phase 1 guard opens: when the role already exists, the stored row is looked up by the same normalized key and rewritten with the JSON title and user. It touches the five role kinds — project lead, Preventa, engineering, quality technician and security — and nothing else. 8 local tests pass; the candidate changes exactly ten definition paths and keeps the role deletion simulated.

Candidate SHA256 `EC5E383368E83CA2E6AE2A00E079C45ACEBF3D8166C5FDCFE7BAE9D7552C0423`, ignored at `.atl/project-title-sync/role-title-convergence-20261110/`.

The write is value-idempotent, not a zero-write guarantee: it repeats the JSON values on every ingestion, the same trade-off the expedition title mapping already made. It is applied only to a row that the key lookup actually found, so a missing row never produces a write against a null id.

## Phase 2b: deleting the roles the JSON no longer describes

This is the remaining half of the authoritative behaviour and the first change that can remove a business row, so it is **designed here but not built yet**. The order matters: the scoped delete must not be shipped before the creation and update paths are proven in DEV, because a delete that runs against an incomplete snapshot or an undefined empty collection destroys exactly the rows the flow is supposed to keep.

The algorithm, for the rows of one expediente:

```
D = desired keys, built from the JSON
    - for each valid responsable: the key of the role its flags resolve to
      (project lead, Preventa or engineering)
    - plus the key of responsableCalidad and of responsableSeguridad
E = existing rows for the expediente, read complete

keep    E ∩ D     (phase 2a rewrites their title and user)
delete  E \ D
```

Implementation shape on the published child: the mocked `Eliminar_RolesUsuario` becomes a real `DeleteItem` that only runs for rows whose key is not in `D`, and the desired keys have to be collected while the per-responsible loop already resolves the role identifiers. That means two structural changes at once — reordering the deletion loop after the desired-key collection, and replacing the static result — which is why it needs its own candidate, its own review and its own measurement.

Two business rules are still undefined and must be settled before it is built:

1. **Empty collection.** If the JSON carries no valid responsable, or an empty `responsables` array, the desired set is empty and a literal reading of the algorithm would delete every role of the expediente. The safe default, and the one this design assumes until the product owner decides otherwise, is to fail closed: an empty desired set never deletes anything and the run records a warning.
2. **Ownership of the quality and security rows.** Those two roles come from `responsableCalidad` and `responsableSeguridad`, not from the `responsables` array. If they are not part of `D`, the delete step removes them and the flow recreates them on every ingestion. They are therefore included in `D` by design, and that inclusion has to be confirmed.

The parent read fix remains the precondition for the delete: the desired set is only as complete as the snapshot it is diffed against, and the published pagination is bounded at 5000 items with a fail-closed count guard, not unlimited.

### Execution constraints

- DEV/CERT only. PRO stays excluded and needs a separate explicit approval.
- Confirm the identifiers `900611501–900611503` are absent in CERT before any upload.
- One submission per case, uploaded through `cargaJSON_entrada`, with the upload receipt, the run identifiers and the readback captured as evidence.
- No `Probar`, no replay of a previous business JSON, no cleanup of existing duplicates, no change to the role-deletion mock, no permission or group change.

### How the run is executed

The corporate session is reached with the device code flow: [rf03-token.cjs](../../scripts/flow-title-sync/rf03-token.cjs) requests the codes against the tenant, prints them for the operator, renews them automatically when they expire and writes the resulting tokens to an ignored local file. The tokens never reach the repository and are never printed.

The controlled run itself is [rf03-dev-run.cjs](../../scripts/flow-title-sync/rf03-dev-run.cjs), pinned to the CERT site and to the reviewed flow identifiers:

```powershell
& '.\v18.20.4\node.exe' '.\scripts\flow-title-sync\rf03-dev-run.cjs' precheck
& '.\v18.20.4\node.exe' '.\scripts\flow-title-sync\rf03-dev-run.cjs' upload rf03a-create.json
& '.\v18.20.4\node.exe' '.\scripts\flow-title-sync\rf03-dev-run.cjs' runs
& '.\v18.20.4\node.exe' '.\scripts\flow-title-sync\rf03-dev-run.cjs' readback
```

Each step writes an evidence receipt under the ignored `.atl/project-title-sync/rf03-20261110/` directory: identity, list reachability, the upload bytes and hash, the new parent and child runs with their outputs, and the scoped role, supplier and milestone rows of the three controlled identifiers.

## Gates that stay closed

- Phase 1 and phase 2a are prepared as reviewed candidates but **not applied**: the DEV child is still the published one. The release stays HOLD.
- No runtime evidence exists yet for any of the three candidates: the retest has not run.
- The real role deletion stays disabled until creation and update are proven against the JSON.
- The empty-collection semantics (`null`, absent, `[]`) are still undefined and must be settled before the delete step can be enabled.
- Quality and security rows are created outside the `responsables` array; their ownership in `D` must be confirmed before any deletion is enabled, otherwise the delete step would remove rows the JSON still implies.
- The duplicates already present on leaf `900611367` (`1677–1682`, `1827–1828`) stay untouched: their cleanup is a separate decision.
- The DOC IT copy of the operational manual has not been re-checked against the current SharePoint revision.

## Related records

- [DEV responsible filter, November 6](../tests/dev-responsible-filter-2026-11-06.md) — RF01 pass, RF02 duplication fail, and the proven cause.
- [DEV parent snapshot completeness, November 7](../tests/dev-parent-snapshot-completeness-2026-11-07.md) — the published read fix and the release HOLD.
- [Provisioned-expediente title synchronization](expediente-title-sync.md) — the earlier incident and title mapping work.
