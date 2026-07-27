import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1100 plugin loader requires config", () => {
  it("removes plugin loader config fallback and keeps callers explicit", () => {
    const loaderSource = readFileSync("packages/core/src/plugins/loader.ts", "utf-8")
    const serverSource = readFileSync("packages/core/src/api/server.ts", "utf-8")
    const pluginsRouteSource = readFileSync("packages/core/src/api/routes/plugins.ts", "utf-8")

    expect(loaderSource).toContain("interface PluginLoaderRuntimeOptions {\n  config: KnowbeeConfig\n}")
    expect(loaderSource).toContain("async loadAll(options: PluginLoaderRuntimeOptions): Promise<void>")
    expect(loaderSource).toContain("async load(meta: PluginMeta, options: PluginLoaderRuntimeOptions): Promise<void>")
    expect(loaderSource).toContain("async enable(name: string, options: PluginLoaderRuntimeOptions): Promise<void>")
    expect(loaderSource).toContain("const config = options.config")
    expect(loaderSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(loaderSource).not.toContain("options.config ?? getConfig()")

    expect(serverSource).toContain("await pluginLoader.loadAll({ config: cfg })")
    expect(pluginsRouteSource).toContain("await pluginLoader.enable(name, { config })")
    expect(pluginsRouteSource).not.toContain("pluginLoader.enable(name)")
  })
})
