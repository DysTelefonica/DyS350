# PROD: quick link to CADETE

Date: 2026-11-12
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF`
Change type: SharePoint configuration (list item added)

## Goal

Second entry of the general quick links page (`SitePages/Enlaces-generales.aspx`), requested as "the CADETE link" with the address `https://cadete.es.telefonica/`. It uses the same registration mechanism described in [the videos record](prod-quick-links-videos-formacion-2026-11-11.md): the `GeneralLinksWebPart` renders the `EnlacesGenerales` list, one item per link.

## Applied change

One item added to the `EnlacesGenerales` list:

| Field | Value |
| --- | --- |
| `Title` (`Titulo`) | `CADETE` |
| `Enlace` | `https://cadete.es.telefonica/` |

No permission, web part, solution or page change: the target is an external application, so SharePoint permissions are not involved, and the web part reads the list at render time.

## Verification

| Check | Result |
| --- | --- |
| `POST` create item | HTTP 201, `Id = 2`, `Created = 2026-11-12T09:19:22Z` |
| `GET` list items | Two items: `Id = 1` (Videos de Formacion E2E, from 2026-11-11) and `Id = 2` (CADETE) |
| Page reload | Anchors rendered: `CADETE` -> `https://cadete.es.telefonica/` and `Videos de Formacion E2E` -> the videos folder |

The web part orders items by `ID` descending, so `CADETE` is displayed above the videos link.

## Notes

- The `EnlacesExpediente` list (per-expediente links) already contained a `CADETE` entry pointing to `https://cadete.es.telefonica///`. It was left untouched: it is a different list, consumed by a different page.
- The external target was not opened or tested from the browser in this session; the link was verified as stored and rendered, not as reachable.
