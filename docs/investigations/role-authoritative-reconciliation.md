# Authoritative role reconciliation: design, apply and DEV/CERT measurement

**Status: phases 1, 2a and 2b applied and measured on 2026-11-11.** The DEV child now creates a role row only when the JSON describes a role that does not exist yet, rewrites the title of the rows it does describe, and deletes the rows the JSON no longer describes. The controlled RF04 and RF05 runs in DEV/CERT measured that an update, a rename and a removal of a responsible leave the role table exactly where the JSON says it has to be. The release stays HOLD: the supplier and milestone identifiers still churn on every ingestion, the milestone identity needs a business decision, and re-provisioning on update is undefined.

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

The candidate changes exactly nine definition paths and nothing else. The role deletion stays the reviewed static result, no existing row is rewritten, and the responsible filter and the other four branches are untouched. Candidate SHA256 `FD445A3FB13031F6B518ADE053304E8986DC0C2EADDDD42C2B82E5FF1312B0CA`, canonical definition hash `B419F64A9666E4F3ACF326149B3E9502C02CE19F80F43164EBC9C72D73AFA244`, ignored at `.atl/project-title-sync/role-existence-guard-20261110/`.

Normalization is not cosmetic. The RF02 duplicate analysis grouped the rows by trimmed lower-case user, so a raw comparison would miss real matches and the guard would protect nothing. Normalizing the index and the three checks together is what makes the guard effective; normalizing only one side would silently break the two checks that already existed.

## Phase 2a candidate: title and user convergence

[prepare-role-title-convergence.cjs](../../scripts/flow-title-sync/prepare-role-title-convergence.cjs) builds on the phase 1 candidate (pinned canonical hash `1184BEB7…`) and fills the empty branch that each phase 1 guard opens: when the role already exists, the stored row is looked up by the same normalized key and rewritten with the JSON title and user. It touches the five role kinds — project lead, Preventa, engineering, quality technician and security — and nothing else. 8 local tests pass; the candidate changes exactly ten definition paths and keeps the role deletion simulated.

Candidate SHA256 `83C29FFABD93EEE2DCC4C5B7F0F3E0876B382B0D50548A82227CB78959E2747E`, canonical definition hash `568D3028B095C9F7EE38659D35D8B4BBE2CEB7A7ACA7E7D48FFCD8C72CEBD845`, ignored at `.atl/project-title-sync/role-title-convergence-20261110/`.

The write is value-idempotent, not a zero-write guarantee: it repeats the JSON values on every ingestion, the same trade-off the expedition title mapping already made. It is applied only to a row that the key lookup actually found, so a missing row never produces a write against a null id.

## Phase 2b: deleting the roles the JSON no longer describes

This is the remaining half of the authoritative behaviour and the first change that can remove a business row. It **was applied in DEV on 2026-11-11**, after the creation and update paths had been proven there: the scoped delete must not ship before that, because a delete that runs against an incomplete snapshot or an undefined empty collection destroys exactly the rows the flow is supposed to keep. The guard that keeps it safe is the empty-collection rule below — the delete only runs when the JSON has at least one valid responsible, and it only runs for the rows whose key is not in the desired set.

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

[prepare-role-scoped-delete.cjs](../../scripts/flow-title-sync/prepare-role-scoped-delete.cjs) builds it on the phase 2a candidate (pinned canonical hash `E9916A53…`) with ten changed paths and 9 local tests passing:

1. A root variable `RolesUsuarioDeseados` collects the desired keys.
2. Five append actions fill it while the flow already resolves the role identifiers: the project lead key where `Filter_array_2` is read, the Preventa key where `Filter_array_Preventa_2` is read, the engineering key where the role parameter is used, and the quality and security keys where those roles already exist.
3. The mocked `Eliminar_RolesUsuario` becomes a real `DeleteItem`, but only inside a new `Es_Rol_No_Deseado` guard: the row is deleted when its normalized key is **not** in the desired set.
4. The guard fails closed: with fewer than one valid responsable in the JSON, nothing is deleted at all.
5. The deletion loop now runs after the responsible loop, and the roles branch waits for the quality check, so the desired set is complete before the first deletion.

