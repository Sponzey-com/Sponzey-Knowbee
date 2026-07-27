import { describe, expect, it } from "vitest"
import {
  normalizeLogPurposeVisibility,
  redactLogText,
} from "../packages/core/src/logger/index.ts"

describe("task0905 logger purpose policy regression", () => {
  it("normalizes product, debug, and development log purpose visibility", () => {
    expect(normalizeLogPurposeVisibility("product")).toBe("product")
    expect(normalizeLogPurposeVisibility("debug")).toBe("debug")
    expect(normalizeLogPurposeVisibility("development")).toBe("development")
    expect(normalizeLogPurposeVisibility("dev")).toBe("development")
    expect(normalizeLogPurposeVisibility("unknown", "debug")).toBe("debug")
  })

  it("redacts product log text more strictly than debug log text", () => {
    const raw = [
      "runId=run-123",
      "sessionId=session-456",
      "path=/Users/example/private/project/file.txt",
      "token=sk-12345678901234567890",
    ].join(" ")

    const product = redactLogText(raw, "product")
    expect(product).toContain("runId=[id-redacted]")
    expect(product).toContain("sessionId=[id-redacted]")
    expect(product).toContain("[internal-path-redacted]")
    expect(product).toContain("token=***")
    expect(product).not.toContain("/Users/example")
    expect(product).not.toContain("sk-12345678901234567890")

    const debug = redactLogText(raw, "debug")
    expect(debug).toContain("runId=run-123")
    expect(debug).toContain("sessionId=session-456")
    expect(debug).toContain("[internal-path-redacted]")
    expect(debug).toContain("token=***")
    expect(debug).not.toContain("/Users/example")
    expect(debug).not.toContain("sk-12345678901234567890")
  })
})
