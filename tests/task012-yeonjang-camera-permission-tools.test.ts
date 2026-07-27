import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { yeonjangCameraPermissionStatusTool } from "../packages/core/src/tools/builtin/yeonjang.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task012 Yeonjang camera permission status tool", () => {
  it("defines a read-only Yeonjang camera permission diagnostic tool", () => {
    expect(yeonjangCameraPermissionStatusTool).toMatchObject({
      name: "yeonjang_camera_permission_status",
      evidenceSourceKind: "yeonjang",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["camera.permission_status"],
      riskLevel: "safe",
      requiresApproval: false,
    })
  })

  it("maps the core tool to the matching Yeonjang Rust method", () => {
    const source = readSource("packages/core/src/tools/builtin/yeonjang.ts")

    expect(source).toContain('invokeYeonjangMethod<YeonjangCameraPermissionStatusResult>("camera.permission_status"')
  })

  it("keeps camera permission status gated without invoking capture", () => {
    const nodeSource = readSource("Yeonjang/src/node.rs")
    const cameraSource = readSource("Yeonjang/src/features/camera.rs")
    const permissionFunction = cameraSource.match(/pub fn permission_status\(\) -> Result<Value> \{[\s\S]*?\n\}/u)?.[0] ?? ""

    expect(nodeSource).toMatch(
      /ensure_permission\(\s*permissions\.allow_camera_access,\s*"camera\.permission_status",\s*"allow_camera_access",\s*\)/u,
    )
    expect(permissionFunction).not.toMatch(/capture_camera|CameraCaptureRequest|camera\.capture/u)
  })

  it("requires camera permission status result fields used by recovery", () => {
    const cameraSource = readSource("Yeonjang/src/features/camera.rs")

    expect(cameraSource).toContain('"status"')
    expect(cameraSource).toContain('"reason"')
    expect(cameraSource).toContain('"platform"')
    expect(cameraSource).toContain('"canAttemptCapture"')
    expect(cameraSource).toContain('"requiresUserAction"')
  })
})