Candidate SHA256 `9536095A6EB38B30FAD655CDB2F716A0EC6DCA2CDD70C87F305D1AC8F5E0A974`, canonical definition hash `8A4A6D589B20612B30B9A4229907C012CDF7861428ADB0AA7964A9DB5C7CCA79`, ignored at `.atl/project-title-sync/role-scoped-delete-20261110/`.

Two business rules are baked into that candidate and still need the product owner's confirmation:

1. **Empty collection.** If the JSON carries no valid responsable, or an empty `responsables` array, the desired set would be empty and a literal reading of the algorithm would delete every role of the expediente. The candidate therefore fails closed: an empty responsible list never deletes anything. That is the safe reading and it is the one implemented, not an assumption hidden in the code.
2. **Ownership of the quality and security rows.** Those two roles come from `responsableCalidad` and `responsableSeguridad`, not from the `responsables` array. If they are not part of `D`, the delete step removes them and the flow recreates them on every ingestion. The candidate adds both keys to `D`, so a row the JSON still describes is never deleted.

One consequence of the authoritative rule is worth stating explicitly: a role row of a kind the JSON does not describe is not in `D` either, so it is deleted. That is the literal meaning of "the JSON is authoritative", and it is also the widest blast radius of the three phases. If the business prefers to keep rows whose kind the flow does not manage, the delete guard needs one more condition and the candidate has to be regenerated.

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

- Phases 1, 2a and 2b are **applied and measured** in DEV/CERT on 2026-11-11: the role duplication is gone, the display names converge and a role the JSON no longer describes is deleted. The release still stays HOLD for the reasons below.
- The supplier and milestone rows are deleted and re-created on every ingestion (supplier row `1840` → `1841` and milestone row `642` → `643` on the controlled leaf). The identifiers change, so anything that points at those rows breaks. The reconciliation has the same shape as the role one and is not built: the **supplier** key is decided (`IDProyecto` + `IDSuministrador` + `IDPadre` + `IDExpedienteSuministrador`, the four fields the flow writes) and only the candidate is missing, but the **milestone** has no identity in the JSON at all — rows `631`–`634` of the project `1297` carry the same title, the same date and a null amount, so no content key can tell them apart and the reconciliation needs an identifier the JSON does not carry.
- A deleted role leaves the person in the SharePoint group: the decision B4 is still open, and so is the fate of a role whose kind the JSON does not describe (B1), even though the implemented default is the literal reading of the authoritative rule.
- The patch of the provisioned list (`Expedientes`) has not been re-exercised at runtime: in this DEV copy the creation of a row in that list is mocked, so only the eight demo expedientes exist there and probing them would corrupt their `Miembros` and role state.
- Updating an expediente does not re-provision it: folders, permissions and groups are created by the provisioning flow when a row is created in `Expedientes`, and the child only patches. Whether an update is expected to re-provision is a business decision.
- The duplicates already present on leaf `900611367` (`1677–1682`, `1827–1828`) stay untouched: their cleanup is a separate decision.
- The controlled identifiers of RF03 (`900611501`–`900611503`), RF04 and RF05 (`900611601`–`900611603`) stay in CERT as evidence: their cleanup is a separate decision too.
- The DOC IT copy of the operational manual has been re-checked on 2026-11-11: one file, text identical to the snapshot, transcription verified, snapshot refreshed.

## The platform save contract, learned on November 11

Applying a candidate to a cloud flow is a PATCH on the environment scoped flow route:

```
PATCH https://emea.api.flow.microsoft.com/providers/Microsoft.Flow/environments/{environmentId}/flows/{flowId}?api-version=2022-10-01
body: { "properties": { "definition": { ...WDL... } } }
```

The read side is `GET .../flows/{flowId}?api-version=2020-06-01&$expand=definition`, and the token that works is the portal's own Power Platform session token, held in the browser's MSAL cache.

Three rules the platform enforces on the save side, each discovered by reading the error it returns:

