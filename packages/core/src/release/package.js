import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, accessSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { runSubAgentBenchmarkSuite, } from "../benchmarks/sub-agent-benchmarks.js";
import { buildBackupTargetInventory, buildMigrationPreflightReport, } from "../config/backup-rehearsal.js";
import { createRuntimePaths } from "../config/paths.js";
import { DEFAULT_CONFIG } from "../config/types.js";
import { getDb } from "../db/index.js";
import { runPlanDriftCheck } from "../diagnostics/plan-drift.js";
import { loadPromptSourceRegistry } from "../memory/knowbee-md.js";
import { resolveOrchestrationModeSnapshotSync, } from "../orchestration/mode.js";
import { buildFixtureRegressionFromWorkspace, buildWebRetrievalReleaseGateSummary, } from "../runs/web-retrieval-smoke.js";
import { buildRolloutSafetySnapshot } from "../runtime/rollout-safety.js";
import { getCurrentAppVersion, getCurrentDisplayVersion, getWorkspaceRootPath } from "../version.js";
import { getYeonjangRegistrySummary, listYeonjangRegistryInstances } from "../yeonjang/registry.js";
import { buildYeonjangFleetProjection } from "../yeonjang/topology.js";
import { produceChannelLiveAcceptanceEvidence, } from "./channel-live-acceptance-evidence.js";
import { buildConversationProcessReleaseEvidence, } from "./conversation-process-release-evidence.js";
import { buildEnterpriseTopologyReleaseReadinessSummary, buildEnterpriseTopologyRollbackRunbook, } from "./enterprise-topology-release-gate.js";
import { produceExtensionLiveAcceptanceEvidence, } from "./extension-live-acceptance-evidence.js";
import { admitLiveAcceptance, } from "./live-acceptance-admission.js";
import { collectLivePerformanceAcceptanceEvidence, } from "./live-performance-acceptance-collection.js";
import { buildMemoryCompactionReleaseGateSummary, } from "./memory-compaction-gate.js";
import { verifyOperationalRehearsalEvidence, } from "./operational-rehearsal-evidence.js";
import { buildReleasePerformanceSummary, } from "./performance-gate.js";
import { selectReleaseRolloutThresholdPolicy, } from "./release-policy-authorization.js";
import { buildSubAgentReleaseReadinessSummary, } from "./sub-agent-release-gate.js";
import { buildUiModeReleaseGateSummary } from "./ui-mode-gate.js";
import { produceWebLiveAcceptanceEvidence, } from "./web-live-acceptance-evidence.js";
import { produceYeonjangLiveAcceptanceEvidence, } from "./yeonjang-live-acceptance-evidence.js";
import { produceVerifiedYeonjangAcceptanceEvidence, } from "./yeonjang-verified-acceptance-evidence.js";
import { buildYeonjangPlatformAcceptanceMatrix, } from "./yeonjang-platform-acceptance.js";
import { collectYeonjangPlatformCapabilityReceipts } from "./yeonjang-capability-readiness-collector.js";
import { collectYeonjangCapabilityReadinessObservationsFromRegistry } from "./yeonjang-capability-readiness-registry-source.js";
import { ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS, collectYeonjangBrowserActiveTabInfoReleaseGateEvidence, collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository, } from "./yeonjang-browser-active-tab-info-release-gate-evidence-collector.js";
import { buildYeonjangMultiInstanceReleaseGateSummary, } from "./yeonjang-multi-instance-gate.js";
import { buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection, } from "./yeonjang-browser-active-tab-info-live-enable-review.js";
import { buildYeonjangBrowserActiveTabInfoLiveEnableProjection, } from "./yeonjang-browser-active-tab-info-live-enable-state-machine.js";
import { evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites, } from "./yeonjang-browser-active-tab-info-live-enable-prerequisites.js";
const ACTIVE_TAB_INFO_RELEASE_GATE_LIVE_DISABLED = Object.freeze({
    rustLiveHandlerEnabled: false,
    skillMappingEnabled: false,
    productionBindingEnabled: false,
    defaultLiveSmokeEnabled: false,
});
function buildReleaseManifestActiveTabInfoReleaseGate(options) {
    const repositoryEvidence = options.yeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidence;
    if (repositoryEvidence) {
        const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository({
            evidencePort: repositoryEvidence.evidencePort,
            publicRawLeakDetected: repositoryEvidence.publicRawLeakDetected ?? false,
            reviewBypassDetected: repositoryEvidence.reviewBypassDetected ?? false,
            unsafeEvidenceRefDetected: repositoryEvidence.unsafeEvidenceRefDetected ?? false,
            liveIntegrationState: ACTIVE_TAB_INFO_RELEASE_GATE_LIVE_DISABLED,
        });
        return {
            releaseGateSummary: collected.releaseGateSummary,
            evidenceCompleteness: buildActiveTabInfoEvidenceCompleteness(collected),
        };
    }
    const explicitEvidence = options.yeonjangBrowserActiveTabInfoReleaseGateEvidence;
    if (explicitEvidence) {
        const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
            moduleEvidence: explicitEvidence.moduleEvidence,
            testEvidence: explicitEvidence.testEvidence,
            publicRawLeakDetected: explicitEvidence.publicRawLeakDetected ?? false,
            reviewBypassDetected: explicitEvidence.reviewBypassDetected ?? false,
            unsafeEvidenceRefDetected: explicitEvidence.unsafeEvidenceRefDetected ?? false,
            liveIntegrationState: ACTIVE_TAB_INFO_RELEASE_GATE_LIVE_DISABLED,
        });
        return {
            releaseGateSummary: collected.releaseGateSummary,
            evidenceCompleteness: buildActiveTabInfoEvidenceCompleteness(collected),
        };
    }
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
        moduleEvidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
            gateId: requirement.gateId,
            present: false,
        })),
        testEvidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
            testPath: requirement.testPath,
            status: "missing",
        })),
        publicRawLeakDetected: false,
        reviewBypassDetected: false,
        unsafeEvidenceRefDetected: false,
        liveIntegrationState: ACTIVE_TAB_INFO_RELEASE_GATE_LIVE_DISABLED,
    });
    return {
        releaseGateSummary: collected.releaseGateSummary,
        evidenceCompleteness: buildActiveTabInfoEvidenceCompleteness({
            ...collected,
            missingSourcePaths: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.modulePath),
            missingTestPaths: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.testPath),
        }),
    };
}
function buildActiveTabInfoEvidenceCompleteness(collected) {
    const missingSourcePaths = sanitizeReleaseRelativePaths(collected.missingSourcePaths ?? []);
    const missingTestPaths = sanitizeReleaseRelativePaths(collected.missingTestPaths ?? []);
    const staleTestPaths = sanitizeReleaseRelativePaths(collected.staleTestPaths ?? []);
    const rejectedSkippedTestPaths = sanitizeReleaseRelativePaths(collected.rejectedSkippedTestPaths ?? []);
    const rejectedUnknownTestPaths = sanitizeReleaseRelativePaths(collected.rejectedUnknownTestPaths ?? []);
    const rejectedPublicRawReportPaths = sanitizeReleaseRelativePaths(collected.rejectedPublicRawReportPaths ?? []);
    const failingTestPaths = sanitizeReleaseRelativePaths(collected.failingTestPaths);
    return Object.freeze({
        schemaVersion: "yeonjang-browser-active-tab-info-evidence-completeness-v1",
        visibility: "release_summary",
        missingSourceCount: missingSourcePaths.length,
        missingTestCount: missingTestPaths.length,
        staleTestCount: staleTestPaths.length,
        rejectedSkippedTestCount: rejectedSkippedTestPaths.length,
        rejectedUnknownTestCount: rejectedUnknownTestPaths.length,
        rejectedPublicRawReportCount: rejectedPublicRawReportPaths.length,
        failingTestCount: failingTestPaths.length,
        auditDetailVisibility: "audit_only",
        auditDetailPaths: {
            missingSourcePaths,
            missingTestPaths,
            staleTestPaths,
            rejectedSkippedTestPaths,
            rejectedUnknownTestPaths,
            rejectedPublicRawReportPaths,
            failingTestPaths,
        },
    });
}
function buildYeonjangBrowserActiveTabInfoAuditArtifact(completeness) {
    const content = buildYeonjangBrowserActiveTabInfoAuditArtifactContent(completeness);
    return Object.freeze({
        id: "yeonjang:browser-active-tab-info:evidence",
        kind: "active_tab_info_audit_bundle",
        packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
        audience: "audit_only",
        redaction: "sanitized",
        rawDataAllowed: false,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        checksum: sha256Buffer(Buffer.from(content, "utf8")),
    });
}
function buildYeonjangBrowserActiveTabInfoAuditArtifactContent(completeness) {
    return `${JSON.stringify({
        schemaVersion: "yeonjang-browser-active-tab-info-audit-artifact-v1",
        method: "browser.active_tab_info",
        visibility: "audit_only",
        rawDataAllowed: false,
        evidenceCompleteness: completeness,
    }, null, 2)}\n`;
}
function sanitizeReleaseRelativePaths(paths) {
    return [...new Set(paths)]
        .filter((path) => !path.startsWith("/") && !path.includes("..") && !/^[a-z]+:\/\//iu.test(path))
        .sort();
}
const DEFAULT_TARGET_PLATFORMS = ["macos", "windows", "linux"];
export function buildReleaseManifest(options = {}) {
    const rootDir = resolve(options.rootDir ?? getWorkspaceRootPath());
    const runtimePaths = options.runtimePaths ?? createRuntimePaths({ KNOWBEE_STATE_DIR: join(rootDir, ".knowbee") });
    const db = getDb({ paths: runtimePaths });
    const now = options.now ?? new Date();
    const releaseAudience = options.releaseAudience ?? "public";
    const channelProductions = (options.channelLiveSmokeRuns ?? []).map(produceChannelLiveAcceptanceEvidence);
    const channelAccepted = channelProductions
        .flatMap((production) => production.accepted)
        .sort((left, right) => right.executedAt - left.executedAt);
    const channelLiveAcceptanceProduction = {
        acceptedCount: channelAccepted.length,
        rejected: channelProductions.flatMap((production) => production.rejected),
    };
    const conversationProcessEvidence = buildConversationProcessReleaseEvidence({
        candidates: options.conversationProcessLiveCandidates ?? [],
        expectedBuildIdentity: options.gitCommit ?? "",
        now: now.getTime(),
        maxAgeMs: Math.max(1, options.conversationProcessMaxAgeMs ?? 15 * 60 * 1_000),
    });
    const webProductions = (options.webLiveSmokeRuns ?? []).map((run, index) => ({
        index,
        run,
        production: produceWebLiveAcceptanceEvidence({
            run,
            now: now.getTime(),
            maxSourceAgeMs: Math.max(1, options.webLiveSourceMaxAgeMs ?? 15 * 60 * 1_000),
        }),
    }));
    const latestWebRunByScenario = new Map();
    for (const item of [...webProductions].sort((left, right) => {
        const timestampDifference = Date.parse(right.run.finishedAt) - Date.parse(left.run.finishedAt);
        return timestampDifference || right.index - left.index;
    })) {
        for (const result of item.run.results) {
            if (!latestWebRunByScenario.has(result.scenario.id)) {
                latestWebRunByScenario.set(result.scenario.id, item.index);
            }
        }
    }
    const webAccepted = webProductions
        .flatMap((item) => item.production.accepted.filter((evidence) => latestWebRunByScenario.get(evidence.scenarioId) === item.index))
        .sort((left, right) => right.executedAt - left.executedAt);
    const webLiveAcceptanceProduction = {
        acceptedCount: webAccepted.length,
        rejected: webProductions.flatMap((item) => item.production.rejected),
    };
    const extensionProductions = (options.extensionLiveSmokeRuns ?? []).map((run, index) => ({
        index,
        run,
        production: produceExtensionLiveAcceptanceEvidence(run),
    }));
    const latestExtensionRunByScenario = new Map();
    for (const item of [...extensionProductions].sort((left, right) => right.run.finishedAt - left.run.finishedAt || right.index - left.index)) {
        for (const result of item.run.results) {
            const key = `${result.scenario.capability}:${result.scenario.id}`;
            if (!latestExtensionRunByScenario.has(key)) {
                latestExtensionRunByScenario.set(key, item.index);
            }
        }
    }
    const extensionAccepted = extensionProductions
        .flatMap((item) => item.production.accepted.filter((evidence) => latestExtensionRunByScenario.get(`${evidence.capability}:${evidence.scenarioId}`) ===
        item.index))
        .sort((left, right) => right.executedAt - left.executedAt);
    const extensionLiveAcceptanceProduction = {
        acceptedCounts: {
            skill: extensionAccepted.filter((evidence) => evidence.capability === "skill").length,
            mcp: extensionAccepted.filter((evidence) => evidence.capability === "mcp").length,
        },
        rejected: extensionProductions.flatMap((item) => item.production.rejected),
    };
    const yeonjangProductions = (options.yeonjangLiveSmokeRuns ?? []).map((run, index) => ({
        index,
        run,
        production: produceYeonjangLiveAcceptanceEvidence({
            run,
            now: now.getTime(),
            maxSessionAgeMs: Math.max(1, options.yeonjangLiveSessionMaxAgeMs ?? 60_000),
        }),
    }));
    const latestYeonjangRunByScenario = new Map();
    for (const item of [...yeonjangProductions].sort((left, right) => right.run.finishedAt - left.run.finishedAt || right.index - left.index)) {
        for (const result of item.run.results) {
            if (!latestYeonjangRunByScenario.has(result.scenario.id)) {
                latestYeonjangRunByScenario.set(result.scenario.id, item.index);
            }
        }
    }
    const yeonjangAccepted = yeonjangProductions
        .flatMap((item) => item.production.accepted.filter((evidence) => latestYeonjangRunByScenario.get(evidence.scenarioId) === item.index))
        .sort((left, right) => right.executedAt - left.executedAt);
    const yeonjangLiveAcceptanceProduction = {
        acceptedCount: yeonjangAccepted.length,
        rejected: yeonjangProductions.flatMap((item) => item.production.rejected),
    };
    const yeonjangVerifiedAcceptanceProduction = produceVerifiedYeonjangAcceptanceEvidence(options.yeonjangVerifiedAcceptanceEvidence ?? []);
    const externallyProvidedEvidence = (options.liveAcceptanceEvidence ?? []).filter((evidence) => !(evidence.capability === "yeonjang" &&
        (evidence.scenarioId.startsWith("yeonjang:manual:") ||
            evidence.scenarioId.startsWith("yeonjang:verified:"))));
    const liveAcceptance = admitLiveAcceptance({
        audience: releaseAudience,
        requiredCapabilities: options.requiredLiveCapabilities ?? [
            "webui",
            "telegram",
            "slack",
            "web",
            "skill",
            "mcp",
            "yeonjang",
        ],
        evidence: [
            ...externallyProvidedEvidence,
            ...channelAccepted,
            ...webAccepted,
            ...extensionAccepted,
            ...yeonjangAccepted,
            ...yeonjangVerifiedAcceptanceProduction.accepted,
        ].sort((left, right) => right.executedAt - left.executedAt),
        now: now.getTime(),
        maxAgeMs: Math.max(1, options.liveAcceptanceMaxAgeMs ?? 24 * 60 * 60 * 1_000),
    });
    const targetPlatforms = options.targetPlatforms ?? DEFAULT_TARGET_PLATFORMS;
    const yeonjangPlatformRequiredCapabilityMethods = options.yeonjangPlatformRequiredCapabilityMethods ?? [];
    const yeonjangAutoCapabilityReceipts = options.yeonjangAutoCollectPlatformCapabilityReadiness &&
        yeonjangPlatformRequiredCapabilityMethods.length > 0
        ? collectYeonjangPlatformCapabilityReceipts({
            requiredMethods: yeonjangPlatformRequiredCapabilityMethods,
            observations: collectYeonjangCapabilityReadinessObservationsFromRegistry({
                requiredMethods: yeonjangPlatformRequiredCapabilityMethods,
                now: now.getTime(),
                db,
            }),
        })
        : [];
    const explicitYeonjangPlatformCapabilityReceipts = options.yeonjangPlatformCapabilityReceipts ?? [];
    const explicitYeonjangCapabilityKeys = new Set(explicitYeonjangPlatformCapabilityReceipts.map((receipt) => `${receipt.platform}:${receipt.method.trim()}`));
    const mergedYeonjangPlatformCapabilityReceipts = [
        ...explicitYeonjangPlatformCapabilityReceipts,
        ...yeonjangAutoCapabilityReceipts.filter((receipt) => !explicitYeonjangCapabilityKeys.has(`${receipt.platform}:${receipt.method.trim()}`)),
    ];
    const yeonjangPlatformAcceptance = buildYeonjangPlatformAcceptanceMatrix({
        requiredPlatforms: targetPlatforms,
        availablePlatforms: options.availableYeonjangPlatforms ??
            [...new Set((options.yeonjangPlatformLiveRecords ?? []).map((record) => record.platform))],
        deterministicReceipts: options.yeonjangPlatformDeterministicReceipts ?? [],
        liveRecords: options.yeonjangPlatformLiveRecords ?? [],
        requiredCapabilityMethods: yeonjangPlatformRequiredCapabilityMethods,
        capabilityReceipts: mergedYeonjangPlatformCapabilityReceipts,
        now: now.getTime(),
        maxSessionAgeMs: Math.max(1, options.yeonjangLiveSessionMaxAgeMs ?? 60_000),
    });
    const releaseVersion = options.releaseVersion ?? getCurrentDisplayVersion();
    const appVersion = getCurrentAppVersion();
    const gitTag = options.gitTag === undefined
        ? readGitValue(rootDir, ["describe", "--tags", "--always", "--dirty"])
        : options.gitTag;
    const gitCommit = options.gitCommit === undefined
        ? readGitValue(rootDir, ["rev-parse", "--short", "HEAD"])
        : options.gitCommit;
    const operationalRehearsalEvidence = verifyOperationalRehearsalEvidence({
        candidate: { appVersion, gitTag, gitCommit },
        npmReceipt: options.operationalRehearsalEvidence?.npmReceipt ?? null,
        stagedPackages: options.operationalRehearsalEvidence?.stagedPackages ?? [],
        backupReceipt: options.operationalRehearsalEvidence?.backupReceipt ?? null,
        backupManifest: options.operationalRehearsalEvidence?.backupManifest ?? null,
        snapshotVerification: options.operationalRehearsalEvidence?.snapshotVerification ?? {
            ok: false,
            checked: 0,
            failures: [],
        },
        artifactCleanupSmokeReceipt: options.operationalRehearsalEvidence?.artifactCleanupSmokeReceipt ?? null,
    });
    const promptSources = options.promptSources ?? safePromptSources(rootDir);
    const definitions = buildReleaseArtifactDefinitions({ rootDir, targetPlatforms, promptSources });
    const artifacts = definitions.map(materializeArtifact);
    const backupInventory = safeBackupInventory(rootDir, runtimePaths);
    const migrationPreflight = buildMigrationPreflightReport({
        dbPath: runtimePaths.dbFile,
        providerConfigSane: true,
        canWrite: true,
    });
    const updatePreflight = buildReleaseUpdatePreflightReport({
        rootDir,
        targetPlatforms,
        promptSourceCount: promptSources.length,
    });
    const rollout = buildRolloutSafetySnapshot(runtimePaths.dbFile);
    const planDrift = safePlanDrift(rootDir);
    const webRetrievalEvidence = buildWebRetrievalReleaseGateSummary({
        fixtureRegression: safeWebRetrievalFixtureRegression(rootDir),
        liveSmoke: null,
    });
    const uiModeEvidence = buildUiModeReleaseGateSummary();
    const yeonjangMultiInstanceEvidence = buildYeonjangMultiInstanceReleaseGateSummary({
        now,
        profileSmokeEvidence: options.yeonjangProfileSmokeEvidence ?? [],
        profileSmokeMaxAgeMs: Math.max(1, options.yeonjangProfileSmokeMaxAgeMs ?? 24 * 60 * 60 * 1_000),
        liveFleetProjection: buildYeonjangFleetProjection({
            instances: listYeonjangRegistryInstances({ db, now: now.getTime() }),
            registrySummary: getYeonjangRegistrySummary({ db, now: now.getTime() }),
            now: now.getTime(),
        }),
    });
    const memoryCompactionEvidence = buildMemoryCompactionReleaseGateSummary({
        now: options.now ?? new Date(),
        config: options.config ?? DEFAULT_CONFIG,
    });
    const acceptanceEvidence = resolveLivePerformanceAcceptanceEvidence(options.livePerformanceAcceptanceSelection);
    const performanceEvidence = buildReleasePerformanceSummary({
        ...(options.now ? { now: options.now } : {}),
        ...(acceptanceEvidence ? { acceptanceEvidence } : {}),
    });
    const benchmarkSuite = runSubAgentBenchmarkSuite({ now: options.now ?? new Date() });
    const benchmarkEvidence = benchmarkSuite.releaseGate;
    const featureFlags = rollout.featureFlags.map((flag) => ({
        featureKey: flag.featureKey,
        mode: flag.mode,
        compatibilityMode: flag.compatibilityMode,
        source: flag.source,
    }));
    const orchestrationEvidence = buildReleaseOrchestrationEvidence({
        now: options.now ?? new Date(),
        featureFlags,
    });
    const rollback = buildReleaseRollbackRunbook();
    const rolloutThresholdPolicy = options.rolloutThresholdPolicySelection
        ? selectReleaseRolloutThresholdPolicy(options.rolloutThresholdPolicySelection)
        : undefined;
    const subAgentReleaseGate = buildSubAgentReleaseReadinessSummary({
        now: options.now ?? new Date(),
        requestedMode: "limited_beta",
        featureFlags,
        migrationPreflight,
        performanceEvidence,
        benchmarkSuite,
        orchestrationEvidence,
        uiModeEvidence,
        ...(rolloutThresholdPolicy?.status === "selected"
            ? {
                rolloutThresholdPolicy: {
                    candidate: rolloutThresholdPolicy.candidate,
                    authorizationPort: rolloutThresholdPolicy.authorizationPort,
                },
            }
            : {}),
    });
    const enterpriseTopologyReleaseGate = buildEnterpriseTopologyReleaseReadinessSummary({
        now: options.now ?? new Date(),
        featureFlags,
    });
    const yeonjangBrowserActiveTabInfoReleaseGateEvidence = buildReleaseManifestActiveTabInfoReleaseGate(options);
    const yeonjangBrowserActiveTabInfoReleaseGate = yeonjangBrowserActiveTabInfoReleaseGateEvidence.releaseGateSummary;
    const yeonjangBrowserActiveTabInfoEvidenceCompleteness = yeonjangBrowserActiveTabInfoReleaseGateEvidence.evidenceCompleteness;
    const yeonjangBrowserActiveTabInfoAuditArtifact = buildYeonjangBrowserActiveTabInfoAuditArtifact(yeonjangBrowserActiveTabInfoEvidenceCompleteness);
    const yeonjangBrowserActiveTabInfoLiveEnableReview = buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection(options.yeonjangBrowserActiveTabInfoLiveEnableReviewRecord, { now });
    const yeonjangBrowserActiveTabInfoRuntimeTransition = options.yeonjangBrowserActiveTabInfoLiveEnableReviewRecord === undefined
        ? buildYeonjangBrowserActiveTabInfoLiveEnableProjection({
            currentState: "inventory_only",
            event: "EVIDENCE_READY",
            evidenceReady: yeonjangBrowserActiveTabInfoReleaseGate.gateStatus !== "blocked",
            liveIntegrationState: yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState,
            now,
        })
        : buildYeonjangBrowserActiveTabInfoLiveEnableProjection({
            currentState: "review_ready",
            event: "REVIEW_ACCEPTED",
            evidenceReady: yeonjangBrowserActiveTabInfoReleaseGate.gateStatus !== "blocked",
            reviewRecord: options.yeonjangBrowserActiveTabInfoLiveEnableReviewRecord,
            liveIntegrationState: yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState,
            now,
        });
    const activeTabInfoEvidenceClean = yeonjangBrowserActiveTabInfoReleaseGate.gateStatus !== "blocked" &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.missingSourceCount === 0 &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.missingTestCount === 0 &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.staleTestCount === 0 &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.rejectedSkippedTestCount === 0 &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.rejectedUnknownTestCount === 0 &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.rejectedPublicRawReportCount === 0 &&
        yeonjangBrowserActiveTabInfoEvidenceCompleteness.failingTestCount === 0;
    const activeTabInfoLivePathsClosed = !yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.rustLiveHandlerEnabled &&
        !yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.skillMappingEnabled &&
        !yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.productionBindingEnabled &&
        !yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.defaultLiveSmokeEnabled;
    const yeonjangBrowserActiveTabInfoLiveEnablePrerequisites = evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
        productionExposureAuditPassed: activeTabInfoLivePathsClosed,
        manualReviewRecordAccepted: yeonjangBrowserActiveTabInfoLiveEnableReview.status === "accepted",
        runtimeTransitionReady: yeonjangBrowserActiveTabInfoRuntimeTransition.transitionOk &&
            yeonjangBrowserActiveTabInfoRuntimeTransition.state === "review_record_accepted" &&
            yeonjangBrowserActiveTabInfoRuntimeTransition.openSurfaceCount === 0,
        releaseApprovalEvidenceValid: activeTabInfoEvidenceClean,
        finalProductLogBoundaryReady: true,
        operatorWordingReady: true,
        taskEvidenceReady: true,
    });
    const releaseNotes = buildReleaseNoteSummary({
        featureFlags,
        migrationPreflight,
        performanceEvidence,
        benchmarkEvidence,
        subAgentReleaseGate,
        enterpriseTopologyReleaseGate,
        orchestrationEvidence,
        rollback,
        webRetrievalEvidence,
        uiModeEvidence,
        yeonjangMultiInstanceEvidence,
        yeonjangBrowserActiveTabInfoReleaseGate,
        yeonjangBrowserActiveTabInfoEvidenceCompleteness,
        yeonjangBrowserActiveTabInfoLiveEnableReview,
        yeonjangBrowserActiveTabInfoRuntimeTransition,
        memoryCompactionEvidence,
    });
    return {
        kind: "knowbee.release.package",
        version: 2,
        releaseVersion,
        appVersion,
        gitTag,
        gitCommit,
        createdAt: (options.now ?? new Date()).toISOString(),
        rootDir,
        targetPlatforms,
        artifacts,
        requiredMissing: artifacts
            .filter((artifact) => artifact.status === "missing_required")
            .map((artifact) => artifact.id),
        checksums: artifacts
            .filter((artifact) => artifact.checksum !== null)
            .map((artifact) => ({
            id: artifact.id,
            checksum: artifact.checksum,
            packagePath: artifact.packagePath,
        }))
            .concat([
            {
                id: yeonjangBrowserActiveTabInfoAuditArtifact.id,
                checksum: yeonjangBrowserActiveTabInfoAuditArtifact.checksum,
                packagePath: yeonjangBrowserActiveTabInfoAuditArtifact.packagePath,
            },
        ]),
        backupInventory: {
            included: backupInventory.included,
            excluded: backupInventory.excluded,
            promptSources: backupInventory.promptSources,
            logicalCoverage: backupInventory.logicalCoverage,
        },
        updatePreflight,
        migrationPreflight: {
            ok: migrationPreflight.ok,
            risk: migrationPreflight.risk,
            currentSchemaVersion: migrationPreflight.currentSchemaVersion,
            latestSchemaVersion: migrationPreflight.latestSchemaVersion,
            pendingVersions: migrationPreflight.pendingVersions,
        },
        featureFlags,
        rolloutEvidence: {
            mismatchCount: rollout.shadowCompare.mismatchCount,
            warningCount: rollout.evidence.warningCount,
            blockedCount: rollout.evidence.blockedCount,
            latest: rollout.evidence.latest.map((item) => ({
                featureKey: item.feature_key,
                stage: item.stage,
                status: item.status,
                summary: item.summary,
            })),
        },
        planEvidence: planDrift.releaseNoteEvidence,
        webRetrievalEvidence,
        uiModeEvidence,
        yeonjangMultiInstanceEvidence,
        memoryCompactionEvidence,
        operationalRehearsalEvidence,
        performanceEvidence,
        benchmarkEvidence,
        subAgentReleaseGate,
        enterpriseTopologyReleaseGate,
        orchestrationEvidence,
        liveAcceptance,
        channelLiveAcceptanceProduction,
        conversationProcessEvidence,
        webLiveAcceptanceProduction,
        extensionLiveAcceptanceProduction,
        yeonjangLiveAcceptanceProduction,
        yeonjangVerifiedAcceptanceProduction: {
            acceptedCount: yeonjangVerifiedAcceptanceProduction.accepted.length,
            rejected: [...yeonjangVerifiedAcceptanceProduction.rejected],
        },
        yeonjangPlatformAcceptance,
        yeonjangBrowserActiveTabInfoReleaseGate,
        yeonjangBrowserActiveTabInfoEvidenceCompleteness,
        yeonjangBrowserActiveTabInfoAuditArtifact,
        yeonjangBrowserActiveTabInfoLiveEnableReview,
        yeonjangBrowserActiveTabInfoRuntimeTransition,
        yeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
        releaseNotes,
        pipeline: buildReleasePipelinePlan({ targetPlatforms, audience: releaseAudience }),
        rollback,
        cleanInstallChecklist: buildCleanMachineInstallChecklist(),
    };
}
export function evaluateReleaseReadiness(manifest) {
    const blockerCodes = [];
    if (manifest.requiredMissing.length > 0)
        blockerCodes.push("required_artifact_missing");
    if (!manifest.updatePreflight.ok)
        blockerCodes.push("update_preflight_failed");
    if (!manifest.migrationPreflight.ok)
        blockerCodes.push("migration_preflight_failed");
    if (manifest.performanceEvidence.gateStatus === "failed") {
        blockerCodes.push("performance_gate_failed");
    }
    if (manifest.benchmarkEvidence.gateStatus === "failed")
        blockerCodes.push("benchmark_gate_failed");
    if (manifest.subAgentReleaseGate.gateStatus === "failed") {
        blockerCodes.push("sub_agent_gate_failed");
    }
    if (manifest.enterpriseTopologyReleaseGate.gateStatus === "failed") {
        blockerCodes.push("enterprise_topology_gate_failed");
    }
    if (manifest.orchestrationEvidence.gateStatus === "failed") {
        blockerCodes.push("orchestration_gate_failed");
    }
    if (manifest.webRetrievalEvidence.gateStatus === "failed") {
        blockerCodes.push("web_retrieval_gate_failed");
    }
    if (manifest.uiModeEvidence.gateStatus === "failed")
        blockerCodes.push("ui_mode_gate_failed");
    if (manifest.yeonjangMultiInstanceEvidence.gateStatus === "failed") {
        blockerCodes.push("yeonjang_multi_instance_gate_failed");
    }
    if (manifest.yeonjangBrowserActiveTabInfoReleaseGate.gateStatus === "blocked" ||
        hasActiveTabInfoEvidenceCompletenessBlocker(manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness)) {
        blockerCodes.push("yeonjang_active_tab_info_release_gate_failed");
    }
    if (manifest.memoryCompactionEvidence.gateStatus === "failed") {
        blockerCodes.push("memory_compaction_gate_failed");
    }
    if (manifest.liveAcceptance.status === "blocked") {
        blockerCodes.push("live_acceptance_failed");
    }
    if (manifest.operationalRehearsalEvidence.npmInstall.status !== "verified") {
        blockerCodes.push("npm_install_rehearsal_failed");
    }
    if (manifest.operationalRehearsalEvidence.backupRestore.status !== "verified") {
        blockerCodes.push("backup_restore_rehearsal_failed");
    }
    if (manifest.operationalRehearsalEvidence.artifactCleanupSmoke.status !== "verified") {
        blockerCodes.push("artifact_cleanup_smoke_failed");
    }
    return {
        status: blockerCodes.length === 0 ? "ready" : "blocked",
        blockerCodes,
    };
}
export function buildReleaseReadinessFailureSummary(input) {
    const readiness = input.readiness ?? evaluateReleaseReadiness(input.manifest);
    const lines = [];
    if (readiness.blockerCodes.includes("yeonjang_active_tab_info_release_gate_failed")) {
        const completeness = input.manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness;
        lines.push(`Yeonjang browser.active_tab_info evidence blocked: missingSources=${completeness.missingSourceCount}, missingTests=${completeness.missingTestCount}, staleTests=${completeness.staleTestCount}, rejectedSkipped=${completeness.rejectedSkippedTestCount}, rejectedUnknown=${completeness.rejectedUnknownTestCount}, rejectedPublicRawReports=${completeness.rejectedPublicRawReportCount}, failingTests=${completeness.failingTestCount}.`);
    }
    return Object.freeze({
        visibility: "release_operator_summary",
        lines,
    });
}
export function buildReleaseApprovalEvidenceProjection(input) {
    const readiness = input.readiness ?? evaluateReleaseReadiness(input.manifest);
    const artifact = input.manifest.yeonjangBrowserActiveTabInfoAuditArtifact;
    const completeness = input.manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness;
    return Object.freeze({
        schemaVersion: "knowbee.release-approval-evidence.v1",
        visibility: "release_operator_summary",
        readiness: Object.freeze({
            status: readiness.status,
            blockerCodes: Object.freeze([...readiness.blockerCodes]),
        }),
        activeTabInfoAuditArtifact: Object.freeze({
            id: artifact.id,
            checksum: artifact.checksum,
            packagePath: artifact.packagePath,
        }),
        activeTabInfoEvidenceCompleteness: Object.freeze({
            missingSourceCount: completeness.missingSourceCount,
            missingTestCount: completeness.missingTestCount,
            staleTestCount: completeness.staleTestCount,
            rejectedSkippedTestCount: completeness.rejectedSkippedTestCount,
            rejectedUnknownTestCount: completeness.rejectedUnknownTestCount,
            rejectedPublicRawReportCount: completeness.rejectedPublicRawReportCount,
            failingTestCount: completeness.failingTestCount,
        }),
    });
}
export function validateReleaseApprovalEvidenceProjection(value) {
    if (!releaseObjectRecord(value)) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_required");
    }
    if (releaseApprovalEvidenceContainsRawData(value)) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_raw_data");
    }
    const allowedTopLevelKeys = new Set([
        "schemaVersion",
        "visibility",
        "readiness",
        "activeTabInfoAuditArtifact",
        "activeTabInfoEvidenceCompleteness",
    ]);
    if (Object.keys(value).some((key) => !allowedTopLevelKeys.has(key))) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    if (value.schemaVersion !== "knowbee.release-approval-evidence.v1") {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    const readiness = value.readiness;
    if (!releaseObjectRecord(readiness)) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    const readinessStatus = readiness.status;
    if (readinessStatus !== "ready" && readinessStatus !== "blocked") {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    if (!Array.isArray(readiness.blockerCodes) ||
        readiness.blockerCodes.some((code) => typeof code !== "string" || !code.trim() || !/^[a-z0-9_.:-]+$/u.test(code))) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    if (readinessStatus === "ready" && readiness.blockerCodes.length > 0) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    if (readinessStatus === "blocked" && readiness.blockerCodes.length < 1) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    const artifact = value.activeTabInfoAuditArtifact;
    if (!releaseObjectRecord(artifact)) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    const artifactId = artifact.id;
    const checksum = artifact.checksum;
    const packagePath = artifact.packagePath;
    if (artifactId !== "yeonjang:browser-active-tab-info:evidence" ||
        typeof checksum !== "string" ||
        !/^[a-f0-9]{64}$/u.test(checksum) ||
        packagePath !== "audit/yeonjang/browser-active-tab-info-evidence.json") {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    const completeness = value.activeTabInfoEvidenceCompleteness;
    if (!releaseObjectRecord(completeness)) {
        return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
    }
    const countKeys = [
        "missingSourceCount",
        "missingTestCount",
        "staleTestCount",
        "rejectedSkippedTestCount",
        "rejectedUnknownTestCount",
        "rejectedPublicRawReportCount",
        "failingTestCount",
    ];
    const counts = {
        missingSourceCount: 0,
        missingTestCount: 0,
        staleTestCount: 0,
        rejectedSkippedTestCount: 0,
        rejectedUnknownTestCount: 0,
        rejectedPublicRawReportCount: 0,
        failingTestCount: 0,
    };
    for (const key of countKeys) {
        const count = completeness[key];
        if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
            return rejectedReleaseApprovalEvidence("release_approval_evidence_invalid");
        }
        counts[key] = count;
    }
    return Object.freeze({
        status: "valid",
        evidence: Object.freeze({
            schemaVersion: "knowbee.release-approval-evidence.v1",
            visibility: "release_operator_summary",
            readiness: Object.freeze({
                status: readinessStatus,
                blockerCodes: Object.freeze([...readiness.blockerCodes]),
            }),
            activeTabInfoAuditArtifact: Object.freeze({
                id: artifactId,
                checksum,
                packagePath,
            }),
            activeTabInfoEvidenceCompleteness: Object.freeze({ ...counts }),
        }),
    });
}
function releaseApprovalEvidenceContainsRawData(value) {
    const serialized = JSON.stringify(value);
    return (!serialized ||
        /stdout|stderr|stack trace|raw output|https?:\/\/|token=|\/Users\/|\/private\//iu.test(serialized));
}
function rejectedReleaseApprovalEvidence(reasonCode) {
    return Object.freeze({ status: "rejected", reasonCode });
}
export function buildReleaseActiveTabInfoAuditAccessProjectionMatrix(input) {
    const artifact = input.manifest.yeonjangBrowserActiveTabInfoAuditArtifact;
    const counts = buildReleaseApprovalEvidenceProjection({ manifest: input.manifest })
        .activeTabInfoEvidenceCompleteness;
    const artifactSummary = Object.freeze({
        id: artifact.id,
        checksum: artifact.checksum,
        packagePath: artifact.packagePath,
    });
    const forbiddenDataClasses = Object.freeze([
        "raw_audit_json_content",
        "raw_test_runner_stdout",
        "raw_test_runner_stderr",
        "raw_stack_trace",
        "raw_browser_tab_data",
        "manual_review_raw_record",
        "runtime_transition_raw_record",
        "runtime_activation_binding_change",
        "runtime_mutation_preflight_projection",
        "runtime_mutation_executor_plan_projection",
        "runtime_mutation_dry_run_receipt_projection",
        "live_execution_authorization_projection",
        "live_execution_authorization_ref",
        "operator_live_authorization_proof",
        "live_execution_authorization_timestamp",
        "live_execution_receipt_projection",
        "live_execution_receipt_id",
        "dispatch_control_flag",
        "target_instance_ref",
        "runtime_config_snapshot_id",
        "user_goal_success_flag",
        "dispatch_execution_plan_projection",
        "dispatch_execution_step_plan",
        "dispatch_rollback_step_plan",
        "dispatch_post_check_step_plan",
        "dispatch_dry_run_receipt_projection",
        "dispatch_dry_run_receipt_id",
        "dispatch_adapter_dry_run_status",
        "dispatch_rollback_dry_run_status",
        "dispatch_post_check_dry_run_status",
        "dispatch_execution_receipt_projection",
        "dispatch_execution_receipt_id",
        "post_dispatch_result_ref",
        "dispatch_execution_timestamp",
        "dispatch_verification_admission_projection",
        "dispatch_verification_admission_id",
        "redacted_runtime_observation_ref",
        "llm_decision_summary_ref",
        "verification_admission_flag",
        "llm_post_check_decision_receipt_projection",
        "llm_post_check_decision_receipt_id",
        "post_check_goal_satisfied_flag",
        "final_response_delivery_flag",
        "llm_post_check_decision_status",
        "final_response_delivery_gate_projection",
        "final_delivery_gate_id",
        "delivery_channel_acknowledgement_status",
        "final_response_projection_ref",
        "product_log_evidence_ref",
        "user_goal_closeout_receipt_projection",
        "user_goal_closeout_receipt_id",
        "user_visible_final_response_ack_ref",
        "user_goal_closeout_success_flag",
        "release_readiness_flag",
        "publication_readiness_flag",
        "completion_audit_summary_projection",
        "completion_audit_summary_id",
        "completion_status",
        "sanitized_operator_completion_note_ref",
        "final_result_projection_ref",
        "terminal_report_projection",
        "terminal_report_projection_id",
        "terminal_report_status",
        "user_facing_response_ack_ref",
        "sanitized_terminal_report_ref",
        "terminal_delivery_receipt_projection",
        "terminal_delivery_receipt_id",
        "terminal_delivery_status",
        "terminal_output_channel_ack_ref",
        "cleanup_branch_preparation_plan_projection",
        "cleanup_branch_preparation_plan_status",
        "cleanup_branch_preparation_plan_reviewed_receipt_status",
        "cleanup_branch_preparation_plan_required_branch_steps",
        "cleanup_branch_preparation_plan_required_verification_commands",
        "cleanup_branch_preparation_plan_create_branch_flag",
        "sanitized_cleanup_branch_preparation_ref",
        "cleanup_branch_execution_admission_projection",
        "cleanup_branch_execution_admission_status",
        "cleanup_branch_execution_admission_reviewed_plan_status",
        "cleanup_branch_execution_admission_required_boundaries",
        "cleanup_branch_execution_admission_run_git_flag",
        "sanitized_cleanup_branch_execution_admission_ref",
        "cleanup_deletion_candidate_plan_projection",
        "cleanup_deletion_candidate_plan_status",
        "cleanup_deletion_candidate_plan_count",
        "cleanup_deletion_candidate_plan_candidate_refs",
        "cleanup_deletion_candidate_plan_required_review_steps",
        "cleanup_deletion_candidate_plan_required_verification_commands",
        "cleanup_deletion_candidate_plan_delete_flag",
        "cleanup_deletion_review_receipt_projection",
        "cleanup_deletion_review_receipt_status",
        "cleanup_deletion_review_receipt_review_decision",
        "cleanup_deletion_review_receipt_reviewed_candidate_plan_status",
        "cleanup_deletion_review_receipt_ref",
        "cleanup_deletion_review_receipt_execution_admission_flag",
        "cleanup_deletion_execution_admission_projection",
        "cleanup_deletion_execution_admission_status",
        "cleanup_deletion_execution_admission_reviewed_receipt_status",
        "cleanup_deletion_execution_admission_decision",
        "cleanup_deletion_execution_admission_ref",
        "cleanup_deletion_execution_admission_dry_run_flag",
        "cleanup_deletion_dry_run_receipt_projection",
        "cleanup_deletion_dry_run_receipt_status",
        "cleanup_deletion_dry_run_receipt_reviewed_admission_status",
        "cleanup_deletion_dry_run_receipt_id",
        "cleanup_deletion_dry_run_receipt_candidate_count",
        "cleanup_deletion_dry_run_receipt_required_verification_command_count",
        "cleanup_deletion_dry_run_receipt_rollback_note_count",
        "cleanup_deletion_dry_run_receipt_review_flag",
        "cleanup_deletion_dry_run_review_acknowledgement_receipt_projection",
        "cleanup_deletion_dry_run_review_acknowledgement_receipt_status",
        "cleanup_deletion_dry_run_review_acknowledgement_receipt_reviewed_dry_run_status",
        "cleanup_deletion_dry_run_review_acknowledgement_receipt_id",
        "cleanup_deletion_dry_run_review_acknowledgement_receipt_next_action",
        "cleanup_deletion_dry_run_review_acknowledgement_receipt_audit_retention_flag",
        "sanitized_terminal_delivery_event_ref",
        "operator_closeout_note_projection",
        "operator_closeout_note_id",
        "operator_closeout_status",
        "sanitized_user_ack_ref",
        "sanitized_operator_closeout_note_ref",
        "final_closeout_ledger_projection",
        "final_closeout_ledger_id",
        "final_closeout_ledger_status",
        "completion_audit_summary_ref",
        "terminal_delivery_receipt_ref",
        "final_audit_handoff_bundle_projection",
        "final_audit_handoff_bundle_id",
        "final_audit_handoff_status",
        "sanitized_audit_artifact_descriptor_ref",
        "release_surface_matrix_ack_ref",
        "operator_completion_notice_projection",
        "operator_completion_notice_id",
        "operator_completion_notice_status",
        "sanitized_operator_notice_ref",
        "user_visible_response_ack_ref",
        "operator_readable_closeout_summary_projection",
        "operator_readable_closeout_summary_id",
        "operator_readable_closeout_summary_status",
        "sanitized_closeout_summary_ref",
        "audit_handoff_ack_ref",
        "final_archival_pointer_projection",
        "final_archival_pointer_id",
        "archival_pointer_status",
        "sanitized_archive_descriptor_ref",
        "retention_policy_ack_ref",
        "archival_release_evidence_index_projection",
        "archival_release_evidence_index_id",
        "archival_release_evidence_index_status",
        "sanitized_evidence_index_ref",
        "audit_retrieval_ack_ref",
        "final_audit_release_handoff_receipt_projection",
        "final_audit_release_handoff_receipt_id",
        "final_audit_release_handoff_receipt_status",
        "sanitized_release_handoff_receipt_ref",
        "manual_audit_queue_ack_ref",
        "final_audit_release_closure_ledger_projection",
        "final_audit_release_closure_ledger_id",
        "final_audit_release_closure_ledger_status",
        "sanitized_release_closure_ledger_ref",
        "audit_archive_closure_ack_ref",
        "operator_release_archive_completion_notice_projection",
        "operator_release_archive_completion_notice_id",
        "operator_release_archive_completion_notice_status",
        "sanitized_archive_completion_notice_ref",
        "operator_archive_ack_ref",
        "final_release_archive_index_pointer_projection",
        "final_release_archive_index_pointer_id",
        "final_release_archive_index_pointer_status",
        "sanitized_release_archive_index_pointer_ref",
        "archive_index_retention_ack_ref",
        "operator_archive_index_retention_receipt_projection",
        "operator_archive_index_retention_receipt_id",
        "operator_archive_index_retention_receipt_status",
        "sanitized_archive_index_retention_receipt_ref",
        "operator_retention_ack_ref",
        "final_archived_release_closure_marker_projection",
        "final_archived_release_closure_marker_id",
        "final_archived_release_closure_marker_status",
        "sanitized_archived_release_closure_marker_ref",
        "final_archive_retention_ack_ref",
        "operator_archived_release_acknowledgement_projection",
        "operator_archived_release_acknowledgement_id",
        "operator_archived_release_acknowledgement_status",
        "sanitized_archived_release_acknowledgement_ref",
        "operator_archived_release_ack_ref",
        "final_archival_completion_index_projection",
        "final_archival_completion_index_id",
        "final_archival_completion_index_status",
        "sanitized_archival_completion_index_ref",
        "archival_completion_retention_ack_ref",
        "operator_archival_completion_acknowledgement_receipt_projection",
        "operator_archival_completion_acknowledgement_receipt_id",
        "operator_archival_completion_acknowledgement_receipt_status",
        "sanitized_archival_completion_acknowledgement_ref",
        "operator_archival_completion_ack_ref",
        "final_operator_archive_completion_marker_projection",
        "final_operator_archive_completion_marker_id",
        "final_operator_archive_completion_marker_status",
        "sanitized_final_operator_archive_completion_marker_ref",
        "final_operator_archive_completion_ack_ref",
        "operator_completion_archive_acknowledgement_projection",
        "operator_completion_archive_acknowledgement_id",
        "operator_completion_archive_acknowledgement_status",
        "sanitized_operator_completion_archive_acknowledgement_ref",
        "operator_completion_archive_ack_ref",
        "final_completion_archive_seal_projection",
        "final_completion_archive_seal_id",
        "final_completion_archive_seal_status",
        "sanitized_final_completion_archive_seal_ref",
        "final_completion_archive_ack_ref",
        "operator_sealed_completion_archive_receipt_projection",
        "operator_sealed_completion_archive_receipt_id",
        "operator_sealed_completion_archive_receipt_status",
        "sanitized_operator_sealed_completion_archive_receipt_ref",
        "operator_sealed_completion_archive_receipt_ref",
        "final_sealed_archive_handoff_marker_projection",
        "final_sealed_archive_handoff_marker_id",
        "final_sealed_archive_handoff_marker_status",
        "sanitized_final_sealed_archive_handoff_marker_ref",
        "final_sealed_archive_handoff_ack_ref",
        "operator_sealed_archive_handoff_receipt_projection",
        "operator_sealed_archive_handoff_receipt_id",
        "operator_sealed_archive_handoff_receipt_status",
        "sanitized_operator_sealed_archive_handoff_receipt_ref",
        "operator_sealed_archive_handoff_receipt_ref",
        "final_sealed_archive_handoff_completion_index_projection",
        "final_sealed_archive_handoff_completion_index_id",
        "final_sealed_archive_handoff_completion_index_status",
        "sanitized_final_sealed_archive_handoff_completion_index_ref",
        "final_sealed_archive_handoff_completion_ack_ref",
        "operator_final_sealed_archive_receipt_projection",
        "operator_final_sealed_archive_receipt_id",
        "operator_final_sealed_archive_receipt_status",
        "sanitized_operator_final_sealed_archive_receipt_ref",
        "operator_final_sealed_archive_receipt_ref",
        "final_sealed_archive_closeout_ledger_projection",
        "final_sealed_archive_closeout_ledger_id",
        "final_sealed_archive_closeout_ledger_status",
        "sanitized_final_sealed_archive_closeout_ledger_ref",
        "final_sealed_archive_closeout_ack_ref",
        "operator_final_closeout_acknowledgement_receipt_projection",
        "operator_final_closeout_acknowledgement_receipt_id",
        "operator_final_closeout_acknowledgement_receipt_status",
        "sanitized_operator_final_closeout_acknowledgement_receipt_ref",
        "operator_final_closeout_acknowledgement_receipt_ref",
        "final_operator_closeout_index_projection",
        "final_operator_closeout_index_id",
        "final_operator_closeout_index_status",
        "sanitized_final_operator_closeout_index_ref",
        "final_operator_closeout_ack_ref",
        "operator_final_index_retention_receipt_projection",
        "operator_final_index_retention_receipt_id",
        "operator_final_index_retention_receipt_status",
        "sanitized_operator_final_index_retention_receipt_ref",
        "operator_final_index_retention_receipt_ref",
        "final_retention_closure_ledger_projection",
        "final_retention_closure_ledger_id",
        "final_retention_closure_ledger_status",
        "sanitized_final_retention_closure_ledger_ref",
        "final_retention_closure_ack_ref",
        "operator_final_retention_acknowledgement_receipt_projection",
        "operator_final_retention_acknowledgement_receipt_id",
        "operator_final_retention_acknowledgement_receipt_status",
        "sanitized_operator_final_retention_acknowledgement_receipt_ref",
        "operator_final_retention_acknowledgement_ref",
        "final_handoff_closure_marker_projection",
        "final_handoff_closure_marker_id",
        "final_handoff_closure_marker_status",
        "sanitized_final_handoff_closure_marker_ref",
        "final_handoff_closure_ack_ref",
        "operator_final_handoff_receipt_projection",
        "operator_final_handoff_receipt_id",
        "operator_final_handoff_receipt_status",
        "sanitized_operator_final_handoff_receipt_ref",
        "operator_final_handoff_ack_ref",
        "final_transfer_closeout_ledger_projection",
        "final_transfer_closeout_ledger_id",
        "final_transfer_closeout_ledger_status",
        "sanitized_final_transfer_closeout_ledger_ref",
        "final_transfer_closeout_ack_ref",
        "operator_final_transfer_acknowledgement_receipt_projection",
        "operator_final_transfer_acknowledgement_receipt_id",
        "operator_final_transfer_acknowledgement_receipt_status",
        "sanitized_operator_final_transfer_acknowledgement_receipt_ref",
        "operator_final_transfer_acknowledgement_ref",
        "final_post_transfer_archive_pointer_projection",
        "final_post_transfer_archive_pointer_id",
        "final_post_transfer_archive_pointer_status",
        "sanitized_post_transfer_archive_pointer_ref",
        "archive_transfer_ack_ref",
        "operator_post_transfer_archive_acknowledgement_receipt_projection",
        "operator_post_transfer_archive_acknowledgement_receipt_id",
        "operator_post_transfer_archive_acknowledgement_receipt_status",
        "sanitized_operator_post_transfer_archive_acknowledgement_receipt_ref",
        "operator_post_transfer_archive_acknowledgement_ref",
        "final_retained_transfer_index_projection",
        "final_retained_transfer_index_id",
        "final_retained_transfer_index_status",
        "sanitized_retained_transfer_index_ref",
        "retention_transfer_acknowledgement_ref",
        "operator_retained_transfer_index_acknowledgement_receipt_projection",
        "operator_retained_transfer_index_acknowledgement_receipt_id",
        "operator_retained_transfer_index_acknowledgement_receipt_status",
        "sanitized_operator_retained_transfer_index_acknowledgement_receipt_ref",
        "operator_retained_transfer_acknowledgement_ref",
        "final_retained_completion_index_projection",
        "final_retained_completion_index_id",
        "final_retained_completion_index_status",
        "sanitized_final_retained_completion_index_ref",
        "retained_completion_acknowledgement_ref",
        "operator_retained_completion_acknowledgement_receipt_projection",
        "operator_retained_completion_acknowledgement_receipt_id",
        "operator_retained_completion_acknowledgement_receipt_status",
        "sanitized_operator_retained_completion_acknowledgement_receipt_ref",
        "operator_retained_completion_acknowledgement_ref",
        "final_retained_completion_acknowledgement_ledger_projection",
        "final_retained_completion_acknowledgement_ledger_id",
        "final_retained_completion_acknowledgement_ledger_status",
        "sanitized_final_retained_completion_acknowledgement_ledger_ref",
        "final_retained_completion_acknowledgement_ref",
        "operator_retained_ledger_acknowledgement_receipt_projection",
        "operator_retained_ledger_acknowledgement_receipt_id",
        "operator_retained_ledger_acknowledgement_receipt_status",
        "sanitized_operator_retained_ledger_acknowledgement_receipt_ref",
        "operator_retained_ledger_acknowledgement_ref",
        "final_retained_ledger_acknowledgement_seal_projection",
        "final_retained_ledger_acknowledgement_seal_id",
        "final_retained_ledger_acknowledgement_seal_status",
        "sanitized_final_retained_ledger_acknowledgement_seal_ref",
        "final_retained_ledger_acknowledgement_ref",
        "operator_retained_seal_acknowledgement_receipt_projection",
        "operator_retained_seal_acknowledgement_receipt_id",
        "operator_retained_seal_acknowledgement_receipt_status",
        "sanitized_operator_retained_seal_acknowledgement_receipt_ref",
        "operator_retained_seal_acknowledgement_ref",
        "final_retained_seal_closeout_ledger_projection",
        "final_retained_seal_closeout_ledger_id",
        "final_retained_seal_closeout_ledger_status",
        "sanitized_final_retained_seal_closeout_ledger_ref",
        "final_retained_seal_closeout_ack_ref",
        "operator_retained_closeout_acknowledgement_receipt_projection",
        "operator_retained_closeout_acknowledgement_receipt_id",
        "operator_retained_closeout_acknowledgement_receipt_status",
        "sanitized_operator_retained_closeout_acknowledgement_receipt_ref",
        "operator_retained_closeout_acknowledgement_ref",
        "final_retained_closeout_acknowledgement_ledger_projection",
        "final_retained_closeout_acknowledgement_ledger_id",
        "final_retained_closeout_acknowledgement_ledger_status",
        "sanitized_final_retained_closeout_acknowledgement_ledger_ref",
        "final_retained_closeout_acknowledgement_ref",
        "operator_final_retained_closeout_acknowledgement_receipt_projection",
        "operator_final_retained_closeout_acknowledgement_receipt_id",
        "operator_final_retained_closeout_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_closeout_acknowledgement_receipt_ref",
        "operator_final_retained_closeout_acknowledgement_ref",
        "final_retained_closeout_completion_ledger_projection",
        "final_retained_closeout_completion_ledger_id",
        "final_retained_closeout_completion_ledger_status",
        "sanitized_final_retained_closeout_completion_ledger_ref",
        "final_retained_closeout_completion_ref",
        "operator_final_retained_closeout_completion_acknowledgement_receipt_projection",
        "operator_final_retained_closeout_completion_acknowledgement_receipt_id",
        "operator_final_retained_closeout_completion_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_closeout_completion_acknowledgement_receipt_ref",
        "operator_final_retained_closeout_completion_acknowledgement_ref",
        "final_retained_completion_closeout_ledger_projection",
        "final_retained_completion_closeout_ledger_id",
        "final_retained_completion_closeout_ledger_status",
        "sanitized_final_retained_completion_closeout_ledger_ref",
        "final_retained_completion_closeout_ref",
        "operator_final_retained_completion_closeout_acknowledgement_receipt_projection",
        "operator_final_retained_completion_closeout_acknowledgement_receipt_id",
        "operator_final_retained_completion_closeout_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_completion_closeout_acknowledgement_receipt_ref",
        "operator_final_retained_completion_closeout_acknowledgement_ref",
        "final_retained_closeout_sealed_ledger_projection",
        "final_retained_closeout_sealed_ledger_id",
        "final_retained_closeout_sealed_ledger_status",
        "sanitized_final_retained_closeout_sealed_ledger_ref",
        "final_retained_closeout_sealed_ref",
        "operator_final_retained_closeout_sealed_acknowledgement_receipt_projection",
        "operator_final_retained_closeout_sealed_acknowledgement_receipt_id",
        "operator_final_retained_closeout_sealed_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_closeout_sealed_acknowledgement_receipt_ref",
        "operator_final_retained_closeout_sealed_acknowledgement_ref",
        "final_retained_sealed_closeout_ledger_projection",
        "final_retained_sealed_closeout_ledger_id",
        "final_retained_sealed_closeout_ledger_status",
        "sanitized_final_retained_sealed_closeout_ledger_ref",
        "final_retained_sealed_closeout_ref",
        "final_retained_sealed_closeout_acknowledgement_ledger_projection",
        "final_retained_sealed_closeout_acknowledgement_ledger_id",
        "final_retained_sealed_closeout_acknowledgement_ledger_status",
        "sanitized_final_retained_sealed_closeout_acknowledgement_ledger_ref",
        "final_retained_sealed_closeout_acknowledgement_ref",
        "operator_final_retained_sealed_closeout_acknowledgement_receipt_projection",
        "operator_final_retained_sealed_closeout_acknowledgement_receipt_id",
        "operator_final_retained_sealed_closeout_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_sealed_closeout_acknowledgement_receipt_ref",
        "operator_final_retained_sealed_closeout_acknowledgement_ref",
        "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_projection",
        "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_id",
        "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ref",
        "operator_final_retained_sealed_closeout_completion_acknowledgement_ref",
        "final_retained_sealed_closeout_completion_ledger_projection",
        "final_retained_sealed_closeout_completion_ledger_id",
        "final_retained_sealed_closeout_completion_ledger_status",
        "sanitized_final_retained_sealed_closeout_completion_ledger_ref",
        "final_retained_sealed_closeout_completion_ref",
        "operator_final_retained_sealed_completion_receipt_projection",
        "operator_final_retained_sealed_completion_receipt_id",
        "operator_final_retained_sealed_completion_receipt_status",
        "sanitized_operator_final_retained_sealed_completion_receipt_ref",
        "operator_final_retained_sealed_completion_ref",
        "final_retained_sealed_completion_ledger_projection",
        "final_retained_sealed_completion_ledger_id",
        "final_retained_sealed_completion_ledger_status",
        "sanitized_final_retained_sealed_completion_ledger_ref",
        "final_retained_sealed_completion_ref",
        "operator_final_retained_completion_receipt_projection",
        "operator_final_retained_completion_receipt_id",
        "operator_final_retained_completion_receipt_status",
        "sanitized_operator_final_retained_completion_receipt_ref",
        "operator_final_retained_completion_ref",
        "final_retained_completion_ledger_projection",
        "final_retained_completion_ledger_id",
        "final_retained_completion_ledger_status",
        "sanitized_final_retained_completion_ledger_ref",
        "final_retained_completion_ref",
        "operator_final_completion_receipt_projection",
        "operator_final_completion_receipt_id",
        "operator_final_completion_receipt_status",
        "sanitized_operator_final_completion_receipt_ref",
        "operator_final_completion_ref",
        "final_completion_ledger_projection",
        "final_completion_ledger_id",
        "final_completion_ledger_status",
        "sanitized_final_completion_ledger_ref",
        "final_completion_ref",
        "operator_final_acknowledgement_receipt_projection",
        "operator_final_acknowledgement_receipt_id",
        "operator_final_acknowledgement_receipt_status",
        "sanitized_operator_final_acknowledgement_receipt_ref",
        "operator_final_acknowledgement_ref",
        "operator_final_retained_acknowledgement_completion_receipt_projection",
        "operator_final_retained_acknowledgement_completion_receipt_id",
        "operator_final_retained_acknowledgement_completion_receipt_status",
        "sanitized_operator_final_retained_acknowledgement_completion_receipt_ref",
        "operator_final_retained_acknowledgement_completion_ref",
        "final_retained_acknowledgement_completion_ledger_projection",
        "final_retained_acknowledgement_completion_ledger_id",
        "final_retained_acknowledgement_completion_ledger_status",
        "sanitized_final_retained_acknowledgement_completion_ledger_ref",
        "final_retained_acknowledgement_completion_ref",
        "operator_final_retained_acknowledgement_completion_closeout_receipt_projection",
        "operator_final_retained_acknowledgement_completion_closeout_receipt_id",
        "operator_final_retained_acknowledgement_completion_closeout_receipt_status",
        "sanitized_operator_final_retained_acknowledgement_completion_closeout_receipt_ref",
        "operator_final_retained_acknowledgement_completion_closeout_ref",
        "final_retained_acknowledgement_completion_closeout_ledger_projection",
        "final_retained_acknowledgement_completion_closeout_ledger_id",
        "final_retained_acknowledgement_completion_closeout_ledger_status",
        "sanitized_final_retained_acknowledgement_completion_closeout_ledger_ref",
        "final_retained_acknowledgement_completion_closeout_ref",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_projection",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_id",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ref",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ref",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_projection",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_id",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_status",
        "sanitized_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ref",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_ref",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_projection",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_id",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_status",
        "sanitized_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ref",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ref",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_projection",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_id",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_status",
        "sanitized_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ref",
        "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ref",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_projection",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_id",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_status",
        "sanitized_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ref",
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ref",
        "final_acknowledgement_ledger_projection",
        "final_acknowledgement_ledger_id",
        "final_acknowledgement_ledger_status",
        "sanitized_final_acknowledgement_ledger_ref",
        "final_acknowledgement_ref",
        "operator_final_retained_acknowledgement_receipt_projection",
        "operator_final_retained_acknowledgement_receipt_id",
        "operator_final_retained_acknowledgement_receipt_status",
        "sanitized_operator_final_retained_acknowledgement_receipt_ref",
        "operator_final_retained_acknowledgement_ref",
        "final_retained_acknowledgement_ledger_projection",
        "final_retained_acknowledgement_ledger_id",
        "final_retained_acknowledgement_ledger_status",
        "sanitized_final_retained_acknowledgement_ledger_ref",
        "final_retained_acknowledgement_ref",
        "runtime_execution_flag",
        "live_execution_receipt_id",
        "rust_dispatch_execution_id",
        "skill_mapping_activation_id",
        "production_binding_mutation_id",
        "default_live_smoke_run_id",
        "user_goal_success_claim",
        "release_readiness_override",
        "publication_readiness_override",
        "url",
        "token",
        "local_absolute_path",
        "internal_instance_id",
    ]);
    const publicAllowedFields = Object.freeze([
        "activeTabInfoAuditArtifact.id",
        "activeTabInfoAuditArtifact.checksum",
        "activeTabInfoAuditArtifact.packagePath",
        "evidenceCountSummary",
        "readiness.status",
        "readiness.blockerCodes",
    ]);
    const manifestSummaryAllowedFields = Object.freeze([
        ...publicAllowedFields,
        "yeonjangBrowserActiveTabInfoLiveEnableReview.status",
        "yeonjangBrowserActiveTabInfoRuntimeTransition.state",
        "yeonjangBrowserActiveTabInfoRuntimeTransition.transitionOk",
        "yeonjangBrowserActiveTabInfoRuntimeTransition.openSurfaceCount",
        "yeonjangBrowserActiveTabInfoLiveEnablePrerequisites.status",
        "yeonjangBrowserActiveTabInfoLiveEnablePrerequisites.missingPrerequisites",
        "yeonjangBrowserActiveTabInfoLiveEnablePrerequisites.blockingReasonCodes",
        "yeonjangBrowserActiveTabInfoLiveEnablePrerequisites.explicitEnableTaskRequired",
    ]);
    const auditDescriptorAllowedFields = Object.freeze([
        "activeTabInfoAuditArtifact.id",
        "activeTabInfoAuditArtifact.checksum",
        "activeTabInfoAuditArtifact.packagePath",
        "activeTabInfoAuditArtifact.audience",
        "activeTabInfoAuditArtifact.redaction",
        "activeTabInfoAuditArtifact.rawDataAllowed",
    ]);
    const auditPayloadAllowedFields = Object.freeze([
        "schemaVersion",
        "method",
        "visibility",
        "rawDataAllowed",
        "evidenceCompleteness",
        "evidenceCompleteness.auditDetailPaths",
    ]);
    const entry = (surface, audience, visibility, allowedFields, auditDetailPathsIncluded) => Object.freeze({
        surface,
        audience,
        visibility,
        rawDataAllowed: false,
        auditDetailPathsIncluded,
        allowedFields: Object.freeze([...allowedFields]),
        forbiddenDataClasses,
        activeTabInfoAuditArtifact: artifactSummary,
        evidenceCountSummary: counts,
    });
    return Object.freeze({
        schemaVersion: "knowbee.active-tab-info-audit-access-projection.v1",
        method: "browser.active_tab_info",
        entries: Object.freeze([
            entry("release_summary", "release_operator", "release_summary", manifestSummaryAllowedFields, false),
            entry("release_package_dry_run_json", "release_operator", "release_operator_summary", manifestSummaryAllowedFields, false),
            entry("release_approval_cli_output", "release_operator", "release_operator_summary", publicAllowedFields, false),
            entry("release_prepared_candidate_cli_output", "release_operator", "release_operator_summary", publicAllowedFields, false),
            entry("release_manifest_public_fields", "release_operator", "release_summary", manifestSummaryAllowedFields, false),
            entry("final_response", "release_operator", "release_operator_summary", publicAllowedFields, false),
            entry("product_log", "release_operator", "release_operator_summary", ["activeTabInfoAuditArtifact.id"], false),
            entry("audit_artifact_descriptor", "audit_operator", "audit_only", auditDescriptorAllowedFields, false),
            entry("audit_artifact_payload", "audit_operator", "audit_only", auditPayloadAllowedFields, true),
        ]),
    });
}
export function verifyReleaseActiveTabInfoAuditArtifactPayload(input) {
    if (sha256Buffer(Buffer.from(input.payloadContent, "utf8")) !== input.artifact.checksum) {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_checksum_mismatch");
    }
    let payload;
    try {
        payload = JSON.parse(input.payloadContent);
    }
    catch {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_json_invalid");
    }
    if (!releaseObjectRecord(payload)) {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_schema_invalid");
    }
    if (payload.schemaVersion !== "yeonjang-browser-active-tab-info-audit-artifact-v1" ||
        payload.method !== "browser.active_tab_info" ||
        payload.visibility !== "audit_only") {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_schema_invalid");
    }
    if (payload.rawDataAllowed !== false) {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_raw_data_allowed");
    }
    const serialized = JSON.stringify(payload);
    if (/stdout|stderr|stack trace|raw output|https?:\/\/|token=|\/Users\/|\/private\//iu.test(serialized)) {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_raw_data_detected");
    }
    const completeness = payload.evidenceCompleteness;
    if (!releaseObjectRecord(completeness)) {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_completeness_invalid");
    }
    const countKeys = [
        "missingSourceCount",
        "missingTestCount",
        "staleTestCount",
        "rejectedSkippedTestCount",
        "rejectedUnknownTestCount",
        "rejectedPublicRawReportCount",
        "failingTestCount",
    ];
    for (const key of countKeys) {
        const value = completeness[key];
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
            return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_completeness_invalid");
        }
    }
    if (completeness.schemaVersion !== "yeonjang-browser-active-tab-info-evidence-completeness-v1" ||
        completeness.visibility !== "release_summary" ||
        completeness.auditDetailVisibility !== "audit_only" ||
        !releaseObjectRecord(completeness.auditDetailPaths)) {
        return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_completeness_invalid");
    }
    const auditDetailPaths = completeness.auditDetailPaths;
    const detailPathKeys = [
        "missingSourcePaths",
        "missingTestPaths",
        "staleTestPaths",
        "rejectedSkippedTestPaths",
        "rejectedUnknownTestPaths",
        "rejectedPublicRawReportPaths",
        "failingTestPaths",
    ];
    for (const key of detailPathKeys) {
        const paths = auditDetailPaths[key];
        if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
            return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_completeness_invalid");
        }
        if (sanitizeReleaseRelativePaths(paths).length !== paths.length) {
            return rejectedActiveTabInfoAuditArtifact("active_tab_info_audit_artifact_detail_path_unsafe");
        }
    }
    return Object.freeze({
        status: "verified",
        visibility: "audit_operator_summary",
        summary: Object.freeze({
            artifactId: input.artifact.id,
            checksum: input.artifact.checksum,
            packagePath: input.artifact.packagePath,
            evidenceCountSummary: Object.freeze({
                missingSourceCount: completeness.missingSourceCount,
                missingTestCount: completeness.missingTestCount,
                staleTestCount: completeness.staleTestCount,
                rejectedSkippedTestCount: completeness.rejectedSkippedTestCount,
                rejectedUnknownTestCount: completeness.rejectedUnknownTestCount,
                rejectedPublicRawReportCount: completeness.rejectedPublicRawReportCount,
                failingTestCount: completeness.failingTestCount,
            }),
        }),
    });
}
function releaseObjectRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function rejectedActiveTabInfoAuditArtifact(reasonCode) {
    return Object.freeze({
        status: "rejected",
        visibility: "audit_operator_summary",
        reasonCode,
    });
}
function hasActiveTabInfoEvidenceCompletenessBlocker(completeness) {
    return (completeness.missingSourceCount > 0 ||
        completeness.missingTestCount > 0 ||
        completeness.staleTestCount > 0 ||
        completeness.rejectedSkippedTestCount > 0 ||
        completeness.rejectedUnknownTestCount > 0 ||
        completeness.rejectedPublicRawReportCount > 0 ||
        completeness.failingTestCount > 0);
}
function resolveLivePerformanceAcceptanceEvidence(selection) {
    if (!selection)
        return undefined;
    const candidate = selection;
    const selector = candidate.selector;
    if (!selector ||
        typeof selector.matrixId !== "string" ||
        typeof selector.matrixVersion !== "number" ||
        typeof selector.baselineVersion !== "string" ||
        !candidate.repository ||
        typeof candidate.repository.findLatest !== "function" ||
        !candidate.source ||
        typeof candidate.source.read !== "function" ||
        !Array.isArray(candidate.runs)) {
        return {
            status: "baseline_only",
            matrixId: typeof selector?.matrixId === "string" ? selector.matrixId : null,
            matrixVersion: typeof selector?.matrixVersion === "number" ? selector.matrixVersion : null,
            baselineVersion: typeof selector?.baselineVersion === "string" ? selector.baselineVersion : null,
            authorizationId: null,
            reasonCodes: ["performance_acceptance_context_invalid"],
        };
    }
    try {
        return collectLivePerformanceAcceptanceEvidence({
            selector: {
                matrixId: selector.matrixId,
                matrixVersion: selector.matrixVersion,
                baselineVersion: selector.baselineVersion,
            },
            repository: candidate.repository,
            source: candidate.source,
            runs: candidate.runs,
        });
    }
    catch {
        return {
            status: "baseline_only",
            matrixId: selector.matrixId,
            matrixVersion: selector.matrixVersion,
            baselineVersion: selector.baselineVersion,
            authorizationId: null,
            reasonCodes: ["performance_acceptance_collection_failed"],
        };
    }
}
export function buildReleaseArtifactDefinitions(input) {
    const rootDir = resolve(input.rootDir);
    const targetPlatforms = new Set(input.targetPlatforms ?? DEFAULT_TARGET_PLATFORMS);
    const promptSources = input.promptSources ?? safePromptSources(rootDir);
    const definitions = [
        requiredArtifact("gateway:cli", "gateway_node_bundle", rootDir, "packages/cli/dist/index.js", "gateway/packages/cli/dist/index.js", "CLI daemon entrypoint bundle."),
        requiredArtifact("gateway:core", "gateway_node_bundle", rootDir, "packages/core/dist/index.js", "gateway/packages/core/dist/index.js", "Core runtime bundle."),
        requiredArtifact("webui:static", "webui_static", rootDir, "packages/webui/dist", "webui/dist", "Static WebUI build directory."),
        requiredArtifact("db:migrations", "db_migration", rootDir, "packages/core/src/db/migrations.ts", "db/migrations.ts", "DB migration source included for release audit."),
        requiredArtifact("yeonjang:protocol", "yeonjang_protocol", rootDir, "Yeonjang/src/protocol.rs", "yeonjang/protocol.rs", "Yeonjang protocol contract source."),
        requiredArtifact("yeonjang:permissions", "yeonjang_protocol", rootDir, "Yeonjang/manifests/permissions.json", "yeonjang/permissions.json", "Yeonjang permission manifest."),
        requiredArtifact("runbook:release", "release_runbook", rootDir, "docs/release-runbook.md", "docs/release-runbook.md", "Install, update, rollback, and recovery runbook."),
        optionalArtifact("admin:diagnostic-bundle", "admin_diagnostic_bundle", rootDir, "release/admin-diagnostics.json", "diagnostics/admin-diagnostics.json", "Sanitized admin diagnostics bundle captured during release dry-run."),
    ];
    for (const source of promptSources) {
        definitions.push({
            id: `prompt:${source.sourceId}:${source.locale}`,
            kind: "prompt_seed",
            sourcePath: resolve(source.path),
            packagePath: `prompts/${basename(source.path)}`,
            required: source.required,
            description: `Prompt seed ${source.sourceId}:${source.locale}@${source.version}`,
            handling: releaseArtifactHandling("prompt_seed"),
        });
    }
    if (targetPlatforms.has("macos")) {
        definitions.push(optionalArtifact("yeonjang:macos:app", "yeonjang_macos_app", rootDir, "Yeonjang/target/release/Yeonjang.app", "yeonjang/macos/Yeonjang.app", "macOS tray app bundle.", "macos"));
        definitions.push(requiredArtifact("yeonjang:macos:build-script", "yeonjang_script", rootDir, "scripts/build-yeonjang-macos.sh", "scripts/build-yeonjang-macos.sh", "macOS Yeonjang build script.", "macos"));
        definitions.push(requiredArtifact("yeonjang:macos:start-script", "yeonjang_script", rootDir, "scripts/start-yeonjang-macos.sh", "scripts/start-yeonjang-macos.sh", "macOS Yeonjang start script.", "macos"));
    }
    if (targetPlatforms.has("windows")) {
        definitions.push(optionalArtifact("yeonjang:windows:exe", "yeonjang_windows_exe", rootDir, "Yeonjang/target/release/knowbee-yeonjang.exe", "yeonjang/windows/knowbee-yeonjang.exe", "Windows tray executable.", "windows"));
        definitions.push(requiredArtifact("yeonjang:windows:build-script", "yeonjang_script", rootDir, "scripts/build-yeonjang-windows.bat", "scripts/build-yeonjang-windows.bat", "Windows Yeonjang build script.", "windows"));
        definitions.push(requiredArtifact("yeonjang:windows:start-script", "yeonjang_script", rootDir, "scripts/start-yeonjang-windows.bat", "scripts/start-yeonjang-windows.bat", "Windows Yeonjang start script.", "windows"));
        definitions.push(requiredArtifact("yeonjang:windows:stop-script", "yeonjang_script", rootDir, "scripts/stop-yeonjang-windows.bat", "scripts/stop-yeonjang-windows.bat", "Windows Yeonjang stop script.", "windows"));
    }
    if (targetPlatforms.has("linux")) {
        definitions.push(optionalArtifact("yeonjang:linux:binary", "yeonjang_linux_binary", rootDir, "Yeonjang/target/release/knowbee-yeonjang", "yeonjang/linux/knowbee-yeonjang", "Linux Yeonjang executable.", "linux"));
        definitions.push(requiredArtifact("yeonjang:linux:build-script", "yeonjang_script", rootDir, "scripts/build-yeonjang-linux.sh", "scripts/build-yeonjang-linux.sh", "Linux Yeonjang build script.", "linux"));
        definitions.push(requiredArtifact("yeonjang:linux:start-script", "yeonjang_script", rootDir, "scripts/start-yeonjang-linux.sh", "scripts/start-yeonjang-linux.sh", "Linux Yeonjang desktop start script.", "linux"));
        definitions.push(requiredArtifact("yeonjang:linux:headless-start-script", "yeonjang_script", rootDir, "scripts/start-yeonjang-linux-headless.sh", "scripts/start-yeonjang-linux-headless.sh", "Linux Yeonjang headless managed start script.", "linux"));
        definitions.push(requiredArtifact("yeonjang:linux:stop-script", "yeonjang_script", rootDir, "scripts/stop-yeonjang-linux.sh", "scripts/stop-yeonjang-linux.sh", "Linux Yeonjang desktop stop script.", "linux"));
        definitions.push(requiredArtifact("yeonjang:linux:headless-stop-script", "yeonjang_script", rootDir, "scripts/stop-yeonjang-linux-headless.sh", "scripts/stop-yeonjang-linux-headless.sh", "Linux Yeonjang headless managed stop script.", "linux"));
    }
    return definitions;
}
export function buildReleasePipelinePlan(input = {}) {
    const targetPlatforms = new Set(input.targetPlatforms ?? DEFAULT_TARGET_PLATFORMS);
    const audience = input.audience ?? "public";
    const steps = [
        step("environment-preflight", "Environment preflight", ["node", "scripts/release-package.mjs", "--dry-run", "--json"], true, false, "Validate version, artifact definitions, migration state, backup inventory, readiness blockers, and sanitized releaseApprovalEvidence without mutating runtime state."),
        step("release-approval-candidate-preparation", "Release approval candidate preparation", [
            "pnpm",
            "run",
            "release:prepare-approval-candidate",
            "--",
            "--candidate",
            "<performance-or-rollout-candidate.json>",
            "--release-dry-run",
            "<release-dry-run.json>",
            "--output",
            "<prepared-approval-candidate.json>",
        ], true, false, "Prepare performance or rollout approval candidates by attaching releaseApprovalEvidence from release-package --dry-run --json, then run release:authorize. Output must show only artifact id, checksum, packagePath, count summary, readiness blocker state, and no threshold/baseline raw detail, raw audit JSON, URL, or local absolute path."),
        step("clean-build", "Clean build", ["pnpm", "-r", "build"], true, false, "Build Gateway, CLI, Core, and WebUI from a clean checkout."),
        step("typecheck", "Typecheck", ["pnpm", "-r", "typecheck"], true, false, "Run TypeScript type checks before packaging."),
        step("unit-tests", "Unit and integration tests", ["pnpm", "test"], true, false, "Run automated regression tests."),
        step("orchestration-release-gate", "Orchestration release gate", [
            "pnpm",
            "exec",
            "vitest",
            "run",
            "tests/task001-sub-agent-contracts.test.ts",
            "tests/task003-orchestration-mode.test.ts",
            "tests/task004-orchestration-planner.test.ts",
            "tests/task006-sub-session-runtime.test.ts",
            "tests/task013-channel-delivery-observability.test.ts",
        ], true, false, "Verify feature flag off parity, no-agent fallback, orchestration contracts, planner, runtime, and channel delivery orchestration guards."),
        step("memory-isolation-release-gate", "Memory isolation release gate", ["pnpm", "test", "tests/task019-memory-isolation-writeback.test.ts"], true, false, "Verify owner-scope memory isolation, DataExchange-only shared context, writeback owner policy, and memory access audit regressions."),
        step("memory-compaction-release-gate", "Memory compaction release gate", ["pnpm", "exec", "vitest", "run", "tests/task006-memory-release-gate.test.ts"], true, false, "Verify memory inspector evidence, compaction model audit, heuristic fallback trace, append-only archive evidence, drift warnings, and release summary wiring."),
        step("capability-isolation-release-gate", "Capability isolation release gate", [
            "pnpm",
            "test",
            "tests/task020-capability-approval-isolation.test.ts",
            "tests/mcp-client.test.ts",
        ], true, false, "Verify agent-scoped tool and MCP capability binding isolation, secret scope separation, approval propagation, and capability delegation audit regressions."),
        step("model-execution-release-gate", "Model execution policy release gate", ["pnpm", "test", "tests/task021-model-execution-policy.test.ts"], true, false, "Verify agent model resolver, provider capability matrix, timeout retry and fallback behavior, model cost budgets, and token cost latency audit summaries."),
        step("performance-release-gate", "Performance and release summary gate", ["pnpm", "exec", "vitest", "run", "tests/task014-release-readiness.test.ts"], true, false, "Verify latency targets, release performance evidence, orchestration feature flag defaults, rollback notes, and release summary warnings."),
        step("sub-agent-benchmark-release-gate", "Sub-agent benchmark release gate", ["pnpm", "test", "tests/task029-benchmarks-release-gate.test.ts"], true, false, "Verify deterministic benchmark scenarios, parallel efficiency, cache/cost metrics, restart recovery, duplicate-final guard, and compiled workflow recommendation safety."),
        step("sub-agent-release-readiness-gate", "Sub-agent release readiness gate", ["pnpm", "test", "tests/task030-release-gate-rollback-soak.test.ts"], true, false, "Verify rollout mode sequence, release dry-run summary, rollback-by-feature-flag, restart-resume soak, WebUI projection, nested delegation, benchmark thresholds, and duplicate-final zero tolerance."),
        step("enterprise-topology-release-gate", "Enterprise Topology release gate", [
            "pnpm",
            "test",
            "tests/task025-enterprise-topology-release-gate.test.ts",
            "tests/task013-executor-first-release-gate.test.ts",
            "tests/task013-executor-first-usability.test.tsx",
            "tests/task012-topology-workspace-release-gate.test.ts",
        ], true, false, "Verify topology feature flag matrix, workspace route/layer/Executor-first usability, contracts/validator-only rollout, dry-run/shadow, gated mode, opt-in routing, single main-agent fallback, sub-agent and channel finalizer regressions, WebUI build gate, runtime smoke, and rollback smoke."),
        step("web-retrieval-fixture-regression", "Web retrieval fixture regression", ["pnpm", "test", "tests/task008-web-retrieval-fixtures.test.ts"], true, false, "Run offline KOSPI, KOSDAQ, NASDAQ, weather, timeout, and no-network retrieval regression fixtures."),
        step("ui-mode-release-gate", "UI mode release gate", ["pnpm", "test", "tests/task017-ui-release-gate.test.ts"], true, false, "Verify beginner, advanced, and admin smoke matrix, redaction, admin guard, route redirects, and UI regression blockers."),
        step("yeonjang-multi-instance-release-gate", "Yeonjang multi-instance release gate", [
            "pnpm",
            "exec",
            "vitest",
            "run",
            "tests/task010-yeonjang-multi-instance-e2e.test.ts",
            "tests/task010-yeonjang-release-gate.test.ts",
        ], true, false, "Verify multi-instance target routing, revoke/quarantine blocks, duplicate-session guard, broadcast partial retry, and release evidence summary."),
        step("yeonjang-browser-active-tab-info-release-gate", "Yeonjang browser active tab info release gate", [
            "pnpm",
            "exec",
            "vitest",
            "run",
            "tests/task279-active-tab-info-terminal-report-projection-misuse-guard.test.ts",
            "tests/task281-active-tab-info-terminal-delivery-receipt-misuse-guard.test.ts",
            "tests/task280-active-tab-info-terminal-delivery-receipt.test.ts",
            "tests/task283-active-tab-info-operator-closeout-note-misuse-guard.test.ts",
            "tests/task282-active-tab-info-operator-closeout-note.test.ts",
            "tests/task285-active-tab-info-final-closeout-ledger-misuse-guard.test.ts",
            "tests/task284-active-tab-info-final-closeout-ledger.test.ts",
            "tests/task458-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt-misuse-guard.test.ts",
            "tests/task457-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.test.ts",
            "tests/task460-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission-misuse-guard.test.ts",
            "tests/task459-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.test.ts",
            "tests/task464-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task463-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.test.ts",
            "tests/task462-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt-misuse-guard.test.ts",
            "tests/task461-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.test.ts",
            "tests/task456-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan-misuse-guard.test.ts",
            "tests/task455-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.test.ts",
            "tests/task454-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission-misuse-guard.test.ts",
            "tests/task453-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.test.ts",
            "tests/task452-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan-misuse-guard.test.ts",
            "tests/task451-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.test.ts",
            "tests/task450-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt-misuse-guard.test.ts",
            "tests/task449-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.test.ts",
            "tests/task448-active-tab-info-release-evidence-chain-cleanup-pr-checklist-misuse-guard.test.ts",
            "tests/task447-active-tab-info-release-evidence-chain-cleanup-pr-checklist.test.ts",
            "tests/task446-active-tab-info-release-evidence-chain-cleanup-readiness-index-misuse-guard.test.ts",
            "tests/task445-active-tab-info-release-evidence-chain-cleanup-readiness-index.test.ts",
            "tests/task444-active-tab-info-release-evidence-chain-cleanup-task-plan-summary-misuse-guard.test.ts",
            "tests/task443-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.test.ts",
            "tests/task442-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.test.ts",
            "tests/task441-active-tab-info-release-evidence-chain-cleanup-approval-gate.test.ts",
            "tests/task440-active-tab-info-release-evidence-chain-cleanup-proposal.test.ts",
            "tests/task439-active-tab-info-release-evidence-chain-architecture-review.test.ts",
            "tests/task438-active-tab-info-release-evidence-chain-termination.test.ts",
            "tests/task437-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt-misuse-guard.test.ts",
            "tests/task436-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt.test.ts",
            "tests/task435-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-misuse-guard.test.ts",
            "tests/task434-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.test.ts",
            "tests/task433-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt-misuse-guard.test.ts",
            "tests/task432-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt.test.ts",
            "tests/task431-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-misuse-guard.test.ts",
            "tests/task430-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.test.ts",
            "tests/task429-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task428-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.test.ts",
            "tests/task427-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger-misuse-guard.test.ts",
            "tests/task426-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.test.ts",
            "tests/task425-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt-misuse-guard.test.ts",
            "tests/task424-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.test.ts",
            "tests/task423-active-tab-info-final-retained-acknowledgement-completion-ledger-misuse-guard.test.ts",
            "tests/task422-active-tab-info-final-retained-acknowledgement-completion-ledger.test.ts",
            "tests/task421-active-tab-info-operator-final-retained-acknowledgement-completion-receipt-misuse-guard.test.ts",
            "tests/task420-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.test.ts",
            "tests/task419-active-tab-info-final-acknowledgement-ledger-misuse-guard.test.ts",
            "tests/task418-active-tab-info-final-acknowledgement-ledger.test.ts",
            "tests/task417-active-tab-info-operator-final-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task416-active-tab-info-operator-final-acknowledgement-receipt.test.ts",
            "tests/task415-active-tab-info-final-completion-ledger-misuse-guard.test.ts",
            "tests/task414-active-tab-info-final-completion-ledger.test.ts",
            "tests/task413-active-tab-info-operator-final-completion-receipt-misuse-guard.test.ts",
            "tests/task412-active-tab-info-operator-final-completion-receipt.test.ts",
            "tests/task411-active-tab-info-final-retained-completion-ledger-misuse-guard.test.ts",
            "tests/task410-active-tab-info-final-retained-completion-ledger.test.ts",
            "tests/task409-active-tab-info-operator-final-retained-completion-receipt-misuse-guard.test.ts",
            "tests/task408-active-tab-info-operator-final-retained-completion-receipt.test.ts",
            "tests/task407-active-tab-info-final-retained-sealed-completion-ledger-misuse-guard.test.ts",
            "tests/task406-active-tab-info-final-retained-sealed-completion-ledger.test.ts",
            "tests/task405-active-tab-info-operator-final-retained-sealed-completion-receipt-misuse-guard.test.ts",
            "tests/task404-active-tab-info-operator-final-retained-sealed-completion-receipt.test.ts",
            "tests/task403-active-tab-info-final-retained-sealed-closeout-completion-ledger-misuse-guard.test.ts",
            "tests/task402-active-tab-info-final-retained-sealed-closeout-completion-ledger.test.ts",
            "tests/task401-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task400-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.test.ts",
            "tests/task399-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger-misuse-guard.test.ts",
            "tests/task398-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.test.ts",
            "tests/task397-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task396-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.test.ts",
            "tests/task395-active-tab-info-final-retained-sealed-closeout-ledger-misuse-guard.test.ts",
            "tests/task394-active-tab-info-final-retained-sealed-closeout-ledger.test.ts",
            "tests/task393-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task392-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.test.ts",
            "tests/task391-active-tab-info-final-retained-closeout-sealed-ledger-misuse-guard.test.ts",
            "tests/task390-active-tab-info-final-retained-closeout-sealed-ledger.test.ts",
            "tests/task389-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task388-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.test.ts",
            "tests/task387-active-tab-info-final-retained-completion-closeout-ledger-misuse-guard.test.ts",
            "tests/task386-active-tab-info-final-retained-completion-closeout-ledger.test.ts",
            "tests/task385-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task384-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.test.ts",
            "tests/task383-active-tab-info-final-retained-closeout-completion-ledger-misuse-guard.test.ts",
            "tests/task382-active-tab-info-final-retained-closeout-completion-ledger.test.ts",
            "tests/task381-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task380-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.test.ts",
            "tests/task379-active-tab-info-final-retained-closeout-acknowledgement-ledger-misuse-guard.test.ts",
            "tests/task378-active-tab-info-final-retained-closeout-acknowledgement-ledger.test.ts",
            "tests/task377-active-tab-info-operator-retained-closeout-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task376-active-tab-info-operator-retained-closeout-acknowledgement-receipt.test.ts",
            "tests/task375-active-tab-info-final-retained-seal-closeout-ledger-misuse-guard.test.ts",
            "tests/task374-active-tab-info-final-retained-seal-closeout-ledger.test.ts",
            "tests/task373-active-tab-info-operator-retained-seal-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task372-active-tab-info-operator-retained-seal-acknowledgement-receipt.test.ts",
            "tests/task371-active-tab-info-final-retained-ledger-acknowledgement-seal-misuse-guard.test.ts",
            "tests/task370-active-tab-info-final-retained-ledger-acknowledgement-seal.test.ts",
            "tests/task369-active-tab-info-operator-retained-ledger-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task368-active-tab-info-operator-retained-ledger-acknowledgement-receipt.test.ts",
            "tests/task367-active-tab-info-final-retained-completion-acknowledgement-ledger-misuse-guard.test.ts",
            "tests/task366-active-tab-info-final-retained-completion-acknowledgement-ledger.test.ts",
            "tests/task365-active-tab-info-operator-retained-completion-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task364-active-tab-info-operator-retained-completion-acknowledgement-receipt.test.ts",
            "tests/task363-active-tab-info-final-retained-completion-index-misuse-guard.test.ts",
            "tests/task362-active-tab-info-final-retained-completion-index.test.ts",
            "tests/task361-active-tab-info-operator-final-retained-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task360-active-tab-info-operator-final-retained-acknowledgement-receipt.test.ts",
            "tests/task359-active-tab-info-final-retained-acknowledgement-ledger-misuse-guard.test.ts",
            "tests/task358-active-tab-info-final-retained-acknowledgement-ledger.test.ts",
            "tests/task357-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task356-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.test.ts",
            "tests/task355-active-tab-info-final-retained-transfer-index-misuse-guard.test.ts",
            "tests/task354-active-tab-info-final-retained-transfer-index.test.ts",
            "tests/task353-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task352-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.test.ts",
            "tests/task351-active-tab-info-final-post-transfer-archive-pointer-misuse-guard.test.ts",
            "tests/task350-active-tab-info-final-post-transfer-archive-pointer.test.ts",
            "tests/task349-active-tab-info-operator-final-transfer-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task348-active-tab-info-operator-final-transfer-acknowledgement-receipt.test.ts",
            "tests/task347-active-tab-info-final-transfer-closeout-ledger-misuse-guard.test.ts",
            "tests/task346-active-tab-info-final-transfer-closeout-ledger.test.ts",
            "tests/task345-active-tab-info-operator-final-handoff-receipt-misuse-guard.test.ts",
            "tests/task344-active-tab-info-operator-final-handoff-receipt.test.ts",
            "tests/task343-active-tab-info-final-handoff-closure-marker-misuse-guard.test.ts",
            "tests/task342-active-tab-info-final-handoff-closure-marker.test.ts",
            "tests/task341-active-tab-info-operator-final-retention-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task340-active-tab-info-operator-final-retention-acknowledgement-receipt.test.ts",
            "tests/task339-active-tab-info-final-retention-closure-ledger-misuse-guard.test.ts",
            "tests/task338-active-tab-info-final-retention-closure-ledger.test.ts",
            "tests/task337-active-tab-info-operator-final-index-retention-receipt-misuse-guard.test.ts",
            "tests/task336-active-tab-info-operator-final-index-retention-receipt.test.ts",
            "tests/task335-active-tab-info-final-operator-closeout-index-misuse-guard.test.ts",
            "tests/task334-active-tab-info-final-operator-closeout-index.test.ts",
            "tests/task333-active-tab-info-operator-final-closeout-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task332-active-tab-info-operator-final-closeout-acknowledgement-receipt.test.ts",
            "tests/task331-active-tab-info-final-sealed-archive-closeout-ledger-misuse-guard.test.ts",
            "tests/task330-active-tab-info-final-sealed-archive-closeout-ledger.test.ts",
            "tests/task329-active-tab-info-operator-final-sealed-archive-receipt-misuse-guard.test.ts",
            "tests/task328-active-tab-info-operator-final-sealed-archive-receipt.test.ts",
            "tests/task327-active-tab-info-final-sealed-archive-handoff-completion-index-misuse-guard.test.ts",
            "tests/task326-active-tab-info-final-sealed-archive-handoff-completion-index.test.ts",
            "tests/task325-active-tab-info-operator-sealed-archive-handoff-receipt-misuse-guard.test.ts",
            "tests/task324-active-tab-info-operator-sealed-archive-handoff-receipt.test.ts",
            "tests/task323-active-tab-info-final-sealed-archive-handoff-marker-misuse-guard.test.ts",
            "tests/task322-active-tab-info-final-sealed-archive-handoff-marker.test.ts",
            "tests/task321-active-tab-info-operator-sealed-completion-archive-receipt-misuse-guard.test.ts",
            "tests/task320-active-tab-info-operator-sealed-completion-archive-receipt.test.ts",
            "tests/task319-active-tab-info-final-completion-archive-seal-misuse-guard.test.ts",
            "tests/task318-active-tab-info-final-completion-archive-seal.test.ts",
            "tests/task317-active-tab-info-operator-completion-archive-acknowledgement-misuse-guard.test.ts",
            "tests/task316-active-tab-info-operator-completion-archive-acknowledgement.test.ts",
            "tests/task315-active-tab-info-final-operator-archive-completion-marker-misuse-guard.test.ts",
            "tests/task314-active-tab-info-final-operator-archive-completion-marker.test.ts",
            "tests/task313-active-tab-info-operator-archival-completion-acknowledgement-receipt-misuse-guard.test.ts",
            "tests/task312-active-tab-info-operator-archival-completion-acknowledgement-receipt.test.ts",
            "tests/task311-active-tab-info-final-archival-completion-index-misuse-guard.test.ts",
            "tests/task310-active-tab-info-final-archival-completion-index.test.ts",
            "tests/task309-active-tab-info-operator-archived-release-acknowledgement-misuse-guard.test.ts",
            "tests/task308-active-tab-info-operator-archived-release-acknowledgement.test.ts",
            "tests/task307-active-tab-info-final-archived-release-closure-marker-misuse-guard.test.ts",
            "tests/task306-active-tab-info-final-archived-release-closure-marker.test.ts",
            "tests/task305-active-tab-info-operator-archive-index-retention-receipt-misuse-guard.test.ts",
            "tests/task304-active-tab-info-operator-archive-index-retention-receipt.test.ts",
            "tests/task303-active-tab-info-final-release-archive-index-pointer-misuse-guard.test.ts",
            "tests/task302-active-tab-info-final-release-archive-index-pointer.test.ts",
            "tests/task301-active-tab-info-operator-release-archive-completion-notice-misuse-guard.test.ts",
            "tests/task300-active-tab-info-operator-release-archive-completion-notice.test.ts",
            "tests/task299-active-tab-info-final-audit-release-closure-ledger-misuse-guard.test.ts",
            "tests/task298-active-tab-info-final-audit-release-closure-ledger.test.ts",
            "tests/task297-active-tab-info-final-audit-release-handoff-receipt-misuse-guard.test.ts",
            "tests/task296-active-tab-info-final-audit-release-handoff-receipt.test.ts",
            "tests/task295-active-tab-info-archival-release-evidence-index-misuse-guard.test.ts",
            "tests/task294-active-tab-info-archival-release-evidence-index.test.ts",
            "tests/task293-active-tab-info-final-archival-pointer-misuse-guard.test.ts",
            "tests/task292-active-tab-info-final-archival-pointer.test.ts",
            "tests/task291-active-tab-info-operator-readable-closeout-summary-misuse-guard.test.ts",
            "tests/task290-active-tab-info-operator-readable-closeout-summary.test.ts",
            "tests/task289-active-tab-info-operator-completion-notice-misuse-guard.test.ts",
            "tests/task288-active-tab-info-operator-completion-notice.test.ts",
            "tests/task287-active-tab-info-final-audit-handoff-bundle-misuse-guard.test.ts",
            "tests/task286-active-tab-info-final-audit-handoff-bundle.test.ts",
            "tests/task278-active-tab-info-terminal-report-projection.test.ts",
            "tests/task277-active-tab-info-completion-audit-summary-misuse-guard.test.ts",
            "tests/task276-active-tab-info-completion-audit-summary.test.ts",
            "tests/task275-active-tab-info-user-goal-closeout-receipt-misuse-guard.test.ts",
            "tests/task274-active-tab-info-user-goal-closeout-receipt.test.ts",
            "tests/task273-active-tab-info-final-response-delivery-gate-misuse-guard.test.ts",
            "tests/task272-active-tab-info-final-response-delivery-gate.test.ts",
            "tests/task271-active-tab-info-llm-post-check-decision-receipt-misuse-guard.test.ts",
            "tests/task270-active-tab-info-llm-post-check-decision-receipt.test.ts",
            "tests/task269-active-tab-info-dispatch-verification-admission-misuse-guard.test.ts",
            "tests/task268-active-tab-info-dispatch-verification-admission.test.ts",
            "tests/task267-active-tab-info-dispatch-execution-receipt-misuse-guard.test.ts",
            "tests/task266-active-tab-info-dispatch-execution-receipt.test.ts",
            "tests/task265-active-tab-info-dispatch-dry-run-receipt-misuse-guard.test.ts",
            "tests/task264-active-tab-info-dispatch-dry-run-receipt.test.ts",
            "tests/task263-active-tab-info-dispatch-execution-plan-misuse-guard.test.ts",
            "tests/task262-active-tab-info-dispatch-execution-plan.test.ts",
            "tests/task261-active-tab-info-live-execution-receipt-misuse-guard.test.ts",
            "tests/task260-active-tab-info-live-execution-receipt-contract.test.ts",
            "tests/task259-active-tab-info-live-execution-authorization-misuse-guard.test.ts",
            "tests/task258-active-tab-info-live-execution-authorization-contract.test.ts",
            "tests/task257-active-tab-info-runtime-mutation-dry-run-receipt-misuse-guard.test.ts",
            "tests/task256-active-tab-info-runtime-mutation-dry-run-receipt.test.ts",
            "tests/task255-active-tab-info-runtime-mutation-executor-plan-misuse-guard.test.ts",
            "tests/task254-active-tab-info-runtime-mutation-executor-plan.test.ts",
            "tests/task253-active-tab-info-runtime-mutation-preflight-misuse-guard.test.ts",
            "tests/task252-active-tab-info-runtime-mutation-preflight.test.ts",
            "tests/task251-active-tab-info-runtime-change-skeleton-misuse-guard.test.ts",
            "tests/task250-active-tab-info-runtime-change-skeleton.test.ts",
            "tests/task249-active-tab-info-authorization-executor-bridge-misuse-guard.test.ts",
            "tests/task248-active-tab-info-authorization-executor-bridge.test.ts",
            "tests/task247-active-tab-info-high-risk-authorization-misuse-guard.test.ts",
            "tests/task246-active-tab-info-high-risk-authorization-contract.test.ts",
            "tests/task245-active-tab-info-activation-executor-misuse-guard.test.ts",
            "tests/task244-active-tab-info-activation-executor-boundary.test.ts",
            "tests/task243-active-tab-info-activation-task-state-misuse-guard.test.ts",
            "tests/task242-active-tab-info-activation-task-state-machine.test.ts",
            "tests/task241-active-tab-info-activation-request-misuse-guard.test.ts",
            "tests/task240-active-tab-info-activation-request-contract.test.ts",
            "tests/task239-active-tab-info-release-surface-matrix.test.ts",
            "tests/task238-release-active-tab-info-prerequisite-readiness-misuse-guard.test.ts",
            "tests/task237-release-active-tab-info-live-enable-prerequisites-manifest.test.ts",
            "tests/task236-active-tab-info-live-enable-prerequisite-projection-guard.test.ts",
            "tests/task235-active-tab-info-live-enable-prerequisites.test.ts",
            "tests/task233-release-active-tab-info-runtime-transition-misuse-guard.test.ts",
            "tests/task232-release-active-tab-info-runtime-transition-projection.test.ts",
            "tests/task231-yeonjang-browser-active-tab-info-live-enable-state-machine.test.ts",
            "tests/task189-release-approval-workflow.test.ts",
            "tests/task012-release-package.test.ts",
            "tests/task230-release-active-tab-info-review-projection-misuse-guard.test.ts",
            "tests/task229-release-active-tab-info-live-enable-review-projection.test.ts",
            "tests/task228-yeonjang-browser-active-tab-info-live-enable-review.test.ts",
            "tests/task227-yeonjang-browser-active-tab-info-production-exposure-audit.test.ts",
            "tests/task226-release-approval-evidence-validator.test.ts",
            "tests/task225-release-active-tab-info-audit-artifact-verifier.test.ts",
            "tests/task224-release-active-tab-info-audit-projection-boundary.test.ts",
            "tests/task223-active-tab-info-release-gate-test-runner-summary-adapter.test.ts",
            "tests/task222-active-tab-info-release-gate-test-status-evidence-format.test.ts",
            "tests/task221-release-manifest-active-tab-info-evidence-input.test.ts",
            "tests/task220-yeonjang-browser-active-tab-info-release-gate-repository-evidence-adapter.test.ts",
            "tests/task219-yeonjang-browser-active-tab-info-release-gate-evidence-collector.test.ts",
            "tests/task217-yeonjang-browser-active-tab-info-release-gate-summary.test.ts",
            "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts",
            "tests/task215-yeonjang-browser-active-tab-info-postcheck-llm-review-admission.test.ts",
            "tests/task214-yeonjang-browser-active-tab-info-runtime-result-assembler.test.ts",
        ], true, false, "Verify active tab info repository source/test evidence, evidence chain cleanup deletion dry-run review acknowledgement receipt misuse guard, evidence chain cleanup deletion dry-run review acknowledgement receipt, evidence chain cleanup deletion dry-run receipt surface matrix, evidence chain cleanup deletion dry-run receipt misuse guard, evidence chain cleanup deletion dry-run receipt, and disabled live paths before manual integration review. Passing prerequisites only permits a separate explicit activation task."),
        step("backup-rehearsal", "Backup and restore rehearsal", ["pnpm", "run", "backup:rehearsal"], true, false, "Verify DB, prompt, migration, and restore rehearsal paths."),
        step("admin-diagnostic-export", "Admin diagnostic export rehearsal", ["pnpm", "exec", "vitest", "run", "tests/task014-admin-platform-export.test.ts"], true, false, "Verify sanitized admin diagnostics export and bundle generation contract."),
        step("channel-delivery-release-gate", "Channel delivery release gate", [
            "pnpm",
            "exec",
            "vitest",
            "run",
            "tests/channel-delivery-fallback.test.ts",
            "tests/channel-smoke-runner.test.ts",
            "tests/channel-adapter-contract-runner.test.ts",
            "tests/channel-connections.test.ts",
            "tests/task013-channel-api.test.ts",
        ], true, false, "Verify long text splitting, artifact fallback, unsupported capability receipts, channel fixture smoke, and connection API regressions."),
        step("channel-smoke-dry-run", "Channel smoke dry-run", ["pnpm", "run", "smoke:channels"], true, true, "Verify WebUI, Telegram, Slack, Discord, Google Chat fixture smoke plus iMessage/KakaoTalk manual-gate skip evidence without live external send unless configured."),
        step("artifact-cleanup-cli-smoke", "Artifact cleanup CLI smoke", ["pnpm", "run", "smoke:artifact-cleanup-cli"], true, true, "Verify artifact cleanup preview and confirmation failure paths through the installed CLI. This non-destructive smoke must not run the destructive fixture success path."),
    ];
    if (targetPlatforms.has("macos"))
        steps.push(step("yeonjang-macos", "Yeonjang macOS package", ["bash", "scripts/build-yeonjang-macos.sh"], false, true, "Build macOS tray app bundle when running on macOS."));
    if (targetPlatforms.has("windows"))
        steps.push(step("yeonjang-windows", "Yeonjang Windows package", ["scripts\\build-yeonjang-windows.bat"], false, true, "Build Windows tray executable on Windows or a Windows build host."));
    if (targetPlatforms.has("linux"))
        steps.push(step("yeonjang-linux", "Yeonjang Linux package", ["bash", "scripts/build-yeonjang-linux.sh"], false, true, "Build Linux Yeonjang binary via the Linux build script on a Linux build host."));
    steps.push(step("package-manifest", "Package manifest and checksums", ["node", "scripts/release-package.mjs"], true, false, "Copy release payload entries and generate manifest.json plus SHA256SUMS."));
    steps.push(step("rollout-shadow-evidence", "Rollout shadow evidence review", ["pnpm", "exec", "knowbee", "doctor", "--json"], true, false, "Confirm feature flags, migration lock status, and shadow compare evidence before enforced rollout."));
    steps.push(step("plan-drift-evidence", "Plan and task evidence review", ["pnpm", "exec", "knowbee", "doctor", "--json"], true, false, "Confirm phase plans, task evidence, and release-note evidence summary before publishing."));
    steps.push(step("web-retrieval-live-smoke", "Web retrieval live smoke", ["pnpm", "run", "smoke:web:live"], false, true, "Opt-in DuckDuckGo search and public document fetch provider smoke; provider limits are recorded without exposing raw content."));
    steps.push(step("live-smoke-gate", "Live smoke gate", ["pnpm", "exec", "knowbee", "smoke", "channels", "--live"], audience === "public", true, "Run at least one real channel live smoke before publishing a public release."));
    return { dryRunSafe: true, order: steps.map((item) => item.id), steps };
}
export function buildReleaseRollbackRunbook() {
    const topologyRollback = buildEnterpriseTopologyRollbackRunbook();
    return {
        id: "release-rollback-runbook",
        title: "Release rollback runbook",
        stopBeforeRollback: [
            "Stop Gateway service, channel adapters, scheduler, and Yeonjang writers.",
            "Confirm no process is writing the operational SQLite DB or prompt registry.",
            ...topologyRollback.stopBeforeRollback,
        ],
        restoreTargets: [
            "Gateway/CLI/Core binary bundle",
            "WebUI static bundle",
            "state/data.db and SQLite sidecars",
            "state/memory.db3 vector DB",
            "prompts/*.md seed files",
            "config file with secret re-entry as needed",
            "Yeonjang executable plus protocol/permission manifests",
            ...topologyRollback.restoreTargets,
        ],
        steps: [
            "Verify the release manifest checksum and the selected backup snapshot checksum.",
            "Copy the current runtime state into a rollback-of-rollback snapshot.",
            "Restore the previous release binary payload and WebUI static files.",
            "Disable the orchestration feature flag or set it to rollback compatibility mode before restoring state when delegation-related regressions are suspected.",
            ...topologyRollback.flagActions,
            ...topologyRollback.steps,
            "Restore the DB and prompt files into a rehearsal directory first.",
            "Run SQLite integrity_check, migration status, and prompt source registry checks.",
            "Re-run migration rehearsal and admin diagnostic export against the rehearsal directory before swapping operational files.",
            "Replace operational DB, prompt registry, config, and Yeonjang package only after rehearsal passes.",
            "Restart Gateway and Yeonjang, then run channel smoke and Yeonjang screen/capability smoke.",
        ],
        verification: [
            "Gateway /api/status displayVersion matches the rollback release.",
            "Feature flags show orchestration disabled or rollback-compatible until the incident is closed.",
            "Prompt source checksum matches the restored prompt registry.",
            "Existing schedules and memory search load without migration warnings.",
            "Yeonjang node.ping protocolVersion is compatible with Gateway expectations.",
            "At least one live channel delivery smoke passes after restart.",
            ...topologyRollback.verification,
        ],
        retryForbiddenWhen: [
            "Backup or release manifest checksum fails.",
            "SQLite integrity_check fails in rehearsal.",
            "Prompt source registry cannot load from rehearsal directory.",
            "Yeonjang protocol version is newer than the rollback Gateway can parse.",
            "Feature flag rollback still leaves no-agent fallback broken in compatibility smoke.",
            ...topologyRollback.retryForbiddenWhen,
        ],
    };
}
export function buildCleanMachineInstallChecklist() {
    return [
        {
            id: "node",
            required: true,
            description: "Node.js 22+ is installed and `node --version` passes.",
        },
        { id: "pnpm", required: true, description: "pnpm is available for workspace install/build." },
        {
            id: "state-dir",
            required: true,
            description: "A writable KNOWBEE_STATE_DIR or default ~/.knowbee state directory exists.",
        },
        {
            id: "prompt-seed",
            required: true,
            description: "Prompt seed files are present and prompt source registry loads without sys_prop dependency.",
        },
        {
            id: "db-migration",
            required: true,
            description: "Initial DB migration applies cleanly from an empty database.",
        },
        {
            id: "feature-flags",
            required: true,
            description: "Runtime feature flags are reviewed and any rollback/shadow mismatch evidence is accepted before enforced rollout.",
        },
        {
            id: "release-approval-candidate-preparation",
            required: true,
            description: "Run release-package --dry-run --json, attach its sanitized releaseApprovalEvidence to performance and rollout approval candidates with release:prepare-approval-candidate, then approve with release:authorize. Operator output must contain only artifact id, checksum, packagePath, evidence count summary, readiness blocker state, and no threshold/baseline raw detail, raw audit JSON, URL, or local absolute path.",
        },
        {
            id: "orchestration-release-gate",
            required: true,
            description: "Sub-agent orchestration feature flag default, off-state parity, and no-agent fallback evidence are reviewed before publish.",
        },
        {
            id: "memory-isolation-release-gate",
            required: true,
            description: "Owner-scoped memory, DataExchange-only context sharing, writeback owner policy, and memory access audit regressions pass.",
        },
        {
            id: "memory-compaction-release-gate",
            required: true,
            description: "Memory inspector cards, compaction model audit, heuristic fallback trace, append-only archive evidence, drift warnings, and release summary wiring are reviewed before publish.",
        },
        {
            id: "capability-isolation-release-gate",
            required: true,
            description: "Agent-scoped tool, MCP, Skill, secret scope, approval propagation, and capability delegation audit regressions pass.",
        },
        {
            id: "model-execution-release-gate",
            required: true,
            description: "Agent model resolver, provider matrix, timeout retry and fallback policy, cost budget, and token cost latency audit regressions pass.",
        },
        {
            id: "performance-release-gate",
            required: true,
            description: "Latency targets, queue wait, first progress, finalization, delivery dedupe, and concurrency block evidence are reviewed in the release summary.",
        },
        {
            id: "sub-agent-release-readiness-gate",
            required: true,
            description: "Sub-agent rollout modes, dry-run summary, rollback smoke, restart-resume soak, nested delegation, WebUI projection, and duplicate-final zero tolerance pass before public enablement.",
        },
        {
            id: "enterprise-topology-release-gate",
            required: true,
            description: "Enterprise Topology feature flag matrix, single main-agent fallback, sub-agent and channel finalizer regressions, WebUI build gate, runtime smoke, active topology rollback, and compiled snapshot restore evidence pass before opt-in routing.",
        },
        {
            id: "plan-drift",
            required: true,
            description: "Phase plan and task evidence drift check has no unreviewed completed-without-evidence warnings.",
        },
        {
            id: "web-retrieval-fixtures",
            required: true,
            description: "Offline web retrieval fixture regression passes and release manifest includes retrieval policy evidence.",
        },
        {
            id: "ui-mode-release-gate",
            required: true,
            description: "Beginner, advanced, and admin UI mode smoke matrix, redaction, route guard, and redirect evidence pass.",
        },
        {
            id: "yeonjang-multi-instance-release-gate",
            required: true,
            description: "Yeonjang multi-instance exact target, ambiguity guard, revoked/quarantined block, duplicate-session guard, broadcast partial retry, and readiness evidence regressions pass.",
        },
        {
            id: "yeonjang-browser-active-tab-info-release-gate",
            required: true,
            description: "Yeonjang browser.active_tab_info repository evidence, normalized test status evidence, stale/missing/skipped rejection, audit-only redaction, safe evidenceRef, runtime assembler, LLM review admission, and disabled live path regressions pass before any live handler or Skill mapping is enabled. Manual review and runtime transition summaries are release notes only and do not prove live enablement or user goal success.",
        },
        {
            id: "admin-diagnostics",
            required: true,
            description: "A sanitized admin diagnostics bundle is exportable and attached or explicitly marked missing in the release artifact list.",
        },
        {
            id: "webui",
            required: true,
            description: "WebUI static files are served and /api/status returns displayVersion.",
        },
        {
            id: "yeonjang-macos",
            required: false,
            description: "macOS Yeonjang app enters tray and publishes MQTT capability status.",
        },
        {
            id: "yeonjang-windows",
            required: false,
            description: "Windows Yeonjang starts without console and screen capture smoke passes.",
        },
        {
            id: "channel-smoke",
            required: true,
            description: "WebUI dry-run, Telegram/Slack live or semi-automated smoke, Discord/Google Chat fixture smoke, iMessage/KakaoTalk manual local bridge gate, and long text/artifact/approval/continuation/duplicate delivery regressions are reviewed before public publish.",
        },
        {
            id: "artifact-cleanup-cli-smoke",
            required: true,
            description: "Artifact cleanup preview and confirmation-failure paths pass through the installed CLI using the non-destructive default smoke.",
        },
    ];
}
function buildReleaseNoteSummary(input) {
    const orchestrationFlag = input.featureFlags.find((flag) => flag.featureKey === "sub_agent_orchestration");
    return {
        featureFlagDefaults: input.featureFlags
            .map((flag) => `${flag.featureKey}: mode=${flag.mode}, compatibility=${flag.compatibilityMode ? "on" : "off"}`)
            .sort(),
        migrationCautions: [
            `schema current=${input.migrationPreflight.currentSchemaVersion}, latest=${input.migrationPreflight.latestSchemaVersion}, pending=${input.migrationPreflight.pendingVersions.join(",") || "none"}`,
            `migration risk=${input.migrationPreflight.risk}`,
            "Always take a verified DB and prompt backup snapshot immediately before a live rollout.",
            "Do not enable orchestration by default unless feature flag off parity and no-agent fallback smoke both pass.",
            "Do not enable topology root-run routing until active topology rollback and compiled snapshot restore evidence pass.",
        ],
        rollbackProcedure: [
            ...input.rollback.steps,
            "Verify feature flag state first, then prefer rollback compatibility mode or full disable before restoring payloads.",
            "For topology incidents, set topology_runtime_enabled=off before active topology or compiled snapshot restore.",
        ],
        knownLimitations: [
            `Performance release gate: ${input.performanceEvidence.gateStatus} (acceptance=${input.performanceEvidence.acceptance.status}, operational=${input.performanceEvidence.operationalStatus})`,
            input.performanceEvidence.missingRequiredMetrics.length > 0
                ? `Missing release-window metrics: ${input.performanceEvidence.missingRequiredMetrics.join(", ")}`
                : "Release-window latency metrics were collected for all required task014 targets.",
            `Orchestration release gate: ${input.orchestrationEvidence.gateStatus}`,
            `Sub-agent benchmark release gate: ${input.benchmarkEvidence.gateStatus}`,
            `Sub-agent release readiness gate: ${input.subAgentReleaseGate.gateStatus}`,
            `Enterprise Topology release gate: ${input.enterpriseTopologyReleaseGate.gateStatus}`,
            `Web retrieval release gate: ${input.webRetrievalEvidence.gateStatus}`,
            `UI mode release gate: ${input.uiModeEvidence.gateStatus}`,
            `Yeonjang multi-instance release gate: ${input.yeonjangMultiInstanceEvidence.gateStatus}`,
            `Yeonjang browser.active_tab_info release gate: ${input.yeonjangBrowserActiveTabInfoReleaseGate.gateStatus}`,
            `Yeonjang browser.active_tab_info manual review record: ${input.yeonjangBrowserActiveTabInfoLiveEnableReview.status} (surfaces=${input.yeonjangBrowserActiveTabInfoLiveEnableReview.approvedSurfaceCount}, evidenceChecksums=${input.yeonjangBrowserActiveTabInfoLiveEnableReview.evidenceChecksumCount}, rollbackSurfaces=${input.yeonjangBrowserActiveTabInfoLiveEnableReview.rollbackSurfaceCount}).`,
            `Yeonjang browser.active_tab_info runtime transition: ${input.yeonjangBrowserActiveTabInfoRuntimeTransition.state} reason=${input.yeonjangBrowserActiveTabInfoRuntimeTransition.reasonCode} openSurfaces=${input.yeonjangBrowserActiveTabInfoRuntimeTransition.openSurfaceCount}.`,
            `Yeonjang browser.active_tab_info evidence completeness: missingSources=${input.yeonjangBrowserActiveTabInfoEvidenceCompleteness.missingSourceCount}, missingTests=${input.yeonjangBrowserActiveTabInfoEvidenceCompleteness.missingTestCount}, staleTests=${input.yeonjangBrowserActiveTabInfoEvidenceCompleteness.staleTestCount}, rejectedSkipped=${input.yeonjangBrowserActiveTabInfoEvidenceCompleteness.rejectedSkippedTestCount}, rejectedUnknown=${input.yeonjangBrowserActiveTabInfoEvidenceCompleteness.rejectedUnknownTestCount}, rejectedPublicRawReports=${input.yeonjangBrowserActiveTabInfoEvidenceCompleteness.rejectedPublicRawReportCount}.`,
            `Yeonjang browser.active_tab_info live integration requires manual review; Rust live handler=${input.yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.rustLiveHandlerEnabled}, Skill mapping=${input.yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.skillMappingEnabled}, production binding=${input.yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.productionBindingEnabled}, default live smoke=${input.yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState.defaultLiveSmokeEnabled}.`,
            `Memory compaction release gate: ${input.memoryCompactionEvidence.gateStatus}`,
            orchestrationFlag
                ? `Sub-agent orchestration default is ${orchestrationFlag.mode}; public rollout should keep single main-agent fallback intact.`
                : "Sub-agent orchestration feature flag state is missing from the rollout snapshot.",
        ],
    };
}
export function buildReleaseUpdatePreflightReport(input = {}) {
    const rootDir = resolve(input.rootDir ?? getWorkspaceRootPath());
    const targetPlatforms = new Set(input.targetPlatforms ?? DEFAULT_TARGET_PLATFORMS);
    const checks = [];
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    checks.push({
        id: "node-22",
        ok: nodeMajor >= 22,
        required: true,
        message: nodeMajor >= 22
            ? `Node.js ${process.version} is supported.`
            : `Node.js 22+ is required; current ${process.version}.`,
    });
    checks.push(commandCheck("pnpm", ["--version"], true, "pnpm is available for workspace install/build."));
    checks.push(commandCheck("cargo", ["--version"], targetPlatforms.size > 0, "Rust/Cargo is available for Yeonjang builds."));
    checks.push({
        id: "os-supported",
        ok: process.platform === "darwin" || process.platform === "win32" || process.platform === "linux",
        required: true,
        message: `Current OS platform is ${process.platform}.`,
    });
    checks.push({
        id: "write-permission",
        ok: canWrite(rootDir),
        required: true,
        message: canWrite(rootDir)
            ? "Workspace write permission is available."
            : "Workspace write permission is blocked.",
    });
    checks.push({
        id: "prompt-seed",
        ok: (input.promptSourceCount ?? safePromptSources(rootDir).length) > 0,
        required: true,
        message: `Prompt seed count: ${input.promptSourceCount ?? safePromptSources(rootDir).length}.`,
    });
    checks.push({
        id: "yeonjang-protocol",
        ok: existsSync(join(rootDir, "Yeonjang", "src", "protocol.rs")) &&
            existsSync(join(rootDir, "Yeonjang", "manifests", "permissions.json")),
        required: true,
        message: "Yeonjang protocol and permission manifest must be packaged with the release.",
    });
    checks.push({
        id: "db-backup-required",
        ok: false,
        required: false,
        message: "A verified DB/prompt backup snapshot is required immediately before updating a live installation.",
    });
    return {
        ok: checks.every((check) => check.ok || !check.required),
        checks,
    };
}
export function writeReleasePackage(options) {
    const manifest = buildReleaseManifest(options);
    return writeReleaseManifest({
        manifest,
        outputDir: options.outputDir,
        ...(options.copyPayload === undefined ? {} : { copyPayload: options.copyPayload }),
    });
}
export function writePreparedReleasePackage(options) {
    const readiness = evaluateReleaseReadiness(options.manifest);
    if (readiness.status === "blocked") {
        const summary = buildReleaseReadinessFailureSummary({
            manifest: options.manifest,
            readiness,
        });
        throw new Error([
            `Release publication blocked: ${readiness.blockerCodes.join(",")}`,
            ...summary.lines,
        ].join("; "));
    }
    return writeReleaseManifest(options);
}
function writeReleaseManifest(options) {
    const { manifest } = options;
    const outputDir = resolve(options.outputDir);
    const payloadDir = join(outputDir, "payload");
    mkdirSync(outputDir, { recursive: true });
    if (options.copyPayload !== false)
        mkdirSync(payloadDir, { recursive: true });
    const copiedArtifacts = [];
    let activeTabInfoAuditVerification = buildPendingActiveTabInfoAuditVerification(manifest);
    if (options.copyPayload !== false) {
        for (const artifact of manifest.artifacts) {
            if (artifact.status !== "present")
                continue;
            const targetPath = join(payloadDir, ...artifact.packagePath.split("/"));
            copyPath(artifact.sourcePath, targetPath);
            copiedArtifacts.push({ id: artifact.id, sourcePath: artifact.sourcePath, targetPath });
        }
        const activeTabInfoAuditTargetPath = join(payloadDir, ...manifest.yeonjangBrowserActiveTabInfoAuditArtifact.packagePath.split("/"));
        mkdirSync(dirname(activeTabInfoAuditTargetPath), { recursive: true });
        const activeTabInfoAuditContent = buildYeonjangBrowserActiveTabInfoAuditArtifactContent(manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness);
        writeFileSync(activeTabInfoAuditTargetPath, activeTabInfoAuditContent, "utf-8");
        activeTabInfoAuditVerification = verifyReleaseActiveTabInfoAuditArtifactPayload({
            artifact: manifest.yeonjangBrowserActiveTabInfoAuditArtifact,
            payloadContent: activeTabInfoAuditContent,
        });
        if (activeTabInfoAuditVerification.status === "rejected") {
            throw new Error(`active_tab_info_audit_artifact_verification_failed:${activeTabInfoAuditVerification.reasonCode}`);
        }
        copiedArtifacts.push({
            id: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.id,
            sourcePath: "[generated:release-manifest]",
            targetPath: activeTabInfoAuditTargetPath,
        });
    }
    const manifestPath = join(outputDir, "manifest.json");
    const checksumPath = join(outputDir, "SHA256SUMS");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    writeFileSync(checksumPath, `${manifest.checksums.map((entry) => `${entry.checksum}  ${entry.packagePath}`).join("\n")}\n`, "utf-8");
    return {
        outputDir,
        manifestPath,
        checksumPath,
        copiedArtifacts,
        activeTabInfoAuditVerification,
        manifest,
    };
}
function buildPendingActiveTabInfoAuditVerification(manifest) {
    const projection = buildReleaseApprovalEvidenceProjection({ manifest });
    return Object.freeze({
        status: "pending",
        visibility: "release_operator_summary",
        reasonCode: "active_tab_info_audit_artifact_payload_not_written",
        summary: Object.freeze({
            artifactId: projection.activeTabInfoAuditArtifact.id,
            checksum: projection.activeTabInfoAuditArtifact.checksum,
            packagePath: projection.activeTabInfoAuditArtifact.packagePath,
            evidenceCountSummary: projection.activeTabInfoEvidenceCompleteness,
        }),
    });
}
function requiredArtifact(id, kind, rootDir, relativeSourcePath, packagePath, description, platform) {
    return {
        id,
        kind,
        sourcePath: resolve(rootDir, relativeSourcePath),
        packagePath,
        required: true,
        description,
        handling: releaseArtifactHandling(kind),
        ...(platform ? { platform } : {}),
    };
}
function optionalArtifact(id, kind, rootDir, relativeSourcePath, packagePath, description, platform) {
    return {
        id,
        kind,
        sourcePath: resolve(rootDir, relativeSourcePath),
        packagePath,
        required: false,
        description,
        handling: releaseArtifactHandling(kind),
        ...(platform ? { platform } : {}),
    };
}
function releaseArtifactHandling(kind) {
    if (kind === "admin_diagnostic_bundle") {
        return {
            purpose: "sanitized_release_diagnostics",
            audience: "release_package",
            redaction: "sanitized",
            retention: "release_lifecycle",
            rawDataAllowed: false,
        };
    }
    if (kind === "active_tab_info_audit_bundle") {
        return {
            purpose: "active_tab_info_release_evidence_audit",
            audience: "audit_only",
            redaction: "sanitized",
            retention: "release_lifecycle",
            rawDataAllowed: false,
        };
    }
    return {
        purpose: "release_installation_payload",
        audience: "release_package",
        redaction: "source_contract",
        retention: "release_lifecycle",
        rawDataAllowed: false,
    };
}
function materializeArtifact(definition) {
    if (!existsSync(definition.sourcePath)) {
        return {
            ...definition,
            status: definition.required ? "missing_required" : "missing_optional",
            sizeBytes: null,
            checksum: null,
        };
    }
    return {
        ...definition,
        status: "present",
        sizeBytes: pathSize(definition.sourcePath),
        checksum: checksumPath(definition.sourcePath),
    };
}
function step(id, title, command, required, smoke, description) {
    return { id, title, command, required, smoke, description };
}
function commandCheck(command, args, required, successMessage) {
    try {
        execFileSync(command, args, { stdio: ["ignore", "ignore", "ignore"] });
        return { id: `command:${command}`, ok: true, required, message: successMessage };
    }
    catch {
        return {
            id: `command:${command}`,
            ok: false,
            required,
            message: `${command} was not found or failed to run.`,
        };
    }
}
function canWrite(path) {
    try {
        accessSync(path, constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
function safePromptSources(rootDir) {
    try {
        return loadPromptSourceRegistry(rootDir).map(({ content: _content, ...metadata }) => metadata);
    }
    catch {
        return [];
    }
}
function safeBackupInventory(rootDir, paths) {
    try {
        const inventory = buildBackupTargetInventory({ paths, workDir: rootDir });
        return {
            included: inventory.included.length,
            excluded: inventory.excluded.length,
            promptSources: inventory.promptSources.length,
            logicalCoverage: inventory.targets
                .filter((target) => target.kind === "logical_sqlite_table")
                .map((target) => target.relativePath),
        };
    }
    catch {
        return { included: 0, excluded: 0, promptSources: 0, logicalCoverage: [] };
    }
}
function safePlanDrift(rootDir) {
    try {
        return { releaseNoteEvidence: runPlanDriftCheck({ rootDir }).releaseNoteEvidence };
    }
    catch {
        return {
            releaseNoteEvidence: {
                verifiedTasks: [],
                manualOnlyTasks: [],
                unverifiedTasks: [],
                pendingTasks: [],
                warningsByCode: {
                    phase_plan_missing: 0,
                    missing_required_section: 0,
                    completed_without_evidence: 0,
                    missing_referenced_path: 0,
                    plan_outdated_claim: 0,
                },
            },
        };
    }
}
function safeWebRetrievalFixtureRegression(rootDir) {
    try {
        return buildFixtureRegressionFromWorkspace(rootDir);
    }
    catch {
        return null;
    }
}
function readGitValue(rootDir, args) {
    try {
        const value = execFileSync("git", args, {
            cwd: rootDir,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return value || null;
    }
    catch {
        return null;
    }
}
export function buildReleaseOrchestrationEvidence(input) {
    const checks = [];
    let offRegistryLookups = 0;
    const offParitySnapshot = resolveOrchestrationModeSnapshotSync({
        config: {
            orchestration: {
                ...DEFAULT_CONFIG.orchestration,
                mode: "orchestration",
                featureFlagEnabled: false,
            },
        },
        loadRegistry: () => {
            offRegistryLookups += 1;
            return {
                activeSubAgents: [
                    { agentId: "agent:unexpected", agentName: "Unexpected", source: "config" },
                ],
                totalSubAgentCount: 1,
                disabledSubAgentCount: 0,
            };
        },
        now: () => input.now.getTime(),
    });
    checks.push(buildOrchestrationCheck({
        id: "feature_flag_off_parity",
        pass: offParitySnapshot.mode === "single_knowbee" &&
            offParitySnapshot.reasonCode === "feature_flag_off" &&
            offRegistryLookups === 0,
        summary: offParitySnapshot.mode === "single_knowbee" &&
            offParitySnapshot.reasonCode === "feature_flag_off"
            ? "Feature flag off state keeps the resolver on the single main-agent path without touching the registry."
            : "Feature flag off state no longer guarantees a clean single main-agent fallback.",
        detail: {
            registryLookups: offRegistryLookups,
            snapshot: serializeOrchestrationSnapshot(offParitySnapshot),
        },
    }));
    const noAgentFallbackSnapshot = resolveOrchestrationModeSnapshotSync({
        config: {
            orchestration: {
                ...DEFAULT_CONFIG.orchestration,
                mode: "orchestration",
                featureFlagEnabled: true,
            },
        },
        loadRegistry: () => ({
            activeSubAgents: [],
            totalSubAgentCount: 0,
            disabledSubAgentCount: 0,
        }),
        now: () => input.now.getTime(),
    });
    checks.push(buildOrchestrationCheck({
        id: "no_agent_fallback",
        pass: noAgentFallbackSnapshot.mode === "single_knowbee" &&
            noAgentFallbackSnapshot.reasonCode === "no_active_sub_agents",
        summary: noAgentFallbackSnapshot.mode === "single_knowbee" &&
            noAgentFallbackSnapshot.reasonCode === "no_active_sub_agents"
            ? "No-agent orchestration requests still fall back to the single main-agent path automatically."
            : "No-agent fallback no longer resolves cleanly to the single main-agent path.",
        detail: {
            snapshot: serializeOrchestrationSnapshot(noAgentFallbackSnapshot),
        },
    }));
    const runtimeFlag = input.featureFlags.find((flag) => flag.featureKey === "sub_agent_orchestration");
    checks.push({
        id: "runtime_flag_default",
        status: runtimeFlag?.mode === "off" && runtimeFlag.compatibilityMode
            ? "passed"
            : runtimeFlag
                ? "warning"
                : "warning",
        summary: runtimeFlag?.mode === "off" && runtimeFlag.compatibilityMode
            ? "Runtime orchestration flag default remains off with compatibility mode enabled."
            : runtimeFlag
                ? `Runtime orchestration flag is ${runtimeFlag.mode}; verify this is intentional before public rollout.`
                : "Runtime orchestration flag snapshot is missing.",
        detail: runtimeFlag
            ? {
                featureKey: runtimeFlag.featureKey,
                mode: runtimeFlag.mode,
                compatibilityMode: runtimeFlag.compatibilityMode,
                source: runtimeFlag.source,
            }
            : { featureKey: "sub_agent_orchestration", missing: true },
    });
    const warnings = checks
        .filter((check) => check.status === "warning")
        .map((check) => `${check.id}: ${check.summary}`);
    const blockingFailures = checks
        .filter((check) => check.status === "failed")
        .map((check) => `${check.id}: ${check.summary}`);
    return {
        kind: "knowbee.release.orchestration",
        generatedAt: input.now.toISOString(),
        gateStatus: blockingFailures.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
        checks,
        warnings,
        blockingFailures,
    };
}
function buildOrchestrationCheck(input) {
    return {
        id: input.id,
        status: input.pass ? "passed" : "failed",
        summary: input.summary,
        detail: input.detail,
    };
}
function serializeOrchestrationSnapshot(snapshot) {
    return {
        mode: snapshot.mode,
        status: snapshot.status,
        featureFlagEnabled: snapshot.featureFlagEnabled,
        requestedMode: snapshot.requestedMode,
        activeSubAgentCount: snapshot.activeSubAgentCount,
        totalSubAgentCount: snapshot.totalSubAgentCount,
        disabledSubAgentCount: snapshot.disabledSubAgentCount,
        reasonCode: snapshot.reasonCode,
        reason: snapshot.reason,
    };
}
function pathSize(path) {
    const stat = statSync(path);
    if (stat.isFile())
        return stat.size;
    if (!stat.isDirectory())
        return 0;
    return listFiles(path).reduce((sum, file) => sum + statSync(file).size, 0);
}
function checksumPath(path) {
    const stat = statSync(path);
    if (stat.isFile())
        return sha256Buffer(readFileSync(path));
    const root = resolve(path);
    const hash = createHash("sha256");
    for (const file of listFiles(root)) {
        const relativePath = relative(root, file).split(sep).join("/");
        hash.update(relativePath);
        hash.update("\0");
        hash.update(sha256Buffer(readFileSync(file)));
        hash.update("\n");
    }
    return hash.digest("hex");
}
function sha256Buffer(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}
function listFiles(root) {
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const fullPath = join(root, entry.name);
        if (entry.isDirectory())
            files.push(...listFiles(fullPath));
        else if (entry.isFile())
            files.push(fullPath);
    }
    return files.sort();
}
function copyPath(sourcePath, targetPath) {
    const stat = statSync(sourcePath);
    if (stat.isDirectory()) {
        mkdirSync(targetPath, { recursive: true });
        for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
            copyPath(join(sourcePath, entry.name), join(targetPath, entry.name));
        }
        return;
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
}
//# sourceMappingURL=package.js.map