import { expect, test } from "bun:test"
import { getFootprintNames } from "@tscircuit/footprinter"
import { modelCatalog } from "../src/lib/model-catalog"
import {
  catalog,
  configure,
  initialState,
  prepareValues,
  searchCatalog,
  updateValues,
} from "../src/lib/catalog"

test("function search covers both catalogs and matches all query words", () => {
  expect(catalog).toHaveLength(modelCatalog.length + getFootprintNames().length)
  expect(
    searchCatalog("gear")
      .map((entry) => entry.fn)
      .sort(),
  ).toEqual(["helicalgear", "spurgear", "wormgear"])
  expect(searchCatalog("gear", "footprinter")).toEqual([])
  expect(searchCatalog("nema motor")[0]?.fn).toBe("nema")
  expect(searchCatalog("SOIC", "footprinter")[0]?.fn).toBe("soic")
  expect(searchCatalog("xyzzy non existent")).toEqual([])
})

test("JSON controls preserve actual model placement and reject incomplete JSON", () => {
  const entry = catalog.find((item) => item.fn === "flexscreen")!
  const values = prepareValues(entry, {
    width: 40,
    height: 30,
    offset: '{"x":5,"y":10,"z":15}',
  })
  const result = configure(entry, values)
  expect(result.values.offset).toEqual({ x: 5, y: 10, z: 15 })
  expect(() => prepareValues(entry, { offset: "[" })).toThrow("valid JSON")
})

test("a spec-only model link restores explicit parameters without freezing preset defaults", () => {
  const state = initialState("?model=modelprinter:nema&spec=nema17_length50mm")
  expect(state.entry.fn).toBe("nema")
  expect(state.values).toEqual({ nemaSize: 17, bodyLength: 50 })
  const switched = configure(state.entry, { ...state.values, nemaSize: 8 })
  expect(switched.values.bodyLength).toBe(50)
  expect(switched.values.bodyWidth).not.toBe(
    configure(state.entry, state.values).values.bodyWidth,
  )
})

test("selecting a footprint preset replaces previous size and dimension overrides", () => {
  const entry = catalog.find((item) => item.fn === "res")!
  const edited = configure(entry, { imperial: "0603", pw: "2mm" })
  const values = updateValues(
    entry,
    { imperial: "0603", pw: "2mm" },
    "metric",
    "1005",
  )
  const preset = configure(entry, values)
  expect(preset.resolvedValues?.pw).not.toBe(edited.resolvedValues?.pw)
  expect(preset.spec).toContain("1005_metric")
})

test("changing connector families repeatedly selects the most recent choice", () => {
  const entry = catalog.find((item) => item.fn === "jst")!
  let values = updateValues(entry, {}, "ph", true)
  const ph = configure(entry, values).resolvedValues
  values = updateValues(entry, values, "zh", true)
  expect(configure(entry, values).resolvedValues?.zh).toBe(true)
  values = updateValues(entry, values, "ph", true)
  expect(configure(entry, values).resolvedValues).toEqual(ph)
})
