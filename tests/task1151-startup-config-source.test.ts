import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createStartupConfigSource } from "../packages/core/src/config/startup-source.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

describe("task1151 startup config source", () => {
  it("loads and returns one stable startup snapshot", () => {
    const loader = vi.fn(() => DEFAULT_CONFIG)
    const source = createStartupConfigSource(loader)

    expect(source.getState()).toBe("empty")
    const snapshot = source.getSnapshot()
    expect(snapshot).not.toBe(DEFAULT_CONFIG)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(source.getState()).toBe("ready")
    expect(source.getSnapshot()).toBe(snapshot)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it("keeps loader failure terminal instead of retrying implicitly", () => {
    const failure = new Error("config unavailable")
    const loader = vi.fn(() => {
      throw failure
    })
    const source = createStartupConfigSource(loader)

    expect(() => source.getSnapshot()).toThrow(failure)
    expect(source.getState()).toBe("failed")
    expect(() => source.getSnapshot()).toThrow(failure)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it("rejects reentrant loading instead of starting a second load", () => {
    let source: ReturnType<typeof createStartupConfigSource>
    source = createStartupConfigSource(() => source.getSnapshot())

    expect(() => source.getSnapshot()).toThrow("startup_config_load_reentrant")
    expect(source.getState()).toBe("failed")
  })

  it("removes mutable config cache access from the core composition root", () => {
    const composition = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf-8")

    expect(composition).toContain("createStartupConfigSource(() => {")
    expect(composition).toContain("loadConfigSnapshot({")
    expect(composition).toContain("startupConfigSource.getSnapshot()")
    expect(composition).not.toContain("getConfig")
    expect(composition).not.toContain("reloadConfig")
  })
})
