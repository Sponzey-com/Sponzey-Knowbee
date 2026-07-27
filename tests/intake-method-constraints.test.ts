import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { extractIntakeMethodConstraints } from "../packages/core/src/agent/intake-method-constraints.ts"
import { TASK_INTAKE_RESPONSE_TOOL } from "../packages/core/src/agent/intake-response-tool.ts"

function runTaskPayloadProperty(field: "preferred_methods" | "exclusive_methods" | "target_instance") {
  const root = TASK_INTAKE_RESPONSE_TOOL.input_schema as Record<string, unknown>
  const properties = root.properties as Record<string, unknown>
  const actionItems = properties.action_items as Record<string, unknown>
  const itemSchema = actionItems.items as Record<string, unknown>
  const variants = itemSchema.anyOf as Array<Record<string, unknown>>
  const runTask = variants.find((candidate) => {
    const candidateProperties = candidate.properties as Record<string, unknown>
    const type = candidateProperties.type as Record<string, unknown>
    return Array.isArray(type.enum) && type.enum.includes("run_task")
  })
  const runTaskProperties = runTask?.properties as Record<string, unknown>
  const payload = runTaskProperties.payload as Record<string, unknown>
  const payloadProperties = payload.properties as Record<string, unknown>
  return payloadProperties[field] as Record<string, unknown>
}

function methodItemSchema(field: "preferred_methods" | "exclusive_methods") {
  return runTaskPayloadProperty(field).items as Record<string, unknown>
}

describe("LLM intake method constraints", () => {
  it("extracts exact preferred, exclusive, and target values with stable deduplication", () => {
    expect(
      extractIntakeMethodConstraints([
        {
          payload: {
            preferred_methods: [" web.search ", "mcp.finance", "web.search"],
            exclusive_methods: ["mcp.finance", "mcp.finance"],
            target_instance: " pc:office ",
          },
        },
      ]),
    ).toEqual({
      ok: true,
      constraints: {
        requestedMethods: ["web.search", "mcp.finance"],
        exclusiveMethods: ["mcp.finance"],
        targetId: "pc:office",
      },
    })
  })

  it("returns typed issues for malformed values and conflicting targets", () => {
    expect(
      extractIntakeMethodConstraints([{ payload: { preferred_methods: "web.search" } }]),
    ).toEqual({
      ok: false,
      reasonCode: "method_constraints_malformed",
    })
    expect(
      extractIntakeMethodConstraints([
        { payload: { target_instance: "pc:office" } },
        { payload: { target_instance: "pc:home" } },
      ]),
    ).toEqual({ ok: false, reasonCode: "target_instance_conflict" })
  })

  it("rejects prose where a stable capability identifier is required", () => {
    expect(
      extractIntakeMethodConstraints([{
        payload: {
          preferred_methods: ["Use another permitted local method."],
        },
      }]),
    ).toEqual({
      ok: false,
      reasonCode: "method_identifier_invalid",
    })
  })

  it("returns empty explicit constraints without inventing capabilities", () => {
    expect(extractIntakeMethodConstraints([{
      payload: {
        target_instance: null,
      },
    }])).toEqual({
      ok: true,
      constraints: { requestedMethods: [], exclusiveMethods: [] },
    })
  })

  it("publishes the stable identifier format in the response-tool schema", () => {
    expect(methodItemSchema("preferred_methods")).toMatchObject({
      type: "string",
      pattern: "^[a-z][a-z0-9_.:-]{0,127}$",
      description: expect.stringContaining("explicitly supplied"),
    })
    expect(methodItemSchema("exclusive_methods")).toMatchObject({
      type: "string",
      pattern: "^[a-z][a-z0-9_.:-]{0,127}$",
      description: expect.stringContaining("explicitly supplied"),
    })
    expect(runTaskPayloadProperty("target_instance")).toMatchObject({
      type: ["string", "null"],
      pattern: "^[a-z][a-z0-9_.:-]{0,127}$",
      description: expect.stringContaining("Use null when the user did not supply one"),
    })
  })

  it("defines method exclusivity and exact target ownership in the intake prompt", () => {
    const prompt = readFileSync(new URL("../prompts/task_intake.md", import.meta.url), "utf8")
    expect(prompt).toContain("`preferred_methods`")
    expect(prompt).toContain("`exclusive_methods`")
    expect(prompt).toContain("`target_instance`")
    expect(prompt).toContain(
      "only when the user explicitly requires that method and forbids alternatives",
    )
    expect(prompt).toContain("Do not infer, translate, alias, or invent")
    expect(prompt).toContain("Use stable capability identifiers, not prose or instructions")
    expect(prompt).toContain(
      "Alternative strategy descriptions belong in the goal, context, or constraints",
    )
    expect(prompt).toContain(
      "never derive `target_instance` from a method name, runtime context, or suggested target",
    )
  })
})
