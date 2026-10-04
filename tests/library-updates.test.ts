import { expect, test } from "bun:test"
import { planLibraryUpdates } from "../scripts/update-model-libraries"

const manifest = {
  dependencies: {
    "@tscircuit/footprinter": "0.0.430",
    "@tscircuit/modelprinter": "0.0.7",
    "jscad-electronics": "0.0.185",
    react: "19.1.0",
  },
}
const pins = {
  footprinter: {
    package: "@tscircuit/footprinter",
    version: "0.0.430",
    commit: "a".repeat(40),
    repository: "tscircuit/footprinter",
  },
  modelprinter: {
    package: "@tscircuit/modelprinter",
    version: "0.0.7",
    commit: "b".repeat(40),
    repository: "tscircuit/modelprinter",
  },
}
const releases = Object.fromEntries(
  Object.entries(manifest.dependencies).map(([name, version]) => [
    name,
    { name, version, gitHead: "c".repeat(40) },
  ]),
)

test("unchanged releases skip installation and deployment; dist-tag rollbacks do not downgrade", () => {
  const result = planLibraryUpdates(manifest, pins, releases)
  expect(result.updates).toEqual([])
  expect(result.manifest).toEqual(manifest)
  expect(result.pins).toEqual(pins)
  expect(
    planLibraryUpdates(manifest, pins, {
      ...releases,
      "jscad-electronics": {
        ...releases["jscad-electronics"],
        version: "0.0.184",
      },
    }).updates,
  ).toEqual([])
})

test("package updates and matching source commits advance together without changing other dependencies", () => {
  const result = planLibraryUpdates(manifest, pins, {
    ...releases,
    "@tscircuit/footprinter": {
      ...releases["@tscircuit/footprinter"],
      version: "0.0.431",
    },
    "@tscircuit/modelprinter": {
      ...releases["@tscircuit/modelprinter"],
      version: "0.0.8",
    },
    "jscad-electronics": {
      ...releases["jscad-electronics"],
      version: "0.0.186",
    },
  })
  expect(result.updates).toHaveLength(3)
  expect(result.pins.footprinter).toEqual({
    ...pins.footprinter,
    version: "0.0.431",
    commit: "c".repeat(40),
  })
  expect(result.pins.modelprinter).toEqual({
    ...pins.modelprinter,
    version: "0.0.8",
    commit: "c".repeat(40),
  })
  expect(result.manifest.dependencies["jscad-electronics"]).toBe("0.0.186")
  expect(result.manifest.dependencies.react).toBe("19.1.0")
  expect(manifest.dependencies["@tscircuit/modelprinter"]).toBe("0.0.7")
  expect(pins.modelprinter.version).toBe("0.0.7")
})

test("missing source commits and unexpected registry data fail before any files are changed", () => {
  const name = "@tscircuit/modelprinter"
  for (const release of [
    { name, version: "0.0.8" },
    { name, version: "0.0.8", gitHead: "main" },
    { name, version: "0.0.8-beta.1", gitHead: "c".repeat(40) },
    { name: "another-package", version: "0.0.8", gitHead: "c".repeat(40) },
  ])
    expect(() =>
      planLibraryUpdates(manifest, pins, { ...releases, [name]: release }),
    ).toThrow()
})
