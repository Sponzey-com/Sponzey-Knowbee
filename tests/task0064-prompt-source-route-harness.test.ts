import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerPromptSourcesRoute } from "../packages/core/src/api/routes/prompt-sources.ts"
import type { SystemPromptDisclosureAuthorizationReceipt } from "../packages/core/src/contracts/system-prompt-disclosure-boundary.ts"
import type {
  PromptImprovementApprovalRecord,
  PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): any
  }>
}

const tempDirs: string[] = []
const disclosureNow = Date.UTC(2026, 6, 14, 22, 0, 0)

function registerTestPromptSourcesRoute(app: Parameters<typeof registerPromptSourcesRoute>[0]): void {
  registerPromptSourcesRoute(app, {
    now: () => disclosureNow,
    resolveAuthorizationReceipt: (authorizationId, context): SystemPromptDisclosureAuthorizationReceipt | undefined => {
      if (authorizationId !== "authorization:test") return undefined
      const actorCapability = context.purpose === "prompt_review_or_improvement"
        ? "prompt_reviewer"
        : context.purpose === "administrator_debug" ? "administrator" : "security_auditor"
      return {
        schemaVersion: 1, authorizationId, requestId: context.requestId, actorRef: context.actorRef,
        actorCapability, audienceRef: context.audienceRef, purpose: context.purpose,
        targetSourceRefs: [context.targetSourceRef], sourceSetFingerprint: "sources:test",
        redactionMode: "raw_authorized", maxBytes: 1_000_000, maxSegments: 1_000,
        decision: "approved", issuedAt: disclosureNow, expiresAt: disclosureNow + 60_000,
      }
    },
  })
}

function createPromptFixture(content = "# Identity\n\nOriginal identity prompt\n"): { root: string; identityPath: string } {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task0064-prompt-route-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  const identityPath = join(promptsDir, "identity.md")
  writeFileSync(identityPath, content, "utf-8")
  return { root, identityPath }
}

function approvalRecord(): PromptImprovementApprovalRecord {
  return {
    approvedBy: "admin:prompt-source-route-test",
    approvedAt: "2026-07-04T00:00:00.000Z",
    approvalScope: ["apply_change"],
    targetPromptSources: ["identity:en"],
    targetHarnessSources: [],
    riskAccepted: "medium",
  }
}

