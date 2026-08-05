import { describe, expect, it } from "vitest"

import {
  classifyYeonjangCapabilityMethod,
  normalizeYeonjangCapabilityMatrix,
} from "../packages/core/src/capabilities/yeonjang-capability-schema.ts"

describe("task002 Yeonjang capability schema", () => {
  it("normalizes structured capability matrix entries into reviewable capability contracts", () => {
    const result = normalizeYeonjangCapabilityMatrix({
      capabilityMatrix: {
        "screen.capture": {
          supported: true,
          supportState: "supported",
          requiresApproval: true,
          requiresPermission: true,
          permissionSetting: "allow_screen_capture",
          outputModes: ["base64", "file"],
          lastCheckedAt: 10,
        },
      },
    })

    expect(result.issues).toEqual([])
    expect(result.capabilities).toEqual([
      expect.objectContaining({
        capabilityId: "yeonjang:screen.capture",
        method: "screen.capture",
        group: "screen",
        riskLevel: "moderate",
        sideEffectClass: "screen_read",
        supportState: "supported",
        permissionSetting: "allow_screen_capture",
        compatibilityMode: "structured_matrix",
      }),
    ])
  })

  it("reports invalid enum fields instead of silently accepting unsafe schema drift", () => {
    const result = normalizeYeonjangCapabilityMatrix({
      capabilityMatrix: {
        "file.delete": {
          supported: true,
          supportState: "ready",
          requiresApproval: true,
        },
      },
    })

    expect(result.capabilities[0]).toMatchObject({
      method: "file.delete",
      group: "files",
      riskLevel: "dangerous",
      sideEffectClass: "delete_local",
      supportState: "unknown",
    })
    expect(result.issues).toEqual([
      expect.objectContaining({
        method: "file.delete",
        reasonCode: "invalid_support_state",
      }),
    ])
  })

  it("keeps legacy methods compatible but marks the migration gap", () => {
    const result = normalizeYeonjangCapabilityMatrix({
      methods: [
        { name: "camera.capture", implemented: true },
        { name: "browser.list", implemented: false },
      ],
    })

    expect(result.capabilities).toEqual([
      expect.objectContaining({
        method: "browser.list",
        group: "browser",
        supportState: "unsupported",
        compatibilityMode: "legacy_methods_only",
      }),
      expect.objectContaining({
        method: "camera.capture",
        group: "camera",
        supportState: "supported",
        compatibilityMode: "legacy_methods_only",
      }),
    ])
    expect(result.issues).toEqual([
      expect.objectContaining({ reasonCode: "legacy_methods_only" }),
    ])
  })

  it("classifies planned remote computer resources before their Rust implementation exists", () => {
    expect(classifyYeonjangCapabilityMethod("file.read")).toMatchObject({
      group: "files",
      riskLevel: "safe",
      sideEffectClass: "read_local",
    })
    expect(classifyYeonjangCapabilityMethod("file.write")).toMatchObject({
      group: "files",
      riskLevel: "moderate",
      sideEffectClass: "write_local",
    })
    expect(classifyYeonjangCapabilityMethod("disk.info")).toMatchObject({
      group: "disk",
      riskLevel: "safe",
      sideEffectClass: "read_local",
    })
    expect(classifyYeonjangCapabilityMethod("browser.list")).toMatchObject({
      group: "browser",
      riskLevel: "safe",
      sideEffectClass: "read_local",
    })
    expect(classifyYeonjangCapabilityMethod("process.kill")).toMatchObject({
      group: "process",
      riskLevel: "dangerous",
      sideEffectClass: "process_control",
    })
  })
})