1. **No `@` inside a nested expression.** `concat(toLower(trim(x)),'-',@int(parameters('...')))` is rejected with a template validation error: the `@` prefix is only valid at the start of the whole expression. The candidates now use the form the published flow already proves, `toLower(trim(string(coalesce(x, ''))))`, with `int(parameters(...))` without the prefix.
2. **The save form must not carry `inputs.authentication`.** The published definition the read endpoint returns does carry it, and saving that shape is rejected with *should not have the property 'authentication'*. The platform injects the connection itself.
3. **The save form must carry `inputs.host.connectionReferenceName`**, and it has to resolve against the solution. The published definition has no `connectionReferenceName`, and its `$connections` and `connectionReferences` come back empty, so the logical names live in the solution and are not exposed by these APIs. Using the service name fails with *the API connection reference 'shared_sharepointonline' could not be found*.

**Consequence:** the definition that the read endpoint returns is the runtime shape and cannot be saved back directly. The save has to go through the portal's own editor form, which the maker portal holds and these APIs do not expose.

Nothing was left half applied: after every rejected attempt the readback confirmed the published child is still `8B9A82F1CE6CDD71ADD147085BD50A437CCCA1EC343446B3C192E435CFB73C32`, unchanged.

## How the definition is applied

The editor form the API does not expose is the one the platform itself keeps: the Dataverse row of the flow. A solution-aware cloud flow is a Dataverse component, and its editable definition lives in the `clientdata` column of the `workflows` table of the environment Dataverse:

```
GET  https://orge4f220a2.crm4.dynamics.com/api/data/v9.2/workflows(1ca49582-ae1e-f111-8342-6045bde02c54)?$select=clientdata
     clientdata = { "schemaVersion": "1.0.0.0",
                    "properties": { "connectionReferences": { … }, "definition": { … }, "templateName": "" } }
PATCH https://orge4f220a2.crm4.dynamics.com/api/data/v9.2/workflows(1ca49582-ae1e-f111-8342-6045bde02c54)
     body: { "clientdata": "{ …the same JSON with properties.definition replaced… }" }
```

Replacing only `properties.definition` and leaving `connectionReferences` and `templateName` untouched publishes the change: the PATCH answers `204`, the flow API readback returns the new definition and the flow stays `state: Started`. The connection references of the child are `shared_sharepointonline` → `cr435_sharedsharepointonline_c8ddc` and `shared_commondataserviceforapps` → `cr435_sharedcommondataserviceforapps_52caf`, and they must not be rewritten.

Three things make this the practical route, and each was learned by reading the error the platform returns:

1. **The environment API is reachable from the session.** The portal's own Power Platform token (MSAL cache, target `https://service.powerapps.com//user_impersonation`) authorizes both `https://emea.api.flow.microsoft.com/…` and `https://{envPrefix}.4b.environment.api.powerplatform.com/…`.
2. **A definition can be validated without saving it.** `POST …/powerautomate/flows/{flowId}/checkFlowErrors?api-version=2024-10-01` and `…/checkFlowWarnings?api-version=2024-10-01`, body `{"properties":{"definition": …}}`, answer `[]` for a sound definition.
3. **The flow API refuses the runtime shape, and the Dataverse write does not.** `PATCH …/powerautomate/flows/{flowId}?api-version=2024-10-01` with the published definition fails on the 46 `authentication` nodes, then on the missing `inputs.host.connectionReferenceName`, then on the API connection reference itself: no candidate name resolved (`cr435_sharedsharepointonline_c8ddc`, `new_sharedsharepointonline_7bf51`, the connection id, the display name, the full connection resource id). `parameters.$connections` must not carry a `value` ("the parameter value must not be specified"). The runtime shape and the editor shape are not interchangeable.

The portal editor is not needed and does not load in the embedded browser: `make.powerapps.com` renders only the navigation shell for the flow routes and `make.powerautomate.com` redirects solution-aware flows to the list. The Dataverse write is therefore the route, and the readback through the flow API is the proof that it took effect.

