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
      runtimeMethodIds: ["camera.permission_status", "camera.capture"],
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
    const permissionFunction = cameraSource.match(/pub fn permission_status\([^)]*\) -> Result<Value> \{[\s\S]*?\n\}/u)?.[0] ?? ""

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

  it("delegates permission status to the platform backend instead of returning a fixed unknown value", () => {
    const cameraSource = readSource("Yeonjang/src/features/camera.rs")

    expect(cameraSource).toContain("backend.camera_permission_status()")
    expect(cameraSource).not.toContain('"os_permission_status_unavailable"')
  })

  it("keeps the bundled macOS permission-status command read-only", () => {
    const helperSource = readSource("Yeonjang/helpers/macos/camera_capture_helper.swift")
    const statusBranch =
      helperSource.match(
        /if args == \["--permission-status"\] \{[\s\S]*?(?=\n\}\n\n(?:guard|var|let))/u,
      )?.[0] ?? ""

    expect(statusBranch).toContain("AVCaptureDevice.authorizationStatus(for: .video)")
    expect(statusBranch).toContain("canAttemptCapture")
    expect(statusBranch).toContain("requiresUserAction")
    expect(statusBranch).not.toContain("requestAccess")
    expect(statusBranch).not.toContain("capturePhoto")
  })

  it("uses the request capture budget instead of independent macOS and Swift timeouts", () => {
    const macosSource = readSource("Yeonjang/src/platform/macos.rs")
    const helperSource = readSource("Yeonjang/helpers/macos/camera_capture_helper.swift")

    expect(macosSource).not.toContain("timeout: Duration::from_secs(25)")
    expect(macosSource).toContain("CameraCaptureBudget::from_millis")
    expect(helperSource).toContain('"--capture-timeout-ms"')
    expect(helperSource).not.toContain("timeoutSeconds: 60")
  })
})
