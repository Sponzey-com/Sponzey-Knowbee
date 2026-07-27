import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "ExecutorRunResultPanel.tsx"),
  "utf-8",
)

describe("task0450 executor trace redaction", () => {
  it("uses diagnostic trace wording instead of raw trace wording", () => {
    expect(source).not.toContain('data-testid="executor-result-raw-trace"')
    expect(source).not.toContain("function RawTraceList")
    expect(source).toContain('data-testid="executor-result-diagnostic-trace"')
    expect(source).toContain("function TraceReceiptList")
  })

  it("does not render trace, failure, node-run, or work-order IDs directly", () => {
    expect(source).not.toContain("{event.traceEventId} / {event.nodeRunId} / {event.workOrderId}")
    expect(source).not.toContain("{failure.failureReportId} / {failure.nodeRunId} / {failure.workOrderId}")
    expect(source).toContain('data-testid="executor-result-trace-receipt-event"')
    expect(source).toContain('data-testid="executor-result-failure-receipt"')
  })
})
