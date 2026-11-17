# Documentation hub

Use this area to find the development team's operational references before investigating an incident. The manual is in Spanish, matching the supplied document.

## Start here

- Read the [searchable operational manual](manuals/guia-consulta-operativa.md) for diagnosis procedures.
- Open the [unchanged Word snapshot](reference/Guia_consulta_operativa.docx) for its original presentation.
- Read the [branch convention](branching-convention.md) to know which branch carries the development (DEV/CERT and develop), which one carries what is applied in PROD (prod) and which one carries the released state (main), and how a release is cut.
- Check [SharePoint DOC IT](https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF/Documentos%20compartidos/Forms/AllItems.aspx?id=%2Fsites%2FDyS350%2Eprod%2EOCETF%2FDocumentos%20compartidos%2FDOC%20IT&viewid=1d5892bd%2Dc6dd%2D4264%2D8363%2Debfcb50793ad) for the team's ongoing documentation. Corporate authentication and appropriate permissions are required.

## Find an operational topic

| Question | Manual section |
| --- | --- |
| Where is the input JSON, and how are Preventa roles checked? | [Carga del JSON y roles de Preventa](manuals/guia-consulta-operativa.md#1-carga-del-json-y-roles-de-preventa) |
| Which flow should be checked for missing notifications, reviews, signatures or reminders? | [Notificaciones](manuals/guia-consulta-operativa.md#2-notificaciones) |
| How are document libraries, effective permissions and provisioning investigated? | [Estructura documental y permisos](manuals/guia-consulta-operativa.md#3-estructura-documental-y-permisos) |
| What evidence should be gathered, and in which order? | [Método de diagnóstico](manuals/guia-consulta-operativa.md#4-método-de-diagnóstico) |
| What are the relevant SharePoint lists, libraries and flow routes? | [Resumen de rutas](manuals/guia-consulta-operativa.md#resumen-de-rutas) |

The manual's diagnostic workflow is read-only: identify the affected resource and inspect SharePoint and Power Automate evidence without making changes during diagnosis.

## Investigations and proposed changes

- [PROD quick link to the E2E training videos, November 11](changes/prod-quick-links-videos-formacion-2026-11-11.md) — the "Enlaces rápidos" page had never registered a quick link. The `GeneralLinksWebPart` renders the `EnlacesGenerales` list, so one item was added to it: **applied in PROD and verified** (HTTP 201, exactly one item, anchor rendered after a page reload). The target folder inherits the site permissions (`HasUniqueRoleAssignments = false`), so every principal with access to the site can open the videos. No SPFx deployment and no page re-publication were involved. **Updated on November 13**: the folder was renamed to `Vídeos formación DyS350`, and the label and URL of the link were corrected in place and re-verified in the browser.
- [PROD quick link to CADETE, November 12](changes/prod-quick-link-cadete-2026-11-12.md) — a second entry of the same general quick links page: one item (`CADETE` -> `https://cadete.es.telefonica/`) was added to `EnlacesGenerales`. **Applied in PROD and verified** (HTTP 201, item `Id = 2`, both anchors rendered after a page reload). The `EnlacesExpediente` list already had its own `CADETE` entry and was left untouched; the external target itself was not opened or tested.
- [PROD CADETE logo in the header, November 12](changes/prod-header-cadete-logo-2026-11-12.md) — the header is not native SharePoint chrome but the `E2eBranding` SPFx Application Customizer of this repository, so a third logo needed a code change, a rebuild and a solution upgrade. **Applied in PROD and verified**: the local build reproduced the deployed bundle byte for byte before the change, the new bundle is the one the page now loads, and `Logo CADETE Blanco.png` sits next to the DyS350 logo linking to `https://cadete.es.telefonica/`. The deployment stays scoped to the site collection (`AppCatalog`), and no web part was redeployed.

- [PROD: the reconciliation of the ingestion, November 17](changes/prod-reconciliation-ingestion-2026-11-17.md) — the work of the phases A to E of the reconciliation (the roles by their identifiers, the rejection of an unknown key of the JSON, the fifty keys of the exporter, the trace of what changed and the ordering guard) was developed and measured in DEV/CERT and is promoted to PROD. **Applied in PROD and verified**: the parent (`2B056DD4…`) and the child (`3BD8762B…`) were published as a port of the definitions that were live in PROD, and the case measured it there (the new file: `Total 3, Nuevos 3, Antiguos 0`; the old file: `Total 3, Nuevos 0, Antiguos 3`, and the row kept the values of the new file). The record says what was published, with which values, how it was verified, what was left in the environment and how it is undone.

These authored records are separate from the team's manual. They distinguish observed evidence, proposed behavior and unresolved validation; an investigation is not a production change authorization.
- [PROD: the JSON is the authority over the roles of an expediente, November 17](changes/prod-role-authoritative-deletion-2026-11-17.md) — the child flow of PROD now deletes the role rows that the JSON does not describe, the quality and the security rows are not protected any more, the `Dirección` kind is out of the scope of the flow and a row that does not change is not written again. **Applied in PROD and verified:** the quality row was deleted, the `Dirección` row survived and the three rows that did not change kept their `Modified`. The promotion was a port: the wiring of PROD was kept and only the 18 paths of the phase moved.

## Releases

- [v0.0.2](releases/v0.0.2.md) — the JSON is the authority over the roles of an expediente.
- [v0.0.1](releases/v0.0.1.md) — the reconciliation of the ingestion (the roles by their identifiers, the rejection of an unknown key, the fifty keys of the exporter, the trace of what changed and the ordering guard).

## Reference status

The `Guia_consulta_operativa.docx` snapshot was imported on **2026-10-30** and **refreshed from the live source on 2026-11-11**. Its provenance and SHA-256 are recorded in the [searchable copy](manuals/guia-consulta-operativa.md#about-this-copy). The import date is not a publication date or a claim that the snapshot is the latest revision.

The DOC IT folder holds exactly one file with that filename, last modified **2026-10-30T12:09:54Z**. It was compared with the previous snapshot on 2026-11-11: the extracted text is **identical** (SHA-256 `D93ED9B8…`) and only the container bytes differ, so the document was re-saved without a content change; the transcription was verified against it line by line with nothing missing. This repository is a local reference snapshot, not an automatically synchronized mirror: freshness has to be re-checked by hand.

The manual describes the team's operational guidance, not independently verified behavior of the current code or deployed environment. For implementation questions, inspect the relevant code; for live incidents, confirm the correct environment and current evidence. If the manual, code or live evidence disagree, report the discrepancy explicitly rather than silently treating one as proof of the others. Never claim to have checked SharePoint when corporate access is unavailable.

## Keeping references current

1. Open DOC IT with authorized corporate access and check the current document and its revision information. Do not assume a matching filename means matching contents.
2. Review the document for credentials, tokens and other information that must not enter the repository. Do not copy secret material.
3. Update the [Word snapshot](reference/Guia_consulta_operativa.docx), [searchable transcription](manuals/guia-consulta-operativa.md) and its provenance together: import date, source location, SHA-256 and any verified revision/comparison result. Preserve warnings, steps, identifiers, tables and meaningful visual content; flag anything not represented in Markdown.
4. Validate transcription fidelity, local links and source/snapshot hashes. Record relevant changes and unresolved discrepancies rather than implying automatic synchronization.

For additional manuals, add a clearly named source snapshot under `reference/`, a searchable copy under `manuals/`, and an entry in this hub. Record the source and freshness limits for each document; do not mix unverified assumptions into the team's original instructions.
