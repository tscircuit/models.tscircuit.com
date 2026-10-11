const origin = process.env.DEPLOYMENT_URL ?? "https://models.tscircuit.com"
const model = "spurgear16_m1mm_w4mm"
const page = await fetch(`${origin}/${model}`)
if (!page.ok || !page.headers.get("content-type")?.includes("text/html"))
  throw new Error(`Model page failed: ${page.status}`)
for (const extension of ["glb", "step", "x_t"]) {
  const url = `${origin}/${model}.${extension}`
  const first = await fetch(url)
  if (!first.ok) throw new Error(`${extension}: HTTP ${first.status}`)
  const bytes = new Uint8Array(await first.arrayBuffer())
  const text = new TextDecoder().decode(bytes.slice(0, 256))
  if (extension === "glb" && new DataView(bytes.buffer).getUint32(0, true) !== 0x46546c67)
    throw new Error("GLB signature missing")
  if (extension === "step" && !text.startsWith("ISO-10303-21;"))
    throw new Error("STEP signature missing")
  if (extension === "x_t" && !text.startsWith("T51 : TRANSMIT FILE"))
    throw new Error("Parasolid header missing")
  if (!first.headers.get("cache-control")?.includes("max-age=604800"))
    throw new Error("Seven-day cache header missing")
  let hit = false
  for (let attempt = 0; attempt < 15; attempt++) {
    const second = await fetch(url)
    const cached = new Uint8Array(await second.arrayBuffer())
    if (second.headers.get("x-model-cache") === "HIT") {
      if (cached.length !== bytes.length || cached.some((value, index) => value !== bytes[index]))
        throw new Error(`${extension}: cache returned different bytes`)
      hit = true
      break
    }
    await Bun.sleep(5000)
  }
  if (!hit) throw new Error(`${extension}: no KV HIT after retries`)
  console.log(`${extension}: valid export, seven-day caching, identical KV HIT`)
}
console.log("Live model page and all export routes passed.")
