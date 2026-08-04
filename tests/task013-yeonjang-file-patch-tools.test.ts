import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { yeonjangFilePatchTool } from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task013 Yeonjang file patch tool", () => {
  it("defines an approval-gated Yeonjang file patch tool", () => {
    expect(yeonjangFilePatchTool).toMatchObject({
      name: "yeonjang_file_patch",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["file.patch"],
      riskLevel: "moderate",
      requiresApproval: true,
    })
  })

  it("maps the core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangFilePatchResult>("file.patch"')
  })

  it("keeps file patch gated by explicit Rust permission and write path policy", () => {
    const nodeSource = readSource("Yeonjang/src/node.rs")
    const fileSource = readSource("Yeonjang/src/features/file.rs")

    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_file_write,\s*"file\.patch",\s*"allow_file_write",?\s*\)/u,
    )
    expect(fileSource).toContain("PathOperation::Write")
    expect(fileSource).toContain("expected_text")
    expect(fileSource).not.toMatch(/system\.exec|Command::new|sed\s|perl\s|python\s|powershell|cmd\.exe/u)
  })
})
