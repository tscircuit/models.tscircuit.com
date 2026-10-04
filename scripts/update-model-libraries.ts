import { appendFile } from "node:fs/promises"
import { resolve } from "node:path"
import type sourcePins from "./source-pins.json"

export const modelLibraries = [
  "@tscircuit/footprinter",
  "@tscircuit/modelprinter",
  "jscad-electronics",
] as const

type Release = { name: string; version: string; gitHead?: string }
type SourcePins = typeof sourcePins

export function planLibraryUpdates(
  manifest: { dependencies: Record<string, string> },
  pins: SourcePins,
  releases: Record<string, Release>,
) {
  const nextManifest = structuredClone(manifest)
  const nextPins = structuredClone(pins)
  const updates: string[] = []
  for (const name of modelLibraries) {
    const release = releases[name]
    const current = manifest.dependencies[name]
    if (
      !release ||
      release.name !== name ||
      !/^\d+\.\d+\.\d+$/.test(release.version)
    )
      throw new Error(`Invalid latest release for ${name}`)
    if (!current || !/^\d+\.\d+\.\d+$/.test(current))
      throw new Error(`${name} must have an exact version pin`)
    if (Bun.semver.order(release.version, current) <= 0) continue
    for (const pin of Object.values(nextPins)) {
      if (pin.package !== name) continue
      if (!release.gitHead || !/^[a-f0-9]{40}$/.test(release.gitHead))
        throw new Error(
          `${name}@${release.version} is missing its published source commit`,
        )
      pin.version = release.version
      pin.commit = release.gitHead
    }
    nextManifest.dependencies[name] = release.version
    updates.push(`${name}: ${current} → ${release.version}`)
  }
  return { manifest: nextManifest, pins: nextPins, updates }
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..")
  const manifestPath = resolve(root, "package.json")
  const pinsPath = resolve(root, "scripts/source-pins.json")
  const releases = Object.fromEntries(
    await Promise.all(
      modelLibraries.map(async (name) => {
        const response = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
          {
            signal: AbortSignal.timeout(30_000),
          },
        )
        if (!response.ok)
          throw new Error(`Cannot check ${name}: HTTP ${response.status}`)
        return [name, (await response.json()) as Release]
      }),
    ),
  )
  const plan = planLibraryUpdates(
    await Bun.file(manifestPath).json(),
    await Bun.file(pinsPath).json(),
    releases,
  )
  const changed = plan.updates.length > 0
  if (changed) {
    console.log(plan.updates.join("\n"))
    await Bun.write(manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`)
    await Bun.write(pinsPath, `${JSON.stringify(plan.pins, null, 2)}\n`)
    const install = Bun.spawn([process.execPath, "install"], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    })
    if ((await install.exited) !== 0)
      throw new Error("Dependency installation failed")
  } else console.log("Model libraries are already up to date.")
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)
}
