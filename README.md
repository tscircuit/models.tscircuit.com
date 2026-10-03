# models.tscircuit.com

An interactive workbench for [ModelPrinter](https://github.com/tscircuit/modelprinter) and [Footprinter](https://github.com/tscircuit/footprinter). Search a function, edit its parameters, and see the resulting model update automatically.

![Spur gear configuration with a live 3D preview](docs/configurator.png)

- Six ModelPrinter functions: NEMA motors, sheet metal, flexible screens, socket bolts, involute spur gears, and worm screws.
- All 104 functions from Footprinter 0.0.430, with controls generated from the native parameter schemas.
- 3D orbit, pan, zoom, camera presets, and fit; footprint SVG previews with pan and zoom.
- Editable model strings, generated TypeScript, parameter JSON, and shareable configuration URLs.
- Responsive catalog and parameter panels, keyboard search with Ctrl/Cmd+K, and validation that preserves the last valid preview.

## Development

Install [Bun](https://bun.sh), then run:

```sh
bun install --frozen-lockfile
bun run dev
```

Open the URL printed by Vite. Geometry generation runs in a Web Worker; edits are debounced and superseded jobs are cancelled.

```sh
bun run test       # Catalog, parameter serialization, and real geometry checks
bun run build      # Typecheck and production bundle
bunx playwright install chromium
bun run test:browser
```

To test a production build, stop the dev server and run `PLAYWRIGHT_PREVIEW=1 bun run test:browser` after building. Set `CHROMIUM_PATH` to use an existing Chromium installation, or `PLAYWRIGHT_BASE_URL` to test an already running server.

## Parameter and preview accuracy

The controls use ModelPrinter's exported schemas and checked-in Footprinter schema metadata. Inputs remain separate from resolved defaults so changing a package preset can recompute dependent dimensions. The preview uses the libraries' actual generated geometry and Circuit JSON.

Some Footprinter booleans and enum combinations cannot be expressed by its string grammar. In those cases, the TypeScript tab exports the complete configuration and the UI explains the string limitation. Unsupported or mismatched package bodies are omitted from 3D previews; the exact copper and footprint SVG remain available.

FlexScreen placement objects are edited as JSON and exported as JSX when needed. `wormgear` currently generates a worm screw; a conjugate mating worm wheel is outside the current ModelPrinter implementation.

## Updating the catalogs

ModelPrinter controls are derived from the installed package. Footprinter does not export its schemas in the npm bundle, so its controls are generated from a matching source checkout:

```sh
git clone https://github.com/tscircuit/footprinter ../footprinter
cd ../footprinter
git checkout 69b6d99f65c30afc0e1c578a7754dce5d1dbcdfe
bun install
cd ../models.tscircuit.com
FOOTPRINTER_SOURCE_PATH=../footprinter bun scripts/generate-footprint-catalog.ts
```

Update the pinned package version and metadata together, then run the tests. Catalog coverage tests check every installed function and its default footprint.

## Deployment

`bun run build` produces the static site in `dist/`. The included `vercel.json` sets the Bun install/build commands and Vite output directory. Connect this repository to Vercel and assign `models.tscircuit.com` to publish at that domain.
