import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import type { PreviewMesh, PreviewResult } from "./catalog-types"

export type CameraView = "isometric" | "top" | "front"

export function createThreePreview(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor("#f5f8f7")
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive 3D model. Drag to orbit, right drag to pan, scroll to zoom.",
  )
  renderer.domElement.setAttribute("role", "img")
  renderer.domElement.style.display = "block"
  renderer.domElement.style.width = "100%"
  renderer.domElement.style.height = "100%"
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10000)
  camera.up.set(0, 0, 1)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.screenSpacePanning = true
  controls.enableDamping = false
  const group = new THREE.Group()
  scene.add(group)
  scene.add(new THREE.HemisphereLight("#ffffff", "#bdc8c2", 2.4))
  const key = new THREE.DirectionalLight("#ffffff", 2.8)
  key.position.set(70, -80, 150)
  scene.add(key)
  const fill = new THREE.DirectionalLight("#ffffff", 1.2)
  fill.position.set(-60, 40, 30)
  scene.add(fill)
  let grid: THREE.GridHelper | undefined
  let gridVisible = true
  let bounds: PreviewResult["bounds"]
  let width = 1
  let height = 1
  let fitted = false
  let disposed = false
  const draw = () => {
    if (!disposed) renderer.render(scene, camera)
  }
  controls.addEventListener("change", draw)

  const disposeObject = (object: THREE.Object3D) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    }
  }

  const fit = (view?: CameraView) => {
    if (!bounds) return
    const min = new THREE.Vector3(...bounds.min)
    const max = new THREE.Vector3(...bounds.max)
    const center = min.clone().add(max).multiplyScalar(0.5)
    const size = max.clone().sub(min)
    const radius = Math.max(size.length() / 2, 0.001)
    const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2)
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect)
    const distance =
      (radius / Math.sin(Math.min(halfHorizontal, halfVertical))) * 1.2
    let direction = camera.position.clone().sub(controls.target).normalize()
    if (!fitted || view === "isometric")
      direction.set(1, -1.3, 0.95).normalize()
    if (view === "top") direction.set(0, -0.00001, 1).normalize()
    if (view === "front") direction.set(0, -1, 0.00001).normalize()
    controls.target.copy(center)
    camera.position.copy(center).addScaledVector(direction, distance)
    camera.near = Math.max(radius / 1000, 0.000001)
    camera.far = Math.max(distance + radius * 1000, 100)
    controls.minDistance = radius * 0.03
    controls.maxDistance = radius * 500
    camera.updateProjectionMatrix()
    camera.lookAt(center)
    controls.update()
    fitted = true
    draw()
  }

  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    draw()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  return {
    setMeshes(meshes: PreviewMesh[], nextBounds: PreviewResult["bounds"]) {
      group.traverse(disposeObject)
      group.clear()
      for (const mesh of meshes) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(mesh.positions, 3),
        )
        geometry.computeVertexNormals()
        const color = new THREE.Color()
        if (typeof mesh.color === "string") color.set(mesh.color)
        else {
          const divisor = mesh.color.slice(0, 3).some((channel) => channel > 1)
            ? 255
            : 1
          color.setRGB(
            mesh.color[0] / divisor,
            mesh.color[1] / divisor,
            mesh.color[2] / divisor,
            THREE.SRGBColorSpace,
          )
        }
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.43,
          metalness: 0.12,
          side: THREE.DoubleSide,
        })
        group.add(new THREE.Mesh(geometry, material))
      }
      bounds = nextBounds
      if (grid) {
        scene.remove(grid)
        disposeObject(grid)
        grid = undefined
      }
      if (bounds) {
        const extent = Math.max(
          ...bounds.max.map((value, index) => value - bounds!.min[index]),
          0.01,
        )
        const step = 10 ** Math.floor(Math.log10(extent / 6))
        const gridSize = Math.ceil((extent * 2.5) / step) * step
        const divisions = Math.min(
          100,
          Math.max(2, Math.round(gridSize / step)),
        )
        grid = new THREE.GridHelper(gridSize, divisions, "#c7d7cd", "#e0e8e3")
        grid.rotation.x = Math.PI / 2
        grid.position.set(
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          bounds.min[2] - extent * 0.007,
        )
        grid.visible = gridVisible
        scene.add(grid)
      }
      fit()
      draw()
    },
    fit,
    setGrid(visible: boolean) {
      gridVisible = visible
      if (grid) grid.visible = visible
      draw()
    },
    dispose() {
      disposed = true
      observer.disconnect()
      controls.removeEventListener("change", draw)
      controls.dispose()
      group.traverse(disposeObject)
      if (grid) disposeObject(grid)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
