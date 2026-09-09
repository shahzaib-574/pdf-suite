# Ream website

The website and Android app share the PDF processing engine and tool workflows.
`npm run dev:website` serves the website on port 5174. `npm run build:website`
produces `dist-web/`. Normal builds and OTA publishing retain the Android UI.

The website directory lists 12 tools (Scan is omitted), searchable categories, responsive layouts,
light/dark themes, local recent files, and drag-and-drop file selection. The font
is self-hosted Manrope, distributed with its SIL Open Font License.

## Hostinger and Git deployment

`.github/workflows/deploy-hostinger.yml` deploys compiled assets on pushes to main
once `HOSTINGER_DEPLOY_ENABLED=true` is configured as a repository variable.
It is deliberately inactive until the domain's hosting account is verified.

Required repository variables: `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_USER`,
`HOSTINGER_SSH_PORT`, and `HOSTINGER_DEPLOY_ENABLED`.
Required secrets: `HOSTINGER_SSH_KEY` and `HOSTINGER_KNOWN_HOSTS` containing the
verified server host keys. Never disable SSH host verification or commit keys.

The deployment target is fixed to `domains/reampdfsuite.com/public_html/`.
The workflow verifies that directory exists, uploads assets first and activates
the new index last. Old assets are retained so open sessions continue working.
Before the initial deployment, inspect and back up any existing website outside
the public directory. Do not publish the repository root or private OTA material.

Deployment uses GitHub Actions to build Vite before uploading; Hostinger's raw
Git checkout feature alone cannot serve the source as a working website.
The website deploy and production OTA are independent release actions.

The existing GitHub Pages workflow also publishes `dist-web/` on main, including
the privacy policy at its existing address. Its website URL is
https://shahzaib-574.github.io/pdf-suite/. The canonical production domain remains
https://reampdfsuite.com/; domain activation is separate from the Pages deployment.

## Verification

Run `npm run build:website`, then serve the result on port 5174 and run
`node tests/browser/website-selfcheck.mjs`. The browser test covers catalog routes,
search, categories, responsive overflow, themes, and real merge/download output.
Camera hardware and the installed Android app still require device acceptance.
