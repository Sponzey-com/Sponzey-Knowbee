import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { runIntakeBridgePass as runIntakeBridgePassCore } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const intakeRuntime = createTestAgentRuntimeDependencies("/tmp/knowbee-run-intake-bridge-pass")

function runIntakeBridgePass(
  params: Omit<Parameters<typeof runIntakeBridgePassCore>[0], "artifactStorage" | "config">,
  dependencies: Parameters<typeof runIntakeBridgePassCore>[1],
  moduleDependencies?: Parameters<typeof runIntakeBridgePassCore>[2],
) {
  return runIntakeBridgePassCore(
    {
      ...params,
      artifactStorage: intakeRuntime.artifactStorage,
      config: DEFAULT_CONFIG,
    },
    dependencies,
    moduleDependencies,
  )
}

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    emitScheduleCreated: vi.fn(),
    emitScheduleCancelled: vi.fn(),
    scheduleDelayedRun: vi.fn(),
    startDelegatedRun: vi.fn(),
    normalizeTaskProfile: vi.fn((taskProfile) => taskProfile ?? "general_chat"),
    logInfo: vi.fn(),
    recordCanonicalIntakeDiagnosis: vi.fn(async () => ({ ok: true as const })),
    authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
  }
}

function createBaseIntakeResult() {
  return {
    intent: {
      category: "task_intake" as const,
      summary: "후속 실행이 필요합니다.",
      confidence: 0.9,
    },
    user_message: {
      mode: "accepted_receipt" as const,
      text: "후속 실행을 시작합니다.",
    },
    action_items: [],
    structured_request: {
      source_language: "en" as const,
      normalized_english: "Deliver the requested result.",
      target: "deliver result",
      to: "telegram chat 1, main thread",
      context: ["request accepted"],
      complete_condition: ["deliver result"],
    },
    intent_envelope: {
      intent_type: "task_intake" as const,
      source_language: "en" as const,
      normalized_english: "Deliver the requested result.",
      target: "deliver result",
      destination: "telegram chat 1, main thread",
      context: ["request accepted"],
      complete_condition: ["deliver result"],
      schedule_spec: {
        detected: false,
        kind: "none" as const,
        status: "not_applicable" as const,
        schedule_text: "",
      },
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: "none" as const,
        artifactDelivery: "none" as const,
        approvalRequired: false,
        approvalTool: "external_action" as const,
      },
      delivery_mode: "none" as const,
      requires_approval: false,
      approval_tool: "external_action" as const,
      preferred_target: "auto",
      needs_tools: false,
      needs_web: false,
    },
    scheduling: {
      detected: false,
      kind: "none" as const,
      status: "not_applicable" as const,
      schedule_text: "",
    },
    execution: {
      requires_run: true,
      requires_delegation: false,
      suggested_target: "auto",
      max_delegation_turns: 3,
      needs_tools: false,
      needs_web: false,
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: "none" as const,
        artifactDelivery: "none" as const,
        approvalRequired: false,
        approvalTool: "external_action" as const,
      },
    },
    notes: [],
  }
}

function createAskUserExecutionDecisionResult(input: {
  unresolvedReason?: string | undefined
  reason?: string | undefined
}) {
  const decision = {
    contract_version: "agent-execution-decision:v1" as const,
    current_executor_id: "agent:knowbee",
    domain: "general",
    behavior_pattern: "clarify" as const,
    execution_route: "ask_user" as const,
    selected_connection_path: [],
    task_profile: {
      title: "Clarify execution",
      summary: "Execution needs user input",
      goals: ["Ask the user for the missing execution condition"],
      task_units: [],
      success_criteria: ["User provides the missing condition"],
    },
    required_outputs: [
      {
        id: "answer",
        label: "Final answer",
        acceptance_criteria: ["Ask for the missing condition"],
      },
    ],
    risk_boundary: {
      requires_user_approval: false,
      reason: "clarification_required",
    },
    confidence: 0.8,
    fallback_if_unavailable: "ask_user" as const,
    ...(input.unresolvedReason ? { unresolved_reason: input.unresolvedReason } : {}),
    reason: input.reason ?? "Execution route requires user clarification.",
  }

  return {
    ok: true as const,
    decision,
    decisionTrace: {
      contract_version: "agent-execution-decision:v1" as const,
      decision_source: "knowbee_harness",
      current_executor_id: "agent:knowbee",
      available_executor_ids: [],
      diagnostic_executor_ids: [],
      all_active_executor_ids: ["agent:knowbee"],
      selected_connection_path: [],
      execution_route: "ask_user" as const,
      fallback_if_unavailable: "ask_user" as const,
      validation_ok: true,
      validation_status: "valid" as const,
      validation_issues: [],
    },
    validation: {
      shape: { ok: true, issues: [] },
      delegation: {
        contract_version: "agent-execution-decision:v1" as const,
        ok: true,
        status: "valid" as const,
        issues: [],
        fallback_if_invalid: "ask_user" as const,
      },
    },
    trace: [],
    rawModelOutput: "{}",
  }
}