function harnessInput(): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Save reviewed identity prompt source.",
    improvementKind: "prompt_source",
    improvingAgentName: "Knowbee",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "admin_request",
    targetPromptSources: ["identity:en"],
    activeHarnessVersion: "prompt_improvement.md:sha256:active",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["identity"],
    currentBehavior: "The active prompt source draft differs from the saved prompt source.",
    desiredBehavior: "The reviewed prompt source is saved.",
    userReactionEvidence: ["User explicitly submitted the write route."],
    responseStrategyTarget: "identity",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change unrelated prompt sources."],
    allowedChangeScope: ["identity:en"],
    requiredInvariants: ["identity", "safety"],
    requiredTests: ["tests/task0064-prompt-source-route-harness.test.ts"],
    approvalMode: "admin_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore identity:en from the generated prompt backup.",
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0064 prompt source route harness gate", () => {
  it("rejects query-only raw disclosure when no server receipt resolver is installed", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}&purpose=prompt_review&actor=actor%3Aowner&target=prompt-source%3Aidentity%3Aen&audience=audience%3Aowner&redactionMode=raw_authorized&authorizationId=self-asserted&requestId=request%3A1`,
      })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining(["authorization_missing_or_invalid"]),
      })
    } finally {
      await app.close()
    }
  })

  it("blocks prompt source metadata lists without an authorized disclosure contract", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const missing = await app.inject({
        method: "GET",
        url: `/api/prompt-sources?workDir=${encodeURIComponent(root)}`,
      })
      expect(missing.statusCode).toBe(403)
      expect(missing.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining([
          "purpose_missing_or_invalid",
          "actor_missing",
          "audience_missing",
          "redaction_mode_missing_or_invalid",
        ]),
      })

      const invalidPurpose = await app.inject({
        method: "GET",
        url: `/api/prompt-sources?workDir=${encodeURIComponent(root)}&purpose=ordinary_ui&actor=test&audience=test&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })
      expect(invalidPurpose.statusCode).toBe(403)
      expect(invalidPurpose.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining(["purpose_missing_or_invalid", "target_missing"]),
      })
    } finally {
      await app.close()
    }
  })

  it("blocks raw prompt source disclosures without the expected target", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const missingTarget = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}&purpose=prompt_improvement&actor=webui-active-instructions-panel&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })
      expect(missingTarget.statusCode).toBe(403)
      expect(missingTarget.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: ["target_missing"],
      })

      const wrongTarget = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}&purpose=prompt_improvement&actor=webui-active-instructions-panel&target=prompt-source:planner:en&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })
      expect(wrongTarget.statusCode).toBe(403)
      expect(wrongTarget.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: ["target_mismatch"],
      })
    } finally {
      await app.close()
    }
  })

  it("redacts prompt source metadata for authorized redacted disclosure lists", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources?workDir=${encodeURIComponent(root)}&purpose=audit&actor=test:audit&audience=auditor&redactionMode=redacted`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: "[internal-path-redacted]",
        disclosure: {
          purpose: "audit",
          actor: "test:audit",
          audience: "auditor",
          redactionMode: "redacted",
          state: "redacted",
        },
        sources: [
          expect.objectContaining({
            sourceId: "identity",
            locale: "en",
            path: "[internal-path-redacted]",
            checksum: "[checksum-redacted]",
          }),
        ],
      })
      expect(JSON.stringify(response.json())).not.toContain(root)
      expect(JSON.stringify(response.json())).not.toContain("Original identity prompt")
    } finally {
      await app.close()
    }
  })

  it("returns prompt source metadata only for authorized raw disclosure lists", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources?workDir=${encodeURIComponent(root)}&purpose=prompt_improvement&actor=webui-active-instructions-panel&target=prompt-source-registry&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: root,
        disclosure: {
          purpose: "prompt_improvement",
          actor: "webui-active-instructions-panel",
          target: "prompt-source-registry",
          audience: "authorized-user",
          redactionMode: "raw_authorized",
          state: "raw_authorized",
        },
        sources: [
          expect.objectContaining({
            sourceId: "identity",
            locale: "en",
          }),
        ],
      })
      expect(response.json().sources[0].path).toContain(root)
      expect(response.json().sources[0].checksum).not.toBe("[checksum-redacted]")
      expect(JSON.stringify(response.json())).not.toContain("Original identity prompt")
    } finally {
      await app.close()
    }
  })

  it("blocks prompt source dry-run assembly without an authorized disclosure contract", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const missing = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/dry-run?workDir=${encodeURIComponent(root)}&locale=en`,
      })
      expect(missing.statusCode).toBe(403)
      expect(missing.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining([
          "purpose_missing_or_invalid",
          "actor_missing",
          "audience_missing",
          "redaction_mode_missing_or_invalid",
        ]),
      })
    } finally {
      await app.close()
    }
  })

  it("redacts prompt source dry-run assembly for authorized redacted disclosure reads", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/dry-run?workDir=${encodeURIComponent(root)}&locale=en&purpose=audit&actor=test:audit&audience=auditor&redactionMode=redacted`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: "[internal-path-redacted]",
        locale: "en",
        disclosure: {
          purpose: "audit",
          actor: "test:audit",
          audience: "auditor",
          redactionMode: "redacted",
          state: "redacted",
        },
        dryRun: {
          assembly: {
            text: "[assembled-prompt-redacted]",
          },
          sourceOrder: [
            expect.objectContaining({
              path: "[internal-path-redacted]",
              checksum: "[checksum-redacted]",
            }),
          ],
          totalChars: 0,
        },
      })
      expect(response.json().dryRun.assembly.sources[0]).toMatchObject({
        path: "[internal-path-redacted]",
        checksum: "[checksum-redacted]",
        content: "[raw-prompt-source-redacted]",
      })
      expect(JSON.stringify(response.json())).not.toContain(root)
      expect(JSON.stringify(response.json())).not.toContain("Original identity prompt")
      expect(JSON.stringify(response.json())).not.toContain("# Identity")
    } finally {
      await app.close()
    }
  })

  it("returns prompt source dry-run assembly only for authorized raw disclosure reads", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/dry-run?workDir=${encodeURIComponent(root)}&locale=en&purpose=prompt_review&actor=webui-active-instructions-panel&target=prompt-assembly:en&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: root,
        locale: "en",
        disclosure: {
          purpose: "prompt_review",
          actor: "webui-active-instructions-panel",
          target: "prompt-assembly:en",
          audience: "authorized-user",
          redactionMode: "raw_authorized",
          state: "raw_authorized",
        },
      })
      expect(response.json().dryRun.totalChars).toBeGreaterThan(0)
      expect(response.json().dryRun.assembly.text).toContain("Original identity prompt")
      expect(response.json().dryRun.sourceOrder[0].path).toContain(root)
      expect(response.json().dryRun.sourceOrder[0].checksum).not.toBe("[checksum-redacted]")
    } finally {
      await app.close()
    }
  })

  it("blocks prompt source regression without an authorized disclosure contract", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const missing = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/regression?workDir=${encodeURIComponent(root)}&locale=en`,
      })
      expect(missing.statusCode).toBe(403)
      expect(missing.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining([
          "purpose_missing_or_invalid",
          "actor_missing",
          "audience_missing",
          "redaction_mode_missing_or_invalid",
        ]),
      })
    } finally {
      await app.close()
    }
  })

  it("redacts prompt source regression metadata for authorized redacted disclosure reads", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/regression?workDir=${encodeURIComponent(root)}&locale=en&purpose=audit&actor=test:audit&audience=auditor&redactionMode=redacted`,
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toMatchObject({
        workDir: "[internal-path-redacted]",
        disclosure: {
          purpose: "audit",
          actor: "test:audit",
          audience: "auditor",
          redactionMode: "redacted",
          state: "redacted",
        },
        regression: {
          workDir: "[internal-path-redacted]",
          registry: {
            checksums: [
              expect.objectContaining({
                path: "[internal-path-redacted]",
                checksum: "[checksum-redacted]",
              }),
            ],
          },
        },
      })
      const issueGroups = [
        ...body.regression.responsibility,
        ...(body.regression.policyCompatibility ?? []),
        ...body.regression.impact,
      ]
      for (const group of issueGroups) {
        for (const issue of group.issues ?? []) {
          if (issue.evidence !== undefined) expect(issue.evidence).toBe("[prompt-evidence-redacted]")
        }
      }
      for (const issue of body.regression.issues ?? []) {
        if (issue.evidence !== undefined) expect(issue.evidence).toBe("[prompt-evidence-redacted]")
      }
      expect(JSON.stringify(body)).not.toContain(root)
      expect(JSON.stringify(body)).not.toContain("Original identity prompt")
    } finally {
      await app.close()
    }
  })

  it("returns prompt source regression metadata only for authorized raw disclosure reads", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/regression?workDir=${encodeURIComponent(root)}&locale=en&purpose=prompt_review&actor=webui-active-instructions-panel&target=prompt-regression:en&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        workDir: root,
        disclosure: {
          purpose: "prompt_review",
          actor: "webui-active-instructions-panel",
          target: "prompt-regression:en",
          audience: "authorized-user",
          redactionMode: "raw_authorized",
          state: "raw_authorized",
        },
        regression: {
          workDir: root,
          registry: {
            checksums: [
              expect.objectContaining({
                sourceId: "identity",
                locale: "en",
              }),
            ],
          },
        },
      })
      expect(response.json().regression.registry.checksums[0].path).toContain(root)
      expect(response.json().regression.registry.checksums[0].checksum).not.toBe("[checksum-redacted]")
    } finally {
      await app.close()
    }
  })

  it("blocks raw prompt source reads without an authorized disclosure contract", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const missing = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}`,
      })
      expect(missing.statusCode).toBe(403)
      expect(missing.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining([
          "purpose_missing_or_invalid",
          "actor_missing",
          "audience_missing",
          "redaction_mode_missing_or_invalid",
        ]),
      })

      const invalidPurpose = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}&purpose=ordinary_ui&actor=test&audience=test&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })
      expect(invalidPurpose.statusCode).toBe(403)
      expect(invalidPurpose.json()).toMatchObject({
        error: "prompt_source_disclosure_not_authorized",
        issues: expect.arrayContaining(["purpose_missing_or_invalid", "target_missing"]),
      })
    } finally {
      await app.close()
    }
  })

  it("redacts prompt source content for authorized redacted disclosure reads", async () => {
    const sensitiveValues = [
      "secret=private-value",
      "token=token-value",
      "/Users/private/internal/path",
      "personal-email@example.com",
      "security.allowUnsafe=true",
    ]
    const { root } = createPromptFixture(`# Identity\n\n${sensitiveValues.join("\n")}\n`)
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}&purpose=audit&actor=test:audit&audience=auditor&redactionMode=redacted`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        disclosure: {
          purpose: "audit",
          actor: "test:audit",
          audience: "auditor",
          redactionMode: "redacted",
          state: "redacted",
        },
        source: {
          sourceId: "identity",
          locale: "en",
          path: "[internal-path-redacted]",
          checksum: "[checksum-redacted]",
          content: "[raw-prompt-source-redacted]",
        },
      })
      const payload = JSON.stringify(response.json())
      for (const value of sensitiveValues) expect(payload).not.toContain(value)
      expect(payload).not.toContain(root)
    } finally {
      await app.close()
    }
  })

  it("returns editable content only for authorized raw prompt disclosure reads", async () => {
    const { root } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/prompt-sources/identity/en?workDir=${encodeURIComponent(root)}&purpose=prompt_improvement&actor=webui-active-instructions-panel&target=prompt-source:identity:en&audience=authorized-user&redactionMode=raw_authorized&authorizationId=authorization%3Atest&requestId=request%3Atest`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        disclosure: {
          purpose: "prompt_improvement",
          actor: "webui-active-instructions-panel",
          target: "prompt-source:identity:en",
          audience: "authorized-user",
          redactionMode: "raw_authorized",
          state: "raw_authorized",
        },
        source: {
          sourceId: "identity",
          locale: "en",
          content: "# Identity\n\nOriginal identity prompt",
        },
      })
      expect(response.json().source.path).toContain(root)
    } finally {
      await app.close()
    }
  })

  it("rejects prompt source writes without harness input and leaves the file unchanged", async () => {
    const { root, identityPath } = createPromptFixture()
    const before = readFileSync(identityPath, "utf-8")
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/prompt-sources/identity/en/write",
        payload: {
          workDir: root,
          content: "# Identity\n\nInvalid route write\n",
          createBackup: true,
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        error: "prompt improvement harness input is required",
        state: "blocked",
        missingFields: ["harnessInput"],
        issues: [expect.objectContaining({ path: "harnessInput" })],
      })
      expect(readFileSync(identityPath, "utf-8")).toBe(before)
    } finally {
      await app.close()
    }
  })

  it("writes prompt sources through a valid harness input", async () => {
    const { root, identityPath } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/prompt-sources/identity/en/write",
        payload: {
          workDir: root,
          content: "# Identity\n\nHarness route write\n",
          createBackup: true,
          harnessInput: harnessInput(),
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(response.json()).toMatchObject({
        backup: {
          backupId: expect.any(String),
          sourceId: "identity",
          locale: "en",
          sourcePath: "[internal-path-redacted]",
          backupPath: "[internal-path-redacted]",
          checksum: "[checksum-redacted]",
        },
        source: {
          sourceId: "identity",
          locale: "en",
          path: "[internal-path-redacted]",
          checksum: "[checksum-redacted]",
          content: "[raw-prompt-source-redacted]",
        },
        sourceWriteState: "written",
        activationState: "activation_pending",
        harnessValidation: { ok: true, risk: "medium", issues: [] },
        harnessReport: {
          state: "activation_pending",
          rollbackState: "backup_available",
          rollbackPlan: "[rollback-target-redacted]",
          baselineCapture: expect.objectContaining({
            rollbackTarget: "[rollback-target-redacted]",
          }),
        },
        diff: {
          beforeChecksum: "[checksum-redacted]",
          afterChecksum: "[checksum-redacted]",
          changed: true,
        },
      })
      expect(body.diff.lines.some((line: { before?: string; after?: string }) => line.before === "Original identity prompt")).toBe(false)
      expect(body.diff.lines.some((line: { before?: string; after?: string }) => line.after === "Harness route write")).toBe(false)
      expect(JSON.stringify(body)).not.toContain(root)
      expect(JSON.stringify(body)).not.toContain("Original identity prompt")
      expect(JSON.stringify(body)).not.toContain("Harness route write")
      expect(readFileSync(identityPath, "utf-8")).toContain("Harness route write")
    } finally {
      await app.close()
    }
  })

  it("rolls back prompt sources only through registry source id and backup id", async () => {
    const { root, identityPath } = createPromptFixture()
    const app = Fastify({ logger: false })
    registerTestPromptSourcesRoute(app)
    await app.ready()
    try {
      const writeResponse = await app.inject({
        method: "POST",
        url: "/api/prompt-sources/identity/en/write",
        payload: {
          workDir: root,
          content: "# Identity\n\nHarness route write before rollback\n",
          createBackup: true,
          harnessInput: harnessInput(),
        },
      })
      expect(writeResponse.statusCode).toBe(200)
      const backup = writeResponse.json().backup
      expect(backup).toMatchObject({
        sourcePath: "[internal-path-redacted]",
        backupPath: "[internal-path-redacted]",
        checksum: "[checksum-redacted]",
      })
      expect(readFileSync(identityPath, "utf-8")).toContain("Harness route write before rollback")

      const pathBasedRollback = await app.inject({
        method: "POST",
        url: "/api/prompt-sources/rollback",
        payload: {
          sourcePath: backup.sourcePath,
          backupPath: backup.backupPath,
          reason: "legacy_path_based_rollback_should_fail",
        },
      })
      expect(pathBasedRollback.statusCode).toBe(400)
      expect(pathBasedRollback.json()).toMatchObject({ error: "sourceId, locale, and backupId are required" })
      expect(readFileSync(identityPath, "utf-8")).toContain("Harness route write before rollback")

      const mismatchedBackup = await app.inject({
        method: "POST",
        url: "/api/prompt-sources/rollback",
        payload: {
          workDir: root,
          sourceId: "identity",
          locale: "en",
          backupId: backup.backupId.replace("identity.en.", "planner.en."),
          reason: "mismatched_backup_should_fail",
        },
      })
      expect(mismatchedBackup.statusCode).toBe(400)
      expect(mismatchedBackup.json()).toMatchObject({ error: "backupId does not match prompt source" })

      const rollbackResponse = await app.inject({
        method: "POST",
        url: "/api/prompt-sources/rollback",
        payload: {
          workDir: root,
          sourceId: "identity",
          locale: "en",
          backupId: backup.backupId,
          reason: "prompt_source_route_test_rollback",
        },
      })
      expect(rollbackResponse.statusCode).toBe(200)
      expect(rollbackResponse.json()).toMatchObject({
        sourcePath: "[internal-path-redacted]",
        backupPath: "[internal-path-redacted]",
        restoredChecksum: "[checksum-redacted]",
        previousChecksum: "[checksum-redacted]",
        rolledBackFiles: [{
          sourcePath: "[internal-path-redacted]",
          backupPath: "[internal-path-redacted]",
        }],
        activationStateAfterRollback: "rolled_back",
        reason: "prompt_source_route_test_rollback",
      })
      expect(JSON.stringify(rollbackResponse.json())).not.toContain(root)
      expect(readFileSync(identityPath, "utf-8")).toContain("Original identity prompt")
      expect(readFileSync(identityPath, "utf-8")).not.toContain("Harness route write before rollback")
    } finally {
      await app.close()
    }
  })
})
