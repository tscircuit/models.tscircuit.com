import { expect, test } from "bun:test"
import worker from "../src/worker"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { inspectParasolid } from "./parasolid-helpers"

function environment() {
  const data = new Map<string, ArrayBuffer>()
  const writes: { ttl: number }[] = []
  const pending: Promise<unknown>[] = []
  return {
    env: {
      ASSETS: { fetch: async () => new Response("app shell") },
      MODEL_CACHE: {
        get: async (key: string) => data.get(key) ?? null,
        put: async (
          key: string,
          value: ArrayBuffer,
          options: { expirationTtl: number },
        ) => {
          data.set(key, value)
          writes.push({ ttl: options.expirationTtl })
        },
      },
    },
    ctx: {
      waitUntil: (promise: Promise<unknown>) => {
        pending.push(promise)
      },
    },
    pending,
    writes,
    data,
  }
}
for (const format of ["glb", "step", "x_t"] as const) {
  test(`${format} direct route exports real geometry and caches for seven days`, async () => {
    const { env, ctx, pending, writes } = environment()
    const request = new Request(
      `https://models.tscircuit.com/spurgear16_m1mm_w4mm.${format}`,
    )
    const first = await worker.fetch(request, env, ctx)
    expect(first.status).toBe(200)
    expect(first.headers.get("X-Model-Cache")).toBe("MISS")
    const bytes = await first.arrayBuffer()
    if (format === "glb") {
      const gltf = await new GLTFLoader().parseAsync(bytes, "")
      expect(gltf.scene.children.length).toBeGreaterThan(0)
    } else if (format === "step")
      expect(new TextDecoder().decode(bytes)).toContain("FACETED_BREP")
    else
      expect(
        inspectParasolid(new TextDecoder().decode(bytes)).fullyParsed,
      ).toBe(true)
    await Promise.all(pending)
    expect(writes).toEqual([{ ttl: 604800 }])
    const second = await worker.fetch(request, env, ctx)
    expect(second.headers.get("X-Model-Cache")).toBe("HIT")
    expect(await second.arrayBuffer()).toEqual(bytes)
    const head = await worker.fetch(
      new Request(request.url, { method: "HEAD" }),
      env,
      ctx,
    )
    expect(await head.text()).toBe("")
    expect(head.headers.get("Content-Type")).toBe(
      second.headers.get("Content-Type"),
    )
  })
}
test("page routes serve the SPA; invalid models never enter KV", async () => {
  const { env, ctx, writes } = environment()
  expect(
    await (
      await worker.fetch(
        new Request("https://models.tscircuit.com/spurgear16"),
        env,
        ctx,
      )
    ).text(),
  ).toBe("app shell")
  const invalid = await worker.fetch(
    new Request("https://models.tscircuit.com/notamodel.glb"),
    env,
    ctx,
  )
  expect(invalid.status).toBe(400)
  expect(writes).toHaveLength(0)
})
test("formats and parameter overrides use different cache entries", async () => {
  const { env, ctx, pending, data } = environment()
  for (const suffix of [
    ".glb",
    ".step",
    ".glb?params=%7B%22toothCount%22%3A20%7D",
  ]) {
    const response = await worker.fetch(
      new Request(`https://models.tscircuit.com/spurgear16${suffix}`),
      env,
      ctx,
    )
    expect(response.status).toBe(200)
    await Promise.all(pending)
  }
  expect(data.size).toBe(3)
})
