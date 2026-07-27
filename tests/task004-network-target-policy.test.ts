import { describe, expect, it } from "vitest"

import {
  type PublicTargetDecision,
  evaluatePublicNetworkTarget,
} from "../packages/core/src/security/network-target-policy.js"

function expectBlocked(decision: PublicTargetDecision, code: string): void {
  expect(decision).toMatchObject({ allowed: false, code })
}

describe("task004 public network target policy", () => {
  it("accepts public HTTP(S) targets with only public DNS results", () => {
    expect(
      evaluatePublicNetworkTarget({
        rawUrl: "https://example.com/quote",
        resolvedAddresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
      }),
    ).toMatchObject({ allowed: true, canonicalUrl: "https://example.com/quote" })
  })

  it.each([
    ["http://localhost/admin", ["127.0.0.1"], "hostname_not_public"],
    ["http://user:secret@example.com", ["93.184.216.34"], "credentials_not_allowed"],
    ["file:///etc/passwd", [], "scheme_not_allowed"],
    ["not a url", [], "invalid_url"],
    ["http://169.254.169.254/latest/meta-data", ["169.254.169.254"], "address_not_public"],
    ["http://private.test", ["10.0.0.8"], "address_not_public"],
    ["http://private-v6.test", ["fd00::8"], "address_not_public"],
    ["http://loopback-v6.test", ["::1"], "address_not_public"],
    ["http://empty.test", [], "dns_result_empty"],
  ])("blocks %s with a typed code", (rawUrl, resolvedAddresses, code) => {
    expectBlocked(evaluatePublicNetworkTarget({ rawUrl, resolvedAddresses }), code)
  })

  it("fails closed when any DNS answer is non-public", () => {
    expectBlocked(
      evaluatePublicNetworkTarget({
        rawUrl: "https://rebinding.test",
        resolvedAddresses: ["93.184.216.34", "192.168.1.10"],
      }),
      "address_not_public",
    )
  })
})
