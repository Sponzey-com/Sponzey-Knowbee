import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
} from "./fixtures/typescript-source-contract.ts"

const sourcePath = join(process.cwd(), "packages/core/src/api/routes/channels.ts")

function readSource(): string {
  return readFileSync(sourcePath, "utf-8")
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

describe("task0989 unsupported channel runtime boundary", () => {
  it("keeps unsupported runtime response text behind one constant", () => {
    const source = readSource()

    expect(source).toContain('const UNSUPPORTED_CHANNEL_RUNTIME_ERROR = "provider runtime is not implemented yet"')
    expect(countOccurrences(source, "provider runtime is not implemented yet")).toBe(1)
  })

  it("routes unsupported restart, enable, and disable responses through one helper", () => {
    const source = readSource()

    expect(functionParameterTypes(source, "unsupportedChannelRuntimePayload")).toEqual([[
      "ChannelConnectionRecord",
      "KnowbeeConfig",
    ]])
    expect(callArgumentCounts(source, "unsupportedChannelRuntimePayload")).toEqual([2, 2, 2])
    expect(source).toContain('recordRuntime(connection, "enable_unsupported_provider"')
    expect(source).not.toContain('error: "provider runtime is not implemented yet"')
  })
})
