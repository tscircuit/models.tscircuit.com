import { BufferGeometry, BufferAttribute, Color, SRGBColorSpace } from "three"
import type { PreviewMesh } from "./catalog-types"

/** Binary glTF without browser APIs. Coordinates are Y-up meters. */
export function exportGlb(meshes: PreviewMesh[]): ArrayBuffer {
  const chunks: Uint8Array[] = []
  const bufferViews: object[] = [],
    accessors: object[] = [],
    materials: object[] = [],
    models: object[] = []
  let byteLength = 0
  const attribute = (values: Float32Array, bounds = false) => {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < values.length; i++) {
      min[i % 3] = Math.min(min[i % 3], values[i])
      max[i % 3] = Math.max(max[i % 3], values[i])
    }
    chunks.push(
      new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
    )
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: values.byteLength,
      target: 34962,
    })
    byteLength += values.byteLength
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count: values.length / 3,
      type: "VEC3",
      ...(bounds ? { min, max } : {}),
    })
    return accessors.length - 1
  }
  for (const mesh of meshes) {
    const positions = new Float32Array(mesh.positions.length)
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = mesh.positions[i] * 0.001
      positions[i + 1] = mesh.positions[i + 2] * 0.001
      positions[i + 2] = -mesh.positions[i + 1] * 0.001
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    const color = new Color()
    if (typeof mesh.color === "string") color.set(mesh.color)
    else {
      const divisor = mesh.color.slice(0, 3).some((v) => v > 1) ? 255 : 1
      color.setRGB(
        mesh.color[0] / divisor,
        mesh.color[1] / divisor,
        mesh.color[2] / divisor,
        SRGBColorSpace,
      )
    }
    materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [color.r, color.g, color.b, 1],
        metallicFactor: 0.12,
        roughnessFactor: 0.43,
      },
      doubleSided: true,
    })
    models.push({
      primitives: [
        {
          attributes: {
            POSITION: attribute(positions, true),
            NORMAL: attribute(
              geometry.getAttribute("normal").array as Float32Array,
            ),
          },
          material: materials.length - 1,
        },
      ],
    })
    geometry.dispose()
  }
  if (!models.length) throw new Error("This model has no geometry to download.")
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: "2.0", generator: "models.tscircuit.com" },
      scene: 0,
      scenes: [{ nodes: models.map((_, i) => i) }],
      nodes: models.map((_, i) => ({ mesh: i })),
      meshes: models,
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength }],
    }),
  )
  const padded = Math.ceil(json.length / 4) * 4
  const output = new ArrayBuffer(12 + 8 + padded + 8 + byteLength)
  const view = new DataView(output),
    bytes = new Uint8Array(output)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, output.byteLength, true)
  view.setUint32(12, padded, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(32, 20, 20 + padded)
  bytes.set(json, 20)
  view.setUint32(20 + padded, byteLength, true)
  view.setUint32(24 + padded, 0x004e4942, true)
  let offset = 28 + padded
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return output
}
