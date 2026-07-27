import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  yeonjangProcessInfoTool,
  yeonjangProcessListTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task010 Yeonjang process tools", () => {
  it("defines read-only Yeonjang process tools with separated names", () => {
    expect(yeonjangProcessListTool).toMatchObject({
      name: "yeonjang_process_list",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["process.list"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangProcessInfoTool).toMatchObject({
      name: "yeonjang_process_info",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["process.info"],
      riskLevel: "safe",
      requiresApproval: false,
    })
  })

  it("maps each core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangProcessListResult>("process.list"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangProcessInfoResult>("process.info"')
  })

  it("keeps process read tools gated and avoids shell-command fallback", () => {
    const nodeSource = readSource("Yeonjang/src/node.rs")
    const processSource = readSource("Yeonjang/src/features/process.rs")

    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_process_read,\s*"process\.list",\s*"allow_process_read",\s*\)/u,
    )
    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_process_read,\s*"process\.info",\s*"allow_process_read",\s*\)/u,
    )
    expect(processSource).not.toMatch(/system\.exec|Command::new|ps\s|tasklist|wmic|powershell|cmd\.exe/u)
  })

  it("does not expose command line, cwd, or environment fields by default", () => {
    const processSource = readSource("Yeonjang/src/features/process.rs")

    expect(processSource).not.toContain("\"commandLine\":")
    expect(processSource).not.toContain("\"cwd\":")
    expect(processSource).not.toContain("\"env\":")
    expect(processSource).not.toMatch(/\.cmd\(|\.cwd\(|\.environ\(/u)
  })
})
