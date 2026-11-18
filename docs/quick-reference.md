# DyS350 quick reference

The technical map of this repository: the stack, the commands, the flows, the stores and the
platform rules that already have a price paid for them. It answers "where is this and how do I
run it", and links to the document that owns every claim. It is not a record of evidence, not the
operational manual and not a history of what was attempted.

| This file is | This file is not |
| --- | --- |
| The map of the code, the commands and the identifiers | The operational manual ([`manuals/guia-consulta-operativa.md`](manuals/guia-consulta-operativa.md)) |
| The rules of the platform that shape a candidate | The evidence of a change ([`tests/`](tests/), [`investigations/`](investigations/), [`changes/`](changes/)) |
| The current state of the branches | The release notes (`docs/releases/` on `prod` and `main`) |

## Quick path

The loop every change of a flow follows. Each step leaves an artifact that a reviewer can check
without trusting the commit message.

1. **Write a generator and its test.** A change to a flow is a `.cjs` generator in
   `scripts/flow-title-sync/` that turns a *pinned* published definition into a candidate, plus a
   `*.test.cjs` beside it. No generator touches the cloud: they are offline and deterministic.
2. **Prove it offline.** `node --test scripts/flow-title-sync` — no cloud, no tenant, no secrets.
3. **Measure it in DEV/CERT** with a controlled case over identifiers that no other case used, and
   write the before/after values in `docs/tests/`.
4. **Promote to PROD as a port**, not a copy: the wiring of PROD (environment parameters,
   authentication, trigger schema) is kept and only the reviewed paths move.
5. **Release**: commit the published definition to `prod`, bring `main` to that state, tag it
   (`v0.0.x`) and publish the notes of what changed *and* what was attempted.
6. **A change in the SPFx code** is a different loop: build the solution, deploy it to the tenant
   with its own authorization, and record it in `docs/changes/`.

## Repository map

| Path | What it is | Tracked? |
| --- | --- | --- |
| `scripts/flow-title-sync/` | The flow generators, their tests, the fixtures, the pinned baseline and the single mapping table | yes |
| `e2e-webparts/` | The single SPFx solution: thirteen web parts plus the `E2eBranding` application customizer | yes |
| `docs/` | The documentation hub, the manual, the investigations, the test evidence, the change records | yes |
| `v18.20.4/` | The local Node runtime the scripts run with | **no** (`.gitignore`) |
| `.atl/` | The scratch tree: raw definitions, generated candidates, tokens, one-off scripts | **no** (`.gitignore`) |

Nothing under `.atl/` is ever committed. Raw definitions, generated candidates and tokens live
there on purpose; review them for secrets before sharing them.

## Branches, environments and releases

| Branch | Environment | Carries |
| --- | --- | --- |
| `DEV/CERT` | DEV/CERT | The development branch: generators and tests, the SPFx code, the investigations and the test evidence |
| `prod` | PROD | What is applied and verified in PROD, with its change records and the release notes |
| `main` | PROD | The released state; it mirrors PROD and carries a tag per version |
| `develop` | — | History only: the SPFx branch before the consolidation of `E2eBranding` |

`main` is read before any modification. A change travels DEV/CERT → measured in PROD → committed
to `prod` → released on `main`. The development branch is never merged into `main` as a whole, so
the released branch stays readable as the state that is actually released. The full rule is in
the [branch convention](branching-convention.md).

| | DEV/CERT | PROD |
| --- | --- | --- |
| Environment | `DyS350_TF_E_DEV` (`aa9414ba-3c7c-e6ae-b993-01dd03a2bd4b`) | `DyS350_TF_E_PRO` |
| SharePoint site | `https://telefonicacorp.sharepoint.com/sites/DyS350.cert.OCETF` | `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF` |
| Dataverse | `https://orge4f220a2.crm4.dynamics.com` | same instance |
| Quality group | `Calidad`, id `36` | `Calidad`, id `24` |
| Flow instance (child) | `1ca49582-ae1e-f111-8342-6045bde02c54` | same flow, PROD wiring |

**No PROD write, deployment or data change happens without an explicit authorization for that
specific action.** The authorization for DEV/CERT does not extend to PROD.

## The flows

