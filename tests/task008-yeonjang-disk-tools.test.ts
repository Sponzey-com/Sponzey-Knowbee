import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  yeonjangDiskExistsTool,
  yeonjangDiskInfoTool,
  yeonjangDiskUsageTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task008 Yeonjang disk tools", () => {
  it("defines read-only Yeonjang disk tools with separated names", () => {
    expect(yeonjangDiskInfoTool).toMatchObject({
      name: "yeonjang_disk_info",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["disk.info"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangDiskUsageTool).toMatchObject({
      name: "yeonjang_disk_usage",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["disk.usage"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangDiskExistsTool).toMatchObject({
      name: "yeonjang_disk_exists",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["disk.exists"],
      riskLevel: "safe",
      requiresApproval: false,
    })
  })

  it("maps each core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangDiskInfoResult>("disk.info"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangDiskUsageResult>("disk.usage"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangDiskExistsResult>("disk.exists"')
  })

  it("does not implement disk read-only capabilities through system.exec", () => {
    const source = readSource("Yeonjang/src/features/disk.rs")

    expect(source).not.toMatch(/system\.exec|Command::new|df\s|wmic|powershell|cmd\.exe/u)
  })
})
