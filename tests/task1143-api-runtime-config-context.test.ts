import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  getApiRuntimeConfig,
  installApiRuntimeConfig,
} from "../packages/core/src/api/runtime-context.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1143 API runtime config context", () => {
  it("keeps the startup config object in an immutable Fastify context", () => {
    const app = {
      hasDecorator: () => false,
      decorate: (_name: string, value: unknown) => {
        app.knowbeeRuntimeContext = value
      },
      knowbeeRuntimeContext: undefined as unknown,
    }

    const paths = createRuntimePaths({}, { homeDir: "/tmp/knowbee-task1143", exists: () => false })
    const context = installApiRuntimeConfig(app as never, DEFAULT_CONFIG, paths)
    expect(Object.isFrozen(context)).toBe(true)
    expect(context.config).toBe(DEFAULT_CONFIG)
    expect(getApiRuntimeConfig({ server: app } as never)).toBe(DEFAULT_CONFIG)
  })

  it("installs context before routes and removes request-time singleton reads", () => {
    const server = source("packages/core/src/api/server.ts")
    const auth = source("packages/core/src/api/middleware/auth.ts")
    const status = source("packages/core/src/api/routes/status.ts")
    const capabilities = source("packages/core/src/api/routes/capabilities.ts")
    const doctor = source("packages/core/src/api/routes/doctor.ts")

    expect(server.indexOf("installApiRuntimeConfig(server, cfg, paths)")).toBeGreaterThan(-1)
    expect(server.indexOf("installApiRuntimeConfig(server, cfg, paths)")).toBeLessThan(server.indexOf("registerStatusRoute("))
    for (const routeSource of [auth, status, capabilities, doctor]) {
      expect(routeSource).not.toContain("getConfig()")
      expect(routeSource).toContain("getApiRuntimeConfig")
    }
  })

  it("rejects requests whose Fastify instance has no runtime context", () => {
    expect(() => getApiRuntimeConfig({ server: {} } as never)).toThrow(
      "API runtime config context is not installed",
    )
  })
})
