import { Color, SRGBColorSpace } from "three"
import type { PreviewMesh } from "./catalog-types"

/** AP214 faceted B-reps preserve the preview mesh without fitting analytic surfaces. */
export function exportStep(meshes: PreviewMesh[]): string {
  const entities: string[] = []
  const add = (entity: string) => {
    entities.push(`#${entities.length + 1}=${entity};`)
    return `#${entities.length}`
  }
  const real = (value: number) => {
    const text = value.toString().toUpperCase()
    const [mantissa, exponent] = text.split("E")
    return `${mantissa.includes(".") ? mantissa : `${mantissa}.`}${exponent === undefined ? "" : `E${exponent}`}`
  }
  const application = add("APPLICATION_CONTEXT('automotive design')")
  add(
    `APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${application})`,
  )
  const productContext = add(`PRODUCT_CONTEXT('',${application},'mechanical')`)
  const product = add(`PRODUCT('model','Model','',(${productContext}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)
  const definitionContext = add(
    `PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`,
  )
  const definition = add(
    `PRODUCT_DEFINITION('design','',${formation},${definitionContext})`,
  )
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)
  const length = add("(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))")
  const angle = add("(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))")
  const solidAngle = add(
    "(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())",
  )
  const uncertainty = add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${length},'distance_accuracy_value','')`,
  )
  const context = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},${angle},${solidAngle})) REPRESENTATION_CONTEXT('','3D'))`,
  )
  const solids: string[] = []
  const styles: string[] = []

  for (const mesh of meshes) {
    const points = new Map<string, string>()
    const faces: string[] = []
    const p = mesh.positions
    const point = (offset: number) => {
      const coordinates = [p[offset], p[offset + 1], p[offset + 2]]
        .map(real)
        .join(",")
      let ref = points.get(coordinates)
      if (!ref) {
        ref = add(`CARTESIAN_POINT('',(${coordinates}))`)
        points.set(coordinates, ref)
      }
      return ref
    }
    for (let i = 0; i < p.length; i += 9) {
      // Collapsed triangles can appear at curved poles; STEP faces need nonzero area.
      const ax = p[i + 3] - p[i],
        ay = p[i + 4] - p[i + 1],
        az = p[i + 5] - p[i + 2]
      const bx = p[i + 6] - p[i],
        by = p[i + 7] - p[i + 1],
        bz = p[i + 8] - p[i + 2]
      const area = Math.hypot(
        ay * bz - az * by,
        az * bx - ax * bz,
        ax * by - ay * bx,
      )
      if (!Number.isFinite(area))
        throw new Error("The model contains invalid coordinates.")
      if (area === 0) continue
      const loop = add(
        `POLY_LOOP('',(${point(i)},${point(i + 3)},${point(i + 6)}))`,
      )
      const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`)
      const normal = add(
        `DIRECTION('',(${[
          (ay * bz - az * by) / area,
          (az * bx - ax * bz) / area,
          (ax * by - ay * bx) / area,
        ]
          .map(real)
          .join(",")}))`,
      )
      const edgeLength = Math.hypot(ax, ay, az)
      const reference = add(
        `DIRECTION('',(${[ax / edgeLength, ay / edgeLength, az / edgeLength].map(real).join(",")}))`,
      )
      const placement = add(
        `AXIS2_PLACEMENT_3D('',${point(i)},${normal},${reference})`,
      )
      const plane = add(`PLANE('',${placement})`)
      faces.push(add(`FACE_SURFACE('',(${bound}),${plane},.T.)`))
    }
    if (!faces.length) continue
    const shell = add(`CLOSED_SHELL('',(${faces.join(",")}))`)
    const solid = add(`FACETED_BREP('',${shell})`)
    solids.push(solid)

    const color = new Color()
    if (typeof mesh.color === "string") color.set(mesh.color)
    else {
      const divisor = mesh.color.slice(0, 3).some((value) => value > 1)
        ? 255
        : 1
      color.setRGB(
        mesh.color[0] / divisor,
        mesh.color[1] / divisor,
        mesh.color[2] / divisor,
        SRGBColorSpace,
      )
    }
    color.convertLinearToSRGB()
    const rgb = add(
      `COLOUR_RGB('',${real(color.r)},${real(color.g)},${real(color.b)})`,
    )
    const fillColor = add(`FILL_AREA_STYLE_COLOUR('',${rgb})`)
    const fill = add(`FILL_AREA_STYLE('',(${fillColor}))`)
    const surfaceFill = add(`SURFACE_STYLE_FILL_AREA(${fill})`)
    const surface = add(`SURFACE_SIDE_STYLE('',(${surfaceFill}))`)
    const usage = add(`SURFACE_STYLE_USAGE(.BOTH.,${surface})`)
    const assignment = add(`PRESENTATION_STYLE_ASSIGNMENT((${usage}))`)
    styles.push(add(`STYLED_ITEM('',(${assignment}),${solid})`))
  }
  if (!solids.length) throw new Error("This model has no geometry to download.")
  const representation = add(
    `FACETED_BREP_SHAPE_REPRESENTATION('',(${solids.join(",")}),${context})`,
  )
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`)
  add(
    `MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styles.join(",")}),${context})`,
  )
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('Faceted model'),'2;1');",
    `FILE_NAME('model.step','${new Date().toISOString()}',(''),(''),'models.tscircuit.com','models.tscircuit.com','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
    "ENDSEC;",
    "DATA;",
    ...entities,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n")
}
