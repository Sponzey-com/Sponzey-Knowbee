import type { FastifyInstance } from "fastify"
import { basename, dirname, join } from "node:path"
import { authMiddleware } from "../middleware/auth.js"
import {
  checkPromptSourceLocaleParity,
  dryRunPromptSourceAssembly,
  loadPromptSourceRegistry,
  PromptSourceHarnessValidationError,
  rollbackPromptSourceBackup,
  type PromptSourceHarnessWriteResult,
  type PromptSourceRollbackResult,
  writePromptSourceWithHarness,
} from "../../memory/knowbee-md.js"
import type { PromptImprovementHarnessInput } from "../../memory/prompt-improvement-harness.js"
import { PromptSourceContentQualityError } from "../../memory/prompt-source-quality.js"
import {
  runPromptSourceRegression,
  type PromptRegressionLocale,
  type PromptSourceRegressionResult,
} from "../../memory/prompt-regression.js"
import { sanitizeUserFacingError } from "../../runs/error-sanitizer.js"
import { redactLogText } from "../../logger/index.js"
import type { SanitizedErrorSummary } from "../../runs/error-sanitizer.js"
import { getApiRuntimeConfig } from "../runtime-context.js"
import {
  authorizeSystemPromptDisclosure,
  type RawSystemPromptDisclosurePurpose,
  type SystemPromptDisclosureAuthorizationReceipt,
} from "../../contracts/system-prompt-disclosure-boundary.js"

type PromptSourceDisclosurePurpose =
  | "prompt_review"
  | "prompt_improvement"
  | "administration"
  | "security_review"
  | "debugging"
  | "audit"

type PromptSourceDisclosureRedactionMode = "redacted" | "raw_authorized"

interface PromptSourceDisclosureQuery {
  workDir?: string
  locale?: string
  purpose?: string
  actor?: string
  target?: string
  audience?: string
  redactionMode?: string
  authorizationId?: string
  requestId?: string
}

export interface PromptSourceDisclosureRouteOptions {
  resolveAuthorizationReceipt?: (
    authorizationId: string,
    context: { requestId: string; actorRef: string; audienceRef: string; purpose: RawSystemPromptDisclosurePurpose; targetSourceRef: string },
  ) => SystemPromptDisclosureAuthorizationReceipt | undefined
  now?: () => number
}

const AUTHORIZED_DISCLOSURE_PURPOSES = new Set<PromptSourceDisclosurePurpose>([
  "prompt_review",
  "prompt_improvement",
  "administration",
  "security_review",
  "debugging",
  "audit",
])

const INTERNAL_PATH_REDACTION = "[internal-path-redacted]"
const CHECKSUM_REDACTION = "[checksum-redacted]"
const RAW_PROMPT_SOURCE_REDACTION = "[raw-prompt-source-redacted]"
const PROMPT_DIFF_LINE_REDACTION = "[prompt-diff-line-redacted]"
const ROLLBACK_TARGET_REDACTION = "[rollback-target-redacted]"

function resolveWorkDir(value: unknown, fallbackWorkDir: () => string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallbackWorkDir()
}

function resolveLocale(value: unknown): "ko" | "en" | null {
  return value === "ko" || value === "en" ? value : null
}

function resolveRegressionLocales(value: unknown): PromptRegressionLocale[] {
  if (value === "ko" || value === "en") return [value]
  return ["ko", "en"]
}

function normalizeDisclosureField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizePromptSourceId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]+$/u.test(value.trim()) ? value.trim() : null
}

function normalizeRollbackBackupId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const backupId = value.trim()
  if (!backupId || basename(backupId) !== backupId) return null
  return backupId
}

function promptSourceRouteErrorSummary(error: unknown): SanitizedErrorSummary {
  const rawMessage = error instanceof Error ? error.message : String(error)
  return sanitizeUserFacingError(redactLogText(rawMessage))
}

