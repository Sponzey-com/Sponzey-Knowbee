import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1149 runtime composition config boundary", () => {
  it("keeps MCP reload and tool dispatcher independent from config singletons", () => {
    const registrySource = source("packages/core/src/mcp/registry.ts")
    const dispatcherSource = source("packages/core/src/tools/runtime-dispatcher.ts")
    const routeSource = source("packages/core/src/api/routes/mcp.ts")

    expect(registrySource).not.toMatch(/from ["']\.\.\/config\/index\.js["']/)
    expect(registrySource).not.toContain("getConfig")
    expect(registrySource).not.toContain("reloadConfig")
    expect(registrySource).toMatch(
      /async reloadFromConfig\(\s*config: KnowbeeConfig,\s*baseEnv\?: NodeJS\.ProcessEnv,/u,
    )

    expect(dispatcherSource).not.toContain("getConfig")
    expect(dispatcherSource).toContain("export function initializeToolDispatcher(")
    expect(dispatcherSource).toContain("new ToolDispatcher({ config, ...dependencies })")

    expect(routeSource).toContain("getApiRuntimeConfig(req)")
    expect(routeSource).toContain("mcpRegistry.reloadFromConfig(config)")
  })

  it("threads one startup snapshot through the core composition root", () => {
    const coreSource = source("packages/core/src/runtime/bootstrap.ts")
    const serverSource = source("packages/core/src/api/server.ts")

    expect(coreSource).toContain("const startupConfigSource = createStartupConfigSource(() => {")
    expect(coreSource).toContain("loadConfigSnapshot({")
    expect(coreSource).not.toContain("getConfig")
    expect(coreSource).toContain(
      "const browserFocusRuntime = resolveBootstrapBrowserFocusRuntime(options, runtimeConfig)",
    )
    expect(coreSource).toContain("browserFocusRuntime.dispatcherDependencies")
    expect(coreSource).toContain("registerBuiltinTools(dispatcher)")
    expect(coreSource).toContain("bootstrap(runtimeConfig, options)")
    expect(coreSource).toContain("await bootstrapRuntime(runtimeConfig, options)")
    expect(coreSource).toContain("createApiServerRuntimeContext(processContext, apiDependencies)")
    expect(coreSource).toContain("createDefaultLiveAcceptanceBootstrapDependencies")

    expect(serverSource).toContain("runtime: ApiServerRuntimeContext")
    expect(serverSource).not.toContain('from "../config/index.js"')
    expect(serverSource).not.toContain("getConfig()")
  })

  it("requires explicit one-time initialization before dispatcher use", async () => {
    vi.resetModules()
    const runtime = await import("../packages/core/src/tools/runtime-dispatcher.ts")

    expect(() => runtime.getToolDispatcher()).toThrow("Tool dispatcher is not initialized")
    expect(() => runtime.toolDispatcher.getAll()).toThrow("Tool dispatcher is not initialized")

    const initialized = runtime.initializeToolDispatcher(DEFAULT_CONFIG)
    expect(runtime.getToolDispatcher()).toBe(initialized)
    expect(runtime.initializeToolDispatcher(DEFAULT_CONFIG)).toBe(initialized)
    expect(() => runtime.initializeToolDispatcher({ ...DEFAULT_CONFIG })).toThrow(
      "Tool dispatcher is already initialized with a different config snapshot",
    )
  })
})
