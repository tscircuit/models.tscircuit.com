import { parseRepository, Point } from "parasolidts"

export function inspectParasolid(text: string) {
  const repository = parseRepository(text)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const entity of repository.getChildren()) {
    if (!(entity instanceof Point)) continue
    const coordinates = [
      entity.position.x,
      entity.position.y,
      entity.position.z,
    ]
    coordinates.forEach((value, axis) => {
      min[axis] = Math.min(min[axis], value)
      max[axis] = Math.max(max[axis], value)
    })
  }
  return {
    fullyParsed: repository.fullyParsed,
    bodies: repository.bodies.length,
    min,
    max,
  }
}
