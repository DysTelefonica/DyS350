# DEV role reconciliation RF05: the scoped role deletion applied and measured

**The JSON now decides the roles completely.** Phase 2b — the scoped deletion — was applied to the DEV child on 2026-11-11 and measured: a role the JSON no longer describes is deleted, the roles it still describes stay with the names the JSON carries, and the deletion fails closed when the JSON describes no valid responsible. The release still stays HOLD: the supplier and milestone rows are still recreated on every ingestion, and re-provisioning on update is still undefined.

## What was applied, and the defect that blocked it

The prepared phase 2b candidate (canonical hash `8A4A6D58…`) was **rejected by the platform when the flow was saved**:

> InvalidTemplate — The template validation failed: "The circular dependency detected in template language expressions."

Nothing was left half applied: the readback confirmed the published child was still the phase 2a definition (`568D3028…`). The static validator (`checkFlowErrors`) had answered `[]` for that candidate — the cycle is only detected when the flow is saved, not when the definition is validated.

The cause is in the action graph of `Comprobar_que_hay_RolesUsuario`. The deletion loop has to run after the responsible loop, so that the set of desired keys is complete; but the selection that feeds the responsible loop still declared the deletion loop as its dependency, which closes the cycle `selection → compose → responsible loop → deletion loop → selection`. The selection only reads the snapshot of the roles (`body('Recoger_RolesUsuario')`), so it does not need that dependency: the generator now points it nowhere and asserts that the candidate closes no cycle in any scope (`dependencyCycles`). The regenerated candidate is `9FD60833…`.

| Item | Value |
| --- | --- |
| Source | the published phase 2a definition, `568D3028…` |
| Candidate | `9FD608336A7B0C78F61D9D8AA6AACD2D7F3306560A11A0268458D201F7565328`, 11 changed paths |
| Validator | `checkFlowErrors` → `[]`, `checkFlowWarnings` → `[]` |
| Bindings | unchanged: CERT site, `E2E_ListaRolesUsuario` `4f76ac2a…` |
| Behaviour | the deletion is a real `DeleteItem` inside the guard `Es_Rol_No_Deseado`: it runs only when the JSON has at least one valid responsible (fail closed) and only for rows whose normalized key is not in the desired set |
| Desired set | the five role kinds the JSON describes (project lead, Preventa, engineering, quality technician, security) are collected while the flow resolves their identifiers; quality and security are included, so their rows are never deleted |

## What was measured

The case is the controlled leaf `900611603` ingested again without its engineering responsible: the same expediente, the same quality and security responsible, the same title and dates, with one responsible removed from the `responsables` array.

| Case | Input consumed | Processed | Log | Roles total | Leaf roles | Leaf split (jefe / ing / cal / seg) |
| --- | --- | --- | --- | --- | --- | --- |
| Before RF05 | — | 126 | 108 | 1403 | 4 | 1 / 1 / 1 / 1 |
| RF05a update | yes | 127 | 109 | **1402** | **3** | 1 / **0** / 1 / 1 |
| RF05b empty responsible list | yes | 128 | 110 | **1402** | **3** | 1 / **0** / 1 / 1 |

The rows prove it. Row `1713` (engineering, Rosa María Fuentes Herrero) was **deleted**: the JSON no longer describes that role. Rows `1711` (quality), `1712` (project lead) and `1714` (security) stayed, and the two rows whose name the earlier rename case had changed went back to the names of the JSON (`Natalia Casán García`, `Tatiana Shulca Quinaupa`) — the title convergence still holds after the deletion was enabled. The eight rows of the other two controlled expedientes (`1703`–`1710`) were not touched, and the role table lost exactly one row.

The deletion is scoped: the snapshot it walks is filtered by `IDExpediente`, so it can only touch rows of the expediente being ingested.

**RF05b is the safety case.** The same leaf was ingested again with an empty `responsables` array — the input that a malformed or partial export would produce. Nothing was deleted: the three rows stayed, the role table kept its 1402 rows and no row was created. That is the fail-closed rule working: the deletion only runs when the JSON has at least one valid responsible, so a JSON that describes nobody cannot empty an expediente.

## The supplier and milestone churn, measured again

The same run reproduces the defect recorded in [RF04](dev-role-reconciliation-rf04-2026-11-11.md): the milestone row of the controlled leaf went `642` → `643` and the supplier row `1840` → `1841`. The rows are deleted and re-created on every ingestion, so their identifiers change and anything that points at them loses its target.

The reconciliation has the same shape as the role one, and the keys are known:

- **Supplier**: `(IDProyecto, IDSuministrador, IDPadre, IDExpedienteSuministrador)` — the flow writes exactly those four fields, and the JSON carries `idsuministrador`, `idpadre` and `idexpedientesuministrador`. The key is stable, so this table can be reconciled without a business decision.
- **Milestone**: the JSON carries only `descripcion`, `fechahito`, `fechagarantiahito` and `importe`, and the flow writes `Title` (the description), `Importe`, `FechaHito` and `FechaGarantiaHito`. **There is no milestone identity in the JSON**, and no content key can stand in for it: rows `631`, `632`, `633` and `634` of the project `1297` carry the same title (`Hito 1. Entrega de documentación`), the same date and a null amount. Four legitimate milestones that no content key can tell apart would collapse into one, which is data loss. The milestone reconciliation therefore needs an identifier that the JSON does not carry today — either a milestone id in the JSON, or the acceptance of the collapse.

## Limits

- DEV/CERT only. PRO was never read, written or authorized.
- One controlled expediente was ingested once. No business JSON was replayed and no other expediente was touched.
- The deletion removes the row from `Roles_usuario`; it does **not** remove the person from the SharePoint group, which is the open decision B4.
- A role whose kind the JSON does not describe is deleted — the literal reading of "the JSON is authoritative", and the open decision B1.
- The controlled identifiers of RF03 (`900611501`–`900611503`), RF04 (`900611601`–`900611603`) and RF05 (`900611603`) stay in CERT as evidence.

## Next

1. Build and measure the supplier reconciliation; the key is decided, only the candidate is missing.
2. Settle the milestone identity with the business before reconciling that table.
3. Confirm whether an update is expected to re-provision (folders, permissions, groups) an expediente that is already in flight.
4. Decide the group membership of a deleted role (B4) and the fate of the pre-existing duplicates (B5).
5. Clean up the controlled identifiers when the evidence is no longer needed.

Receipt: ignored `.atl/project-title-sync/rf05-20261111/` and `.atl/project-title-sync/role-scoped-delete-20261110/`.
