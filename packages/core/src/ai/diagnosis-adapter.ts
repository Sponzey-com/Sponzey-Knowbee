import type {
  LlmDiagnosisProvider,
  LlmRequestDiagnosisProviderInput,
  LlmResultDiagnosisProviderInput,
} from "../contracts/llm-diagnosis-provider.js"
import type {
  LlmDiagnosisSchemaRepairProvider,
  LlmDiagnosisSchemaRepairProviderInput,
} from "../contracts/llm-diagnosis-schema-repair-provider.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import {
  createUntrustedEvidenceEnvelope,
  projectUntrustedEvidenceForPrompt,
  redactUntrustedEvidenceContent,
} from "../security/trust-boundary.js"
import type { AIProvider, ChatParams } from "./types.js"
import { collectStructuredToolAttempt } from "./structured-tool-attempt.js"
import {
  REQUEST_DIAGNOSIS_RESPONSE_TOOL,
  REQUEST_DIAGNOSIS_RESPONSE_TOOL_NAME,
  RESULT_DIAGNOSIS_RESPONSE_TOOL,
  RESULT_DIAGNOSIS_RESPONSE_TOOL_NAME,
} from "./diagnosis-response-tools.js"

export interface AiChatDiagnosisProviderAdapterOptions {
  provider: AIProvider
  model: string
  diagnosisPromptSourceBlock: string
  maxTokens?: number
  deadlineMs?: number
  workDir?: string
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

type DiagnosisPromptKind = "request_diagnosis" | "result_diagnosis" | "schema_repair"

export class AiChatDiagnosisProviderAdapter
  implements LlmDiagnosisProvider, LlmDiagnosisSchemaRepairProvider
{
  constructor(private readonly options: AiChatDiagnosisProviderAdapterOptions) {}

  diagnoseRequest(input: LlmRequestDiagnosisProviderInput): Promise<unknown> {
    return this.runJsonPrompt("request_diagnosis", input)
  }

  diagnoseResult(input: LlmResultDiagnosisProviderInput): Promise<unknown> {
    return this.runJsonPrompt("result_diagnosis", input)
  }

  repairDiagnosis(input: LlmDiagnosisSchemaRepairProviderInput): Promise<unknown> {
    return this.runJsonPrompt("schema_repair", input)
  }

  private async runJsonPrompt(kind: DiagnosisPromptKind, input: unknown): Promise<unknown> {
    const promptInput =
      kind === "result_diagnosis"
        ? projectResultDiagnosisEvidence(input as LlmResultDiagnosisProviderInput)
        : input
    const promptPayload = {
      kind,
      instruction: loadPromptValue(
        "diagnosis_json_instruction_user",
        {},
        {
          required: true,
          ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
        },
      ),
      input: promptInput,
    }
    const resultTarget =
      kind === "result_diagnosis" ||
      (kind === "schema_repair" &&
        (input as LlmDiagnosisSchemaRepairProviderInput).target ===
          "result_diagnosis")
    const responseTool = resultTarget
      ? RESULT_DIAGNOSIS_RESPONSE_TOOL
      : REQUEST_DIAGNOSIS_RESPONSE_TOOL
    const responseToolName = resultTarget
      ? RESULT_DIAGNOSIS_RESPONSE_TOOL_NAME
      : REQUEST_DIAGNOSIS_RESPONSE_TOOL_NAME
    const chatParams: ChatParams = {
      model: this.options.model,
      system: this.options.diagnosisPromptSourceBlock,
      messages: [{ role: "user" as const, content: JSON.stringify(promptPayload) }],
      tools: [responseTool],
      toolChoice: "required",
      ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
      ...(this.options.observabilityContext
        ? {
            observability: {
              ...this.options.observabilityContext,
              stage: kind === "request_diagnosis" ? ("intake" as const) : ("review" as const),
              operationCode: kind,
            },
          }
        : {}),
    }

    const result = await collectStructuredToolAttempt({
      stream: (signal) =>
        this.options.provider.chat({
          ...chatParams,
          signal,
        }),
      deadlineMs: this.options.deadlineMs ?? 24_000,
      responseToolName,
      maxTextBytes: 4_096,
      maxToolInputBytes: 65_536,
    })
    return result.status === "parsed"
      ? result.value
      : { diagnosis_adapter_error: result.status }
  }
}

function projectResultDiagnosisEvidence(
  input: LlmResultDiagnosisProviderInput,
): ReturnType<typeof projectUntrustedEvidenceForPrompt> {
  const redaction = redactUntrustedEvidenceContent(JSON.stringify(input))
  return projectUntrustedEvidenceForPrompt(
    createUntrustedEvidenceEnvelope({
      sourceKind: input.evidenceSourceKind ?? "tool",
      sourceRef: `result-diagnosis:${input.workId ?? "unscoped"}:${input.stepId}`,
      contentLabel: "Result evidence for diagnosis",
      ownerScope: { ownerType: "system", ownerId: `diagnosis:${input.workId ?? "unscoped"}` },
      content: redaction.content,
      redactionState: "redacted",
    }),
  )
}
