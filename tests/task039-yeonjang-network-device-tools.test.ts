import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { yeonjangDeviceStatusTool, yeonjangNetworkStatusTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task039 Yeonjang network and device read-only tools", () => {
  it("maps network.status and device.status as safe remote Yeonjang tools", () => {
    expect(YEONJANG_TOOL_MAPPINGS.find((mapping) => mapping.toolName === "yeonjang_network_status")).toMatchObject({
      toolName: "yeonjang_network_status",
      methodIds: ["network.status"],
      group: "network",
      riskLevel: "safe",
      requiresApproval: false,
      permissionSetting: "allow_network_read",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(YEONJANG_TOOL_MAPPINGS.find((mapping) => mapping.toolName === "yeonjang_device_status")).toMatchObject({
      toolName: "yeonjang_device_status",
      methodIds: ["device.status"],
      group: "device",
      riskLevel: "safe",
      requiresApproval: false,
      permissionSetting: "allow_device_status",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(YEONJANG_SKILL_TOOL_NAMES).toEqual(expect.arrayContaining([
      "yeonjang_network_status",
      "yeonjang_device_status",
    ]))
  })

  it("defines Core tools without approval or local fallback", () => {
    expect(yeonjangNetworkStatusTool).toMatchObject({
      name: "yeonjang_network_status",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["network.status"],
      riskLevel: "safe",
      requiresApproval: false,
    })
    expect(yeonjangDeviceStatusTool).toMatchObject({
      name: "yeonjang_device_status",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["device.status"],
      riskLevel: "safe",
      requiresApproval: false,
    })

    const toolSource = source("packages/core/src/tools/builtin/yeonjang.ts")
    expect(toolSource).toContain('invokeYeonjangMethod<YeonjangNetworkStatusResult>("network.status"')
    expect(toolSource).toContain('invokeYeonjangMethod<YeonjangDeviceStatusResult>("device.status"')
  })

  it("keeps Rust implementation permission-gated and free from shell/network probes", () => {
    const nodeSource = source("Yeonjang/src/node.rs")
    const networkSource = source("Yeonjang/src/features/network.rs")
    const deviceSource = source("Yeonjang/src/features/device.rs")
    const settingsSource = source("Yeonjang/src/settings.rs")

    expect(settingsSource).toContain("pub allow_network_read: bool")
    expect(settingsSource).toContain("pub allow_device_status: bool")
    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_network_read,\s*"network\.status",\s*"allow_network_read",\s*\)/u,
    )
    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_device_status,\s*"device\.status",\s*"allow_device_status",\s*\)/u,
    )
    expect(networkSource).not.toMatch(/system\.exec|Command::new|curl|ping|fetch|reqwest|TcpStream|UdpSocket/u)
    expect(deviceSource).not.toMatch(/system\.exec|Command::new|env\(|read_to_string|canonicalize/u)
  })
})
