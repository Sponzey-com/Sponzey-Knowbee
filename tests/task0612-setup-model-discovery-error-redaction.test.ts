import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0612 setup model discovery error redaction", () => {
  it("redacts model discovery exceptions before setup capability errors", () => {
    const source = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const discoveryStart = source.indexOf("export async function discoverModelsFromEndpoint")
    const discovery = source.slice(discoveryStart, discoveryStart + 4_000)

    expect(source).toContain("function controlPlaneModelDiscoveryErrorMessage(error: unknown): string")
    expect(discovery).toContain("const message = controlPlaneModelDiscoveryErrorMessage(error)")
    expect(discovery).toContain("errors.push(`${candidate}: ${message}`)")
    expect(discovery).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(discovery).not.toContain("errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`)")
  })
})
