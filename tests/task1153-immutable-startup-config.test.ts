import { describe, expect, it, vi } from "vitest"
import {
  createImmutableConfigSnapshot,
  createStartupConfigSource,
} from "../packages/core/src/config/startup-source.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

describe("task1153 deeply immutable startup config", () => {
  it("deeply freezes a clone without freezing the caller input", () => {
    const input = structuredClone(DEFAULT_CONFIG)
    const snapshot = createImmutableConfigSnapshot(input)

    expect(snapshot).not.toBe(input)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.ai)).toBe(true)
    expect(Object.isFrozen(snapshot.security.allowedPaths)).toBe(true)
    expect(() => snapshot.security.allowedPaths.push("/forbidden")).toThrow()
    expect(input.security.allowedPaths).toEqual([])
    input.security.allowedPaths.push("/caller-owned")
    expect(input.security.allowedPaths).toEqual(["/caller-owned"])
  })

  it("reuses an already canonical immutable snapshot", () => {
    const snapshot = createImmutableConfigSnapshot(DEFAULT_CONFIG)
    expect(createImmutableConfigSnapshot(snapshot)).toBe(snapshot)
  })

  it("stores an immutable clone after loading exactly once", () => {
    const input = structuredClone(DEFAULT_CONFIG)
    const loader = vi.fn(() => input)
    const source = createStartupConfigSource(loader)
    const snapshot = source.getSnapshot()

    expect(snapshot).not.toBe(input)
    expect(Object.isFrozen(snapshot.mqtt)).toBe(true)
    expect(source.getSnapshot()).toBe(snapshot)
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