```
Parent  E2E_AltaExpedientes   (trigger: a JSON file in /cargaJSON_entrada)
├── Comprobar_que_el_archivo_es_JSON, Get_file_content, Parse_JSON, Obtener_Roles
├── Por_cada_Expediente
│   └── Ejecutar_Flujo_E2E_Alta_Expedientes_Modulo1   (the child, with four snapshot files)
├── Crear_Log_JSON  (/cargaJSON_log)   and the counters Total/Nuevos/Actualizados/Fallidos
└── Catch: Crear_JSON_Fallido, Eliminar_JSON_despues_de_fallo

Child  E2E_AltaExpedientes_Modulo1   (trigger: the JSON + the four snapshots)
├── Existe_ExpedienteJSON
│   ├── Actualizar_ExpedienteJSON         (staging list, 37 columns)
│   ├── Actualizar_Expediente_Sistema     (application list, 36 columns)
│   ├── Actualizar_Expediente_-_Dataverse (Dataverse, 32 columns)
│   ├── roles: Por_cada_Responsable_2 → Jefe, Preventa, Ingenieria, Seguridad
│   ├── quality: ResponsableCalidad, Rol_Tecnico_de_Calidad
│   └── the delete branches: roles, milestones, suppliers
└── Anexar_Resultado_Correcto
```

The **parent orchestrates and writes the log**; the **child reconciles**. A third flow,
`E2E_AltaExpedientesAprovisionamiento`, creates the folders and assigns the permissions, and it
is triggered by the *creation* of an item in the `Expedientes` list — an update of a provisioned
expediente does not re-provision it.

