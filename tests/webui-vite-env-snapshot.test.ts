import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("WebUI Vite env snapshot", () => {
  it("keeps the Vite config object free of direct env reads", () => {
    const source = readFileSync(new URL("../packages/webui/vite.config.ts", import.meta.url), "utf-8")
    const configBody = source.slice(source.indexOf("export default defineConfig"))

    expect(source).toContain("const VITE_RUNTIME_ENV")
    expect(configBody).not.toContain("process.env")
  })
})
