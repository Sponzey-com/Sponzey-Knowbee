import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = (path: string) => readFileSync(path, "utf8")

describe("Yeonjang previous-package rollback release gate", () => {
  it("fails closed unless both exact rollback package inputs are supplied", () => {
    const gate = source("scripts/self/run-yeonjang-independent-mqtt-gate.sh")

    expect(gate).toContain("YEONJANG_ROLLBACK_GATE:-0")
    expect(gate).toContain("YEONJANG_ROLLBACK_BINARY")
    expect(gate).toContain("YEONJANG_ROLLBACK_PACKAGE_MANIFEST")
    expect(gate).toContain("rollback gate requires an executable previous package binary")
    expect(gate).toContain("rollback gate requires a previous package identity manifest")
    expect(gate).toContain("YEONJANG_TEST_ROLLBACK_BINARY")
    expect(gate).toContain("YEONJANG_TEST_ROLLBACK_PACKAGE_MANIFEST")
  })

  it("requires a distinct loaded identity and exact terminal replay without a new artifact", () => {
    const sharedGate = source("Yeonjang/tests/support/packaged_desktop_live_mqtt.rs")

    expect(sharedGate).toContain("RollbackPackageFixture")
    expect(sharedGate).toContain("verify_rollback_package_identity")
    expect(sharedGate).toContain("rollback package must differ from the current package")
    expect(sharedGate).toContain("LiveRuntime::spawn_rollback")
    expect(sharedGate).toContain('assert_eq!(replay["payload"], camera_terminal["payload"])')
    expect(sharedGate).toContain('"rollback replay must not execute a new camera effect"')
  })
})
