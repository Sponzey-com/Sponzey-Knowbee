import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  WORK_ORDER_TEMPLATE_CATALOG,
  getWorkOrderTemplate,
  getWorkOrderTemplateContext,
} from "../packages/core/src/topology-runtime/work-order-templates.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0961 work-order template prompt source", () => {
  it("registers work-order template prompt text as an internal English source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "work_order_template_prompt_text_user" && item.locale === "en"
    )

    expect(source).toMatchObject({
      sourceId: "work_order_template_prompt_text_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("triage.description=Classify a customer request")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders built-in work-order prompt text from source values", () => {
    const triage = getWorkOrderTemplate("work-order-template:customer-request-triage")
    const failure = getWorkOrderTemplate("work-order-template:failure-drill")

    expect(triage.descriptionEn).toBe(
      "Classify a customer request from the selected entry node and summarize next action.",
    )
    expect(triage.objective).toBe(
      "Triage the selected customer request and return a concise next-action summary.",
    )
    expect(triage.successCriteria.map((criterion) => criterion.description)).toEqual([
      "Return a concise summary of the request.",
      "Return one clear next action.",
    ])
    expect(failure.descriptionEn).toBe("Exercise FailureReport, retry, and fallback overlay behavior.")
    expect(failure.objective).toBe("Run a controlled failure drill for the selected entry node.")
    expect(failure.successCriteria[0]?.description).toBe(
      "A failure summary is produced after exhaustion review.",
    )
  })

  it("keeps catalog and context fallback behavior unchanged", () => {
    const fallbackTemplate = getWorkOrderTemplate(undefined)
    const explicitTemplate = WORK_ORDER_TEMPLATE_CATALOG.templates[0]

    expect(fallbackTemplate.templateId).toBe(explicitTemplate?.templateId)
    expect(getWorkOrderTemplateContext(fallbackTemplate, undefined).id).toBe(
      fallbackTemplate.contextPresets[0]?.id,
    )
    expect(getWorkOrderTemplateContext(fallbackTemplate, "context:customer-urgent").id).toBe(
      "context:customer-urgent",
    )
  })

  it("does not keep work-order prompt text bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/topology-runtime/work-order-templates.ts", "utf-8")

    expect(source).toContain("work_order_template_prompt_text_user")
    expect(source).not.toContain("Classify a customer request from the selected entry node")
    expect(source).not.toContain("Triage the selected customer request and return a concise")
    expect(source).not.toContain("Return a concise summary of the request.")
    expect(source).not.toContain("Return one clear next action.")
    expect(source).not.toContain("Exercise FailureReport, retry, and fallback overlay behavior.")
    expect(source).not.toContain("Run a controlled failure drill for the selected entry node.")
    expect(source).not.toContain("A failure summary is produced after exhaustion review.")
  })
})