function canonicalPurpose(purpose: PromptSourceDisclosurePurpose): RawSystemPromptDisclosurePurpose {
  if (purpose === "prompt_review" || purpose === "prompt_improvement") return "prompt_review_or_improvement"
  if (purpose === "administration" || purpose === "debugging") return "administrator_debug"
  return "security_or_audit_validation"
}

function authorizePromptSourceDisclosure(query: PromptSourceDisclosureQuery, expectedTarget: string, options: PromptSourceDisclosureRouteOptions): {
  ok: true
  purpose: PromptSourceDisclosurePurpose
  actor: string
  target: string
  audience: string
  redactionMode: PromptSourceDisclosureRedactionMode
} | {
  ok: false
  issues: Array<
    "purpose_missing_or_invalid"
    | "actor_missing"
    | "target_missing"
    | "target_mismatch"
    | "audience_missing"
    | "redaction_mode_missing_or_invalid"
    | "authorization_missing_or_invalid"
  >
} {
  const purpose = normalizeDisclosureField(query.purpose)
  const actor = normalizeDisclosureField(query.actor)
  const target = normalizeDisclosureField(query.target)
  const audience = normalizeDisclosureField(query.audience)
  const redactionMode = normalizeDisclosureField(query.redactionMode)
  const issues: Array<
    "purpose_missing_or_invalid"
    | "actor_missing"
    | "target_missing"
    | "target_mismatch"
    | "audience_missing"
    | "redaction_mode_missing_or_invalid"
    | "authorization_missing_or_invalid"
  > = []

  if (!purpose || !AUTHORIZED_DISCLOSURE_PURPOSES.has(purpose as PromptSourceDisclosurePurpose)) {
    issues.push("purpose_missing_or_invalid")
  }
  if (!actor) issues.push("actor_missing")
  if (redactionMode === "raw_authorized" && !target) {
    issues.push("target_missing")
  } else if (redactionMode === "raw_authorized" && target !== expectedTarget) {
    issues.push("target_mismatch")
  }
  if (!audience) issues.push("audience_missing")
  if (redactionMode !== "redacted" && redactionMode !== "raw_authorized") {
    issues.push("redaction_mode_missing_or_invalid")
  }

  if (issues.length === 0 && redactionMode === "raw_authorized") {
    const authorizationId = normalizeDisclosureField(query.authorizationId)
    const requestId = normalizeDisclosureField(query.requestId)
    const resolvedPurpose = canonicalPurpose(purpose as PromptSourceDisclosurePurpose)
    const receipt = authorizationId && requestId ? options.resolveAuthorizationReceipt?.(authorizationId, {
      requestId, actorRef: actor!, audienceRef: audience!, purpose: resolvedPurpose, targetSourceRef: expectedTarget,
    }) : undefined
    if (!receipt || !requestId || receipt.authorizationId !== authorizationId) {
      issues.push("authorization_missing_or_invalid")
    } else {
      const decision = authorizeSystemPromptDisclosure({
        surface: "authorized_workflow",
        requestId,
        actorRef: actor!,
        audienceRef: audience!,
        requestedPurpose: resolvedPurpose,
        requestedSourceRefs: [expectedTarget],
        expectedSourceSetFingerprint: receipt.sourceSetFingerprint,
        receipt,
        now: options.now?.() ?? 0,
      })
      if (decision.status !== "authorized") issues.push("authorization_missing_or_invalid")
    }
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    purpose: purpose as PromptSourceDisclosurePurpose,
    actor: actor!,
    target: target ?? expectedTarget,
    audience: audience!,
    redactionMode: redactionMode as PromptSourceDisclosureRedactionMode,
  }
}

function redactPromptSourceForDisclosure<T extends { content: string; path: string; checksum: string }>(
  source: T,
  redactionMode: PromptSourceDisclosureRedactionMode,
): T {
  if (redactionMode === "raw_authorized") return source
  return {
    ...source,
    path: INTERNAL_PATH_REDACTION,
    checksum: CHECKSUM_REDACTION,
    content: RAW_PROMPT_SOURCE_REDACTION,
  }
}

