# PROD: quick link to the E2E training videos

Date: 2026-11-11
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF`
Change type: SharePoint configuration (list item added)

## Goal

The "Enlaces rapidos" navigation entry (site page `SitePages/Enlaces-generales.aspx`) rendered an empty section: no quick link had ever been registered. The E2E training videos already existed in the shared document library but were only reachable by browsing to the folder. The change registers the folder as a quick link so that every user with access to the site can open the videos from the navigation.

## How quick links work

`SitePages/Enlaces-generales.aspx` hosts the `GeneralLinksWebPart` (`e2e-webparts/src/webparts/generalLinks`). The web part reads a plain SharePoint list and renders one entry per item:

- On `Enlaces-generales.aspx` it reads the list `EnlacesGenerales` with the fields `Title` (display name `Titulo`) and `Enlace`.
- On `SitePages/KPIs.aspx` it reads the sibling list `EnlacesKPIs` (same fields).
- Items are ordered by `ID` descending; each one renders as an anchor with `target="_blank"`.

There is no separate registration step, provisioning job or web part deployment involved: adding the list item is the whole mechanism.

## Observed state before the change

| Evidence | Value |
| --- | --- |
| `EnlacesGenerales` items | 0 |
| `EnlacesKPIs` items | 0 |
| `EnlacesExpediente` items | 6 (per-expediente links, separate list, untouched) |
| Rendered page | "No hay enlaces generales registrados." |
| Target library | `Documentos compartidos` (list title `Documentos`) |
| Target folder | `Videos formación E2E` — `/sites/DyS350.prod.OCETF/Documentos compartidos/Videos formación E2E` |
| Folder content | `1. Qué es Dys350.mp4` (43.8 MB), `2. Creación de tarea documental.mp4` (70.6 MB), `3. Versionar un documento.mp4` (61.4 MB) |

## Permission check (the "everyone with access" requirement)

The folder does not break permission inheritance:

```
GET /_api/web/GetFolderByServerRelativeUrl('<folder>')/ListItemAllFields?$select=HasUniqueRoleAssignments
-> { "HasUniqueRoleAssignments": false }
```

The folder therefore inherits the site role assignments, which already grant `Leer` (Read) to `Visitantes de la DyS350` and `Editar` (Contribute) to `Integrantes de la DyS350`. Any principal with access to the site can open the folder and play the videos; no permission change was required or made.

## Applied change

One item added to the `EnlacesGenerales` list:

| Field | Value |
| --- | --- |
| `Title` (`Titulo`) | `Videos de Formación E2E` |
| `Enlace` | `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF/Documentos%20compartidos/Videos%20formaci%C3%B3n%20E2E` |

The `Enlace` value is the friendly (server-relative) folder URL, URL-encoded, matching the absolute-URL convention already used by the `EnlacesExpediente` items. It resolves with HTTP 200 and redirects to the library view scoped to the folder.

## Verification

| Check | Result |
| --- | --- |
| `POST` create item | HTTP 201, `Id = 1`, `Created = 2026-11-11T17:48:02Z` |
| `GET` list items | Exactly one item, fields as applied |
| Page reload | Anchor rendered: `Videos de Formación E2E`, `target="_blank"`, pointing to the folder URL |
| Target URL | HTTP 200, redirects to `Forms/AllItems.aspx?RootFolder=...&FolderCTID=...` for the folder view |
| Folder permissions | `HasUniqueRoleAssignments = false` (inherited) |

## Limits and notes

- The web part's in-page admin row (add/delete inputs) does not appear in the modern page: it depends on `pageContext.legacyPageContext.isSiteAdmin`, which the modern page runtime does not expose. Registration was therefore done through the SharePoint REST API with the site form digest, using the authenticated PROD session.
- `POST` to the SharePoint REST API fails with HTTP 403 ("security validation of this page is not valid") when the `X-RequestDigest` header is missing. The digest comes from a `POST` to `/_api/contextinfo` — a `GET` on that endpoint returns HTTP 405.
- The change is content only. No SPFx solution was rebuilt, deployed or republished, and no page was re-published: the web part reads the list at render time.
- Folder visibility for principals outside the site (for example a company-wide audience) was not tested and is out of scope of this change; the folder inherits the site permissions listed above.

## Follow-up — folder renamed, November 13

The folder was renamed in PROD on **2026-11-13T11:15:06Z**: `Videos formación E2E` is now **`Vídeos formación DyS350`**. The old folder no longer exists, so the quick link was pointing to a dead path and was corrected in place on the same list item.

| Field | Before | After |
| --- | --- | --- |
| `Title` (`Titulo`) | `Videos de Formación E2E` | `Vídeos formación DyS350` |
| `Enlace` | `.../Documentos%20compartidos/Videos%20formaci%C3%B3n%20E2E` | `.../Documentos%20compartidos/V%C3%ADdeos%20formaci%C3%B3n%20DyS350` |

The visible label was renamed together with the URL: leaving "E2E" in the quick link while pointing at a folder named "DyS350" would have been misleading.

| Check | Result |
| --- | --- |
| Folder in PROD | `Vídeos formación DyS350`, `ServerRelativeUrl` `/sites/DyS350.prod.OCETF/Documentos compartidos/Vídeos formación DyS350`, `ItemCount` 3 |
| Content | `1. Qué es Dys350.mp4`, `2. Creación de tarea documental.mp4`, `3. Versionar un documento.mp4` |
| Item update | `MERGE` on `items(1)` → HTTP 204, `Modified` 2026-11-13T14:46:25Z. A `MERGE` without `If-Match` is rejected with HTTP 412 ("El valor ETag '' solicitado no coincide") |
| Page reload | Anchor rendered as `Vídeos formación DyS350` with the new URL |
| Browser navigation to that URL | Lands on the folder view (`Forms/AllItems.aspx?FolderCTID=…&id=…`), page title "DyS350 - Documentos", breadcrumb "Vídeos formación DyS350", the three mp4 files listed |

Permission inheritance was not re-checked after the rename: a rename does not break it in SharePoint, and the folder keeps the site role assignments described above.
