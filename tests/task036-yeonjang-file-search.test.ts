import { describe, expect, it } from "vitest"

import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS, isYeonjangLiveSmokeReadOnlyMethod } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { fileSearchTool } from "../packages/core/src/tools/builtin/file-search.ts"
import { yeonjangFileSearchTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

describe("task036 Yeonjang remote file search", () => {
  it("exposes yeonjang_file_search as a remote read-only Yeonjang skill tool", () => {
    const mapping = YEONJANG_TOOL_MAPPINGS.find((entry) => entry.toolName === "yeonjang_file_search")

    expect(mapping).toMatchObject({
      toolName: "yeonjang_file_search",
      methodIds: ["file.search"],
      group: "files",
      riskLevel: "safe",
      requiresApproval: false,
      permissionSetting: "allow_file_read",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_file_search")
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toContain("file_search")
  })

  it("keeps remote Yeonjang search separate from local workspace file search", () => {
    expect(yeonjangFileSearchTool.name).toBe("yeonjang_file_search")
    expect(yeonjangFileSearchTool.evidenceSourceKind).toBe("yeonjang")
    expect(yeonjangFileSearchTool.runtimeHealthMode).toBe("required")
    expect(yeonjangFileSearchTool.runtimeMethodIds).toEqual(["file.search"])
    expect(yeonjangFileSearchTool.riskLevel).toBe("safe")
    expect(yeonjangFileSearchTool.requiresApproval).toBe(false)
    expect(yeonjangFileSearchTool.parameters.required).toEqual(["path", "query"])

    expect(fileSearchTool.name).toBe("file_search")
    expect(fileSearchTool.evidenceSourceKind).toBe("file")
  })

  it("allows file.search in live read-only smoke scenarios", () => {
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).toContain("file.search")
    expect(isYeonjangLiveSmokeReadOnlyMethod("file.search")).toBe(true)
  })
})
