import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createInstructionRuntimeContext } from "../packages/core/src/instructions/merge.ts"
import { TASK_INTAKE_RESPONSE_TOOL } from "../packages/core/src/agent/intake-response-tool.ts"
import { createFirstResponseDeadline } from "../packages/core/src/runs/first-response-deadline.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const aiMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
}))

vi.mock("../packages/core/src/ai/index.js", () => ({
  detectAvailableProvider: vi.fn(() => "mock-provider"),
  getDefaultModel: vi.fn(() => "fake-model"),
  getProvider: aiMocks.getProvider,
}))

const tempDirs: string[] = []

afterEach(() => {
  vi.useRealTimers()
  aiMocks.getProvider.mockReset()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function validDirectIntake(): Record<string, unknown> {
  return {
    intent: {
      category: "direct_answer",
      summary: "Answer the user's greeting.",
      confidence: 1,
    },
    user_message: {
      mode: "direct_answer",
      text: "안녕하세요!",
    },
    identity_claim: { subject: "none", claimed_name: "" },
    action_items: [{
      id: "reply-greeting",
      type: "reply",
      title: "Reply",
      priority: "normal",
      reason: "The request is conversational.",
      payload: { content: "안녕하세요!" },
    }],
    scheduling: {
      detected: false,
      kind: "none",
      status: "not_applicable",
      schedule_text: "",
    },
    execution: {
      requires_run: false,
      requires_delegation: false,
      suggested_target: "agent:knowbee",
      max_delegation_turns: 0,
      needs_tools: false,
      needs_web: false,
      execution_semantics: {
        filesystem_effect: "none",
        privileged_operation: "none",
        artifact_delivery: "none",
        approval_required: false,
        approval_tool: "external_action",
      },
    },
    notes: [],
  }
}

function rejectedIntake(): Record<string, unknown> {
  return {
    ...validDirectIntake(),
    intent: {
      category: "reject",
      summary: "Reject before capability diagnosis.",
      confidence: 1,
    },
    user_message: {
      mode: "failed_receipt",
      text: "요청을 처리할 수 없습니다.",
    },
    action_items: [],
  }
}

function validActionableIntake(): Record<string, unknown> {
  return {
    ...validDirectIntake(),
    intent: {
      category: "task_intake",
      summary: "Diagnose and execute the requested capability through the downstream workflow.",
      confidence: 1,
    },
    user_message: {
      mode: "accepted_receipt",
      text: "요청을 확인하고 가능한 방법을 진행하겠습니다.",
    },
    action_items: [{
      id: "run-requested-capability",
      type: "run_task",
      title: "Execute requested capability",
      priority: "normal",
      reason: "Capability and policy diagnosis belongs to the downstream workflow.",
      payload: {
        goal: "Execute the requested capability or establish a verified permitted alternative.",
      },
    }],
    execution: {
      ...(validDirectIntake().execution as Record<string, unknown>),
      requires_run: true,
      needs_tools: true,
    },
  }
}

function collectOpenObjectPaths(
  schema: unknown,
  path = "$",
  result: string[] = [],
): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return result
  const node = schema as Record<string, unknown>
  if (node.type === "object") {
    if (node.additionalProperties !== false) result.push(path)
    const properties = node.properties
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
      result.push(`${path}:properties`)
    } else {
      for (const [key, value] of Object.entries(properties)) {
        collectOpenObjectPaths(value, `${path}.properties.${key}`, result)
      }
    }
  }
  if (node.type === "array") collectOpenObjectPaths(node.items, `${path}.items`, result)
  for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = node[keyword]
    if (!Array.isArray(variants)) continue
    variants.forEach((variant, index) => {
      collectOpenObjectPaths(variant, `${path}.${keyword}[${index}]`, result)
    })
  }
  return result
}

function actionPayloadPropertyNames(actionType: string): string[] {
  const root = TASK_INTAKE_RESPONSE_TOOL.input_schema as Record<string, unknown>
  const properties = root.properties as Record<string, unknown>
  const actionItems = properties.action_items as Record<string, unknown>
  const itemSchema = actionItems.items as Record<string, unknown>
  const variants = itemSchema.anyOf as Array<Record<string, unknown>>
  const variant = variants.find((candidate) => {
    const candidateProperties = candidate.properties as Record<string, unknown>
    const typeSchema = candidateProperties.type as Record<string, unknown>
    return Array.isArray(typeSchema.enum) && typeSchema.enum.includes(actionType)
  })
  if (!variant) return []
  const variantProperties = variant.properties as Record<string, unknown>
  const payload = variantProperties.payload as Record<string, unknown>
  return Object.keys(payload.properties as Record<string, unknown>).sort()
}

