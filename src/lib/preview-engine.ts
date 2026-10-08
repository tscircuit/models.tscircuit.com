import { modelAdapters } from "./model-adapters"
import jscad from "@jscad/modeling"
import { fp } from "@tscircuit/footprinter"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import {
  ExtrudedPads,
  FlexScreen,
  HexSocketBolt,
  HexBolt,
  HelicalGear,
  NemaMotor,
  SheetMetal,
  SpurGear,
  WormGear,
} from "jscad-electronics"
import { getJscadModelForFootprint } from "jscad-electronics/vanilla"
import { createJSCADRenderer } from "jscad-fiber"
import {
  createElement,
  Fragment,
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react"
import type { Geom3 } from "@jscad/modeling/src/geometries/types"
import type {
  PreviewMesh,
  PreviewRequest,
  PreviewResult,
} from "./catalog-types"
import { createConfiguredFootprint } from "./footprint-configuration"

const MAX_TRIANGLES = 400_000
const BODY_UNAVAILABLE =
  "Showing the footprint; this package body is not available for these settings."

const modelComponents: Record<string, ComponentType<any>> = {
  ...Object.fromEntries(
    Object.entries(modelAdapters).map(([name, adapter]) => [
      name,
      adapter.component,
    ]),
  ),
  nema: NemaMotor,
  hexsocketbolt: HexSocketBolt,
  hexbolt: HexBolt,
  sheetmetal: SheetMetal,
  spurgear: SpurGear,
  helicalgear: HelicalGear,
  wormgear: WormGear,
  flexscreen: FlexScreen,
}

/**
 * Flatten fragments before handing the tree to jscad-fiber. Its synchronous
 * nested host traversal otherwise drops parent transforms around fragments.
 */
function expandGeometryTree(
  node: ReactNode,
  budget: { remaining: number },
): ReactNode[] {
  if (node == null || typeof node === "boolean") return []
  if (--budget.remaining < 0)
    throw new Error("This configuration has too many model parts to preview.")
  if (Array.isArray(node))
    return node.flatMap((child) => expandGeometryTree(child, budget))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (node.type === Fragment)
    return expandGeometryTree(node.props.children as ReactNode, budget)
  if (typeof node.type === "function") {
    const component = node.type as (props: Record<string, unknown>) => ReactNode
    return expandGeometryTree(component(node.props), budget)
  }
  const children = expandGeometryTree(node.props.children as ReactNode, budget)
  return [
    createElement(node.type, {
      ...node.props,
      children: children.length === 1 ? children[0] : children,
    }),
  ]
}

/** Evaluate the library's actual React geometry components without a DOM. */
function renderComponent(
  component: ComponentType<any>,
  props: Record<string, unknown>,
): Geom3[] {
  const geometries: Geom3[] = []
  const tree = createElement(
    Fragment,
    {},
    ...expandGeometryTree(createElement(component, props), {
      remaining: 100_000,
    }),
  )
  // jscad-fiber permits tuple cube sizes in its declaration; JSCAD itself expects a scalar.
  createJSCADRenderer(
    jscad as unknown as Parameters<typeof createJSCADRenderer>[0],
  )
    .createJSCADRoot(geometries)
    .render(tree)
  return geometries
}

/** toPolygons applies pending JSCAD transforms before calculating the mesh/bounds. */
export function geometryToMesh(
  geometry: Geom3,
  color?: string | number[],
): PreviewMesh | null {
  if (!jscad.geometries.geom3.isA(geometry)) return null
  const polygons = jscad.geometries.geom3.toPolygons(geometry)
  let triangleCount = 0
  for (const polygon of polygons)
    triangleCount += Math.max(0, polygon.vertices.length - 2)
  if (triangleCount === 0) return null
  if (triangleCount > MAX_TRIANGLES)
    throw new Error(
      "This preview has too much geometry. Reduce the resolution or pin count.",
    )
  const positions = new Float32Array(triangleCount * 9)
  let offset = 0
  for (const polygon of polygons) {
    for (let index = 2; index < polygon.vertices.length; index++) {
      for (const vertex of [
        polygon.vertices[0],
        polygon.vertices[index - 1],
        polygon.vertices[index],
      ]) {
        for (let axis = 0; axis < 3; axis++) {
          const coordinate = vertex[axis]
          if (!Number.isFinite(coordinate))
            throw new Error(
              "The model generated invalid coordinates. Check its dimensions.",
            )
          positions[offset++] = coordinate
        }
      }
    }
  }
  return { positions, color: color ?? geometry.color ?? "#a1a1aa" }
}

export function getMeshBounds(meshes: PreviewMesh[]): PreviewResult["bounds"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    for (let index = 0; index < mesh.positions.length; index++) {
      const axis = index % 3
      min[axis] = Math.min(min[axis], mesh.positions[index])
      max[axis] = Math.max(max[axis], mesh.positions[index])
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : undefined
}

function meshGeometries(geometries: Geom3[], color?: string): PreviewMesh[] {
  const meshes = geometries
    .map((geometry) => geometryToMesh(geometry, color))
    .filter((mesh): mesh is PreviewMesh => mesh !== null)
  const totalTriangles = meshes.reduce(
    (sum, mesh) => sum + mesh.positions.length / 9,
    0,
  )
  if (totalTriangles > MAX_TRIANGLES)
    throw new Error(
      "This preview has too much geometry. Reduce the resolution or pin count.",
    )
  return meshes
}

/** Compare resolved values, so fluent-only edits never display a stale package body. */
function hasExactBodySpec(
  spec: string,
  resolved: Record<string, unknown>,
): boolean {
  const fromSpec = fp.string(spec).json() as unknown as Record<string, unknown>
  const normalize = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(normalize).join(",")}]`
    if (value && typeof value === "object")
      return `{${Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => `${key}:${normalize(v)}`)
        .join(",")}}`
    return JSON.stringify(value) ?? "undefined"
  }
  return normalize(fromSpec) === normalize(resolved)
}

/** CAD exporters can capture the full-precision solids before display triangulation. */
export function generatePreview(
  request: PreviewRequest,
  onGeometry?: (geometries: Geom3[]) => void,
): PreviewResult {
  try {
    if (request.library === "modelprinter") {
      const component = modelComponents[request.fn]
      if (!component)
        throw new Error(`No geometry generator is available for ${request.fn}.`)
      const geometries = renderComponent(component, request.values)
      onGeometry?.(geometries)
      const meshes = meshGeometries(geometries)
      if (meshes.length === 0)
        throw new Error(
          "These settings produce no visible geometry. Enable a model part to preview it.",
        )
      return { id: request.id, meshes, bounds: getMeshBounds(meshes) }
    }

    const configured = createConfiguredFootprint(
      request.fn,
      request.spec,
      request.values,
    )
    const circuitJson = configured.circuitJson()
    if (circuitJson.length > 20_000)
      throw new Error(
        "This footprint is too large to preview. Reduce the pin count.",
      )
    const svg = convertCircuitJsonToPcbSvg(
      circuitJson as Parameters<typeof convertCircuitJsonToPcbSvg>[0],
      {
        width: 1000,
        height: 760,
        backgroundColor: "transparent",
        includeVersion: false,
        colorOverrides: {
          copper: { top: "#52525b", bottom: "#a1a1aa" },
          drill: "#fafafa",
          silkscreen: { top: "#a1a1aa" },
          courtyard: { top: "#d4d4d8", bottom: "#e4e4e7" },
        },
      },
    )
    let body: Geom3[] = []
    let message: string | undefined
    try {
      if (
        hasExactBodySpec(
          request.spec,
          configured.json() as unknown as Record<string, unknown>,
        )
      ) {
        body = getJscadModelForFootprint(request.spec, jscad).geometries.map(
          ({ geom, color }) => ({ ...geom, color: color ?? geom.color }),
        )
        if (body.length === 0) message = BODY_UNAVAILABLE
      } else {
        message = BODY_UNAVAILABLE
      }
    } catch {
      // The precise circuit JSON remains useful for families without a package body.
      message = BODY_UNAVAILABLE
    }
    let pads: Geom3[] = []
    try {
      pads = renderComponent(ExtrudedPads, { circuitJson })
    } catch {
      message =
        "3D copper is not available for this pad shape. The 2D footprint shows the complete configuration."
    }
    onGeometry?.([...body, ...pads])
    const meshes = [...meshGeometries(body), ...meshGeometries(pads, "#71717a")]
    return {
      id: request.id,
      meshes,
      svg,
      bounds: getMeshBounds(meshes),
      message,
    }
  } catch (error) {
    return {
      id: request.id,
      meshes: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to generate this preview.",
    }
  }
}