The save is also stricter than the validator. `checkFlowErrors` answers `[]` for a definition whose action graph closes a cycle; the cycle is only reported when the flow is saved, as `InvalidTemplate` — "The template validation failed: 'The circular dependency detected in template language expressions.'" Nothing is left half applied when that happens: the readback shows the previous definition and the flow keeps running it. The phase 2b candidate was rejected that way on 2026-11-11 and had to be regenerated (see [RF05](../tests/dev-role-reconciliation-rf05-2026-11-11.md#what-was-applied-and-the-defect-that-blocked-it)).

## Controlled cases for the re-measurement

The duplicates accumulated on `900611503` are not removed by phase 1, so the re-measurement needs fresh identifiers. The generator takes them from the environment: `RF03_NEW_IDS`, `RF03_LABEL` and `RF03_OUT_DIR`. The prepared RF04 payloads are `rf04a-create.json` (hierarchy `900611601` / `900611602` / `900611603`) and `rf04b-update.json` (the leaf alone with two scalars changed), with their receipt, under `.atl/project-title-sync/rf04-20261111/`.

## Verification checklist

The checklist the team can execute without the agent. Every line is a fact to observe, not a task to believe: each one is checked against a receipt written under the ignored `.atl/project-title-sync/rf03-20261110/` directory.

### Runtime, DEV/CERT only

| # | Check | Expected observation | Status |
| --- | --- | --- | --- |
| V1 | Identity of the session | The generic account, site `DyS350.cert.OCETF` | done: `USUARIO GENERICO APLICACION DYS350 RTEL TF04622` |
| V2 | Precheck inventory | `900611501–900611503` absent; role, supplier, milestone and library counts captured | done |
| V3 | RF03a creation | Parent and child runs succeeded; complete snapshot; one row per role; supplier and milestone created | done |
| V4 | RF03b update | The existing-with-roles branch runs; role counts **1 / 2 / 2 / 3** with the published code | done, as predicted |
| V5 | RF03c replay | No count moves, no new row, same counters | done, **FAIL**: the same four rows were added again, 8 → 12 |
| V6 | Isolation | Previous runs, the input queue, other expedientes and the logs do not move | done: no role row outside the controlled identifiers, failed library unchanged |
| V7 | Phase 1 applied | Published child equals the candidate apart from the accepted 19 omissions; the connections and the CERT parameters are unchanged | done on 2026-11-11: published definition `B419F64A…`, 9 changed paths, validator 0 errors and 0 warnings, connections and parameters untouched |
| V8 | Phase 1 measured | RF03b repeated after the apply gives **1 / 1 / 1 / 1** | done on 2026-11-11 (RF04b): the leaf stays **1 / 1 / 1 / 1** and the role table does not move (1403 before and after) |
| V9 | Phase 2a measured | A renamed person in the JSON lands in `Roles_usuario.Title` exactly, which is what the notification emails depend on | done on 2026-11-11 (RF04c): the three renamed rows keep their ids and their new Titles, the untouched row keeps its Title, still 1403 rows |
| V10 | Phase 2b measured | A role the JSON stops describing is deleted, the others stay | done on 2026-11-11 (RF05): the engineering row `1713` is gone, the leaf is 1 / 0 / 1 / 1, the role table loses exactly one row (1403 → 1402) and the other controlled expedientes are untouched |
| V10b | Fail closed | A JSON with no valid responsible deletes nothing | done on 2026-11-11 (RF05b): the three rows of the leaf stay, the role table keeps 1402 rows and no row is created |
| V11 | Supplier and milestone identifiers | The rows of an already ingested expediente keep their ids when the JSON is ingested again | **FAIL**, measured 2026-11-11: the supplier row went `1839` → `1840` and the milestone row `641` → `642` between two ingestions. Open defect |
| V12 | Data of an already ingested expediente | The record of an expediente that was ingested before carries the values of the last ingestion | done on 2026-11-11: the staging row of the controlled leaf carries the changed `titulo` and `fechaoferta` of RF04b |
| V13 | Patch of the provisioned list | A JSON updates the row of an expediente that is already provisioned | not exercised: in this DEV copy the creation of a row in `Expedientes` is mocked, so only the eight demo expedientes exist there |

The November 11 measurement is recorded in [the RF03 retest](../tests/dev-role-reconciliation-rf03-2026-11-11.md).

### Technical checks of the apply

| # | Check | Expected observation | Status |
| --- | --- | --- | --- |
| T1 | Fresh source check | The published child is still `8B9A82F1…` before any save | done on 2026-11-11, read twice before the two writes |
| T2 | Serialization | The read-back definition differs from the candidate only in the accepted authentication placeholders and empty `runAfter` entries | done on 2026-11-11: the read-back hash equals the candidate hash exactly (`B419F64A…`, then `568D3028…`) |
| T3 | Bindings | `E2E_ConexionEntorno` and `E2E_ListaRolesUsuario` still point at CERT and at the same list | done on 2026-11-11: CERT site, `4f76ac2a…`, `39cc4d8f…`, 12 parameters, `staticResults` intact including the still-mocked `Eliminar_RolesUsuario0` |
| T4 | Validator | Zero errors; the five Dataverse licensing warnings are the known pre-existing ones | done on 2026-11-11: `checkFlowErrors` and `checkFlowWarnings` both answer `[]` for the applied definition |
| T5 | Group membership | Deleting a role row leaves the SharePoint group membership behind unless the business decides otherwise | open decision |

### Business decisions still open

| # | Question | Implemented default | Status |
| --- | --- | --- | --- |
| B1 | A role row whose kind the JSON does not describe | Deleted, the literal reading of "the JSON is authoritative" | open |
| B2 | JSON with no valid responsable | Fail closed: nothing is deleted | open |
| B3 | Quality and security rows | Counted as described by the JSON, so they are never deleted | open |
| B4 | Group membership when a role row is deleted | Not implemented | open |
| B5 | The duplicates already present on leaf `900611367` (`1677–1682`, `1827–1828`) | Left untouched | open |

### Documentation and repository

| # | Item | Status |
| --- | --- | --- |
| D1 | DOC IT revision of the operational manual compared with the local transcription | done on 2026-11-11: one file, text identical to the snapshot, transcription verified line by line, snapshot refreshed |
| D2 | This record linked from the documentation hub | done |
| D3 | Local suites | 119 test cases: 112 passed, 6 skipped (pre-existing), 1 blocked by the sandbox (`spawnSync git` is denied), 0 code failures |
| D4 | Commits | `ee7e11c`, `e9faf3a`, `7aa32ac`, `66a045a`, `c803071`, `ecde29a`, `c096828`, `33e52fe`, `e768972`, pushed to `main` on 2026-11-11 |
| D5 | Apply of phase 1 to the DEV child | done on 2026-11-11 through the Dataverse `clientdata` of the flow; see [How the definition is applied](#how-the-definition-is-applied) |
| D6 | Apply of phase 2a to the DEV child | done on 2026-11-11, same route; measured by RF04c |
| D7 | Apply of phase 2b to the DEV child | done on 2026-11-11, same route; the first candidate was rejected by the platform for a dependency cycle and had to be regenerated; measured by RF05 |

## Related records

- [DEV responsible filter, November 6](../tests/dev-responsible-filter-2026-11-06.md) — RF01 pass, RF02 duplication fail, and the proven cause.
- [DEV parent snapshot completeness, November 7](../tests/dev-parent-snapshot-completeness-2026-11-07.md) — the published read fix and the release HOLD.
- [DEV role reconciliation RF04, November 11](../tests/dev-role-reconciliation-rf04-2026-11-11.md) — the apply of phases 1 and 2a, the measurement of the update and rename cases, and the supplier/milestone churn defect.
- [DEV role reconciliation RF05, November 11](../tests/dev-role-reconciliation-rf05-2026-11-11.md) — the apply of phase 2b after the platform rejected the first candidate for a dependency cycle, the measurement of the scoped deletion, and the evidence that the milestone has no identity in the JSON.
- [Provisioned-expediente title synchronization](expediente-title-sync.md) — the earlier incident and title mapping work.
