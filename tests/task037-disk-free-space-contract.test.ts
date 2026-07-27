import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { yeonjangDiskUsageTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

describe("task037 disk free-space contract", () => {
  it("uses disk.usage.availableBytes instead of a duplicate disk.free_space method", () => {
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).not.toContain("yeonjang_disk_free_space")
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).not.toContain("disk.free_space")
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toContain("yeonjang_disk_free_space")
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("disk.free_space")

    expect(yeonjangDiskUsageTool.name).toBe("yeonjang_disk_usage")
    expect(yeonjangDiskUsageTool.runtimeMethodIds).toEqual(["disk.usage"])
    expect(yeonjangDiskUsageTool.evidenceSourceKind).toBe("yeonjang")
    expect(yeonjangDiskUsageTool.requiresApproval).toBe(false)
  })

  it("keeps availableBytes in the Rust disk.usage result and no dispatch for disk.free_space", () => {
    const diskSource = readFileSync("Yeonjang/src/features/disk.rs", "utf8")
    const nodeSource = readFileSync("Yeonjang/src/node.rs", "utf8")

    expect(diskSource).toContain('"availableBytes": usage.available_bytes')
    expect(diskSource).toContain('"freeBytes": usage.free_bytes')
    expect(nodeSource).toContain('"disk.usage"')
    expect(nodeSource).not.toContain('"disk.free_space"')
  })
})