function redactPromptSourceMetadataForDisclosure<T extends { path: string; checksum: string }>(
  source: T,
  redactionMode: PromptSourceDisclosureRedactionMode,
): T {
  if (redactionMode === "raw_authorized") return source
  return {
    ...source,
    path: INTERNAL_PATH_REDACTION,
    checksum: CHECKSUM_REDACTION,
  }
}

function redactPromptSourceDryRunForDisclosure<T extends {
  assembly: null | {
    text: string
    snapshot: { sources: Array<{ path: string; checksum: string }> }
    sources: Array<{ content: string; path: string; checksum: string }>
  }
  sourceOrder: Array<{ path: string; checksum: string }>
  totalChars: number
}>(
  dryRun: T,
  redactionMode: PromptSourceDisclosureRedactionMode,
): T {
  if (redactionMode === "raw_authorized") return dryRun
  return {
    ...dryRun,
    assembly: dryRun.assembly
      ? {
        ...dryRun.assembly,
        text: "[assembled-prompt-redacted]",
        snapshot: {
          ...dryRun.assembly.snapshot,
          sources: dryRun.assembly.snapshot.sources.map((source) =>
            redactPromptSourceMetadataForDisclosure(source, redactionMode),
          ),
        },
        sources: dryRun.assembly.sources.map((source) => redactPromptSourceForDisclosure(source, redactionMode)),
      }
      : null,
    sourceOrder: dryRun.sourceOrder.map((source) => redactPromptSourceMetadataForDisclosure(source, redactionMode)),
    totalChars: 0,
  }
}

function redactPromptRegressionIssueEvidence<T extends { evidence?: string }>(
  issue: T,
  redactionMode: PromptSourceDisclosureRedactionMode,
): T {
  if (redactionMode === "raw_authorized" || issue.evidence === undefined) return issue
  return {
    ...issue,
    evidence: "[prompt-evidence-redacted]",
  }
}

function redactPromptSourceRegressionForDisclosure(
  regression: PromptSourceRegressionResult,
  redactionMode: PromptSourceDisclosureRedactionMode,
): PromptSourceRegressionResult {
  if (redactionMode === "raw_authorized") return regression
  return {
    ...regression,
    workDir: INTERNAL_PATH_REDACTION,
    registry: {
      ...regression.registry,
      checksums: regression.registry.checksums.map((source) =>
        redactPromptSourceMetadataForDisclosure(source, redactionMode),
      ),
    },
    responsibility: regression.responsibility.map((result) => ({
      ...result,
      issues: result.issues.map((issue) => redactPromptRegressionIssueEvidence(issue, redactionMode)),
    })),
    policyCompatibility: regression.policyCompatibility.map((result) => ({
      ...result,
      issues: result.issues.map((issue) => redactPromptRegressionIssueEvidence(issue, redactionMode)),
    })),
    issues: regression.issues.map((issue) => redactPromptRegressionIssueEvidence(issue, redactionMode)),
  }
}

function redactPromptSourceDiffForRoute(diff: PromptSourceHarnessWriteResult["diff"]): PromptSourceHarnessWriteResult["diff"] {
  return {
    beforeChecksum: CHECKSUM_REDACTION,
    afterChecksum: CHECKSUM_REDACTION,
    changed: diff.changed,
    lines: diff.lines.map((line) => ({
      kind: line.kind,
      ...(line.beforeLine !== undefined ? { beforeLine: line.beforeLine } : {}),
      ...(line.afterLine !== undefined ? { afterLine: line.afterLine } : {}),
      ...(line.before !== undefined ? { before: PROMPT_DIFF_LINE_REDACTION } : {}),
      ...(line.after !== undefined ? { after: PROMPT_DIFF_LINE_REDACTION } : {}),
    })),
  }
}