describe("run intake bridge pass", () => {
  it("returns an explicit web-tool contract from the LLM intake self-solve decision", async () => {
    const dependencies = createDependencies()
    dependencies.authorizeCanonicalIntakePlan.mockResolvedValue({
      ok: true as const,
      requiredToolNames: ["web_search"],
    })
    const intake = {
      ...createBaseIntakeResult(),
      action_items: [
        {
          id: "lookup-current-value",
          type: "run_task" as const,
          title: "현재 값 조회",
          priority: "normal" as const,
          reason: "LLM intake selected web retrieval",
          payload: {},
        },
      ],
      execution: {
        ...createBaseIntakeResult().execution,
        needs_tools: true,
        needs_web: true,
      },
      intent_envelope: {
        ...createBaseIntakeResult().intent_envelope,
        needs_tools: true,
        needs_web: true,
      },
    }
    const decisionResult = createAskUserExecutionDecisionResult({})
    const selfSolveDecision = {
      ...decisionResult.decision,
      behavior_pattern: "execute" as const,
      execution_route: "self_solve" as const,
      fallback_if_unavailable: "self_solve" as const,
    }
    const selfSolveResult = {
      ...decisionResult,
      decision: selfSolveDecision,
      decisionTrace: {
        ...decisionResult.decisionTrace,
        execution_route: "self_solve" as const,
        fallback_if_unavailable: "self_solve" as const,
      },
    }
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue(intake),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("research"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Structured execution from LLM intake]"),
      decideExecutionRoute: vi.fn().mockResolvedValue({
        kind: "self_solve" as const,
        agentExecutionDecision: selfSolveDecision,
        decisionResult: selfSolveResult,
        executionGraph: {} as never,
        executionContext: {} as never,
      }),
    }

    const result = await runIntakeBridgePass(
      {
        message: "외부 최신 값을 알려줘",
        originalRequest: "외부 최신 값을 알려줘",
        sessionId: "session-llm-web-contract",
        requestGroupId: "group-llm-web-contract",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "telegram",
        runId: "run-llm-web-contract",
        onChunk: undefined,
        reuseConversationContext: false,
        executionTools: [
          {
            tool_id: "web_search",
            label: "Search public web sources",
            permission_scope: "external",
          },
          {
            tool_id: "web_fetch",
            label: "Fetch a public web source",
            permission_scope: "external",
          },
        ],
      },
      dependencies,
      moduleDependencies as never,
    )

    expect(result).toEqual({
      kind: "execute",
      message: "[Structured execution from LLM intake]",
      requiredToolNames: ["web_search"],
      eventLabel: "LLM intake 실행 계약 적용",
    })
    expect(moduleDependencies.decideExecutionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        availableTools: [
          expect.objectContaining({ tool_id: "web_search" }),
          expect.objectContaining({ tool_id: "web_fetch" }),
        ],
      }),
    )
  })

  it("does not route deterministic reply payloads through direct completion", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "direct_answer" as const,
          summary: "즉시 응답",
          confidence: 1,
        },
        user_message: {
          mode: "direct_answer" as const,
          text: "hello",
        },
        action_items: [
          {
            id: "reply-1",
            type: "reply" as const,
            title: "reply",
            priority: "normal" as const,
            reason: "direct reply",
            payload: {
              content: "hello",
            },
          },
        ],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "say hello",
        originalRequest: "say hello",
        sessionId: "session-1",
        requestGroupId: "group-1",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-1",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toBeNull()
    expect(dependencies.releaseCanonicalSimplePath).not.toHaveBeenCalled()
    expect(dependencies.recordCanonicalIntakeDiagnosis).toHaveBeenCalledOnce()
    expect(dependencies.authorizeCanonicalIntakePlan).toHaveBeenCalledOnce()
    expect(dependencies.recordCanonicalExecutionStart).toHaveBeenCalledOnce()
  })

  it("routes deterministic clarification receipts through runtime deterministic completion", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "clarification" as const,
          summary: "추가 입력 필요",
          confidence: 0.98,
        },
        user_message: {
          mode: "clarification_receipt" as const,
          text: "5초 후에 무엇을 해야 하는지 알려주세요.",
        },
        action_items: [
          {
            id: "ask-delayed-task",
            type: "ask_user" as const,
            title: "지연 실행 내용 확인",
            priority: "normal" as const,
            reason: "상대시간은 파악했지만 실행할 작업 내용이 없습니다.",
            payload: {
              question: "각 시간마다 무엇을 해야 하나요?",
              missing_fields: ["task"],
            },
          },
        ],
        notes: ["relative-delay-heuristic"],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "5초 뒤",
        originalRequest: "5초 뒤",
        sessionId: "session-clarify",
        requestGroupId: "group-clarify",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-clarify",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toEqual({
      kind: "awaiting_user",
      preview: "",
      summary: "추가 입력이 필요합니다.",
      userMessage: "5초 후에 무엇을 해야 하는지 알려주세요.",
      userMessageSource: "runtime_deterministic",
      eventLabel: "intake 런타임 확인 질문 대기",
    })
  })

  it("keeps LLM generated source for reply actions produced by LLM intake", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        status: "success",
        intake: {
          ...createBaseIntakeResult(),
          intent: {
            category: "direct_answer" as const,
            summary: "LLM direct answer",
            confidence: 1,
          },
          user_message: {
            mode: "direct_answer" as const,
            text: "hello from model",
          },
          action_items: [
            {
              id: "reply-llm",
              type: "reply" as const,
              title: "reply",
              priority: "normal" as const,
              reason: "direct reply from LLM intake",
              payload: {
                content: "hello from model",
              },
            },
          ],
          notes: ["llm-intake-result"],
        },
        directResponseProvenance: {
          taskIntakePromptSha256: "a".repeat(64),
          finalResponsePromptSha256: "b".repeat(64),
          providerInvocationRef: "invocation:direct-bridge",
        },
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "say hello",
        originalRequest: "say hello",
        sessionId: "session-llm",
        requestGroupId: "group-llm",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-llm",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "complete",
      text: "hello from model",
      textSource: "llm_generated",
      responseReview: {
        receipt: {
          schemaVersion: 2,
          providerInvocationRef: "invocation:direct-bridge",
        },
      },
      eventLabel: "intake 즉시 응답 완료",
    })
  })

  it("uses direct-answer user_message text instead of stale reply payload content", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "direct_answer" as const,
          summary: "메인 에이전트 이름 응답",
          confidence: 1,
        },
        user_message: {
          mode: "direct_answer" as const,
          text: "제 이름은 마당쇠입니다.",
        },
        action_items: [
          {
            id: "reply-main-agent-self-name",
            type: "reply" as const,
            title: "reply",
            priority: "normal" as const,
            reason: "direct reply from LLM intake",
            payload: {
              content: "제 이름은 Knowbee예요.",
            },
          },
        ],
        notes: ["llm-intake-result", "main-agent-self-name-answer-corrected"],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "니 이름이 뭐니?",
        originalRequest: "니 이름이 뭐니?",
        sessionId: "session-name",
        requestGroupId: "group-name",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-name",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "complete",
      text: "제 이름은 마당쇠입니다.",
      textSource: "llm_generated",
      eventLabel: "intake 즉시 응답 완료",
    })
    expect(JSON.stringify(result)).not.toContain("Knowbee")
  })

  it("completes direct answers from user_message text even when reply action is absent", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "direct_answer" as const,
          summary: "간단한 직접 응답",
          confidence: 0.98,
        },
        user_message: {
          mode: "direct_answer" as const,
          text: "직접 답변입니다.",
        },
        action_items: [],
        notes: ["llm-intake-result"],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "간단히 답해줘",
        originalRequest: "간단히 답해줘",
        sessionId: "session-direct-no-reply",
        requestGroupId: "group-direct-no-reply",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-direct-no-reply",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "complete",
      text: "직접 답변입니다.",
      textSource: "llm_generated",
      eventLabel: "intake 즉시 응답 완료",
    })
  })

  it("does not let an LLM reply action bypass mixed execution actions", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "task_intake" as const,
          summary: "실행이 필요한 요청",
          confidence: 0.9,
        },
        user_message: {
          mode: "accepted_receipt" as const,
          text: "요청을 실행하겠습니다.",
        },
        action_items: [
          {
            id: "reply-llm-mixed",
            type: "reply" as const,
            title: "receipt",
            priority: "normal" as const,
            reason: "receipt from intake",
            payload: {
              content: "요청을 실행하겠습니다.",
            },
          },
          {
            id: "run-task-mixed",
            type: "run_task" as const,
            title: "실제 실행",
            priority: "high" as const,
            reason: "execution is still required",
            payload: {
              goal: "Do the requested work.",
              preferred_target: "provider:openai",
            },
          },
        ],
        notes: ["llm-intake-result"],
      }),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        providerId: "openai",
        model: "gpt-5.4",
        reason: "routing:provider:openai",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("general_chat"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Intake Bridge]\nDo the requested work."),
    }

    const result = await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "이 일 처리해줘",
        originalRequest: "이 일 처리해줘",
        sessionId: "session-mixed-reply",
        requestGroupId: "group-mixed-reply",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "telegram",
        runId: "run-mixed-reply",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(dependencies.startDelegatedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "[Task Intake Bridge]\nDo the requested work.",
        requestGroupId: "run-mixed-reply:child:1",
        parentRunId: "run-mixed-reply",
        providerId: "openai",
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        skipIntake: true,
      }),
    )
    expect(result).toEqual({
      kind: "complete_silent",
      summary: "후속 실행으로 전달되었습니다.",
      eventLabel: "intake 후속 실행 생성 완료",
    })
  })

  it("stops instead of retrying a deterministic schedule failure", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "schedule_request" as const,
          summary: "일정 요청",
          confidence: 0.8,
        },
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn().mockReturnValue({
        ok: false,
        message: "스케줄 생성 실패",
        detail: "run_at missing",
        successCount: 0,
        failureCount: 1,
        receipts: [],
      }),
      createDefaultScheduleActionDependencies: vi.fn().mockReturnValue({}),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "schedule this later",
        originalRequest: "schedule this later",
        sessionId: "session-2",
        requestGroupId: "group-2",
        model: "gpt-test",
        config: structuredClone(DEFAULT_CONFIG),
        workDir: "/tmp",
        source: "webui",
        runId: "run-2",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "stop",
      summary: "일정 요청을 처리하지 못했습니다.",
      reason: "run_at missing",
      eventLabel: "일정 실행 실패 종료",
    })
  })

  it("starts delegated follow-up runs and returns intake receipt", async () => {
    const dependencies = createDependencies()
    const delegatedIntake = {
      ...createBaseIntakeResult(),
      action_items: [
        {
          id: "delegate-1",
          type: "run_task" as const,
          title: "캘린더 만들기",
          priority: "high" as const,
          reason: "needs follow-up",
          payload: {
            goal: "Create a calendar app",
            preferred_target: "provider:openai",
          },
        },
      ],
    }
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue(delegatedIntake),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        providerId: "openai",
        model: "gpt-5.4",
        reason: "routing:provider:openai",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("coding"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Intake Bridge]\nCreate a calendar app"),
    }

    const result = await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "make calendar",
        originalRequest: "make calendar",
        sessionId: "session-3",
        requestGroupId: "group-3",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "cli",
        runId: "run-3",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(dependencies.startDelegatedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "[Task Intake Bridge]\nCreate a calendar app",
        sessionId: "session-3",
        taskProfile: "coding",
        requestGroupId: "run-3:child:1",
        parentRunId: "run-3",
        runScope: "child",
        handoffSummary: "캘린더 만들기",
        contextMode: "handoff",
        originalRequest: "make calendar",
        model: "gpt-5.4",
        providerId: "openai",
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        workDir: "/tmp/project",
        source: "cli",
        skipIntake: true,
      }),
    )
    expect(dependencies.startDelegatedRun.mock.calls[0]?.[0]).not.toHaveProperty("onChunk")
    expect(result).toEqual({
      kind: "complete_silent",
      summary: "후속 실행으로 전달되었습니다.",
      eventLabel: "intake 후속 실행 생성 완료",
    })
  })

  it("waits for delegated child results when the starter returns a completion handle", async () => {
    const dependencies = createDependencies()
    dependencies.startDelegatedRun.mockReturnValue({
      runId: "child-run-1",
      finished: Promise.resolve({
        status: "completed",
        summary: "행랑아범이 확인한 결과입니다.",
      }),
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-1",
            type: "run_task" as const,
            title: "증시 확인",
            priority: "high" as const,
            reason: "후속 실행",
            payload: {
              preferred_target: "provider:openai",
            },
          },
        ],
      }),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "workspace:draft:node:executor-5",
        targetLabel: "행랑아범",
        model: "gpt-5.4",
        reason: "routing:executor",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("research"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Intake Bridge]\n증시 확인"),
    }

    const result = await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "코스피 확인",
        originalRequest: "코스피 확인",
        sessionId: "session-aggregate",
        requestGroupId: "group-aggregate",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-aggregate",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(dependencies.startDelegatedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requestGroupId: "run-aggregate:child:1",
        parentRunId: "run-aggregate",
        targetId: "workspace:draft:node:executor-5",
      }),
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-aggregate",
      "parent_run_awaiting_child_result:intake_followup;child_run=child-run-1",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-aggregate",
      "parent_run_child_result_received:intake_followup;child_run=child-run-1;status=completed",
    )
    expect(result).toEqual({
      kind: "complete",
      text: "행랑아범이 확인한 결과입니다.",
      textSource: "llm_generated",
      eventLabel: "intake 처리 결과 전달",
    })
  })

  it("retries intake instead of finalizing when delegated child review finds missing work", async () => {
    const dependencies = createDependencies()
    dependencies.startDelegatedRun.mockReturnValue({
      runId: "child-run-market",
      finished: Promise.resolve({
        status: "completed",
        summary: [
          "나스닥 종합지수 시가: 확인 실패",
          "나스닥 종합지수 현재값: 확인 실패",
          "테슬라 현재값: 417.63달러",
        ].join("\n"),
      }),
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-market",
            type: "run_task" as const,
            title: "나스닥과 테슬라 가격 확인",
            priority: "high" as const,
            reason: "후속 실행",
            payload: {
              preferred_target: "provider:openai",
            },
          },
        ],
      }),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "workspace:draft:node:executor-5",
        targetLabel: "행랑아범",
        model: "gpt-5.4",
        reason: "routing:executor",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("research"),
      buildFollowupPrompt: vi
        .fn()
        .mockReturnValue("[Task Intake Bridge]\n나스닥과 테슬라 가격 확인"),
      reviewTaskCompletion: vi.fn().mockResolvedValue({
        status: "followup" as const,
        summary: "나스닥 시가와 현재값이 아직 확인되지 않았습니다.",
        reason: "요청한 현재 지수 중 일부가 미확인 상태입니다.",
        followupPrompt:
          "나스닥 종합지수 시가와 현재값을 다른 신뢰 가능한 경로로 확인하고, 이미 확인된 테슬라 값과 함께 최종 답변을 작성하세요.",
        remainingItems: ["나스닥 종합지수 시가", "나스닥 종합지수 현재값"],
      }),
    }

    const result = await runIntakeBridgePass(
      {
        message: "오늘 나스닥 출발 지수하고 현재 지수 알려줘. 테슬라 가격도",
        originalRequest: "오늘 나스닥 출발 지수하고 현재 지수 알려줘. 테슬라 가격도",
        sessionId: "session-market",
        requestGroupId: "group-market",
        config: DEFAULT_CONFIG,
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "telegram",
        runId: "run-market",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(moduleDependencies.reviewTaskCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        originalRequest: "오늘 나스닥 출발 지수하고 현재 지수 알려줘. 테슬라 가격도",
        latestAssistantMessage: expect.stringContaining("나스닥 종합지수 시가: 확인 실패"),
        workDir: "/tmp/project",
      }),
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-market",
      "parent_run_child_result_review:intake_followup;child_run=child-run-market;status=followup;remaining=2",
    )
    expect(result).toMatchObject({
      kind: "retry_intake",
      summary: "나스닥 시가와 현재값이 아직 확인되지 않았습니다.",
      reason: "요청한 현재 지수 중 일부가 미확인 상태입니다.",
      remainingItems: ["나스닥 종합지수 시가", "나스닥 종합지수 현재값"],
      eventLabel: "하위 실행 결과 미완료로 재분석",
      recoveryAdmission: {
        previousStrategyFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        nextStrategyFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        changedDimensions: ["strategy"],
      },
    })
    expect(result && "message" in result ? result.message : "").toContain("Focused follow-up")
    expect(result && "message" in result ? result.message : "").toContain(
      "나스닥 종합지수 시가와 현재값",
    )
  })

  it("redacts delegated child review failure events and keeps completed child summary", async () => {
    const dependencies = createDependencies()
    const secret = "sk-task0583-review-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/review-secret.txt"
    dependencies.startDelegatedRun.mockReturnValue({
      runId: "child-run-review-error",
      finished: Promise.resolve({
        status: "completed",
        summary: "하위 실행이 완료한 요약입니다.",
      }),
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-review-error",
            type: "run_task" as const,
            title: "하위 실행",
            priority: "high" as const,
            reason: "후속 실행",
            payload: {
              preferred_target: "provider:openai",
            },
          },
        ],
      }),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "workspace:draft:node:executor-9",
        targetLabel: "행랑아범",
        model: "gpt-5.4",
        reason: "routing:executor",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("research"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Intake Bridge]\n하위 실행"),
      reviewTaskCompletion: vi
        .fn()
        .mockRejectedValue(new Error(`provider failed token=${secret} path=${localPath}`)),
    }

    const result = await runIntakeBridgePass(
      {
        message: "하위 실행으로 처리해줘",
        originalRequest: "하위 실행으로 처리해줘",
        sessionId: "session-review-error",
        requestGroupId: "group-review-error",
        config: DEFAULT_CONFIG,
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-review-error",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    const events = dependencies.appendRunEvent.mock.calls.map((call) => String(call[1])).join("\n")
    expect(events).toContain(
      "parent_run_child_result_review_failed:intake_followup;child_run=child-run-review-error;error=",
    )
    expect(events).toContain("token=***")
    expect(events).toContain("[internal-path-redacted]")
    expect(events).not.toContain(secret)
    expect(events).not.toContain(localPath)
    expect(result).toEqual({
      kind: "complete",
      text: "하위 실행이 완료한 요약입니다.",
      textSource: "llm_generated",
      eventLabel: "intake 처리 결과 전달",
    })
  })

  it("marks delegated child review reason fallback messages as mixed", async () => {
    const dependencies = createDependencies()
    dependencies.startDelegatedRun.mockReturnValue({
      runId: "child-run-ask-user",
      finished: Promise.resolve({
        status: "completed",
        summary: "작업 범위를 확정하려면 사용자의 선택이 필요합니다.",
      }),
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-ask-user",
            type: "run_task" as const,
            title: "자료 정리",
            priority: "normal" as const,
            reason: "후속 실행",
            payload: {
              preferred_target: "provider:openai",
            },
          },
        ],
      }),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "workspace:draft:node:executor-ask-user",
        targetLabel: "자료 담당",
        model: "gpt-5.4",
        reason: "routing:executor",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("research"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Intake Bridge]\n자료 정리"),
      reviewTaskCompletion: vi.fn().mockResolvedValue({
        status: "ask_user" as const,
        summary: "사용자 확인이 필요합니다.",
        reason: "정리할 자료 범위를 선택해야 합니다.",
        remainingItems: ["자료 범위 선택"],
      }),
    }

    const result = await runIntakeBridgePass(
      {
        message: "자료 정리해줘",
        originalRequest: "자료 정리해줘",
        sessionId: "session-ask-user",
        requestGroupId: "group-ask-user",
        config: DEFAULT_CONFIG,
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-ask-user",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "awaiting_user",
      preview: "",
      userMessage: "정리할 자료 범위를 선택해야 합니다.",
      userMessageSource: "mixed",
      eventLabel: "하위 실행 결과 검증 사용자 확인",
    })
  })

  it("marks explicit delegated child review ask-user messages as mixed without duplicate preview", async () => {
    const dependencies = createDependencies()
    dependencies.startDelegatedRun.mockReturnValue({
      runId: "child-run-explicit-ask-user",
      finished: Promise.resolve({
        status: "completed",
        summary: "선택지가 두 개 있습니다.",
      }),
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-explicit-ask-user",
            type: "run_task" as const,
            title: "옵션 검토",
            priority: "normal" as const,
            reason: "후속 실행",
            payload: {
              preferred_target: "provider:openai",
            },
          },
        ],
      }),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "workspace:draft:node:executor-explicit-ask-user",
        targetLabel: "검토 담당",
        model: "gpt-5.4",
        reason: "routing:executor",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("research"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Intake Bridge]\n옵션 검토"),
      reviewTaskCompletion: vi.fn().mockResolvedValue({
        status: "ask_user" as const,
        summary: "사용자 확인이 필요합니다.",
        reason: "선택지가 여러 개입니다.",
        userMessage: "A안과 B안 중 어느 쪽으로 진행할까요?",
        remainingItems: ["진행 옵션 선택"],
      }),
    }

    const result = await runIntakeBridgePass(
      {
        message: "옵션 검토해줘",
        originalRequest: "옵션 검토해줘",
        sessionId: "session-explicit-ask-user",
        requestGroupId: "group-explicit-ask-user",
        config: DEFAULT_CONFIG,
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-explicit-ask-user",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "awaiting_user",
      preview: "",
      userMessage: "A안과 B안 중 어느 쪽으로 진행할까요?",
      userMessageSource: "mixed",
      eventLabel: "하위 실행 결과 검증 사용자 확인",
    })
  })

  it("marks execution decision fallback ask-user messages as mixed when a reason is included", async () => {
    const dependencies = createDependencies()
    const decisionResult = createAskUserExecutionDecisionResult({
      reason: "The execution target is ambiguous.",
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-execution-ask-user-fallback",
            type: "run_task" as const,
            title: "불명확한 실행",
            priority: "normal" as const,
            reason: "needs routing decision",
            payload: {},
          },
        ],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("general_chat"),
      buildFollowupPrompt: vi.fn(),
      decideExecutionRoute: vi.fn().mockResolvedValue({
        kind: "ask_user" as const,
        agentExecutionDecision: decisionResult.decision,
        decisionResult,
        executionGraph: {} as never,
        executionContext: {} as never,
      }),
    }

    const result = await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "이거 처리해줘",
        originalRequest: "이거 처리해줘",
        sessionId: "session-execution-ask-user-fallback",
        requestGroupId: "group-execution-ask-user-fallback",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-execution-ask-user-fallback",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "awaiting_user",
      preview: "",
      userMessage: "요청을 계속 진행하려면 필요한 조건을 확인해 주세요.",
      userMessageSource: "mixed",
      eventLabel: "execution decision 사용자 확인 대기",
    })
  })

  it("marks explicit execution decision unresolved reasons as mixed without duplicate preview", async () => {
    const dependencies = createDependencies()
    const decisionResult = createAskUserExecutionDecisionResult({
      unresolvedReason: "어느 실행 대상에 맡길지 선택해 주세요.",
      reason: "The user must choose an execution target.",
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-execution-ask-user-explicit",
            type: "run_task" as const,
            title: "대상 선택",
            priority: "normal" as const,
            reason: "needs routing decision",
            payload: {},
          },
        ],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("general_chat"),
      buildFollowupPrompt: vi.fn(),
      decideExecutionRoute: vi.fn().mockResolvedValue({
        kind: "ask_user" as const,
        agentExecutionDecision: decisionResult.decision,
        decisionResult,
        executionGraph: {} as never,
        executionContext: {} as never,
      }),
    }

    const result = await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "대상 선택해서 처리해줘",
        originalRequest: "대상 선택해서 처리해줘",
        sessionId: "session-execution-ask-user-explicit",
        requestGroupId: "group-execution-ask-user-explicit",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-execution-ask-user-explicit",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toMatchObject({
      kind: "awaiting_user",
      preview: "",
      userMessage: "어느 실행 대상에 맡길지 선택해 주세요.",
      userMessageSource: "mixed",
      eventLabel: "execution decision 사용자 확인 대기",
    })
  })

  it("routes an execution boundary failure through LLM execution and review instead of awaiting user", async () => {
    const dependencies = createDependencies()
    const decisionResult = createAskUserExecutionDecisionResult({
      reason: "No viable capability remains in the current execution boundary.",
    })
    const boundaryDecision = {
      ...decisionResult.decision,
      behavior_pattern: "recover" as const,
      execution_route: "boundary_failure" as const,
      fallback_if_unavailable: "boundary_failure" as const,
      unresolved_reason: "The requested capability is unavailable.",
    }
    const boundaryResult = {
      ...decisionResult,
      decision: boundaryDecision,
      decisionTrace: {
        ...decisionResult.decisionTrace,
        execution_route: "boundary_failure" as const,
        fallback_if_unavailable: "boundary_failure" as const,
      },
    }
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        action_items: [
          {
            id: "task-boundary-failure",
            type: "run_task" as const,
            title: "Unavailable capability",
            priority: "normal" as const,
            reason: "requires downstream diagnosis",
            payload: {},
          },
        ],
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("general_chat"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Boundary failure review]"),
      decideExecutionRoute: vi.fn().mockResolvedValue({
        kind: "boundary_failure" as const,
        agentExecutionDecision: boundaryDecision,
        decisionResult: boundaryResult,
        executionGraph: {} as never,
        executionContext: {} as never,
      }),
    }

    const result = await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "없는 기능을 실행해줘",
        originalRequest: "없는 기능을 실행해줘",
        sessionId: "session-boundary-failure",
        requestGroupId: "group-boundary-failure",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "webui",
        runId: "run-boundary-failure",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies as never,
    )

    expect(result).toEqual({
      kind: "execute",
      message: "[Boundary failure review]",
      requiredToolNames: [],
      eventLabel: "execution decision 경계 결과 재진단",
    })
    expect(result).not.toMatchObject({ kind: "awaiting_user" })
  })

  it("normalizes mistaken direct artifact semantics before delegated weather runs", async () => {
    const dependencies = createDependencies()
    const directSemantics = {
      filesystemEffect: "none" as const,
      privilegedOperation: "none" as const,
      artifactDelivery: "direct" as const,
      approvalRequired: false,
      approvalTool: "external_action" as const,
    }
    const delegatedIntake = {
      ...createBaseIntakeResult(),
      action_items: [
        {
          id: "weather-1",
          type: "run_task" as const,
          title: "Current weather conditions for Dongcheon-dong",
          priority: "normal" as const,
          reason: "live information requires web lookup",
          payload: {
            goal: "Current weather conditions for Dongcheon-dong",
            preferred_target: "provider:openai",
          },
        },
      ],
      structured_request: {
        source_language: "ko" as const,
        normalized_english: "Tell me the current weather in Dongcheon-dong.",
        target: "Current weather conditions for Dongcheon-dong",
        to: "telegram chat 1, main thread",
        context: ["User asked for current weather in 동천동"],
        complete_condition: ["Provide a concise current weather summary for Dongcheon-dong."],
      },
      intent_envelope: {
        ...createBaseIntakeResult().intent_envelope,
        source_language: "ko" as const,
        normalized_english: "Tell me the current weather in Dongcheon-dong.",
        target: "Current weather conditions for Dongcheon-dong",
        destination: "telegram chat 1, main thread",
        context: ["User asked for current weather in 동천동"],
        complete_condition: ["Provide a concise current weather summary for Dongcheon-dong."],
        execution_semantics: directSemantics,
        delivery_mode: "direct" as const,
        needs_web: true,
      },
      execution: {
        ...createBaseIntakeResult().execution,
        requires_run: true,
        needs_web: true,
        execution_semantics: directSemantics,
      },
    }
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue(delegatedIntake),
      resolveRunRoute: vi.fn().mockReturnValue({
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        providerId: "openai",
        model: "gpt-5.4",
        reason: "routing:provider:openai",
      }),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn().mockReturnValue("general_chat"),
      buildFollowupPrompt: vi.fn().mockReturnValue("[Task Execution Brief]\nweather"),
    }

    await runIntakeBridgePass(
      {
        config: DEFAULT_CONFIG,
        message: "지금 동천동 날씨 어때?",
        originalRequest: "지금 동천동 날씨 어때?",
        sessionId: "session-weather",
        requestGroupId: "group-weather",
        model: "gpt-test",
        workDir: "/tmp/project",
        source: "telegram",
        runId: "run-weather",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(moduleDependencies.buildFollowupPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        intake: expect.objectContaining({
          intent_envelope: expect.objectContaining({
            delivery_mode: "none",
            execution_semantics: expect.objectContaining({ artifactDelivery: "none" }),
          }),
        }),
      }),
    )
    expect(dependencies.startDelegatedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        executionSemantics: expect.objectContaining({ artifactDelivery: "none" }),
        intentEnvelope: expect.objectContaining({
          delivery_mode: "none",
          execution_semantics: expect.objectContaining({ artifactDelivery: "none" }),
        }),
      }),
    )
  })

  it("emits schedule created event for recurring schedule receipts", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        ...createBaseIntakeResult(),
        intent: {
          category: "schedule_request" as const,
          summary: "반복 예약",
          confidence: 0.9,
        },
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn().mockReturnValue({
        ok: true,
        message: "스케줄이 저장되었습니다.",
        detail: "매 분: 안녕이라고 해줘",
        successCount: 1,
        failureCount: 0,
        receipts: [
          {
            kind: "schedule_create_recurring" as const,
            scheduleId: "schedule-1",
            title: "매 분 안녕",
            task: "안녕이라고 해줘",
            cron: "* * * * *",
            scheduleText: "매 분",
            source: "telegram" as const,
            targetSessionId: "telegram-session-1",
            originRunId: "run-4",
            originRequestGroupId: "group-4",
            driver: "internal" as const,
          },
        ],
      }),
      createDefaultScheduleActionDependencies: vi.fn().mockReturnValue({}),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "매 분 안녕이라고 해줘",
        originalRequest: "매 분 안녕이라고 해줘",
        sessionId: "session-4",
        requestGroupId: "group-4",
        model: "gpt-test",
        config: structuredClone(DEFAULT_CONFIG),
        workDir: "/tmp",
        source: "telegram",
        runId: "run-4",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(dependencies.emitScheduleCreated).toHaveBeenCalledWith({
      runId: "run-4",
      requestGroupId: "group-4",
      registrationKind: "recurring",
      title: "매 분 안녕",
      task: "안녕이라고 해줘",
      source: "telegram",
      scheduleText: "매 분",
      scheduleId: "schedule-1",
      cron: "* * * * *",
      targetSessionId: "telegram-session-1",
      driver: "internal",
    })
    expect(result).toEqual({
      kind: "complete",
      text: "스케줄이 저장되었습니다.",
      textSource: "runtime_deterministic",
      eventLabel: "intake 처리 결과 전달",
    })
  })

  it("does not synthesize a changed strategy from retryable intake provider wording", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue({
        status: "failure" as const,
        reasonCode: "provider_unavailable" as const,
        retryable: true,
        providerInvocationRef: "intake:invocation-1",
      }),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    await expect(
      runIntakeBridgePass(
        {
          message: "컴퓨터 카메라로 사진찍어서 보내줘",
          originalRequest: "컴퓨터 카메라로 사진찍어서 보내줘",
          sessionId: "session-camera",
          requestGroupId: "group-camera",
          model: "gpt-test",
          workDir: "/tmp/project",
          source: "telegram",
          runId: "run-camera",
          onChunk: undefined,
          reuseConversationContext: false,
        },
        dependencies,
        moduleDependencies,
      ),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "intake",
      reasonCode: "provider_unavailable",
      retryable: true,
      safeEvidenceRefs: ["llm-invocation:intake:invocation-1"],
    })
    expect(dependencies.recordCanonicalIntakeDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.recordCanonicalExecutionStart).not.toHaveBeenCalled()
  })
})
