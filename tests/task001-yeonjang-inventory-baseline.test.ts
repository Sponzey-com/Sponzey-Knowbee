import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"

interface YeonjangInventory {
  schemaVersion: 1
  protocolVersion: string
  rustMethods: string[]
  permissionSettings: string[]
  pathAccessSettings: string[]
  skillTools: string[]
  projectionGroups: string[]
  knownCapabilityGaps: Array<{ capability: string; reason: string }>
}

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

function inventory(): YeonjangInventory {
  return JSON.parse(readText("docs/yeonjang/capability-inventory.json")) as YeonjangInventory
}

function rustMethodsFromCanonicalDescriptor(): string[] {
  const source = readText("Yeonjang/src/method_descriptor.rs")
  const inventoryBody = source.match(
    /const ALL_METHOD_NAMES: &\[&str\] = &\[(?<body>[\s\S]*?)\];/u,
  )?.groups?.body ?? ""
  return [...inventoryBody.matchAll(/"([a-z]+\.[a-z_]+)"/gu)]
    .map((match) => match[1])
    .filter((method): method is string => Boolean(method))
    .filter((method, index, methods) => methods.indexOf(method) === index)
    .sort()
}

function permissionSettingsFromRustSource(): string[] {
  const source = readText("Yeonjang/src/settings.rs")
  const structBody = source.match(/pub struct PermissionSettings \{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? ""
  return [...structBody.matchAll(/pub (allow_[a-z_]+): bool,/gu)]
    .map((match) => match[1])
    .filter((field): field is string => Boolean(field))
    .sort()
}

function pathAccessSettingsFromRustSource(): string[] {
  const source = readText("Yeonjang/src/settings.rs")
  const structBody = source.match(/pub struct PathAccessSettings \{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? ""
  return [...structBody.matchAll(/pub ([a-z_]+): (?:Vec<String>|u64|bool),/gu)]
    .map((match) => match[1])
    .filter((field): field is string => Boolean(field))
    .sort()
}

describe("task001 Yeonjang inventory baseline", () => {
  it("records the current Rust capability methods as an explicit baseline", () => {
    const baseline = inventory()

    expect(baseline.protocolVersion).toBe("2026-04-16.capability-matrix.v1")
    expect(baseline.rustMethods).toEqual(rustMethodsFromCanonicalDescriptor())
    expect(baseline.rustMethods).toEqual([
      "application.launch",
      "browser.active_hint",
      "browser.active_tab_info",
      "browser.focus",
      "browser.list",
      "browser.open_url",
      "camera.capture",
      "camera.list",
      "camera.permission_status",
      "clipboard.read",
      "clipboard.write",
      "device.status",
      "disk.exists",
      "disk.info",
      "disk.usage",
      "file.delete",
      "file.list",
      "file.metadata",
      "file.patch",
      "file.read",
      "file.search",
      "file.write",
      "input.focused_target",
      "keyboard.action",
      "keyboard.type",
      "mouse.action",
      "mouse.click",
      "mouse.move",
      "mouse.position",
      "network.status",
      "node.capabilities",
      "node.ping",
      "process.info",
      "process.list",
      "screen.capture",
      "system.control",
      "system.exec",
      "system.info",
    ])
  })

  it("records current permission settings and the planned permission gaps", () => {
    const baseline = inventory()

    expect(baseline.permissionSettings).toEqual(permissionSettingsFromRustSource())
    expect(baseline.permissionSettings).toEqual([
      "allow_application_launch",
      "allow_browser_control",
      "allow_browser_read",
      "allow_camera_access",
      "allow_clipboard_read",
      "allow_clipboard_write",
      "allow_device_status",
      "allow_disk_read",
      "allow_file_delete",
      "allow_file_read",
      "allow_file_write",
      "allow_keyboard_control",
      "allow_mouse_control",
      "allow_network_read",
      "allow_process_control",
      "allow_process_read",
      "allow_screen_capture",
      "allow_shell_exec",
      "allow_system_control",
    ])
    expect(baseline.knownCapabilityGaps.map((gap) => gap.capability)).toEqual(expect.arrayContaining([
    ]))
  })

  it("keeps the built-in Yeonjang skill list aligned with the current inventory", () => {
    const baseline = inventory()

    expect(baseline.skillTools).toEqual([...YEONJANG_SKILL_TOOL_NAMES])
    expect(baseline.skillTools).not.toEqual(expect.arrayContaining([
      "yeonjang_process_kill",
    ]))
  })

  it("documents projection groups without exposing raw internals as default UI contract", () => {
    const baseline = inventory()

    expect(baseline.projectionGroups).toEqual([
      "applications",
      "browser",
      "clipboard",
      "device",
      "disk",
      "files",
      "input",
      "network",
      "process",
      "screen",
      "system",
    ])
    expect(baseline.knownCapabilityGaps.every((gap) => gap.reason.trim().length > 0)).toBe(true)
  })

  it("records the fail-closed path access settings used before file capability implementation", () => {
    const baseline = inventory()

    expect(baseline.pathAccessSettings).toEqual(pathAccessSettingsFromRustSource())
    expect(baseline.pathAccessSettings).toEqual([
      "allow_hidden_files",
      "allowed_read_paths",
      "allowed_write_paths",
      "denied_paths",
      "follow_symlinks",
      "max_read_bytes",
      "max_write_bytes",
    ])
  })
})
