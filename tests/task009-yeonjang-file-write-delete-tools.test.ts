import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  yeonjangFileDeleteTool,
  yeonjangFileWriteTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task009 Yeonjang file write/delete tools", () => {
  it("defines side-effect Yeonjang file tools with approval required", () => {
    expect(yeonjangFileWriteTool).toMatchObject({
      name: "yeonjang_file_write",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["file.write"],
      riskLevel: "moderate",
      requiresApproval: true,
    })
    expect(yeonjangFileDeleteTool).toMatchObject({
      name: "yeonjang_file_delete",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["file.delete"],
      riskLevel: "dangerous",
      requiresApproval: true,
    })
  })

  it("maps each core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangFileWriteResult>("file.write"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangFileDeleteResult>("file.delete"')
  })

  it("keeps write/delete gated by explicit Rust permissions and write path policy", () => {
    const source = readSource("Yeonjang/src/node.rs")
    const fileSource = readSource("Yeonjang/src/features/file.rs")

    expect(source).toMatch(/ensure_permission\(\s*permissions\.allow_file_write,\s*"file\.write",\s*"allow_file_write",\s*\)/)
    expect(source).toMatch(/ensure_permission\(\s*permissions\.allow_file_delete,\s*"file\.delete",\s*"allow_file_delete",\s*\)/)
    expect(fileSource).toContain("PathOperation::Write")
    expect(fileSource).toContain("PathOperation::Delete")
  })
})
