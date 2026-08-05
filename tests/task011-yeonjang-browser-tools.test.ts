import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  yeonjangBrowserActiveHintTool,
  yeonjangBrowserListTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task011 Yeonjang browser tools", () => {
  it("defines read-only Yeonjang browser tools with separated names", () => {
    expect(yeonjangBrowserListTool).toMatchObject({
      name: "yeonjang_browser_list",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["browser.list"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangBrowserActiveHintTool).toMatchObject({
      name: "yeonjang_browser_active_hint",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["browser.active_hint"],
      riskLevel: "safe",
      requiresApproval: false,
    })
  })

  it("maps each core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangBrowserListResult>("browser.list"')
    expect(source).toContain('invokeYeonjangMethod<YeonjangBrowserActiveHintResult>("browser.active_hint"')
  })

  it("keeps browser read tools gated and avoids shell-command fallback", () => {
    const nodeSource = readSource("Yeonjang/src/node.rs")
    const browserSource = readSource("Yeonjang/src/features/browser.rs")
    const readToolSource = [
      browserSource.slice(
        browserSource.indexOf("pub fn list_browsers"),
        browserSource.indexOf("pub fn open_url"),
      ),
      browserSource.slice(
        browserSource.indexOf("fn browser_candidates"),
        browserSource.indexOf("fn normalize_process_name"),
      ),
    ].join("\n")

    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_browser_read,\s*"browser\.list",\s*"allow_browser_read",\s*\)/u,
    )
    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_browser_read,\s*"browser\.active_hint",\s*"allow_browser_read",\s*\)/u,
    )
    expect(readToolSource).not.toMatch(
      /system\.exec|Command::new|ps\s|tasklist|wmic|powershell|cmd\.exe|open_url_with_platform_default/u,
    )
  })

  it("does not expose tab URLs, titles, command line, cwd, profile path, or environment fields by default", () => {
    const browserSource = readSource("Yeonjang/src/features/browser.rs")

    expect(browserSource).not.toContain("\"url\":")
    expect(browserSource).not.toContain("\"title\":")
    expect(browserSource).not.toContain("\"commandLine\":")
    expect(browserSource).not.toContain("\"profilePath\":")
    expect(browserSource).not.toContain("\"cwd\":")
    expect(browserSource).not.toContain("\"env\":")
    expect(browserSource).not.toMatch(/\.cmd\(|\.cwd\(|\.environ\(/u)
  })
})
