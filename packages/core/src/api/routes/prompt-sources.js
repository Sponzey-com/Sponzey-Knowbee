import { basename, dirname, join } from "node:path";
import { authMiddleware } from "../middleware/auth.js";
import { checkPromptSourceLocaleParity, dryRunPromptSourceAssembly, loadPromptSourceRegistry, PromptSourceHarnessValidationError, rollbackPromptSourceBackup, writePromptSourceWithHarness, } from "../../memory/knowbee-md.js";
import { PromptSourceContentQualityError } from "../../memory/prompt-source-quality.js";
import { runPromptSourceRegression, } from "../../memory/prompt-regression.js";
import { sanitizeUserFacingError } from "../../runs/error-sanitizer.js";
import { redactLogText } from "../../logger/index.js";
import { getApiRuntimeConfig } from "../runtime-context.js";
import { authorizeSystemPromptDisclosure, } from "../../contracts/system-prompt-disclosure-boundary.js";
const AUTHORIZED_DISCLOSURE_PURPOSES = new Set([
    "prompt_review",
    "prompt_improvement",
    "administration",
    "security_review",
    "debugging",
    "audit",
]);
const INTERNAL_PATH_REDACTION = "[internal-path-redacted]";
const CHECKSUM_REDACTION = "[checksum-redacted]";
const RAW_PROMPT_SOURCE_REDACTION = "[raw-prompt-source-redacted]";
const PROMPT_DIFF_LINE_REDACTION = "[prompt-diff-line-redacted]";
const ROLLBACK_TARGET_REDACTION = "[rollback-target-redacted]";
function resolveWorkDir(value, fallbackWorkDir) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallbackWorkDir();
}
function resolveLocale(value) {
    return value === "ko" || value === "en" ? value : null;
}
function resolveRegressionLocales(value) {
    if (value === "ko" || value === "en")
        return [value];
    return ["ko", "en"];
}
function normalizeDisclosureField(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function normalizePromptSourceId(value) {
    return typeof value === "string" && /^[a-z0-9_]+$/u.test(value.trim()) ? value.trim() : null;
}
function normalizeRollbackBackupId(value) {
    if (typeof value !== "string")
        return null;
    const backupId = value.trim();
    if (!backupId || basename(backupId) !== backupId)
        return null;
    return backupId;
}
function promptSourceRouteErrorSummary(error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return sanitizeUserFacingError(redactLogText(rawMessage));
}
function canonicalPurpose(purpose) {
    if (purpose === "prompt_review" || purpose === "prompt_improvement")
        return "prompt_review_or_improvement";
    if (purpose === "administration" || purpose === "debugging")
        return "administrator_debug";
    return "security_or_audit_validation";
}
function authorizePromptSourceDisclosure(query, expectedTarget, options) {
    const purpose = normalizeDisclosureField(query.purpose);
    const actor = normalizeDisclosureField(query.actor);
    const target = normalizeDisclosureField(query.target);
    const audience = normalizeDisclosureField(query.audience);
    const redactionMode = normalizeDisclosureField(query.redactionMode);
    const issues = [];
    if (!purpose || !AUTHORIZED_DISCLOSURE_PURPOSES.has(purpose)) {
        issues.push("purpose_missing_or_invalid");
    }
    if (!actor)
        issues.push("actor_missing");
    if (redactionMode === "raw_authorized" && !target) {
        issues.push("target_missing");
    }
    else if (redactionMode === "raw_authorized" && target !== expectedTarget) {
        issues.push("target_mismatch");
    }
    if (!audience)
        issues.push("audience_missing");
    if (redactionMode !== "redacted" && redactionMode !== "raw_authorized") {
        issues.push("redaction_mode_missing_or_invalid");
    }
    if (issues.length === 0 && redactionMode === "raw_authorized") {
        const authorizationId = normalizeDisclosureField(query.authorizationId);
        const requestId = normalizeDisclosureField(query.requestId);
        const resolvedPurpose = canonicalPurpose(purpose);
        const receipt = authorizationId && requestId ? options.resolveAuthorizationReceipt?.(authorizationId, {
            requestId, actorRef: actor, audienceRef: audience, purpose: resolvedPurpose, targetSourceRef: expectedTarget,
        }) : undefined;
        if (!receipt || !requestId || receipt.authorizationId !== authorizationId) {
            issues.push("authorization_missing_or_invalid");
        }
        else {
            const decision = authorizeSystemPromptDisclosure({
                surface: "authorized_workflow",
                requestId,
                actorRef: actor,
                audienceRef: audience,
                requestedPurpose: resolvedPurpose,
                requestedSourceRefs: [expectedTarget],
                expectedSourceSetFingerprint: receipt.sourceSetFingerprint,
                receipt,
                now: options.now?.() ?? 0,
            });
            if (decision.status !== "authorized")
                issues.push("authorization_missing_or_invalid");
        }
    }
    if (issues.length > 0)
        return { ok: false, issues };
    return {
        ok: true,
        purpose: purpose,
        actor: actor,
        target: target ?? expectedTarget,
        audience: audience,
        redactionMode: redactionMode,
    };
}
function redactPromptSourceForDisclosure(source, redactionMode) {
    if (redactionMode === "raw_authorized")
        return source;
    return {
        ...source,
        path: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
        content: RAW_PROMPT_SOURCE_REDACTION,
    };
}
function redactPromptSourceMetadataForDisclosure(source, redactionMode) {
    if (redactionMode === "raw_authorized")
        return source;
    return {
        ...source,
        path: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
    };
}
function redactPromptSourceDryRunForDisclosure(dryRun, redactionMode) {
    if (redactionMode === "raw_authorized")
        return dryRun;
    return {
        ...dryRun,
        assembly: dryRun.assembly
            ? {
                ...dryRun.assembly,
                text: "[assembled-prompt-redacted]",
                snapshot: {
                    ...dryRun.assembly.snapshot,
                    sources: dryRun.assembly.snapshot.sources.map((source) => redactPromptSourceMetadataForDisclosure(source, redactionMode)),
                },
                sources: dryRun.assembly.sources.map((source) => redactPromptSourceForDisclosure(source, redactionMode)),
            }
            : null,
        sourceOrder: dryRun.sourceOrder.map((source) => redactPromptSourceMetadataForDisclosure(source, redactionMode)),
        totalChars: 0,
    };
}
function redactPromptRegressionIssueEvidence(issue, redactionMode) {
    if (redactionMode === "raw_authorized" || issue.evidence === undefined)
        return issue;
    return {
        ...issue,
        evidence: "[prompt-evidence-redacted]",
    };
}
function redactPromptSourceRegressionForDisclosure(regression, redactionMode) {
    if (redactionMode === "raw_authorized")
        return regression;
    return {
        ...regression,
        workDir: INTERNAL_PATH_REDACTION,
        registry: {
            ...regression.registry,
            checksums: regression.registry.checksums.map((source) => redactPromptSourceMetadataForDisclosure(source, redactionMode)),
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
    };
}
function redactPromptSourceDiffForRoute(diff) {
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
    };
}
function redactPromptSourceBackupForRoute(backup) {
    if (!backup)
        return null;
    return {
        ...backup,
        sourcePath: INTERNAL_PATH_REDACTION,
        backupPath: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
    };
}
function redactPromptHarnessReportForRoute(report) {
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
    };
}
function redactPromptSourceWriteResultForRoute(result) {
    return {
        ...result,
        backup: redactPromptSourceBackupForRoute(result.backup),
        source: redactPromptSourceForDisclosure(result.source, "redacted"),
        diff: redactPromptSourceDiffForRoute(result.diff),
        harnessReport: redactPromptHarnessReportForRoute(result.harnessReport),
    };
}
function redactPromptSourceRollbackResultForRoute(result) {
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
    };
}
export function registerPromptSourcesRoute(app, options = {}) {
    app.get("/api/prompt-sources", { preHandler: authMiddleware }, async (req, reply) => {
        const disclosure = authorizePromptSourceDisclosure(req.query, "prompt-source-registry", options);
        if (!disclosure.ok) {
            return reply.status(403).send({
                error: "prompt_source_disclosure_not_authorized",
                issues: disclosure.issues,
                message: "Prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
            });
        }
        const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace);
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
            sources: loadPromptSourceRegistry(workDir).map(({ content: _content, ...metadata }) => redactPromptSourceMetadataForDisclosure(metadata, disclosure.redactionMode)),
        };
    });
    app.get("/api/prompt-sources/dry-run", { preHandler: authMiddleware }, async (req, reply) => {
        const locale = resolveLocale(req.query.locale) ?? "ko";
        const disclosure = authorizePromptSourceDisclosure(req.query, `prompt-assembly:${locale}`, options);
        if (!disclosure.ok) {
            return reply.status(403).send({
                error: "prompt_source_disclosure_not_authorized",
                issues: disclosure.issues,
                message: "Prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
            });
        }
        const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace);
        const dryRun = dryRunPromptSourceAssembly(workDir, locale);
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
        };
    });
    app.get("/api/prompt-sources/parity", { preHandler: authMiddleware }, async (req) => {
        const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace);
        return { workDir: INTERNAL_PATH_REDACTION, parity: checkPromptSourceLocaleParity(workDir) };
    });
    app.get("/api/prompt-sources/regression", { preHandler: authMiddleware }, async (req, reply) => {
        const locales = resolveRegressionLocales(req.query.locale);
        const targetLocale = req.query.locale === "ko" || req.query.locale === "en" ? req.query.locale : "all";
        const disclosure = authorizePromptSourceDisclosure(req.query, `prompt-regression:${targetLocale}`, options);
        if (!disclosure.ok) {
            return reply.status(403).send({
                error: "prompt_source_disclosure_not_authorized",
                issues: disclosure.issues,
                message: "Prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
            });
        }
        const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace);
        const regression = runPromptSourceRegression(workDir, { locales });
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
        };
    });
    app.get("/api/prompt-sources/:sourceId/:locale", { preHandler: authMiddleware }, async (req, reply) => {
        const locale = resolveLocale(req.params.locale);
        if (!locale)
            return reply.status(400).send({ error: "invalid prompt source locale" });
        const disclosure = authorizePromptSourceDisclosure(req.query, `prompt-source:${req.params.sourceId}:${locale}`, options);
        if (!disclosure.ok) {
            return reply.status(403).send({
                error: "prompt_source_disclosure_not_authorized",
                issues: disclosure.issues,
                message: "Raw prompt source disclosure requires an authorized purpose, actor, audience, and redaction mode.",
            });
        }
        const workDir = resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace);
        const source = loadPromptSourceRegistry(workDir).find((item) => item.sourceId === req.params.sourceId && item.locale === locale);
        if (!source)
            return reply.status(404).send({ error: "prompt source not found" });
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
        };
    });
    app.post("/api/prompt-sources/:sourceId/:locale/write", { preHandler: authMiddleware }, async (req, reply) => {
        const locale = resolveLocale(req.params.locale);
        if (!locale)
            return reply.status(400).send({ error: "invalid prompt source locale" });
        if (typeof req.body?.content !== "string" || !req.body.content.trim()) {
            return reply.status(400).send({ error: "prompt source content is required" });
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
            });
        }
        try {
            const result = writePromptSourceWithHarness({
                workDir: resolveWorkDir(req.body.workDir, () => getApiRuntimeConfig(req).profile.workspace),
                sourceId: req.params.sourceId,
                locale,
                content: req.body.content,
                harnessInput: req.body.harnessInput,
                ...(req.body.createBackup !== undefined ? { createBackup: req.body.createBackup } : {}),
            });
            return redactPromptSourceWriteResultForRoute(result);
        }
        catch (error) {
            if (error instanceof PromptSourceHarnessValidationError) {
                const sanitized = promptSourceRouteErrorSummary(error);
                return reply.status(400).send({
                    error: sanitized.userMessage,
                    kind: sanitized.kind,
                    actionHint: sanitized.actionHint,
                    state: error.decision.state,
                    missingFields: error.decision.missingFields,
                    issues: error.validation.issues,
                    risk: error.validation.risk,
                });
            }
            if (error instanceof PromptSourceContentQualityError) {
                const sanitized = promptSourceRouteErrorSummary(error);
                return reply.status(400).send({
                    error: sanitized.userMessage,
                    kind: sanitized.kind,
                    actionHint: sanitized.actionHint,
                    issues: error.issues,
                });
            }
            const sanitized = promptSourceRouteErrorSummary(error);
            return reply.status(400).send({
                error: sanitized.userMessage,
                kind: sanitized.kind,
                actionHint: sanitized.actionHint,
            });
        }
    });
    app.post("/api/prompt-sources/rollback", { preHandler: authMiddleware }, async (req, reply) => {
        const sourceId = normalizePromptSourceId(req.body?.sourceId);
        const locale = resolveLocale(req.body?.locale);
        const backupId = normalizeRollbackBackupId(req.body?.backupId);
        if (!sourceId || !locale || !backupId) {
            return reply.status(400).send({ error: "sourceId, locale, and backupId are required" });
        }
        const workDir = resolveWorkDir(req.body.workDir, () => getApiRuntimeConfig(req).profile.workspace);
        const source = loadPromptSourceRegistry(workDir).find((item) => item.sourceId === sourceId && item.locale === locale);
        if (!source)
            return reply.status(404).send({ error: "prompt source not found" });
        const expectedPrefix = `${sourceId}.${locale}.`;
        const expectedSuffix = `.${basename(source.path)}`;
        if (!backupId.startsWith(expectedPrefix) || !backupId.endsWith(expectedSuffix)) {
            return reply.status(400).send({ error: "backupId does not match prompt source" });
        }
        try {
            const rollbackInput = {
                sourcePath: source.path,
                backupPath: join(dirname(source.path), ".backups", backupId),
                ...(typeof req.body.reason === "string" ? { reason: req.body.reason } : {}),
            };
            return redactPromptSourceRollbackResultForRoute(rollbackPromptSourceBackup(rollbackInput));
        }
        catch (error) {
            const sanitized = promptSourceRouteErrorSummary(error);
            return reply.status(400).send({
                error: sanitized.userMessage,
                kind: sanitized.kind,
                actionHint: sanitized.actionHint,
            });
        }
    });
}
//# sourceMappingURL=prompt-sources.js.map