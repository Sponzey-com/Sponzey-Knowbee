import { describe, expect, it } from "vitest"

import {
  createYeonjangBrowserActiveTabInfoAuditEvidencePolicy,
  validateYeonjangBrowserActiveTabInfoEvidenceUse,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-audit-evidence-boundary.ts"

describe("Task 211 Yeonjang browser.active_tab_info audit evidence boundary", () => {
  it("documents the audit-only raw evidence retention policy without public storage", () => {
    const policy = createYeonjangBrowserActiveTabInfoAuditEvidencePolicy()

    expect(policy).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-audit-evidence-boundary-v1",
      method: "browser.active_tab_info",
      rawEvidenceVisibility: "audit_only",
      retentionScope: "ephemeral_registry_snapshot",
      auditAccessMode: "explicit_audit_context_only",
      defaultLiveSmokeAllowed: false,
    })
    expect(policy.rawDetailFields).toEqual([
      "browserName",
      "title",
      "url",
      "profileName",
      "profilePath",
      "pid",
      "windowId",
      "tabId",
    ])
    expect(policy.prohibitedPublicFields).toEqual(expect.arrayContaining([
      "rawDetails",
      "rawDetailsSchema",
      "rawMqttPayload",
      "title",
      "url",
      "profileName",
      "profilePath",
      "pid",
      "windowId",
      "tabId",
      "internalInstanceId",
      "sessionId",
      "clientId",
      "backendFamily",
    ]))
    expect(policy.publicDestinations).toMatchObject({
      readiness_route: "redacted_projection_only",
      diagnostics_route: "redacted_projection_only",
      pre_dispatch_preview: "redacted_observation_or_evidence_ref",
      webui_state: "redacted_projection_only",
      product_log: "evidence_reference_only",
      final_response: "redacted_summary_only",
    })
  })

  it("allows raw evidence only for explicit audit context", () => {
    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "audit_record",
      visibility: "raw",
      explicitAuditContext: true,
      fields: ["browserName", "title", "url", "pid"],
    })).toEqual({ ok: true })

    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "audit_record",
      visibility: "raw",
      explicitAuditContext: false,
      fields: ["browserName", "title"],
    })).toEqual({
      ok: false,
      reasonCode: "explicit_audit_context_required",
    })

    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "readiness_route",
      visibility: "raw",
      explicitAuditContext: true,
      fields: ["browserName", "title"],
    })).toEqual({
      ok: false,
      reasonCode: "raw_evidence_destination_forbidden",
    })
  })

  it("blocks raw fields in public outputs and permits redacted evidence references", () => {
    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "webui_state",
      visibility: "redacted",
      explicitAuditContext: false,
      fields: ["schemaVersion", "method", "browserName", "titleHash", "urlScheme", "urlHash"],
    })).toEqual({ ok: true })

    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "final_response",
      visibility: "redacted",
      explicitAuditContext: false,
      fields: ["browserName", "title"],
    })).toEqual({
      ok: false,
      reasonCode: "public_field_not_redacted",
      field: "title",
    })

    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "product_log",
      visibility: "evidence_ref",
      explicitAuditContext: false,
      fields: ["evidenceRef"],
    })).toEqual({ ok: true })

    expect(validateYeonjangBrowserActiveTabInfoEvidenceUse({
      destination: "product_log",
      visibility: "redacted",
      explicitAuditContext: false,
      fields: ["browserName", "titleHash"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
