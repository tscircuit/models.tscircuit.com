# models.tscircuit.com

An interactive workbench for [ModelPrinter](https://github.com/tscircuit/modelprinter) and [Footprinter](https://github.com/tscircuit/footprinter). Search examples from the libraries' tests, open a model string, and edit its parameters with a realtime preview.

![Searchable model and footprint examples](docs/examples.png)

- Seven ModelPrinter functions: NEMA motors, sheet metal, flexible screens, socket bolts, spur gears, helical gears, and worm screws.
- All functions from the installed Footprinter version, with controls generated from the native parameter schemas.
- 3D orbit, pan, zoom, camera presets, and fit; footprint SVG previews with pan and zoom.
- Editable model strings, generated TypeScript, parameter JSON, and shareable configuration URLs.
- Download the current 3D model as GLB, STEP, or Parasolid (`.x_t`) from each configuration page. GLB uses Y-up meters; STEP preserves millimeters and exports the preview's faceted geometry, including available footprint bodies and copper. Parasolid uses `tscircuit/jscad-to-parasolid` to export the full-precision JSCAD solids with the current parameters and placement, in Z-up meters. It preserves separate bodies as faceted solids; colors, analytic curves, and feature history are not included. Unsupported or invalid solids display an export error.
- Responsive catalog and parameter panels, keyboard search with Ctrl/Cmd+K, and validation that preserves the last valid preview.

![Spur gear configuration with a live 3D preview](docs/configurator.png)

## Development

Install [Bun](https://bun.sh), then run:

```sh
bun install --frozen-lockfile
bun run dev
```

Open the URL printed by Vite. Geometry generation runs in a Web Worker; edits are debounced and superseded jobs are cancelled.

```sh
bun run test       # Catalog, parameter serialization, and real geometry checks
bun run build      # Regenerate catalogs, typecheck, and bundle
bunx playwright install chromium
bun run test:browser
```

To test a production build, stop the dev server and run `PLAYWRIGHT_PREVIEW=1 bun run test:browser` after building. Set `CHROMIUM_PATH` to use an existing Chromium installation, or `PLAYWRIGHT_BASE_URL` to test an already running server.

## Parameter and preview accuracy

The controls use ModelPrinter's exported Zod schemas and generated metadata from Footprinter's native schemas. The generator filters duplicate aliases, fixed values, and inherited fields ignored by the selected function. Inputs remain separate from resolved defaults so changing a package preset can recompute dependent dimensions. The preview uses the libraries' actual generated geometry and Circuit JSON.

Some Footprinter booleans and enum combinations cannot be expressed by its string grammar. In those cases, the TypeScript tab exports the complete configuration and the UI explains the string limitation. Unsupported or mismatched package bodies are omitted from 3D previews; the exact copper and footprint SVG remain available.

FlexScreen placement objects are edited as JSON and exported as JSX when needed. `wormgear` currently generates a worm screw; a conjugate mating worm wheel is outside the current ModelPrinter implementation.

## Updating the catalogs

Both `dev` and `build` run `generate:catalog`. A clean checkout downloads the pinned public source commits matching the installed npm versions; subsequent runs reuse the immutable source cache in `node_modules/.cache/tscircuit-sources` and scan the tests again.

```sh
bun run generate:catalog
```

`scripts/generate-footprint-catalog.ts` derives Footprinter controls from its Zod schemas. `scripts/generate-model-examples.ts` statically scans all upstream test files for literal strings, finite template expressions, and shared fixtures, without executing test code. It validates candidates with the installed libraries, excludes invalid examples and ignored tokens, and records source files and line numbers. The generated catalog records the package versions, source commits, and test-file counts used for each update.

When upgrading either package, update its version and `scripts/source-pins.json` together, regenerate the catalogs, and run the tests. Catalog tests cover all installed ModelPrinter and Footprinter functions, including functions without a valid test-string example. `FOOTPRINTER_SOURCE_PATH` can override the Footprinter checkout while developing its schemas.

## Deployment

The [live configurator](https://models-tscircuit-com.vercel.app) is hosted in the `tscircuit` team's Vercel project `models-tscircuit-com`. This GitHub repository is connected to Vercel with production deployments from `main`.

`bun run build` produces the static site in `dist/`. The included `vercel.json` sets the Bun install/build commands and Vite output directory.

The custom domain `models.tscircuit.com` is assigned to this project. To activate it, add a Cloudflare CNAME record named `models` pointing to `c27d28c7764d151e.vercel-dns-016.com`, with proxy status **DNS only**.

## Daily library updates

The `Update model libraries` GitHub Actions workflow checks npm daily at 10:23 UTC and can also be run manually from the Actions tab. It checks `@tscircuit/footprinter`, `@tscircuit/modelprinter`, and `jscad-electronics` for newer stable releases.

When versions change, it updates exact package pins, the Bun lockfile, and the matching published Git commits in `scripts/source-pins.json`. It regenerates the catalogs and runs the production build, unit tests, and browser tests before committing to `main`. The existing Vercel Git integration deploys that commit. Unchanged versions produce no commit or deployment; failed validation leaves production unchanged. No additional deployment secret is needed. If branch protection is added later, it must allow this workflow's updates or the publishing step will fail.

Run `bun run update:libraries` locally to update the package/source pins and install dependencies, then run `bun run build`, `bun run test`, and `PLAYWRIGHT_PREVIEW=1 bun run test:browser` before committing the generated catalogs.
