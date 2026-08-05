import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadEnv } from "../packages/core/src/config/index.ts"

describe("config env snapshot", () => {
  it("loads env into a local snapshot without mutating process.env", () => {
    const key = "KNOWBEE_TEST_ENV_MUTATION_GUARD"
    const before = process.env[key]

    const env = loadEnv(
      { [key]: "from-base" },
      { cwd: "/nonexistent/knowbee-config-cwd", stateDir: "/nonexistent/knowbee-config-state" },
    )

    expect(env[key]).toBe("from-base")
    expect(process.env[key]).toBe(before)
  })

  it("keeps dotenv application out of process.env mutation", () => {
    const source = readFileSync(new URL("../packages/core/src/config/index.ts", import.meta.url), "utf-8")

    expect(source).toContain("export function loadEnv(")
    expect(source).toContain("baseEnv: EnvSnapshot,")
    expect(source).not.toContain("baseEnv: EnvSnapshot = process.env")
    expect(source).not.toContain(["delete", "process.env[key]"].join(" "))
    expect(source).not.toContain(["process.env[key]", "=", "value"].join(" "))
  })

  it("does not load removed web search browser preferences into config overrides", () => {
    const configSource = readFileSync(new URL("../packages/core/src/config/index.ts", import.meta.url), "utf-8")

    expect(configSource).not.toContain("KNOWBEE_SELENIUM_BROWSER")
    expect(configSource).not.toContain("browserPreference")
    expect(configSource).not.toContain("webSearchBrowserPreference")
  })
})
