import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

async function importLoggerForCase(caseName: string) {
  expect(caseName).toBeTruthy()
  vi.resetModules()
  return import("../packages/core/src/logger/index.ts")
}

function captureStdout() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true)
}

function captureStderr() {
  return vi.spyOn(process.stderr, "write").mockImplementation(() => true)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("logger policy", () => {
  it("captures env-backed logger policy once at module initialization", () => {
    const source = readFileSync(new URL("../packages/core/src/logger/index.ts", import.meta.url), "utf-8")

    expect(source).toContain("const LOG_POLICY =")
    expect(source).toContain("const LOGGER_PROCESS")
    expect(source).toContain("const LOGGER_RUNTIME_ENV")
    expect(source).toContain('logLevel: LOGGER_PROCESS?.env["KNOWBEE_LOG_LEVEL"]')
    expect(source).toContain('logPurpose: LOGGER_PROCESS?.env["KNOWBEE_LOG_PURPOSE"]')
    expect(source).toContain('noColorDisabled: LOGGER_PROCESS?.env["KNOWBEE_NO_COLOR"] != null')
    expect(source).toContain("normalizeLogLevel(LOGGER_RUNTIME_ENV.logLevel)")
    expect(source).toContain("LOG_POLICY.color")
    expect(source).toContain("LOG_POLICY.minLevel")
    expect(source).toContain("LOG_POLICY.purposeVisibility")
    expect(source).not.toContain("function getMinLevel")
    expect(source).not.toContain("function shouldColor")
  })

  it("normalizes product, debug, development, and dev log purpose inputs", async () => {
    const { normalizeLogPurposeVisibility } = await importLoggerForCase("normalize")

    expect(normalizeLogPurposeVisibility("product")).toBe("product")
    expect(normalizeLogPurposeVisibility("debug")).toBe("debug")
    expect(normalizeLogPurposeVisibility("development")).toBe("development")
    expect(normalizeLogPurposeVisibility("dev")).toBe("development")
    expect(normalizeLogPurposeVisibility("unknown", "debug")).toBe("debug")
  })

  it("defaults to product-purpose logs only", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    vi.stubEnv("KNOWBEE_LOG_PURPOSE", "")
    vi.stubEnv("KNOWBEE_LOG_LEVEL", "")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("product-default")
    const log = createLogger("test:logger")

    log.product("product event")
    log.fieldDebug("debug event")
    log.development("development event")

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain("product")
    expect(output).toContain("product event")
    expect(output).not.toContain("debug event")
    expect(output).not.toContain("development event")
  })

  it("allows field-debug logs when debug purpose visibility is selected", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    vi.stubEnv("KNOWBEE_LOG_PURPOSE", "debug")
    vi.stubEnv("KNOWBEE_FIELD_DEBUG_UNTIL", "4102444800000")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("debug-purpose")
    const log = createLogger("test:logger")

    log.fieldDebug("field diagnosis")
    log.development("development detail")

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain("debug")
    expect(output).toContain("field diagnosis")
    expect(output).not.toContain("development detail")
  })

  it("requires a future bootstrap deadline before emitting field-debug logs", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    vi.stubEnv("KNOWBEE_LOG_PURPOSE", "debug")
    vi.stubEnv("KNOWBEE_FIELD_DEBUG_UNTIL", "")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("field-debug-deadline-required")
    const log = createLogger("test:logger")

    log.fieldDebug("field diagnosis")

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).not.toContain("field diagnosis")
  })

  it("stops field-debug logs after the bootstrap deadline", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    vi.stubEnv("KNOWBEE_LOG_PURPOSE", "debug")
    vi.stubEnv("KNOWBEE_FIELD_DEBUG_UNTIL", "1")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("field-debug-deadline-expired")
    const log = createLogger("test:logger")

    log.fieldDebug("expired field diagnosis")

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).not.toContain("expired field diagnosis")
  })

  it("allows development logs only when development purpose visibility is selected", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    vi.stubEnv("KNOWBEE_LOG_PURPOSE", "dev")
    vi.stubEnv("KNOWBEE_FIELD_DEBUG_UNTIL", "4102444800000")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("development-purpose")
    const log = createLogger("test:logger")

    log.fieldDebug("field diagnosis")
    log.development("development detail")

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain("field diagnosis")
    expect(output).toContain("development")
    expect(output).toContain("development detail")
  })

  it("redacts secret-like strings and local paths before writing logs", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("redact-string")
    const log = createLogger("test:logger")
    const secret = "sk-task0574-secret-value-1234567890"
    const localPath = "/Users/dongwooshin/private/logger-secret.txt"

    log.product(`token=${secret} path=${localPath}`)

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain("token=***")
    expect(output).toContain("[internal-path-redacted]")
    expect(output).not.toContain(secret)
    expect(output).not.toContain(localPath)
  })

  it("redacts object args with secret keys, bearer tokens, raw payloads, and local paths", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("redact-object")
    const log = createLogger("test:logger")
    const secret = "sk-task0574-object-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/object-secret.txt"

    log.product("object payload", {
      apiKey: secret,
      nested: {
        authorization: `Bearer ${secret}`,
        rawHtml: "<!doctype html><html><body>secret</body></html>",
        path: localPath,
      },
    })

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain('"apiKey":"***"')
    expect(output).toContain('"authorization":"***"')
    expect(output).toContain('"rawHtml":"[redacted-raw-payload]"')
    expect(output).toContain("[internal-path-redacted]")
    expect(output).not.toContain(secret)
    expect(output).not.toContain(localPath)
    expect(output).not.toContain("<!doctype")
  })

  it("serializes errors without raw stack traces or embedded secrets", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    const stderr = captureStderr()
    const { createLogger } = await importLoggerForCase("redact-error")
    const log = createLogger("test:logger")
    const secret = "sk-task0574-error-secret-1234567890"
    const error = new Error(`provider failed token=${secret}`)
    error.stack = `Error: provider failed token=${secret}\n    at run (/Users/dongwooshin/private/error-secret.ts:1:1)`

    log.error("provider failed", error)

    const output = stderr.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain('"message":"provider failed token=***"')
    expect(output).not.toContain('"stack"')
    expect(output).not.toContain(secret)
    expect(output).not.toContain("/Users/dongwooshin/private")
  })

  it("redacts product log identifier labels from string messages", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("redact-product-identifiers")
    const log = createLogger("test:logger")

    log.product("runId=run-alpha sessionId=session-alpha channel=C123 user=U123 threadTs=123.456")

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain("runId=[id-redacted]")
    expect(output).toContain("sessionId=[id-redacted]")
    expect(output).toContain("channel=[id-redacted]")
    expect(output).toContain("user=[id-redacted]")
    expect(output).toContain("threadTs=[id-redacted]")
    expect(output).not.toContain("run-alpha")
    expect(output).not.toContain("session-alpha")
    expect(output).not.toContain("C123")
    expect(output).not.toContain("U123")
    expect(output).not.toContain("123.456")
  })

  it("redacts product log identifier fields from object args", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("redact-product-identifier-fields")
    const log = createLogger("test:logger")

    log.product("object identifiers", {
      runId: "run-secret",
      sessionId: "session-secret",
      channelId: "C123",
      userId: "U123",
      nested: { agentId: "agent-secret", messageTs: "123.456" },
    })

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain('"runId":"[id-redacted]"')
    expect(output).toContain('"sessionId":"[id-redacted]"')
    expect(output).toContain('"channelId":"[id-redacted]"')
    expect(output).toContain('"userId":"[id-redacted]"')
    expect(output).toContain('"agentId":"[id-redacted]"')
    expect(output).toContain('"messageTs":"[id-redacted]"')
    expect(output).not.toContain("run-secret")
    expect(output).not.toContain("session-secret")
    expect(output).not.toContain("agent-secret")
  })

  it("preserves diagnostic identifiers in field-debug logs when debug visibility is enabled", async () => {
    vi.stubEnv("KNOWBEE_NO_COLOR", "1")
    vi.stubEnv("KNOWBEE_LOG_PURPOSE", "debug")
    vi.stubEnv("KNOWBEE_FIELD_DEBUG_UNTIL", "4102444800000")
    const stdout = captureStdout()
    const { createLogger } = await importLoggerForCase("debug-identifiers")
    const log = createLogger("test:logger")

    log.fieldDebug("runId=run-debug sessionId=session-debug channel=C123", {
      userId: "U123",
    })

    const output = stdout.mock.calls.map((call) => String(call[0])).join("")
    expect(output).toContain("runId=run-debug")
    expect(output).toContain("sessionId=session-debug")
    expect(output).toContain("channel=C123")
    expect(output).toContain('"userId":"U123"')
  })
})
