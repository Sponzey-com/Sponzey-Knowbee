import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadSystemPromptSourceAssembly } from "../packages/core/src/memory/knowbee-md.ts"

const REQUIRED_LOGGING_MARKERS = [
  "Own product, debug, and development logging levels, redaction boundaries, and observability limits.",
  "Classify every log event as `product`, `debug`, or `development`.",
  "`product` logs are minimal operator-facing records for startup, shutdown, final state, failure, security, permission, approval, and delivery status.",
  "`debug` logs support field diagnosis with request id, run id, adapter state, external-call summary, retry summary, recovery summary, and sanitized error class.",
  "`development` logs support local development and tests with sanitized internal state, contract assembly details, fixture names, schema validation paths, and test diagnostics.",
  "Default behavior must be closest to `product`.",
  "`debug` and `development` logs must not be included in ordinary user-facing output, ordinary UI, or default product logs.",
  "Redact secrets, tokens, credentials, private memory, raw prompt source text, raw provider payloads, raw tool payloads, private file paths, and channel identifiers from all log levels",
  "Logs are observability records; they must not become the source of domain decisions, completion decisions, approval decisions, or user-facing truth by themselves.",
  "Log level selection and runtime log-level changes follow `runtime_environment_policy.md`.",
] as const

describe("task0300 logging policy prompt source", () => {
  it("documents product, debug, and development logging boundaries", () => {
    const policy = readFileSync(join(process.cwd(), "prompts", "logging_policy.md"), "utf-8")
    const system = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf-8")
    const assembly = loadSystemPromptSourceAssembly(process.cwd())

    for (const marker of REQUIRED_LOGGING_MARKERS) {
      expect(policy).toContain(marker)
    }

    expect(system).toContain("`logging_policy.md` owns product, debug, and development logging levels, redaction boundaries, and observability limits.")
    expect(assembly?.snapshot.sources.map((source) => source.sourceId)).toContain("logging_policy")
    expect(assembly?.text).toContain("[Prompt Source: logging_policy:en@")
    expect(system).not.toContain("Classify every log event as `product`, `debug`, or `development`.")
  })
})
