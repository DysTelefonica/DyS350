# Application: consolidation of the E2eBranding extension into the e-2-e-webparts solution

Date: 2026-11-15
Environment: none — this is a change of the source on the `develop` branch. **Nothing was deployed.**
Change type: repository consolidation (two SPFx solutions become one)
Status: **not deployed. PROD still runs the `e2e-branding` package, version 1.0.1.0.**

## Goal

The header of the site is not native SharePoint chrome: it is rendered by the `E2eBranding` SPFx Application Customizer, which lived in its own project (`e2e-branding`) with its own build, its own package and its own dependency tree. The web parts of the same application lived in another project (`e2e-webparts`). Every change to the header needed a second build and a second deployment, and the two projects carried duplicated files (the `tsconfig.json`, the `gulpfile.js`, the `_variables.scss`, the eslint configuration).

This change consolidates the extension into the web parts solution, so that the application ships as one package.

## What changed

| File | Change |
| --- | --- |
| `e2e-webparts/src/extensions/E2eBranding/` | The extension, moved from `e2e-branding/src/extensions/E2eBranding/` without a change in its code |
| `e2e-webparts/src/services/Services.ts` | The menu of the `MenuPrincipal` list, moved from `e2e-branding/src/services/Services.ts`. The relative import of the customizer (`../../services/Services`) still resolves, because the depth of the extension inside `src/` did not change |
| `e2e-webparts/sharepoint/assets/elements.xml`, `ClientSideInstance.xml` | The custom action and the component instance, moved from `e2e-branding/sharepoint/assets/` |
| `e2e-webparts/config/config.json` | The bundle `e2e-branding-application-customizer` and the localized resource `E2eBrandingApplicationCustomizerStrings` |
| `e2e-webparts/config/package-solution.json` | A second feature with the element manifests, and the version of the solution from `1.0.0.1` to `1.0.1.0` |
| `e2e-webparts/config/serve.json` | The serve configuration `E2eBranding`, so the customizer can still be debugged from this project |
| `e2e-webparts/package.json`, `package-lock.json` | Three dependencies the extension needs: `@microsoft/decorators` and `jquery` in production, `@types/jquery` in development |
| `e2e-webparts/README.md` | The project README describes the consolidated solution and the identity of the customizer |
| `e2e-branding/` | **Removed.** The project, its build, its package and the twenty dependencies it declared and never used |

## The identity that had to survive

The site points to the customizer by three identifiers. If any of them changed, the header would simply stop rendering until the custom action was fixed by hand:

| Identifier | Value | Where it lives now |
| --- | --- | --- |
| Component id | `09f7305f-ddae-4a31-bcf0-69a7a68b6a8b` | The manifest, `elements.xml` and `ClientSideInstance.xml`, all three unchanged |
| Custom action | `E2eBranding`, in `ClientSideExtension.ApplicationCustomizer` | `sharepoint/assets/elements.xml`, unchanged |
| Feature id | `c807b501-873f-4251-9973-0fc8d6369ffd` | The second feature of `config/package-solution.json`, with the version `1.0.1.0` of the released extension |

The feature id was kept on purpose: when the old package is removed from the tenant and the new one is added, the feature of the tenant keeps its identity instead of leaving a stale entry behind. The version of the web parts feature stays at `1.0.0.0`, so the thirteen web parts keep the version they have in the tenant and are not touched by the upgrade.

## What was verified

The verification ran on the merged project, with the Node 18.20.4 runtime that the project pins.

| Check | Result |
| --- | --- |
| `tsc --noEmit` of the project before the change | 0 errors |
| `tsc --noEmit` of the merged project | 0 errors |
| `gulp bundle` of the merged project | Finished, 0 errors, 51 s. The sass step compiles the moved `NavBar.module.scss`, whose `@use "../../../../common/styles/variables"` still resolves |
| Unit tests of the permission model (`npm run test:permissions`) | 17 of 17 pass |
| The compiled extension against the released build | **Identical bytes** |

The last check is the one that matters: the extension is compiled by the merged project and compared with the build that PROD serves, which is the build kept in `e2e-branding/lib` of the released solution.

| Compiled file | SHA-256 | Merged project | Released build |
| --- | --- | --- | --- |
| `E2eBrandingApplicationCustomizer.js` | `0B5FD631074BFDE655F5E52B060D24B953E163D11921E279BBC76FE3D87A7C68` | same | same |
| `Navbar.js` | `E77396690D6E8C328AB5BC1810E36671926B6D90E17D2520156DB222DBC71488` | same | same |

The consolidation does not change a single byte of the compiled customizer. The CSS differs between the two builds only because the released one is a `ship` build with minified styles and the verification build is a debug build.

## What the verification does not cover

- The lint step of the merged project reports 536 warnings, of which 14 are in the moved extension files (9 `no-floating-promises`, 2 `ban-ts-comment`, and one each of `explicit-function-return-type`, `prefer-const` and `react/self-closing-comp`). They are warnings and the build finishes, but they are new in this project: the old one used the eslint profile without the type aware rules, so it never saw them. They were not fixed here, because fixing them changes the code of the extension, which is the opposite of what this change is about.
- Nothing was deployed and no tenant was read. The state of PROD is the one described in the record of the CADETE logo: `e2e-branding` 1.0.1.0 and `e-2-e-webparts` 1.0.0.1.
- The behaviour of the customizer in the browser was not re-measured. The byte comparison is against the build that PROD already serves, not against a live page.

## The deployment, when it is authorized

The deployment is a tenant change and it needs its own explicit authorization, like any other.

1. Build the package with `gulp package-solution --ship`. It lands in `solution/e-2-e-webparts.sppkg` and carries the solution version `1.0.1.0`.
2. Remove the `e2e-branding` package (solution id `78153a47-1072-4f25-9fcb-966b80dfb101`) from the site collection App Catalog. **This has to happen first**: both packages register the component id `09f7305f-ddae-4a31-bcf0-69a7a68b6a8b`, so the tenant refuses to have the two of them at the same time.
3. Add the new package to the App Catalog and deploy it to the same scope as the old one.
4. Verify the header (the three logos and the menu), the custom action named `E2eBranding` and the web parts that are already placed in the pages.

## Rollback

The change is a commit on `develop`, so the rollback is a revert of it. The old project is still in the history at `f5a2db7` (`git show f5a2db7:e2e-branding`) and the released package stays in the App Catalog until the step 2 of the deployment happens. If the header breaks after the deployment, the old package can be added back to the App Catalog, because its component id, its custom action and its feature id are the same ones the tenant already knows.
