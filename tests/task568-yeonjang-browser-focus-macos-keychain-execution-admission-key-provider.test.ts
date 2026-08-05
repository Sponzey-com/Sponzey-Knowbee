import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task568 browser.focus execution admission secret storage", () => {
  it("does not retain the removed macOS Keychain provider or helper", () => {
    expect(existsSync(
      "packages/core/src/yeonjang/macos-keychain-execution-admission-key-provider.ts",
    )).toBe(false)
    expect(existsSync(
      "Yeonjang/helpers/macos/keychain_execution_admission_helper.swift",
    )).toBe(false)
    expect(existsSync("scripts/verify-yeonjang-browser-focus-macos.mjs")).toBe(false)
    expect(readFileSync(
      "packages/core/src/yeonjang/browser-focus-runtime-bootstrap.ts",
      "utf8",
    ).toLowerCase()).not.toContain("keychain")
  })
})
