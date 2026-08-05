import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1088 plugin loader config snapshot", () => {
  it("captures config snapshots when loading plugin contexts", () => {
    const loaderSource = readFileSync("packages/core/src/plugins/loader.ts", "utf-8")
    const serverSource = readFileSync("packages/core/src/api/server.ts", "utf-8")
    const pluginsRouteSource = readFileSync("packages/core/src/api/routes/plugins.ts", "utf-8")

    expect(loaderSource).toContain("import type { KnowbeeConfig } from \"../config/types.js\"")
    expect(loaderSource).toContain("interface PluginLoaderRuntimeOptions")
    expect(loaderSource).toContain("async loadAll(options: PluginLoaderRuntimeOptions): Promise<void>")
    expect(loaderSource).toContain("const config = options.config")
    expect(loaderSource).toContain("await this.load(meta, { config })")
    expect(loaderSource).toContain("async load(meta: PluginMeta, options: PluginLoaderRuntimeOptions): Promise<void>")
    expect(loaderSource).toContain("async enable(name: string, options: PluginLoaderRuntimeOptions): Promise<void>")
    expect(loaderSource).toContain("private buildContext(meta: PluginMeta, config: KnowbeeConfig): PluginContext")
    expect(loaderSource).toContain("const cfg = config as unknown as Record<string, unknown>")
    expect(loaderSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(loaderSource).not.toContain("options.config ?? getConfig()")
    expect(loaderSource).not.toContain("const cfg = getConfig() as unknown as Record<string, unknown>")

    expect(serverSource).toContain("await pluginLoader.loadAll({ config: cfg })")
    expect(pluginsRouteSource).toContain("import { getApiRuntimeConfig } from \"../runtime-context.js\"")
    expect(pluginsRouteSource).toContain("const config = getApiRuntimeConfig(req)")
    expect(pluginsRouteSource).not.toContain("getConfig")
    expect(pluginsRouteSource).toContain("await pluginLoader.enable(name, { config })")
  })
})
