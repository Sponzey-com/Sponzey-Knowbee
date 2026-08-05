import { describe, expect, it } from "vitest"
import {
  buildToolAuthorizationBinding,
} from "../packages/core/src/tools/authorization-binding.ts"

describe("tool authorization binding", () => {
  it("preserves the exact legacy params object when there is no execution target", () => {
    const params = { artifactRef: "artifact:opaque", timeoutSec: 30 }

    expect(buildToolAuthorizationBinding(params)).toBe(params)
  })

  it("projects canonical params and an exact validated target into one binding", () => {
    const params = { artifactRef: "artifact:opaque" }
    const executionTargetFingerprint = `sha256:${"a".repeat(64)}` as const

    expect(buildToolAuthorizationBinding(params, {
      executionTargetFingerprint,
    })).toEqual({
      toolParams: params,
      executionTargetFingerprint,
    })
  })

  it.each([
    "a".repeat(64),
    `sha256:${"A".repeat(64)}`,
    `sha256:${"a".repeat(63)}`,
    `sha256:sha256:${"a".repeat(64)}`,
  ])("rejects malformed target fingerprint %s", (executionTargetFingerprint) => {
    expect(buildToolAuthorizationBinding(
      {},
      { executionTargetFingerprint: executionTargetFingerprint as `sha256:${string}` },
    )).toBeNull()
  })
})
