import { expect, test } from "bun:test"
import worker from "../src/worker"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { inspectParasolid } from "./parasolid-helpers"

function environment() {
  const data = new Map<string, ArrayBuffer>()
  const expires = new Map<string, number>()
  let now = 0
  const writes: { ttl: number }[] = []
  const pending: Promise<unknown>[] = []
  return {
    env: {
      ASSETS: { fetch: async () => new Response("app shell") },
      MODEL_CACHE: {
        get: async (key: string) =>
          (expires.get(key) ?? 0) > now ? data.get(key) ?? null : null,
        put: async (
          key: string,
          value: ArrayBuffer,
          options: { expirationTtl: number },
        ) => {
          data.set(key, value)
          expires.set(key, now + options.expirationTtl)
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
    advance: (seconds: number) => { now += seconds },
  }
}
for (const format of ["glb", "step", "x_t"] as const) {
  test(`${format} direct route exports real geometry and caches for 180 days`, async () => {
    const { env, ctx, pending, writes } = environment()
    const request = new Request(
      `https://models.tscircuit.com/spurgear16_m1mm_w4mm.${format}`,
    )
    const first = await worker.fetch(request, env, ctx)
    expect(first.status).toBe(200)
    expect(first.headers.get("X-Model-Cache")).toBe("MISS")
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=15552000")
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
    expect(writes).toEqual([{ ttl: 15552000 }])
    const second = await worker.fetch(request, env, ctx)
    expect(second.headers.get("X-Model-Cache")).toBe("HIT")
    expect(await second.arrayBuffer()).toEqual(bytes)
    await Promise.all(pending)
    expect(writes).toEqual([{ ttl: 15552000 }, { ttl: 15552000 }])
    const head = await worker.fetch(
      new Request(request.url, { method: "HEAD" }),
      env,
      ctx,
    )
    expect(await head.text()).toBe("")
    await Promise.all(pending)
    expect(writes).toHaveLength(3)
    expect(head.headers.get("Content-Type")).toBe(
      second.headers.get("Content-Type"),
    )
  })
}
test("requests renew expiry so a used model survives its original 180-day lifetime", async () => {
  const { env, ctx, pending, advance } = environment()
  const request = new Request("https://models.tscircuit.com/spurgear16.glb")
  const first = await worker.fetch(request, env, ctx)
  const bytes = await first.arrayBuffer()
  await Promise.all(pending)
  advance(179 * 86400)
  const renewed = await worker.fetch(request, env, ctx)
  expect(renewed.headers.get("X-Model-Cache")).toBe("HIT")
  expect(await renewed.arrayBuffer()).toEqual(bytes)
  await Promise.all(pending)
  advance(2 * 86400)
  const later = await worker.fetch(request, env, ctx)
  expect(later.headers.get("X-Model-Cache")).toBe("HIT")
  await Promise.all(pending)
  advance(181 * 86400)
  const expired = await worker.fetch(request, env, ctx)
  expect(expired.headers.get("X-Model-Cache")).toBe("MISS")
})
test("cache renewal retries a rate-limited write without delaying the download", async () => {
  const { env, ctx, pending, writes } = environment()
  const request = new Request("https://models.tscircuit.com/spurgear16.glb")
  const first = await worker.fetch(request, env, ctx)
  const bytes = await first.arrayBuffer()
  await Promise.all(pending)
  const put = env.MODEL_CACHE.put
  let attempts = 0
  env.MODEL_CACHE.put = async (...args) => {
    if (++attempts === 1) throw new Error("KV PUT failed: 429 Too Many Requests")
    return put(...args)
  }
  const hit = await worker.fetch(request, env, ctx)
  expect(hit.headers.get("X-Model-Cache")).toBe("HIT")
  expect(await hit.arrayBuffer()).toEqual(bytes)
  expect(writes).toHaveLength(1)
  await Promise.all(pending)
  expect(attempts).toBe(2)
  expect(writes).toHaveLength(2)
})
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
