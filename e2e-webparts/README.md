# e-2-e-webparts

The single SharePoint Framework solution of the E2E DyS350 application. It carries the thirteen web parts of the application and the `E2eBranding` application customizer that renders the header of the site.

## What it contains

| Kind | Name | Location |
| --- | --- | --- |
| Application customizer | `E2eBrandingApplicationCustomizer` | `src/extensions/E2eBranding/` |
| Web parts | thirteen web parts (proyecto, tareas, notificaciones, enlaces, planificador, buscador) | `src/webparts/` |
| Shared code | the permission model of the functional roles | `src/common/permissions/` |
| Services | the menu of the `MenuPrincipal` list | `src/services/Services.ts` |

The customizer used to live in a second project, `e2e-branding`, with its own build, its own package and its own dependency tree. It was consolidated into this solution on 2026-11-15 so that the header and the web parts ship as one package. The record of the change is in [docs/changes/app-extension-consolidation-2026-11-15.md](../docs/changes/app-extension-consolidation-2026-11-15.md).

## The identity of the customizer

The tenant already knows the customizer by three identifiers. None of them changed in the consolidation, because the custom action of the site points to them:

| Identifier | Value |
| --- | --- |
| Component id | `09f7305f-ddae-4a31-bcf0-69a7a68b6a8b` |
| Custom action | `E2eBranding`, in `ClientSideExtension.ApplicationCustomizer` |
| Feature id | `c807b501-873f-4251-9973-0fc8d6369ffd`, version `1.0.1.0` |

The component id is the one in the manifest, in `sharepoint/assets/elements.xml` and in `sharepoint/assets/ClientSideInstance.xml`. The feature is the second one of `config/package-solution.json`; the first one belongs to the web parts.

## Used SharePoint Framework Version

![version](https://img.shields.io/badge/version-1.19.0-green.svg)

## Prerequisites

- Node 18.20.4, the version pinned in `.nvmrc`.
- A SharePoint tenant with the app catalog where the package is published.

## Solution

| Solution | Author(s) |
| --- | --- |
| `e-2-e-webparts` | DyS350 team |

## How to build it

```bash
npm install
npm run build               # gulp bundle, the debug build
npm run test:permissions    # the unit tests of the permission model
```

The package of the solution is produced by `gulp package-solution --ship` and lands in `solution/e-2-e-webparts.sppkg`.

## How to debug it

`gulp serve` opens the workbench with the web parts. The customizer has its own configuration, because it needs a page of the site and the custom action loaded:

```bash
gulp serve --config E2eBranding
```

## Version history

| Version | Date | Comments |
| --- | --- | --- |
| 1.0.1.0 | 2026-11-15 | The `E2eBranding` customizer is consolidated into this solution. Not deployed. |

## Disclaimer

**THIS CODE IS PROVIDED _AS IS_ WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.**
