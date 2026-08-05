import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1059 tool security config snapshot", () => {
  it("passes security config snapshots into file and telegram file tools", () => {
    const typesSource = source("packages/core/src/tools/types.ts")
    const dispatcherSource = source("packages/core/src/tools/dispatcher.ts")
    const fileSource = source("packages/core/src/tools/builtin/file.ts")
    const fileSearchSource = source("packages/core/src/tools/builtin/file-search.ts")
    const patchSource = source("packages/core/src/tools/builtin/patch-applier.ts")
    const telegramSource = source("packages/core/src/tools/builtin/telegram-send.ts")

    expect(typesSource).toContain("securityConfig?: SecurityConfig")
    expect(dispatcherSource).toContain("securityConfig: NonNullable<ToolContext[\"securityConfig\"]>")
    expect(legacyConfigAccesses(dispatcherSource)).toEqual([])
    expect(functionParameterTypes(dispatcherSource, "buildRuntimeToolContext")).toEqual([[
      expect.stringContaining("ctx: ToolContext"),
    ]])
    expect(functionParameterTypes(dispatcherSource, "buildRuntimeToolContext")[0]?.[0]).toContain(
      "config: ToolRuntimeConfigSnapshot",
    )
    expect(callArgumentCounts(dispatcherSource, "buildRuntimeToolContext")).toEqual([1])
    expect(dispatcherSource).toContain("const approvalRequired = this.shouldRequireApproval(")
    expect(dispatcherSource).toContain("securityConfig.approvalMode,")
    expect(dispatcherSource).toContain("capabilityDecision.approvalRequired,")
    expect(dispatcherSource).toContain("security: securityConfig")
    for (const sourceText of [fileSource, telegramSource]) {
      expect(sourceText).not.toContain("getConfig()")
      expect(sourceText).not.toContain("../../config/index.js")
    }
    expect(fileSource).toContain("assertAllowedPath(filePath, ctx.securityConfig)")
    expect(fileSource).toContain("applyPatch(parsed, ctx.workDir, ctx.securityConfig)")
    expect(fileSearchSource).toContain("assertAllowedPath(p, ctx.securityConfig)")
    expect(patchSource).toContain("assertAllowedPath(absPath, securityConfig)")
    expect(telegramSource).toContain("assertAllowedPath(filePath, ctx.securityConfig)")
  })
})
