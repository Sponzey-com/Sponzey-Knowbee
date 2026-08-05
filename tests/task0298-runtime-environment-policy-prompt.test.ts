import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadSystemPromptSourceAssembly } from "../packages/core/src/memory/knowbee-md.ts"

const REQUIRED_RUNTIME_ENVIRONMENT_MARKERS = [
  "Own external configuration intake, startup runtime context, environment-variable boundaries, explicit setting delivery, and log-level change boundaries.",
  "Keep external configuration files minimal and limited to values that differ by user, deployment, machine, credential boundary, or runtime connection.",
  "Read environment variables and external environment constants only during process startup or an explicit bootstrap stage.",
  "After bootstrap, do not read, inject, or mutate `process.env`, hidden mutable config, singleton config, or global runtime constants to change behavior.",
  "Pass accepted environment values through explicit settings objects, constructor arguments, use-case input, command options, dependency injection, or runtime context objects.",
  "Runtime changes after startup must use an explicit administrator API, command argument, saved user setting, or validated runtime contract, not environment-variable mutation.",
  "Prompt-only changes must not mutate runtime environment values, hidden runtime instructions, permissions, memory, tool access, external feature connection access, Yeonjang policy, or log level.",
  "Log level is chosen during bootstrap.",
  "Tests should prefer explicit fixtures, constructor arguments, dependency injection, and context objects over direct environment mutation.",
  "If a test or edge adapter must set an environment variable for an external library, limit the scope, restore the previous value, and document the adapter boundary.",
] as const

describe("task0298 runtime environment policy prompt source", () => {
  it("documents startup-only environment intake and explicit runtime delivery", () => {
    const policy = readFileSync(join(process.cwd(), "prompts", "runtime_environment_policy.md"), "utf-8")
    const system = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf-8")
    const assembly = loadSystemPromptSourceAssembly(process.cwd())

    for (const marker of REQUIRED_RUNTIME_ENVIRONMENT_MARKERS) {
      expect(policy).toContain(marker)
    }

    expect(system).toContain("`runtime_environment_policy.md` owns external configuration intake, startup runtime context, environment-variable boundaries, explicit setting delivery, and log-level change boundaries.")
    expect(assembly?.snapshot.sources.map((source) => source.sourceId)).toContain("runtime_environment_policy")
    expect(assembly?.text).toContain("[Prompt Source: runtime_environment_policy:en@")
    expect(system).not.toContain("After bootstrap, do not read, inject, or mutate `process.env`")
  })
})
