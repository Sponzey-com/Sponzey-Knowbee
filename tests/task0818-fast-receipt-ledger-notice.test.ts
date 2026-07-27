import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildIngressAcknowledgement } from "../packages/core/src/runs/ingress.ts"

describe("task0818 fast acknowledgement control ledger", () => {
  it("builds a bounded acknowledgement without request or response text", () => {
    const acknowledgement = buildIngressAcknowledgement("상태 확인해줘")

    expect(acknowledgement).toMatchObject({
      kind: "intake_acknowledgement",
      state: "request_received",
      language: "ko",
      deliveryMode: "interactive_control",
      finalAnswer: false,
    })
    expect(acknowledgement).not.toHaveProperty("text")
  })

  it("records only structured acknowledgement controls in channel ledgers", () => {
    const telegram = readFileSync(join(process.cwd(), "packages/core/src/channels/telegram/bot.ts"), "utf-8")
    const slack = readFileSync(join(process.cwd(), "packages/core/src/channels/slack/bot.ts"), "utf-8")
    const runsRoute = readFileSync(join(process.cwd(), "packages/core/src/api/routes/runs.ts"), "utf-8")

    for (const source of [telegram, slack]) {
      expect(source).toContain("acknowledgementControl: acknowledgement")
      expect(source).toContain("sendIntakeAcknowledgement")
      expect(source).not.toContain("sendReceipt(receipt.text)")
    }
    expect(runsRoute).toContain("acknowledgement,")
    expect(runsRoute).not.toContain("receipt: receipt.text")
  })
})