async function fixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-typed-intake-"))
  tempDirs.push(rootDir)
  const runtime = createTestRuntimeConfigFixture({ rootDir })
  const { analyzeTaskIntake, analyzeTaskIntakeOutcome } = await import(
    "../packages/core/src/agent/intake.ts"
  )
  return { runtime, analyzeTaskIntake, analyzeTaskIntakeOutcome }
}

describe("typed task intake response", () => {
  it("documents the exact camera approval capability in the response-tool schema", () => {
    const inputSchema = TASK_INTAKE_RESPONSE_TOOL.input_schema as {
      properties?: {
        execution?: {
          properties?: {
            execution_semantics?: {
              properties?: {
                approval_tool?: {
                  description?: string
                }
              }
            }
          }
        }
      }
    }
    const description =
      inputSchema.properties?.execution?.properties?.execution_semantics
        ?.properties?.approval_tool?.description

    expect(description).toContain("Camera capture: yeonjang_camera_capture")
    expect(description).toContain(
      "external_action only when no purpose-specific value applies",
    )
  })

  it("keeps schema repair on the required response-tool contract", () => {
    const prompt = readFileSync("prompts/task_intake_schema_retry_user.md", "utf-8")

    expect(prompt).toContain("Call `submit_task_intake` exactly once")
    expect(prompt).toContain("Do not return plain JSON")
    expect(prompt).not.toContain("JSON object only")
  })

  it("publishes a closed schema for every nested intake object", () => {
    expect(collectOpenObjectPaths(TASK_INTAKE_RESPONSE_TOOL.input_schema)).toEqual([])
  })

  it("does not expose reject as an LLM-selectable intake category", () => {
    const root = TASK_INTAKE_RESPONSE_TOOL.input_schema as Record<string, unknown>
    const properties = root.properties as Record<string, unknown>
    const intent = properties.intent as Record<string, unknown>
    const intentProperties = intent.properties as Record<string, unknown>
    const category = intentProperties.category as Record<string, unknown>

    expect(category.enum).not.toContain("reject")
  })

  it("does not expose the internal failed receipt as an LLM-selectable message mode", () => {
    const root = TASK_INTAKE_RESPONSE_TOOL.input_schema as Record<string, unknown>
    const properties = root.properties as Record<string, unknown>
    const userMessage = properties.user_message as Record<string, unknown>
    const userMessageProperties = userMessage.properties as Record<string, unknown>
    const mode = userMessageProperties.mode as Record<string, unknown>

    expect(mode.enum).not.toContain("failed_receipt")
  })

  it("retains supported execution and method fields in closed action payloads", () => {
    expect(actionPayloadPropertyNames("run_task")).toEqual(expect.arrayContaining([
      "goal",
      "task",
      "context",
      "success_criteria",
      "constraints",
      "assumptions",
      "task_profile",
      "preferred_target",
      "target_instance",
      "preferred_methods",
      "exclusive_methods",
    ]))
    expect(actionPayloadPropertyNames("delegate_agent")).toEqual(expect.arrayContaining([
      "goal",
      "context",
      "success_criteria",
      "constraints",
      "assumptions",
      "preferred_target",
      "target_instance",
      "preferred_methods",
      "exclusive_methods",
    ]))
  })

  it("accepts exactly one harness response-tool call without a repair call", async () => {
    const { runtime, analyzeTaskIntake } = await fixture()
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "intake-call-1",
          name: "submit_task_intake",
          input: validDirectIntake(),
        } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 10, output_tokens: 20 },
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "안녕",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
      firstResponseDeadline: createFirstResponseDeadline(1_000),
      nowMs: () => 1_500,
    })

    expect(provider.chat).toHaveBeenCalledOnce()
    expect(provider.chat.mock.calls[0]?.[0]).toMatchObject({
      toolChoice: "required",
      tools: [{
        name: "submit_task_intake",
        input_schema: expect.objectContaining({
          type: "object",
          required: expect.arrayContaining([
            "intent",
            "user_message",
            "identity_claim",
            "action_items",
            "scheduling",
            "execution",
          ]),
        }),
      }],
    })
    expect(provider.chat.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal)
    expect(result).toMatchObject({
      intent: { category: "direct_answer" },
      user_message: { mode: "direct_answer", text: "안녕하세요!" },
    })
  })

  it("repairs an early model reject into a supported intake category", async () => {
    const { runtime, analyzeTaskIntake } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        yield {
          type: "tool_use",
          id: `intake-call-${attempt}`,
          name: "submit_task_intake",
          input: attempt === 1 ? rejectedIntake() : validActionableIntake(),
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "지원되지 않는 기능을 실행해줘",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      intent: { category: "task_intake" },
    })
    expect(provider.chat.mock.calls[1]?.[0]).toMatchObject({
      messages: [
        expect.any(Object),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("<validation_issues>"),
        }),
      ],
    })
    const repairMessage = provider.chat.mock.calls[1]?.[0].messages[1]?.content
    expect(repairMessage).toContain("intent_category_invalid")
    expect(repairMessage).toContain("model_message_mode_invalid")
  })

  it("repairs prose method constraints into stable capability identifiers", async () => {
    const { runtime, analyzeTaskIntake } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        const intake = validActionableIntake()
        const action = (intake.action_items as Array<Record<string, unknown>>)[0]
        const payload = action?.payload as Record<string, unknown>
        payload.preferred_methods =
          attempt === 1 ? ["Use another permitted local method."] : ["missing_extension_tool"]
        payload.exclusive_methods = []
        yield {
          type: "tool_use",
          id: `intake-call-${attempt}`,
          name: "submit_task_intake",
          input: intake,
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "missing_extension_tool 기능을 실행해줘",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      intent: { category: "task_intake" },
      action_items: [{
        payload: {
          preferred_methods: ["missing_extension_tool"],
          exclusive_methods: [],
        },
      }],
    })
    const repairMessage = provider.chat.mock.calls[1]?.[0].messages[1]?.content
    expect(repairMessage).toContain("<validation_issues>")
    expect(repairMessage).toContain("method_identifier_invalid")
  })

  it("repairs contradictory camera execution semantics once", async () => {
    const { runtime, analyzeTaskIntake } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        const intake = validActionableIntake()
        const actionItems = intake.action_items as Array<Record<string, unknown>>
        const actionPayload = actionItems[0]?.payload as Record<string, unknown>
        actionPayload.preferred_methods = attempt === 1
          ? ["screen_capture"]
          : ["yeonjang_camera_capture"]
        actionPayload.exclusive_methods = []
        const execution = intake.execution as Record<string, unknown>
        execution.needs_tools = true
        execution.execution_semantics = {
          filesystem_effect: "none",
          privileged_operation: "required",
          artifact_delivery: "direct",
          approval_required: true,
          approval_tool: "yeonjang_camera_capture",
        }
        yield {
          type: "tool_use",
          id: `camera-intake-${attempt}`,
          name: "submit_task_intake",
          input: intake,
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "카메라로 사진을 찍어서 보내줘.",
      model: "fake-model",
      source: "telegram",
      workDir: process.cwd(),
    })

    expect(result).toMatchObject({
      action_items: [{
        payload: {
          preferred_methods: ["yeonjang_camera_capture"],
          exclusive_methods: [],
        },
      }],
      execution: {
        needs_tools: true,
        execution_semantics: {
          privilegedOperation: "required",
          artifactDelivery: "direct",
          approvalRequired: true,
          approvalTool: "yeonjang_camera_capture",
        },
      },
    })
    expect(provider.chat).toHaveBeenCalledTimes(2)
    const repairMessage = provider.chat.mock.calls[1]?.[0].messages[1]?.content
    expect(repairMessage).toContain("execution_specific_approval_tool_method_mismatch")
  })

  it("repairs a text-only response through the structured response tool", async () => {
    const { runtime, analyzeTaskIntake } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        if (attempt === 1) {
          yield { type: "text_delta", delta: JSON.stringify(validDirectIntake()) } as const
          return
        }
        yield {
          type: "tool_use",
          id: "intake-repair-call",
          name: "submit_task_intake",
          input: validDirectIntake(),
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "안녕",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(result).toMatchObject({
      intent: { category: "direct_answer" },
    })
    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(provider.chat.mock.calls[1]?.[0]).toMatchObject({
      messages: [
        expect.any(Object),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("task-intake contract validation"),
        }),
      ],
    })
  })

  it("stops when schema repair returns the same invalid response", async () => {
    const { runtime, analyzeTaskIntakeOutcome } = await fixture()
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "unchanged invalid output" } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntakeOutcome({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "안녕",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(result).toMatchObject({
      status: "failure",
      reasonCode: "response_invalid",
      retryable: true,
      providerInvocationRef: expect.stringMatching(/^intake:[0-9a-f-]+$/u),
    })
    expect(provider.chat).toHaveBeenCalledTimes(2)
  })

  it("stops wording variants of the same invalid contract class after one repair", async () => {
    const { runtime, analyzeTaskIntakeOutcome } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        if (attempt <= 2) {
          const invalid = validDirectIntake()
          invalid.intent = {
            category: `invalid_category_${attempt}`,
            summary: "Invalid contract variant.",
            confidence: 1,
          }
          yield {
            type: "tool_use",
            id: `invalid-intake-${attempt}`,
            name: "submit_task_intake",
            input: invalid,
          } as const
          return
        }
        yield {
          type: "tool_use",
          id: "unexpected-third-call",
          name: "submit_task_intake",
          input: validDirectIntake(),
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntakeOutcome({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "지원하지 않는 기능을 실행해줘.",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(result).toMatchObject({
      status: "failure",
      reasonCode: "response_invalid",
      retryable: true,
      providerInvocationRef: expect.stringMatching(/^intake:[0-9a-f-]+$/u),
    })
    expect(provider.chat).toHaveBeenCalledTimes(2)
  })

  it("returns a typed provider failure outcome without exposing the raw exception", async () => {
    const { runtime, analyzeTaskIntakeOutcome } = await fixture()
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        throw new Error("sensitive provider detail")
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntakeOutcome({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "현재 주가를 알려줘.",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(result).toMatchObject({
      status: "failure",
      reasonCode: "provider_unavailable",
      retryable: true,
      providerInvocationRef: expect.stringMatching(/^intake:[0-9a-f-]+$/u),
    })
    expect(JSON.stringify(result)).not.toContain("sensitive provider detail")
  })

  it("retries a retryable provider failure with a distinct compact intake invocation", async () => {
    const { runtime, analyzeTaskIntakeOutcome } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        if (attempt === 1) throw new Error("temporary provider failure")
        yield {
          type: "tool_use",
          id: "intake-adapter-recovery",
          name: "submit_task_intake",
          input: validDirectIntake(),
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntakeOutcome({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      runId: "run-intake-adapter-recovery",
      userMessage: "현재 주가를 알려줘.",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(result.status).toBe("success")
    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(provider.chat.mock.calls.map((call) => call[0].observability?.operationCode)).toEqual([
      "task_intake",
      "task_intake_adapter_recovery",
    ])
    expect(provider.chat.mock.calls[1]?.[0].messages).toHaveLength(1)
  })

  it.each([
    ["an unexpected tool", ["other_tool"]],
    ["multiple response tools", ["submit_task_intake", "submit_task_intake"]],
  ] as const)("repairs %s with a materially changed prompt", async (_case, names) => {
    const { runtime, analyzeTaskIntake } = await fixture()
    let attempt = 0
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* () {
        attempt += 1
        if (attempt > 1) {
          yield {
            type: "tool_use",
            id: "intake-repair-call",
            name: "submit_task_intake",
            input: validDirectIntake(),
          } as const
          return
        }
        for (const [index, name] of names.entries()) {
          yield {
            type: "tool_use",
            id: `intake-call-${index}`,
            name,
            input: validDirectIntake(),
          } as const
        }
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "안녕",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(result).toMatchObject({
      intent: { category: "direct_answer" },
    })
    expect(provider.chat).toHaveBeenCalledTimes(2)
  })

  it("does not turn the 30-second measurement budget into request cancellation", async () => {
    vi.useFakeTimers()
    const { runtime, analyzeTaskIntake } = await fixture()
    let providerSignal: AbortSignal | undefined
    const provider = {
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: vi.fn(async function* (params: { signal?: AbortSignal }) {
        providerSignal = params.signal
        await new Promise((resolve) => setTimeout(resolve, 24_001))
        yield {
          type: "tool_use",
          id: "intake-late-call",
          name: "submit_task_intake",
          input: validDirectIntake(),
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const resultPromise = analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "안녕",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
      firstResponseDeadline: createFirstResponseDeadline(1_000),
      nowMs: () => 31_001,
    })
    await vi.advanceTimersByTimeAsync(24_001)
    const result = await resultPromise

    expect(result).toMatchObject({
      intent: { category: "direct_answer" },
    })
    expect(provider.chat).toHaveBeenCalledOnce()
    expect(providerSignal?.aborted).toBe(false)
  })
})
