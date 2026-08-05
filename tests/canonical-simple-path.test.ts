import { describe, expect, it, vi } from "vitest"
import {
  buildCanonicalSimplePathReleaseDescriptor,
  releaseCanonicalSimplePath,
} from "../packages/core/src/runs/canonical-simple-path.ts"
import { createCanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"

describe("canonical simple path release", () => {
  it("releases only an unstarted root aggregate", () => {
    const descriptor = buildCanonicalSimplePathReleaseDescriptor({
      runId: "run:simple",
      classification: { category: "direct_answer", mode: "direct_answer" },
      answerSource: "llm_generated",
      requestText: "hello",
      answerText: "Hello.",
    })
    const remove = vi.fn(() => true)
    expect(
      releaseCanonicalSimplePath(descriptor, {
        loadAggregate: () =>
          createCanonicalWorkAggregate({
            workId: descriptor.workId,
            rootRunId: descriptor.runId,
          }),
        deleteUnstartedAggregate: remove,
      }),
    ).toEqual({ ok: true })
    expect(remove).toHaveBeenCalledWith(descriptor.workId)
  })

  it("rejects an aggregate after canonical execution has started", () => {
    const descriptor = buildCanonicalSimplePathReleaseDescriptor({
      runId: "run:simple",
      classification: { category: "direct_answer" },
      answerSource: "llm_generated",
      requestText: "hello",
      answerText: "Hello.",
    })
    expect(
      releaseCanonicalSimplePath(descriptor, {
        loadAggregate: () => ({
          ...createCanonicalWorkAggregate({
            workId: descriptor.workId,
            rootRunId: descriptor.runId,
          }),
          state: "SOLUTION_ANALYZED",
          revision: 1,
          transitions: [],
        }),
        deleteUnstartedAggregate: vi.fn(() => true),
      }),
    ).toEqual({ ok: false, reasonCode: "canonical_simple_path_already_started" })
  })
})
