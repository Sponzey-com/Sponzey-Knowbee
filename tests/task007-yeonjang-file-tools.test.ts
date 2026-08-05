import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  yeonjangFileListTool,
  yeonjangFileMetadataTool,
  yeonjangFileReadTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task007 Yeonjang file tools", () => {
  it("defines read-only Yeonjang file tools with separated names", () => {
    expect(yeonjangFileMetadataTool).toMatchObject({
      name: "yeonjang_file_metadata",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["file.metadata"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangFileListTool).toMatchObject({
      name: "yeonjang_file_list",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["file.list"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangFileReadTool).toMatchObject({
      name: "yeonjang_file_read",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["file.read"],
      riskLevel: "safe",
      requiresApproval: false,
    })
  })

  it("maps each core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangFileMetadataResult>("file.metadata"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangFileListResult>("file.list"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangFileReadResult>("file.read"')
  })

  it("keeps Yeonjang file tools read-only at the core boundary", () => {
    const toolNames = [
      yeonjangFileMetadataTool.name,
      yeonjangFileListTool.name,
      yeonjangFileReadTool.name,
    ]

    expect(toolNames).not.toEqual(expect.arrayContaining([
      "file_read",
      "file_write",
      "yeonjang_file_write",
      "yeonjang_file_delete",
    ]))
  })
})
