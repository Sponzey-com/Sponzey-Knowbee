import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  getGatewayReadinessSnapshot,
  markGatewayFailed,
  markGatewayReady,
  markGatewayStarting,
} from "../packages/core/src/runtime/gateway-readiness.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

function packageJson(path: string): Record<string, unknown> {
  return JSON.parse(source(path)) as Record<string, unknown>
}

describe("Gateway startup entry contract", () => {
  it("routes serve and start through a lightweight launcher", () => {
    const pkg = packageJson("packages/cli/package.json")
    const launcher = source("packages/cli/src/launcher.ts")
    const serveEntry = source("packages/cli/src/serve-entry.ts")

    expect(pkg.main).toBe("./dist/launcher.js")
    expect(pkg.bin).toEqual({
      knowbee: "./dist/launcher.js",
      wizby: "./dist/launcher.js",
      howie: "./dist/launcher.js",
    })
    expect(launcher).toContain('command === "serve" || command === "start"')
    expect(launcher).toContain('"@knowbee/core/serve"')
    expect(launcher).toContain('await import("./index.js")')
    expect(launcher).not.toContain('from "./index.js"')
    expect(serveEntry).toContain('import { serveCommand } from "./commands/serve.js"')
    expect(source("packages/cli/src/commands/service/index.ts")).toContain(
      'resolve(distDir, "launcher.js")',
    )
  })

  it("loads the purpose-specific Core bootstrap export instead of the root barrel", () => {
    const serve = source("packages/cli/src/commands/serve.ts")
    const daemonError = source("packages/cli/src/daemon-error.ts")
    const corePackage = packageJson("packages/core/package.json")
    const exports = corePackage.exports as Record<string, unknown>

    expect(serve).toContain('await import("@knowbee/core/bootstrap")')
    expect(serve).not.toContain('await import("@knowbee/core")')
    expect(daemonError).toContain('from "@knowbee/core/errors"')
    expect(exports).toHaveProperty("./bootstrap")
    expect(exports).toHaveProperty("./errors")
  })

  it("records loading_runtime before importing the heavy Core bootstrap graph", () => {
    const serve = source("packages/cli/src/commands/serve.ts")
    const corePackage = packageJson("packages/core/package.json")
    const exports = corePackage.exports as Record<string, unknown>
    const startupImport = serve.indexOf('await import("@knowbee/core/startup")')
    const bootstrapImport = serve.indexOf('await import("@knowbee/core/bootstrap")')

    expect(exports).toHaveProperty("./startup")
    expect(startupImport).toBeGreaterThan(0)
    expect(bootstrapImport).toBeGreaterThan(startupImport)
    expect(serve.slice(startupImport, bootstrapImport)).toContain("startGatewayStartup")
    expect(serve).toContain("startupProgress: startup.progress")
  })

  it("launches the resolved Node runtime directly and observes verified readiness", () => {
    const script = source("scripts/knowbee-start.sh")

    expect(script).toContain("NODE_RUNTIME_PATH=")
    expect(script).toContain(
      'exec nohup "$NODE_RUNTIME_PATH" packages/core/dist/runtime/serve-bundle.js',
    )
    expect(script).toContain("pnpm run gateway:bundle")
    expect(script).toContain("scripts/self/observe-gateway-startup.mjs")
    expect(script).toContain("verify_gateway_health")
    expect(script).not.toContain("GATEWAY_STARTUP_TIMEOUT_SECONDS")
    expect(script).not.toContain("node packages/cli/dist/index.js serve")
  })

  it("marks the Gateway ready only after required post-listen bootstrap completes", () => {
    const server = source("packages/core/src/api/server.ts")
    const status = source("packages/core/src/api/routes/status.ts")
    const pluginLoad = server.indexOf("await pluginLoader.loadAll({ config: cfg })")
    const ready = server.indexOf("markGatewayReady()")
    const started = server.indexOf('eventBus.emit("gateway.started"')

    expect(status).toContain('app.get("/api/ready"')
    expect(status).toContain("getGatewayReadinessSnapshot")
    expect(pluginLoad).toBeGreaterThan(0)
    expect(ready).toBeGreaterThan(pluginLoad)
    expect(started).toBeGreaterThan(ready)
  })

  it("keeps readiness transitions explicit and independently observable", () => {
    expect(markGatewayStarting()).toMatchObject({
      status: "starting",
      reasonCode: "bootstrap_pending",
    })
    expect(markGatewayFailed("post_listen_bootstrap_failed")).toMatchObject({
      status: "accepted",
      readiness: {
        status: "failed",
        reasonCode: "post_listen_bootstrap_failed",
      },
    })
    expect(markGatewayReady()).toMatchObject({
      status: "rejected",
      reasonCode: "terminal_state_exit_forbidden",
    })
    expect(getGatewayReadinessSnapshot().status).toBe("failed")

    markGatewayStarting()
    expect(markGatewayReady()).toMatchObject({
      status: "accepted",
      readiness: {
        status: "ready",
        reasonCode: null,
      },
    })
    expect(getGatewayReadinessSnapshot().status).toBe("ready")
  })
})
