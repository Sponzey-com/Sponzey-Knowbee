import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const dashboardSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "lib", "advanced-dashboard.ts"), "utf-8")
const sharedRunLabelsSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "lib", "run-labels.ts"), "utf-8")
const componentRunLabelsSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "runs", "runLabels.ts"), "utf-8")

describe("task0433 advanced dashboard runtime wording", () => {
  it("moves run labels to a shared lib while preserving component imports", () => {
    expect(sharedRunLabelsSource).toContain("export function toRunStatusText")
    expect(sharedRunLabelsSource).toContain("export function toRunSourceText")
    expect(sharedRunLabelsSource).toContain("export function toTaskProfileText")
    expect(sharedRunLabelsSource).toContain("export function toContextModeText")
    expect(componentRunLabelsSource).toContain('from "../../lib/run-labels"')
  })

  it("uses user-facing run status and source labels in advanced dashboard cards", () => {
    expect(dashboardSource).not.toContain("${run.title || run.prompt} · ${run.status} · ${run.source}")
    expect(dashboardSource).not.toContain("${run.title || run.prompt} · ${run.status}")
    expect(dashboardSource).not.toContain("${issue.label} · ${issue.status} · ${issue.count}")

    expect(dashboardSource).toContain('import { toRunSourceText, toRunStatusText } from "./run-labels"')
    expect(dashboardSource).toContain("toRunStatusText(run.status, input.language)")
    expect(dashboardSource).toContain("toRunSourceText(run.source, input.language)")
    expect(dashboardSource).toContain("operationsHealthStatusLabel(issue.status, input.language)")
  })

  it("uses user-facing doctor summary labels instead of key-value debug text", () => {
    expect(dashboardSource).not.toContain("ok=${input.doctor.summary.ok}")
    expect(dashboardSource).not.toContain("warning=${doctorWarning}")
    expect(dashboardSource).not.toContain("blocked=${doctorBlocked}")
    expect(dashboardSource).not.toContain("unknown=${input.doctor.summary.unknown}")
    expect(dashboardSource).not.toContain("value: input.doctor?.overallStatus ?? \"-\"")

    expect(dashboardSource).toContain("function doctorSummaryStatusLabel")
    expect(dashboardSource).toContain("doctorSummaryStatusLabel(input.doctor.overallStatus, input.language)")
    expect(dashboardSource).toContain('`${t("정상", "OK")} ${input.doctor.summary.ok}`')
    expect(dashboardSource).toContain('`${t("확인 필요", "Needs check")} ${input.doctor.summary.unknown}`')
  })
})

