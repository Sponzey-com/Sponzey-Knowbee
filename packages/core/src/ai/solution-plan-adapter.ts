import type {
  LlmSolutionPlanProvider,
  LlmSolutionPlanProviderInput,
  LlmSolutionPlanRepairProvider,
  LlmSolutionPlanRepairProviderInput,
} from "../contracts/llm-solution-plan-provider.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import { collectStructuredToolAttempt } from "./structured-tool-attempt.js"
import {
  SOLUTION_PLAN_RESPONSE_TOOL,
  SOLUTION_PLAN_RESPONSE_TOOL_NAME,
} from "./solution-plan-response-tool.js"
import type { AIProvider, ChatParams, ToolDefinition } from "./types.js"

interface MutableSolutionPlanStepSchema {
  properties: Record<string, unknown>
  required: string[]
}

function normalizedCapabilityRefs(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) =>
          value.startsWith("capability:") ? value : `capability:${value}`,
        ),
    ),
  ].sort()
}

function capabilityBoundSolutionPlanResponseTool(
  capabilityRefs: string[],
  requiredCapabilityRefs: string[],
): ToolDefinition {
  const refs = normalizedCapabilityRefs(capabilityRefs)
  const requiredRefs = normalizedCapabilityRefs(requiredCapabilityRefs)
  if (refs.length === 0) return SOLUTION_PLAN_RESPONSE_TOOL
  const inputSchema = structuredClone(SOLUTION_PLAN_RESPONSE_TOOL.input_schema)
  const stepsSchema = inputSchema.properties.steps as {
    items?: MutableSolutionPlanStepSchema
  }
  const stepSchema = stepsSchema.items
  if (!stepSchema) {
    throw new Error("Solution-plan response Tool step schema is required.")
  }
  stepSchema.properties.capability_ref = {
    type: "string",
    enum: refs,
    description:
      "Select the one provided capability reference used by this step. "
      + "Every requiredCapabilityRefs value must be selected by at least one use_tool or use_yeonjang step. "
      + `Required values: ${requiredRefs.join(", ") || "(none)"}.`,
  }
  stepSchema.required = [...new Set([...stepSchema.required, "capability_ref"])]
  return {
    ...SOLUTION_PLAN_RESPONSE_TOOL,
    input_schema: inputSchema,
  }
}

function materializeSelectedCapabilityRefs(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = structuredClone(value)
  if (!Array.isArray(normalized.steps)) return normalized
  for (const candidate of normalized.steps) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue
    const step = candidate as Record<string, unknown>
    const capabilityRef =
      typeof step.capability_ref === "string"
        ? step.capability_ref.trim()
        : ""
    delete step.capability_ref
    if (
      !capabilityRef ||
      (step.action_type !== "use_tool" &&
        step.action_type !== "use_yeonjang")
    ) {
      continue
    }
    const inputRefs = Array.isArray(step.input_refs)
      ? step.input_refs.filter(
          (reference): reference is string =>
            typeof reference === "string" && Boolean(reference.trim()),
        )
      : []
    step.input_refs = [
      ...new Set([
        ...inputRefs.map((reference) => reference.trim()),
        capabilityRef,
      ]),
    ]
  }
  return normalized
}

export interface AiChatSolutionPlanProviderAdapterOptions {
  provider: AIProvider
  model: string
  solutionPlanPromptSourceBlock: string
  maxTokens?: number
  deadlineMs?: number
  maxVisibleTextBytes?: number
  workDir?: string
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

export class AiChatSolutionPlanProviderAdapter
  implements LlmSolutionPlanProvider, LlmSolutionPlanRepairProvider
{
  constructor(private readonly options: AiChatSolutionPlanProviderAdapterOptions) {}

  async planSolution(input: LlmSolutionPlanProviderInput): Promise<unknown> {
    return this.requestStructuredPlan({
      kind: "solution_plan",
      instruction: loadPromptValue(
        "solution_plan_json_instruction_user",
        {},
        {
          required: true,
          ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
        },
      ),
      input,
    }, input.capabilityRefs, input.requiredCapabilityRefs ?? [])
  }

  async repairSolutionPlan(input: LlmSolutionPlanRepairProviderInput): Promise<unknown> {
    return this.requestStructuredPlan({
      kind: "solution_plan_schema_repair",
      instruction: loadPromptValue(
        "solution_plan_json_instruction_user",
        {},
        {
          required: true,
          ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
        },
      ),
      repair: input,
    }, input.subject.capabilityRefs, input.subject.requiredCapabilityRefs ?? [])
  }

  private async requestStructuredPlan(
    payload: Record<string, unknown>,
    capabilityRefs: string[],
    requiredCapabilityRefs: string[],
  ): Promise<unknown> {
    const chatParams: ChatParams = {
        model: this.options.model,
        system: this.options.solutionPlanPromptSourceBlock,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
        tools: [
          capabilityBoundSolutionPlanResponseTool(
            capabilityRefs,
            requiredCapabilityRefs,
          ),
        ],
        toolChoice: "required",
        ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
        ...(this.options.observabilityContext
          ? {
              observability: {
                ...this.options.observabilityContext,
                stage: "planning" as const,
                operationCode:
                  payload.kind === "solution_plan_schema_repair"
                    ? "solution_plan_schema_repair"
                    : "solution_plan",
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
      responseToolName: SOLUTION_PLAN_RESPONSE_TOOL_NAME,
      maxTextBytes: 4_096,
      maxToolInputBytes: this.options.maxVisibleTextBytes ?? 65_536,
    })
    if (result.status === "parsed")
      return materializeSelectedCapabilityRefs(result.value)
    return { solution_plan_adapter_error: result.status }
  }
}
