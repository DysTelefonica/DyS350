# PROD: CADETE logo in the header, next to the DyS350 logo

Date: 2026-11-12
Environment: PROD — `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF`
Change type: SPFx application extension change (code + solution upgrade + asset upload)

## Goal

The site header shows the Telefónica logo and the DyS350 logo. The request was to add the CADETE logo next to the DyS350 logo, clickable to `https://cadete.es.telefonica/`, the same target as the quick link registered the same day.

## Why this was a deployment and not a content change

The header is **not** native SharePoint chrome. It is rendered by the `E2eBranding` SPFx Application Customizer in this repository (`e2e-branding`), injected into `spTopPlaceholder`:

```html
<nav class="menu_887f5af1">
  <div class="menuTop_887f5af1">
    <div class="menuLeft_887f5af1">
      <a href="#"><img src=".../SiteAssets/Img/LogoTelefonicaBlanco.png" ...></a>
      <img src=".../SiteAssets/Img/Logo E2E.png" ...>
    </div>
    ...
```

The component (`e2e-branding/src/extensions/E2eBranding/components/NavBar/Navbar.tsx`) hardcodes those two logos, so a third one requires a code change, a rebuild and a deployment. The logo images themselves are SharePoint content (`SiteAssets/Img`), served by URL, not bundled assets.

## Pre-check: the repository is the deployed source

Before changing anything, the local project was built unmodified and compared with the bundle that PROD actually serves:

| Bundle | File | Size |
| --- | --- | --- |
| Served by PROD | `e2e-branding-application-customizer_68b65cde7fef1d340f7b.js` | 304.766 bytes |
| Local build, unmodified | `e2e-branding-application-customizer_68b65cde7fef1d340f7b.js` | 304.766 bytes |

Same content hash, same size: the local source reproduces the deployed header exactly, so replacing it cannot silently drop features. The site App Catalog also confirmed the installed versions match the repository (`e2e-branding` 1.0.0.0, `e-2-e-webparts` 1.0.0.1).

## Changes

| File | Change |
| --- | --- |
| `e2e-branding/src/extensions/E2eBranding/components/NavBar/Navbar.tsx` | New anchor + image with the CADETE logo, after the DyS350 logo, inside `styles.menuLeft` |
| `e2e-branding/config/package-solution.json` | `solution.version` and `features[0].version` from `1.0.0.0` to `1.0.1.0` (the catalog already had 1.0.0.0, so a new version is required for the upgrade to be accepted) |
| PROD `SiteAssets/Img` | New file `Logo CADETE Blanco.png` (768x768 PNG, 69.448 bytes) |

The markup added to the header:

```tsx
<a
  href="https://cadete.es.telefonica/"
  target="_blank"
  rel="noopener noreferrer"
  title="CADETE"
>
  <img
    src={`${absolutePath}/${_urlAssets}/Logo CADETE Blanco.png`}
    alt="CADETE"
    className={styles.logo}
  />
</a>
```

The white variant of the logo was used because the header background is `#0066ff`.

## Build and packaging

| Step | Command | Result |
| --- | --- | --- |
| Bundle | `node_modules\gulp\bin\gulp.js bundle --ship` (Node 18.20.4) | New bundle `e2e-branding-application-customizer_7240e3fb1fd1578eb316.js` (304.991 bytes) |
| Package | `node_modules\gulp\bin\gulp.js package-solution --ship` | `e2e-branding/sharepoint/solution/e2e-branding.sppkg` (167.265 bytes) |

Gotchas:

- The packaging task is `package-solution`, not `package` (`gulp package` fails with "Task never defined").
- The build exits with code 1 because the lint task writes its warnings to stderr; the bundle itself is produced and valid.
- The SPFx toolchain requires the repository-pinned Node 18.20.4 (`v18.20.4/node.exe` in the repository root). The system Node 24 does not work, and the build has to run outside the agent sandbox because it spawns `tsc` and `eslint` (`spawn EPERM` inside the sandbox).

## Deployment

The extension is deployed **site-scoped**, in the site collection App Catalog `https://telefonicacorp.sharepoint.com/sites/DyS350.prod.OCETF/AppCatalog` (not in the tenant App Catalog).

1. Uploaded `e2e-branding.sppkg` through the catalog's `Cargar` command (classic upload dialog, `Upload.aspx?List={5AC1D756-ABB3-4349-ADF8-DB59DF32F9F7}`), with the version comment "Add CADETE logo link in the header (solution v1.0.1.0)".
2. Confirmed the trust prompt for `e2e-branding-client-side-solution` and deployed it with `Implementar`.
3. In that dialog the *"Hacer que esta solución esté disponible en todos los sitios de la organización"* checkbox was left **unchecked**, so the deployment stays scoped to this site, as the previous version was.

After the upgrade the catalog lists `e2e-branding-client-side-solution` version **1.0.1.0**, enabled, valid, deployed, not added to all sites, with no error message.

## Verification in PROD

| Check | Result |
| --- | --- |
| Bundle loaded by the page | `e2e-branding-application-customizer_7240e3fb1fd1578eb316.js` (the new one) |
| Logos in `menuLeft` | `LogoTelefonicaBlanco.png` (136x40), `Logo E2E.png` (40x40), `Logo CADETE Blanco.png` (40x40, `alt="CADETE"`, loaded) |
| Link | `href="https://cadete.es.telefonica/"`, `target="_blank"`, `title="CADETE"` |
| Layout | Same row, 15px gap, header background `rgb(0, 102, 255)` |
| Asset | File exists in `SiteAssets/Img`, 69.448 bytes, PNG signature valid, 768x768 |

## Limits and notes

- The CADETE mark renders at 40x40, the same size as the DyS350 mark, so the wordmark inside the logo is small. If it should read bigger, the fix is a dedicated CSS class, not a new asset.
- The external target `https://cadete.es.telefonica/` was not opened from the browser in this session: the link was verified as rendered and pointing to that address, not as reachable.
- The previous bundle file is still present in the local `e2e-branding/dist/` (the build does not clean it); only the new hash is referenced by the deployed package.
- The `e2e-webparts` project was not touched by this change and no web part was redeployed.