The sibling flows of the document lifecycle are `E2E_AltaTareaDocumento`,
`E2E_RevisionesTareaDocumental`, `E2E_FirmasTareaDocumental` and
`E2E_RecordatorioTareaDocumental`. Which one to look at for a given symptom is in the
[manual](manuals/guia-consulta-operativa.md#2-notificaciones).

### The stores

| Store | Owner | What the flow does with it |
| --- | --- | --- |
| `cargaJSON_entrada` | the team | The input library. The trigger of the parent polls it |
| `cargaJSON_log`, `cargaJSON_procesados`, `cargaJSON_fallidos` | the flow | Output and traceability |
| `ExpedientesJSON` (staging) | **the flow** | Creates 41 columns, patches 37 |
| `Expedientes` (application list) | **the application** | The flow only patches 36 columns; it never creates the row |
| `cr435_expedientes` (Dataverse) | **the flow** | Creates 37 columns, patches 32 |
| `Roles_usuario` | the flow | `Title`, `usuario`, `IDRol`, `IDExpediente` |
| `Hitos`, `Suministradores` | the flow | The child tables; the rows keep their identifiers since RF06 |
| `TareasDocumentales`, `Firmas` | the flows of the document lifecycle | The tasks and the signatures |
| `DocumentacionTrabajo`, `DocumentacionArchivo` | SharePoint | The documentary libraries of the expediente |

The JSON carries **50 keys**; the flow reads **41** of them. The mapping is one to one and by
name, and it lives in a single table:
[`scripts/flow-title-sync/mapping-table.json`](../scripts/flow-title-sync/mapping-table.json).
Dataverse renames five of them (`Title` → `cr435_name`, `Estado` → `cr435_idestado`,
`Observaciones` → `cr435_obser`, `Tipo` → `cr435_tipo`, `IDGradoClasificacion` →
`cr435_gradoclasificacion`), and `Estado` is a lookup there: the flow writes the identifier, not
the label.

### The role model

The catalog of the environment is the authority for the identifiers. They are read **by title**
in the candidates, never as a literal, so the same definition works where the catalog differs.

| Id | Role | How the JSON recognizes it | Written by the flow |
| --- | --- | --- | --- |
| 2 | Jefe de proyecto | `esjefeproyecto` **is not** `"No"` | yes |
| 1 | Preventa | `esjefeproyecto` is `"No"` and `espreventa` **is not** `"No"` | yes |
| 3 | Ingenieros | both flags are `"No"` | yes |
| 4 | Técnicos de calidad | `responsableCalidad.correousuario` | yes |
| 5 | Técnicos de documentación | `responsableSeguridad.correousuario` | yes |
| 6 | Personal externo | — | never |
| 7 | Dirección | — | never, and never deleted |

Two rules decide most of the outcomes: the flags are compared against the **literal `"No"`**, so a
**null** `esjefeproyecto` makes the person a *Jefe* and a null `esPreventa` makes the person
*Preventa*; and a JSON that declares no responsable with **name and email** fails closed, so
nothing is deleted. There is no *security* role in the catalog: `responsableSeguridad` is stored
as the documentation role (5).

## The generators

Each row is a candidate built over the row above it. The hash is the SHA-256 prefix of the
published definition; `—` means the candidate was never published.

| Generator | Phase | Base | Candidate | State |
| --- | --- | --- | --- | --- |
| `prepare.cjs` | Module1 title sync, PRO | source `c584b6c9…` | — | reviewed |
| `prepare-dev.cjs` | Module1 title sync, DEV | source `e8b962d9…` | `0c22186c…` | published in DEV |
| `prepare-role-existence-guard.cjs` | 1 — role existence guard | — | — | applied |
| `prepare-role-title-convergence.cjs` | 2a — title and user convergence | — | — | applied |
| `prepare-role-scoped-delete.cjs` | 2b — scoped role deletion | — | — | applied |
| `prepare-child-table-reconciliation.cjs` | 3 — child table reconciliation | phase 2b | `FDBC92DE…` | applied |
| `prepare-field-completeness-guard.cjs` | A / RF07 — completeness guard | phase 3 | `A7CA118D…` | applied |
| `prepare-catalog-roles-and-unknown-fields.cjs` | B / RF08 — roles by name, unknown fields | `A7CA118D…` | `7E52849F…` | applied |
| `prepare-exact-exporter-schema.cjs` | RF09 — exact exporter schema | `7E52849F…` | `B9B70E5D…` | applied |
| `prepare-centralized-mapping.cjs` | C / RF10 — centralized mapping | `B9B70E5D…` | `84FABEA2…` | applied |
| `prepare-change-trace.cjs` | D / RF12 — the trace of what changed | `84FABEA2…` | `062C26A1…` | applied |
| `prepare-ordering-guard.cjs` | E — the ordering guard (parent) | `2A2E04E4…` | `6081A1D1…` | applied in DEV |
| `prepare-ordering-state.cjs` | E — the state (child part) | `062C26A1…` | — | **not published**: the state is a file, not a column |
| `prepare-role-authoritative-deletion.cjs` | F — the authoritative deletion of the roles | `062C26A1…` | `2D1C1668…` | applied in DEV and PROD |
| `prepare-role-group-removal.cjs` | F2 / R6 — the person leaves the group | `2D1C1668…` | `E4E823CE…` (DEV) | applied in DEV and PROD |
| `prepare-prod-candidates.cjs` | Builds the PROD candidates from the DEV ones | — | — | promotion tool |
| `prepare-prod-role-authoritative-deletion.cjs` | PROD port of phase F | — | — | promotion tool |
| `prepare-prod-role-group-removal.cjs` | PROD port of F2 | PROD `E61C0AD9…` | `97D20BA2…` | released as `v0.0.3` |

The `prepare-rf*-fixture.cjs` files build the controlled payloads; `runtime-harness.cjs` is the
offline harness that evaluates the generated template expressions with the values of a real
ingestion.

> **Naming trap.** "Phase F" means two different things: the *role identifiers by name* (RF08) in
> the [gap analysis](investigations/full-sync-gap-analysis-2026-11-14.md#the-plan), and the
> *authoritative deletion of the roles* in the
> [reconciliation record](investigations/role-authoritative-reconciliation.md). Always say the
> RF number when the phase letter is ambiguous.

## Commands

Run from the repository root. The scripts need the local runtime in `v18.20.4/` (Node 18.20.4,
pinned in `.nvmrc`), which is not tracked by git.

```powershell
# The whole offline suite of the flow generators
& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync'
```

Measured on 2026-11-18 on `DEV/CERT`: **260 tests, 254 passed, 0 failed, 6 skipped** (~2.1 s).
Five of the skipped cases exercise the actual reviewed snapshots, so they need them as environment
variables:

```powershell
$env:FLOW_DEFINITION_PATH='.atl/project-title-sync/module1.definition.json'
$env:FLOW_DEV_DEFINITION_PATH='.atl/project-title-sync/module1.dev.definition.json'
```

With both set, the same tree measures **261 tests, 259 passed, 0 failed, 2 skipped**.

| Command | What it does |
| --- | --- |
| `& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync'` | The whole offline suite |
| `& '.\v18.20.4\node.exe' --test 'scripts/flow-title-sync/prepare-change-trace.test.cjs'` | One suite |
| `& '.\v18.20.4\node.exe' 'scripts/flow-title-sync/prepare-dev.cjs' '<source>' '<output>'` | One candidate; writes under `.atl/` and refuses to overwrite |
| `cd e2e-webparts; npm run build` | `gulp bundle`, the debug build of the SPFx solution |
| `cd e2e-webparts; npm run test:permissions` | The unit tests of the permission model |
| `cd e2e-webparts; gulp package-solution --ship` | The package, at `solution/e-2-e-webparts.sppkg` |
| `cd e2e-webparts; gulp serve --config E2eBranding` | The workbench with the header customizer |

The SPFx solution targets **SharePoint Framework 1.19.0** and Node 18.20.4. The `E2eBranding`
customizer keeps three identifiers that the tenant already knows — the component id
`09f7305f-ddae-4a31-bcf0-69a7a68b6a8b`, the custom action `E2eBranding` and the feature id
`c807b501-873f-4251-9973-0fc8d6369ffd` — and none of them changed in the consolidation.

## The platform rules

Every rule here has already been paid for in a failed publication or a broken ingestion. A
candidate that breaks one of them is refused by the platform at save time, or by the test of the
generator before that.

| Rule | Consequence for a candidate | Learned in |
| --- | --- | --- |
| An expression is limited to **8,192 characters** | The trace of the 37 columns (15,211 chars) is split into three expressions, the longest 5,784, under a budget of 6,000 | [RF12](tests/dev-change-trace-rf12-2026-11-15.md) |
| Read the result of another action with **`outputs()`**, never `body()` | A Compose has no body: `body()` answered nothing and `concat` wrote an empty text | [RF12](tests/dev-change-trace-rf12-2026-11-15.md) |
| An expression may only read an action **in its `runAfter` path** | The first publication of the trace was refused | [RF12](tests/dev-change-trace-rf12-2026-11-15.md) |
| An action may only wait for an action that **comes before** it | A cycle is refused at save time | [RF05](tests/dev-role-reconciliation-rf05-2026-11-11.md) |
| The **connector decodes the URI** before sending it | A filter that carries the `#` of a claim cuts the query: the filter is by the **email** of the member | [F2](tests/dev-role-group-removal-2026-11-17.md) |
| An expression inside a URI must be **wrapped in braces** (`@{…}`) | Outside them it is sent as a literal and the request fails in milliseconds | [F2](tests/dev-role-group-removal-2026-11-17.md) |
| A group member is removed by the **identifier of the member** | `DELETE /_api/web/sitegroups/getbyid(<group>)/users/getById(<id>)` answers 200; every form that names the person answers 404 | [F2](tests/dev-role-group-removal-2026-11-17.md) |
| **No flow of the environment can write a new column of a list** | The generation time of the ordering guard is a file of the library of the logs, not a column | [E](tests/dev-ordering-guard-2026-11-16.md) |
| Compare the instants as **14 digits as a number** | `int(concat(substring(…)))`: the platform compares dates badly, and the comparison is per expediente, never per file | [E](tests/dev-ordering-guard-2026-11-16.md) |
| The parent read is bounded at **5,000 items** with a fail-closed count guard | The reconciliation is only as complete as the snapshot it diffs against | [reconciliation](investigations/role-authoritative-reconciliation.md) |
| The CERT site is a **classic site with no recycle bin** | A deletion is permanent; read before and after every cleanup | [closing status](tests/dev-reconciliation-closing-status-2026-11-13.md) |
| A partial JSON **wipes** the fields it does not carry | The parse declares the fifty keys of the exporter and rejects the incomplete payload before anything is written | [RF07](tests/dev-field-completeness-guard-rf07-2026-11-14.md) |
| The flags are compared against the **literal `"No"`** | A null flag is *Jefe* or *Preventa*, not "not specified" | [role snapshot](investigations/role-snapshot-2026-11-18.md) |

## Where the evidence lives

| Question | Document |
| --- | --- |
| The operational procedure | [manual](manuals/guia-consulta-operativa.md) (Spanish, mirrors the team document) |
| What a change did and what it was measured against | [`docs/tests/`](tests/) — one file per applied change, with the before/after values |
| Why a change was designed the way it was | [`docs/investigations/`](investigations/) — the design, the open questions and the gaps |
| What was applied in PROD | [`docs/changes/`](changes/) — one record per application, with its verification |
| What a release changed and what was attempted | `docs/releases/v0.0.x.md` on the `prod` and `main` branches |
| The current state of the role table | [role snapshot, November 18](investigations/role-snapshot-2026-11-18.md) — DEV/CERT and PROD, with a verdict per row and two CSVs |
| The open business decisions | [B1–B6](investigations/role-authoritative-reconciliation.md#business-decisions-still-open) |

### Open decisions

| # | Question | Default in force |
| --- | --- | --- |
| B1 | A role row whose kind the JSON does not describe | Deleted (decided 2026-11-17, measured) |
| B2 | A JSON with no valid responsable | Fail closed: nothing is deleted |
| B3 | The quality and the documentation rows | Deleted when the JSON does not describe them (decided 2026-11-17) |
| B4 | The group membership when a row is deleted | The person leaves the group only if she holds no row of that kind in another expediente (decided, published) |
| B5 | The duplicates already present on the leaf `900611367` | Left untouched; covered by the cleanup of the controlled data |
| B6 | The identity of a milestone | The description and the amount, because the JSON carries no milestone identifier |

## Next step

Start at the [documentation hub](README.md) for the operational side, and at
[`scripts/flow-title-sync/README.md`](../scripts/flow-title-sync/README.md) for the mechanical side
of a change to a flow: the generators, their receipts, the publishing route and the promotion to
PROD.

