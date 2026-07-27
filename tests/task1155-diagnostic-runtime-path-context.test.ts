import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import Fastify from "../packages/core/node_modules/fastify/fastify.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  getApiRuntimeConfig,
  getApiRuntimePaths,
  installApiRuntimeConfig,
} from "../packages/core/src/api/runtime-context.ts"

describe("task1155 diagnostic runtime path context", () => {
  it("installs one immutable config and path pair", () => {
    const app = Fastify({ logger: false })
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: "/runtime/task1155" },
      { homeDir: "/home/test", exists: () => false },
    )
    installApiRuntimeConfig(app, DEFAULT_CONFIG, paths)
    const request = { server: app }

    expect(getApiRuntimeConfig(request)).toBe(DEFAULT_CONFIG)
    expect(getApiRuntimePaths(request)).toBe(paths)
    expect(() => installApiRuntimeConfig(app, DEFAULT_CONFIG, paths)).toThrow(
      "API runtime config context is already installed",
    )
  })

  it("requires explicit paths across manifest, doctor, and API composition", () => {
    const manifest = readFileSync("packages/core/src/runtime/manifest.ts", "utf-8")
    const doctor = readFileSync("packages/core/src/diagnostics/doctor.ts", "utf-8")
    const doctorRoute = readFileSync("packages/core/src/api/routes/doctor.ts", "utf-8")
    const server = readFileSync("packages/core/src/api/server.ts", "utf-8")
    const core = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf-8")

    expect(manifest).toContain("paths: RuntimePaths")
    expect(manifest).not.toContain("PATHS")
    expect(doctor).not.toContain("PATHS")
    expect(doctorRoute).toContain("getApiRuntimePaths(req)")
    expect(doctorRoute).not.toContain("PATHS")
    expect(server).toContain("runtime: ApiServerRuntimeContext")
    expect(core).toContain("paths: runtimePaths")
    expect(core).toContain("createApiServerRuntimeContext(processContext, apiDependencies)")
  })

  it("removes root-run ad hoc manifest construction", () => {
    const store = readFileSync("packages/core/src/runs/store.ts", "utf-8")

    expect(store).not.toContain("runtimeManifestConfig")
    expect(store).not.toContain("refreshRuntimeManifest")
  })
})