function redactPromptSourceBackupForRoute(
  backup: PromptSourceHarnessWriteResult["backup"],
): PromptSourceHarnessWriteResult["backup"] {
  if (!backup) return null
  return {
    ...backup,
    sourcePath: INTERNAL_PATH_REDACTION,
    backupPath: INTERNAL_PATH_REDACTION,
    checksum: CHECKSUM_REDACTION,
  }
}

function redactPromptHarnessReportForRoute(
  report: PromptSourceHarnessWriteResult["harnessReport"],
): PromptSourceHarnessWriteResult["harnessReport"] {
  return {
    ...report,
    rollbackPlan: report.rollbackState === "backup_available" ? ROLLBACK_TARGET_REDACTION : report.rollbackPlan,
    baselineCapture: {
      ...report.baselineCapture,
      sourceChecksums: report.baselineCapture.sourceChecksums.map((item) => ({
        ...item,
        beforeChecksum: CHECKSUM_REDACTION,
      })),
      rollbackTarget: report.baselineCapture.rollbackTarget ? ROLLBACK_TARGET_REDACTION : report.baselineCapture.rollbackTarget,
    },
  }
}

function redactPromptSourceWriteResultForRoute(result: PromptSourceHarnessWriteResult): PromptSourceHarnessWriteResult {
  return {
    ...result,
    backup: redactPromptSourceBackupForRoute(result.backup),
    source: redactPromptSourceForDisclosure(result.source, "redacted"),
    diff: redactPromptSourceDiffForRoute(result.diff),
    harnessReport: redactPromptHarnessReportForRoute(result.harnessReport),
  }
}

function redactPromptSourceRollbackResultForRoute(result: PromptSourceRollbackResult): PromptSourceRollbackResult {
  return {
    ...result,
    sourcePath: INTERNAL_PATH_REDACTION,
    backupPath: INTERNAL_PATH_REDACTION,
    restoredChecksum: CHECKSUM_REDACTION,
    previousChecksum: CHECKSUM_REDACTION,
    rolledBackFiles: result.rolledBackFiles.map(() => ({
      sourcePath: INTERNAL_PATH_REDACTION,
      backupPath: INTERNAL_PATH_REDACTION,
    })),
  }
}

