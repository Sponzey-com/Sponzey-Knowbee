import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1150 CLI startup config ownership", () => {
  it("returns the resolved config from every core bootstrap entry", () => {
    const core = source("packages/core/src/runtime/bootstrap.ts")
    const root = source("packages/core/src/index.ts")

    expect(core).toContain(
      "export function bootstrap(",
    )
    expect(core).toContain("export async function bootstrapRuntime(")
    expect(core).toContain("export async function bootstrapAsync(")
    expect(core.match(/return runtimeConfig/g)).toHaveLength(3)
    expect(root).toContain("const runtimeConfig = _runtimeBootstrap(config, options)")
    expect(root).toContain("await _runtimeBootstrapRuntime(config, options)")
    expect(root).toContain("await _runtimeBootstrapAsync(config, options)")
  })

  it("uses bootstrap return values for runtime CLI commands", () => {
    const run = source("packages/cli/src/commands/run.ts")
    const schedule = source("packages/cli/src/commands/schedule.ts")
    const smoke = source("packages/cli/src/commands/smoke.ts")

    expect(run).toContain("const runtimeConfig = await bootstrapRuntime()")
    expect(schedule).toContain("const config = await bootstrapRuntime()")
    expect(smoke).toContain("const config = await resolveRuntimeConfig(dependencies.runtimeConfig)")
    expect(smoke).toContain("await core.bootstrapRuntime(config)")
    expect(smoke).not.toContain("await core.bootstrapRuntime()")
    expect(`${run}\n${schedule}\n${smoke}`).not.toContain("getConfig")
  })

  it("loads config explicitly once for non-runtime CLI inspection commands", () => {
    const index = source("packages/cli/src/index.ts")
    const doctor = source("packages/cli/src/commands/doctor.ts")
    const config = source("packages/cli/src/commands/config.ts")
    const cliSources = `${index}\n${doctor}\n${config}`

    expect(index).toContain("const paths = captureRuntimePaths()")
    expect(index).toContain(
      "const cfg = loadConfigSnapshot({ baseEnv: getCliBaseEnv(), cwd: process.cwd(), paths })",
    )
    expect(index).toContain('import { getCliBaseEnv } from "./runtime-env.js"')
    expect(index).not.toContain("baseEnv: { ...process.env }")
    expect(doctor).toContain("const processContext = core.captureStartupProcessContext()")
    expect(doctor).toContain("const config = core.loadConfigSnapshot({")
    expect(doctor).not.toContain("core.loadConfig()")
    expect(config).toContain("import type { RuntimePaths }")
    expect(config).toContain("const configPath = paths.configFile")
    expect(config).not.toContain("PATHS")
    expect(cliSources).not.toContain("getConfig")
  })
})
