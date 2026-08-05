import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { functionParameterTypes } from "./fixtures/typescript-source-contract.ts"

function functionSlice(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`)
  const next = source.indexOf("\nexport async function ", start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

describe("API server env snapshot", () => {
  it("keeps server route option assembly free of direct env reads", () => {
    const source = readFileSync(new URL("../packages/core/src/api/server.ts", import.meta.url), "utf-8")
    const uiRuntimeBody = functionSlice(source, "createUiModeRuntimeInput")
    const startServerBody = source.slice(source.indexOf("export async function startServer"))

    expect(functionParameterTypes(source, "createUiModeRuntimeInput")).toEqual([[
      "ApiServerRuntimeContext",
    ]])
    expect(functionParameterTypes(source, "startServer")).toEqual([[
      "KnowbeeConfig",
      "RuntimePaths",
      "ApiServerRuntimeContext",
    ]])
    expect(uiRuntimeBody).not.toContain("process.env")
    expect(startServerBody).not.toContain("process.env")
  })
})