export function registerPromptSourcesRoute(app: FastifyInstance, options: PromptSourceDisclosureRouteOptions = {}): void {
  app.get<{ Querystring: PromptSourceDisclosureQuery }>("/api/prompt-sources", { preHandler: authMiddleware }, async (req, reply) => {
    const disclosure = authorizePromptSourceDisclosure(req.query, "prompt-source-registry", options)
    if (!disclosure.ok) {
      return reply.status(403).send({
        error: "prompt_source_disclosure_not_authorized",
        issues: disclosure.issues,
        message: "Prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
      })
    }
    const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace)
    return {
      workDir: disclosure.redactionMode === "raw_authorized" ? workDir : INTERNAL_PATH_REDACTION,
      disclosure: {
        purpose: disclosure.purpose,
        actor: disclosure.actor,
        target: disclosure.target,
        audience: disclosure.audience,
        redactionMode: disclosure.redactionMode,
        state: disclosure.redactionMode === "raw_authorized" ? "raw_authorized" : "redacted",
      },
      sources: loadPromptSourceRegistry(workDir).map(({ content: _content, ...metadata }) =>
        redactPromptSourceMetadataForDisclosure(metadata, disclosure.redactionMode),
      ),
    }
  })

  app.get<{ Querystring: PromptSourceDisclosureQuery }>("/api/prompt-sources/dry-run", { preHandler: authMiddleware }, async (req, reply) => {
    const locale = resolveLocale(req.query.locale) ?? "ko"
    const disclosure = authorizePromptSourceDisclosure(req.query, `prompt-assembly:${locale}`, options)
    if (!disclosure.ok) {
      return reply.status(403).send({
        error: "prompt_source_disclosure_not_authorized",
        issues: disclosure.issues,
        message: "Prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
      })
    }
    const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace)
    const dryRun = dryRunPromptSourceAssembly(workDir, locale)
    return {
      workDir: disclosure.redactionMode === "raw_authorized" ? workDir : INTERNAL_PATH_REDACTION,
      locale,
      disclosure: {
        purpose: disclosure.purpose,
        actor: disclosure.actor,
        target: disclosure.target,
        audience: disclosure.audience,
        redactionMode: disclosure.redactionMode,
        state: disclosure.redactionMode === "raw_authorized" ? "raw_authorized" : "redacted",
      },
      dryRun: redactPromptSourceDryRunForDisclosure(dryRun, disclosure.redactionMode),
    }
  })

  app.get<{ Querystring: { workDir?: string } }>("/api/prompt-sources/parity", { preHandler: authMiddleware }, async (req) => {
    const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace)
    return { workDir: INTERNAL_PATH_REDACTION, parity: checkPromptSourceLocaleParity(workDir) }
  })

  app.get<{ Querystring: PromptSourceDisclosureQuery }>("/api/prompt-sources/regression", { preHandler: authMiddleware }, async (req, reply) => {
    const locales = resolveRegressionLocales(req.query.locale)
    const targetLocale = req.query.locale === "ko" || req.query.locale === "en" ? req.query.locale : "all"
    const disclosure = authorizePromptSourceDisclosure(req.query, `prompt-regression:${targetLocale}`, options)
    if (!disclosure.ok) {
      return reply.status(403).send({
        error: "prompt_source_disclosure_not_authorized",
        issues: disclosure.issues,
        message: "Prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
      })
    }
    const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace)
    const regression = runPromptSourceRegression(workDir, { locales })
    return {
      workDir: disclosure.redactionMode === "raw_authorized" ? workDir : INTERNAL_PATH_REDACTION,
      disclosure: {
        purpose: disclosure.purpose,
        actor: disclosure.actor,
        target: disclosure.target,
        audience: disclosure.audience,
        redactionMode: disclosure.redactionMode,
        state: disclosure.redactionMode === "raw_authorized" ? "raw_authorized" : "redacted",
      },
      regression: redactPromptSourceRegressionForDisclosure(regression, disclosure.redactionMode),
    }
  })

  app.get<{
    Params: { sourceId: string; locale: string }
    Querystring: PromptSourceDisclosureQuery
  }>("/api/prompt-sources/:sourceId/:locale", { preHandler: authMiddleware }, async (req, reply) => {
    const locale = resolveLocale(req.params.locale)
    if (!locale) return reply.status(400).send({ error: "invalid prompt source locale" })
    const disclosure = authorizePromptSourceDisclosure(req.query, `prompt-source:${req.params.sourceId}:${locale}`, options)
    if (!disclosure.ok) {
      return reply.status(403).send({
        error: "prompt_source_disclosure_not_authorized",
        issues: disclosure.issues,
        message: "Raw prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
      })
    }
    const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace)
    const source = loadPromptSourceRegistry(workDir).find((item) => item.sourceId === req.params.sourceId && item.locale === locale)
    if (!source) return reply.status(404).send({ error: "prompt source not found" })
    return {
      workDir: disclosure.redactionMode === "raw_authorized" ? workDir : INTERNAL_PATH_REDACTION,
      disclosure: {
        purpose: disclosure.purpose,
        actor: disclosure.actor,
        target: disclosure.target,
        audience: disclosure.audience,
        redactionMode: disclosure.redactionMode,
        state: disclosure.redactionMode === "raw_authorized" ? "raw_authorized" : "redacted",
      },
      source: redactPromptSourceForDisclosure(source, disclosure.redactionMode),
    }
  })

  app.post<{
    Params: { sourceId: string; locale: string }
    Body: {
      workDir?: string
      content?: string
      createBackup?: boolean
      harnessInput?: Partial<PromptImprovementHarnessInput>
    }
  }>("/api/prompt-sources/:sourceId/:locale/write", { preHandler: authMiddleware }, async (req, reply) => {
    const locale = resolveLocale(req.params.locale)
    if (!locale) return reply.status(400).send({ error: "invalid prompt source locale" })
    if (typeof req.body?.content !== "string" || !req.body.content.trim()) {
      return reply.status(400).send({ error: "prompt source content is required" })
    }
    if (!req.body.harnessInput || typeof req.body.harnessInput !== "object") {
      return reply.status(400).send({
        error: "prompt improvement harness input is required",
        state: "blocked",
        missingFields: ["harnessInput"],
        issues: [{
          code: "required_field_missing",
          path: "harnessInput",
          message: "Prompt source writes require a validated prompt improvement harness input.",
        }],
      })
    }
    try {
      const result = writePromptSourceWithHarness({
        workDir: resolveWorkDir(req.body.workDir, () => getApiRuntimeConfig(req).profile.workspace),
        sourceId: req.params.sourceId,
        locale,
        content: req.body.content,
        harnessInput: req.body.harnessInput,
        ...(req.body.createBackup !== undefined ? { createBackup: req.body.createBackup } : {}),
      })
      return redactPromptSourceWriteResultForRoute(result)
    } catch (error) {
      if (error instanceof PromptSourceHarnessValidationError) {
        const sanitized = promptSourceRouteErrorSummary(error)
        return reply.status(400).send({
          error: sanitized.userMessage,
          kind: sanitized.kind,
          actionHint: sanitized.actionHint,
          state: error.decision.state,
          missingFields: error.decision.missingFields,
          issues: error.validation.issues,
          risk: error.validation.risk,
        })
      }
      if (error instanceof PromptSourceContentQualityError) {
        const sanitized = promptSourceRouteErrorSummary(error)
        return reply.status(400).send({
          error: sanitized.userMessage,
          kind: sanitized.kind,
          actionHint: sanitized.actionHint,
          issues: error.issues,
        })
      }
      const sanitized = promptSourceRouteErrorSummary(error)
      return reply.status(400).send({
        error: sanitized.userMessage,
        kind: sanitized.kind,
        actionHint: sanitized.actionHint,
      })
    }
  })

  app.post<{
    Body: { workDir?: string; sourceId?: string; locale?: string; backupId?: string; reason?: string }
  }>("/api/prompt-sources/rollback", { preHandler: authMiddleware }, async (req, reply) => {
    const sourceId = normalizePromptSourceId(req.body?.sourceId)
    const locale = resolveLocale(req.body?.locale)
    const backupId = normalizeRollbackBackupId(req.body?.backupId)
    if (!sourceId || !locale || !backupId) {
      return reply.status(400).send({ error: "sourceId, locale, and backupId are required" })
    }
    const workDir = resolveWorkDir(req.body.workDir, () => getApiRuntimeConfig(req).profile.workspace)
    const source = loadPromptSourceRegistry(workDir).find((item) => item.sourceId === sourceId && item.locale === locale)
    if (!source) return reply.status(404).send({ error: "prompt source not found" })
    const expectedPrefix = `${sourceId}.${locale}.`
    const expectedSuffix = `.${basename(source.path)}`
    if (!backupId.startsWith(expectedPrefix) || !backupId.endsWith(expectedSuffix)) {
      return reply.status(400).send({ error: "backupId does not match prompt source" })
    }
    try {
      const rollbackInput = {
        sourcePath: source.path,
        backupPath: join(dirname(source.path), ".backups", backupId),
        ...(typeof req.body.reason === "string" ? { reason: req.body.reason } : {}),
      }
      return redactPromptSourceRollbackResultForRoute(rollbackPromptSourceBackup(rollbackInput))
    } catch (error) {
      const sanitized = promptSourceRouteErrorSummary(error)
      return reply.status(400).send({
        error: sanitized.userMessage,
        kind: sanitized.kind,
        actionHint: sanitized.actionHint,
      })
    }
  })
}
