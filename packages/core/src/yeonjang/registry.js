import { createHash, randomUUID } from "node:crypto";
import { getDb, insertAuditLog } from "../db/index.js";
const DEFAULT_LOCAL_NODE_ID = "yeonjang-main";
const CURRENT_YEONJANG_PROTOCOL_VERSION = "2026-04-16.capability-matrix.v1";
const YEONJANG_SESSION_STALE_MS = 90_000;
const DEFAULT_WORKSPACE_SCOPE_ID = "workspace:local-default";
const DEFAULT_OWNER_USER_ID = "local:operator";
const RESERVED_CALL_NAMES = new Set([
    "local",
    "remote",
    "all",
    "전체",
    "instance-id",
    "instance-alias",
    "call-name",
    "all-online",
    "filtered-group",
]);
function nowMs() {
    return Date.now();
}
function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function sanitizeOptionalString(value) {
    const normalized = normalizeString(value);
    return normalized.length > 0 ? normalized : null;
}
function stringifyJson(value) {
    return value == null ? null : JSON.stringify(value);
}
function parseJson(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function parseSessionOrdinal(sessionId) {
    const normalized = normalizeString(sessionId);
    if (!normalized)
        return null;
    const match = /(\d+)(?:\D*)$/.exec(normalized);
    if (!match?.[1])
        return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function previewFingerprint(value) {
    if (!value)
        return null;
    if (value.length <= 12)
        return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
function asTransport(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
}
function isSessionLive(session, now) {
    if (session.ended_at != null)
        return false;
    return now - session.last_seen_at <= YEONJANG_SESSION_STALE_MS;
}
function isConflictSessionState(sessionState) {
    const normalized = normalizeString(sessionState).toLowerCase();
    return normalized === "duplicate_instance_conflict" || normalized === "session_replaced";
}
function selectPreferredSession(sessions, now) {
    const preferredLive = sessions.find((session) => isSessionLive(session, now)
        && !["offline", "disconnected"].includes(normalizeString(session.session_state).toLowerCase())
        && !isConflictSessionState(session.session_state));
    if (preferredLive)
        return preferredLive;
    return sessions[0] ?? null;
}
function computePermissionRequired(permissions, capabilityMatrix) {
    if (!permissions || !capabilityMatrix)
        return false;
    for (const entry of Object.values(capabilityMatrix)) {
        if (!isRecord(entry))
            continue;
        const supported = entry["supported"];
        const permissionSetting = entry["permissionSetting"];
        if (supported === false)
            continue;
        if (typeof permissionSetting !== "string" || permissionSetting.trim().length === 0)
            continue;
        if (permissions[permissionSetting] === false)
            return true;
    }
    return false;
}
function computeDegraded(instance, permissions, toolHealth, capabilityMatrix, duplicateLiveSessionDetected) {
    if (duplicateLiveSessionDetected)
        return true;
    if (!instance.capability_hash || instance.method_count <= 0)
        return true;
    if (!permissions || !capabilityMatrix)
        return true;
    if (!toolHealth)
        return false;
    return Object.values(toolHealth).some((entry) => {
        if (!isRecord(entry))
            return false;
        const status = sanitizeOptionalString(entry["status"]);
        return Boolean(status) && !["ok", "ready", "healthy", "warning"].includes(status.toLowerCase());
    });
}
function normalizeGatewayOs() {
    switch (process.platform) {
        case "darwin":
            return "macos";
        case "win32":
            return "windows";
        default:
            return process.platform;
    }
}
function normalizeGatewayArch() {
    switch (process.arch) {
        case "x64":
            return "x86_64";
        case "arm64":
            return "aarch64";
        case "ia32":
            return "x86";
        default:
            return process.arch;
    }
}
function hostnameCandidate() {
    return normalizeString(process.env["NOBIE_HOSTNAME"])
        || normalizeString(process.env["COMPUTERNAME"])
        || normalizeString(process.env["HOSTNAME"])
        || "localhost";
}
function stableHexHash(value) {
    let hash = 0xcbf29ce484222325n;
    for (const byte of Buffer.from(value, "utf-8")) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, "0");
}
function gatewayHostFingerprint() {
    return stableHexHash(`${hostnameCandidate()}|${normalizeGatewayOs()}|${normalizeGatewayArch()}`);
}
function defaultWorkspaceScopeId() {
    return normalizeString(process.env["NOBIE_YEONJANG_WORKSPACE_SCOPE_ID"]) || DEFAULT_WORKSPACE_SCOPE_ID;
}
function defaultOwnerUserId() {
    return normalizeString(process.env["NOBIE_YEONJANG_OWNER_USER_ID"]) || DEFAULT_OWNER_USER_ID;
}
export function hashYeonjangPairingSecret(secret) {
    return createHash("sha256").update(secret.trim(), "utf8").digest("hex");
}
export function normalizeYeonjangTrustState(value) {
    switch (normalizeString(value).toLowerCase()) {
        case "trusted":
            return "trusted";
        case "revoked":
        case "untrusted":
        case "trust_revoked":
            return "revoked";
        case "quarantined":
        case "quarantine":
            return "quarantined";
        default:
            return "pending";
    }
}
function isAutoLocalIdentity(input) {
    if (input.nodeId === DEFAULT_LOCAL_NODE_ID)
        return true;
    return Boolean(input.hostFingerprint && input.hostFingerprint === gatewayHostFingerprint());
}
export function normalizeYeonjangCallName(value) {
    return value
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function validateObservationIdentity(input) {
    const instanceId = normalizeString(input.instanceId);
    const instanceAlias = normalizeString(input.instanceAlias);
    const displayName = normalizeString(input.displayName);
    const nodeId = normalizeString(input.nodeId);
    const sessionId = normalizeString(input.sessionId);
    if (!instanceId || !instanceAlias || !displayName || !nodeId || !sessionId) {
        return { ok: false, code: "invalid_identity", message: "Yeonjang instance identity 필수값이 비어 있습니다." };
    }
    const normalizedAlias = normalizeYeonjangCallName(instanceAlias);
    const normalizedDisplayName = normalizeYeonjangCallName(displayName);
    if (!normalizedAlias || !normalizedDisplayName) {
        return { ok: false, code: "invalid_identity", message: "호출명으로 사용할 수 없는 instance alias/display name 입니다." };
    }
    if (normalizedAlias === normalizedDisplayName) {
        return { ok: false, code: "call_name_conflict", message: "instance alias와 display name은 같은 호출명 namespace를 공유하므로 중복될 수 없습니다." };
    }
    if (RESERVED_CALL_NAMES.has(normalizedAlias) || RESERVED_CALL_NAMES.has(normalizedDisplayName)) {
        return { ok: false, code: "reserved_call_name", message: "예약어는 instance alias/display name으로 사용할 수 없습니다." };
    }
    return {
        instanceId,
        instanceAlias,
        displayName,
        nodeId,
        sessionId,
        normalizedCallName: normalizedAlias,
    };
}
function ensureCallNameAvailability(db, instanceId, aliasNormalized, displayNormalized) {
    const existing = db
        .prepare(`SELECT instance_id, normalized_name
       FROM yeonjang_instance_call_names
       WHERE normalized_name IN (?, ?)`)
        .all(aliasNormalized, displayNormalized);
    const conflicting = existing.find((row) => row.instance_id !== instanceId);
    if (!conflicting)
        return null;
    return {
        ok: false,
        code: "call_name_conflict",
        message: `호출명 namespace 충돌이 발생했습니다: ${conflicting.normalized_name}`,
    };
}
function resolveInstanceState(instance, sessions, now) {
    const liveSessions = sessions.filter((session) => isSessionLive(session, now));
    const latestSession = selectPreferredSession(sessions, now);
    const permissions = parseJson(instance.permissions_json);
    const toolHealth = parseJson(instance.tool_health_json);
    const capabilityMatrix = parseJson(instance.capability_matrix_json);
    const duplicateLiveSessionDetected = liveSessions.length > 1;
    if (!latestSession)
        return "discovered";
    if (!instance.protocol_version || instance.protocol_version !== CURRENT_YEONJANG_PROTOCOL_VERSION)
        return "update_required";
    if (!isSessionLive(latestSession, now) || ["offline", "disconnected"].includes(latestSession.session_state.toLowerCase()))
        return "offline";
    if (computePermissionRequired(permissions, capabilityMatrix))
        return "permission_required";
    if (computeDegraded(instance, permissions, toolHealth, capabilityMatrix, duplicateLiveSessionDetected))
        return "degraded";
    return "online";
}
function toSessionView(session, now) {
    if (!session)
        return null;
    return {
        sessionId: session.session_id,
        clientId: session.client_id,
        startupMode: session.startup_mode,
        windowMode: session.window_mode,
        trayState: session.tray_state,
        state: session.session_state,
        message: session.session_message,
        startedAt: session.started_at,
        lastSeenAt: session.last_seen_at,
        endedAt: session.ended_at,
        stale: !isSessionLive(session, now),
    };
}
function resolveActiveWorkspaceScopeId(rows) {
    const candidates = [
        rows.find((row) => row.local_marker === 1 && row.trust_state === "trusted" && row.workspace_scope_id),
        rows.find((row) => isAutoLocalIdentity({ nodeId: row.node_id, hostFingerprint: row.host_fingerprint }) && row.trust_state === "trusted" && row.workspace_scope_id),
        rows.find((row) => row.workspace_scope_id),
    ].filter(Boolean);
    return sanitizeOptionalString(candidates[0]?.workspace_scope_id) ?? defaultWorkspaceScopeId();
}
function resolveScopeAccess(workspaceScopeId, activeWorkspaceScopeId) {
    if (!workspaceScopeId)
        return "unassigned";
    return workspaceScopeId === activeWorkspaceScopeId ? "allowed" : "foreign";
}
function buildRunnableState(input) {
    const reasonCodes = [];
    if (input.state !== "online" && input.state !== "degraded") {
        reasonCodes.push(`target_state_${input.state}`);
    }
    if (input.trustState !== "trusted") {
        switch (input.trustState) {
            case "revoked":
                reasonCodes.push("target_trust_revoked");
                break;
            case "quarantined":
                reasonCodes.push("target_trust_quarantined");
                break;
            default:
                reasonCodes.push("target_trust_pending");
                break;
        }
    }
    if (input.scopeAccess === "foreign") {
        reasonCodes.push("workspace_scope_forbidden");
    }
    if (input.scopeAccess === "unassigned") {
        reasonCodes.push("workspace_scope_unassigned");
    }
    if (input.duplicateLiveSessionDetected) {
        reasonCodes.push("duplicate_live_session");
    }
    if (!input.session || input.session.stale) {
        reasonCodes.push("session_binding_unavailable");
    }
    return {
        runnableTarget: reasonCodes.length === 0,
        runnableReasonCodes: [...new Set(reasonCodes)],
    };
}
function writeCallNames(db, instanceId, instanceAlias, displayName, updatedAt) {
    const aliasNormalized = normalizeYeonjangCallName(instanceAlias);
    const displayNormalized = normalizeYeonjangCallName(displayName);
    db.prepare("DELETE FROM yeonjang_instance_call_names WHERE instance_id = ?").run(instanceId);
    const insertCallName = db.prepare(`INSERT INTO yeonjang_instance_call_names (
      instance_id, name_kind, raw_name, normalized_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`);
    insertCallName.run(instanceId, "instance_alias", instanceAlias, aliasNormalized, updatedAt, updatedAt);
    insertCallName.run(instanceId, "display_name", displayName, displayNormalized, updatedAt, updatedAt);
}
function evaluateYeonjangSessionClaim(params) {
    if (!params.existingInstance) {
        return { outcome: "accepted" };
    }
    const liveSessions = params.existingSessions.filter((session) => isSessionLive(session, params.incomingObservedAt));
    if (liveSessions.length === 0) {
        return { outcome: "accepted" };
    }
    if (liveSessions.some((session) => session.session_id === params.incomingSessionId)) {
        return { outcome: "accepted" };
    }
    const existing = params.existingInstance;
    const sameInstallFingerprint = Boolean(params.incomingInstallFingerprint
        && existing.install_fingerprint
        && params.incomingInstallFingerprint === existing.install_fingerprint);
    const sameHostFingerprint = Boolean(params.incomingHostFingerprint
        && existing.host_fingerprint
        && params.incomingHostFingerprint === existing.host_fingerprint);
    const sameWorkspaceScope = params.incomingWorkspaceScopeId == null
        || existing.workspace_scope_id == null
        || params.incomingWorkspaceScopeId === existing.workspace_scope_id;
    const trustedOwner = existing.trust_state === "trusted" && sanitizeOptionalString(existing.owner_user_id) != null;
    const validPairingFingerprint = Boolean(params.incomingPairingFingerprint
        && existing.pairing_fingerprint
        && params.incomingPairingFingerprint === existing.pairing_fingerprint);
    const existingOrdinal = Math.max(...liveSessions.map((session) => parseSessionOrdinal(session.session_id) ?? 0));
    const incomingOrdinal = parseSessionOrdinal(params.incomingSessionId) ?? params.incomingObservedAt;
    const newerSession = incomingOrdinal > existingOrdinal
        || params.incomingObservedAt >= Math.max(...liveSessions.map((session) => session.last_seen_at));
    if (sameInstallFingerprint && sameWorkspaceScope && newerSession && (trustedOwner || validPairingFingerprint || sameHostFingerprint)) {
        return {
            outcome: "replaced",
            reasonCode: "session_replaced",
            replaceSessionIds: liveSessions.map((session) => session.session_id),
        };
    }
    if (!sameWorkspaceScope) {
        return { outcome: "quarantined", reasonCode: "duplicate_instance_conflict:foreign_scope" };
    }
    if (!sameInstallFingerprint) {
        return { outcome: "quarantined", reasonCode: "duplicate_instance_conflict:install_fingerprint_mismatch" };
    }
    if (!newerSession) {
        return { outcome: "quarantined", reasonCode: "duplicate_instance_conflict:stale_session" };
    }
    return { outcome: "quarantined", reasonCode: "duplicate_instance_conflict:claim_validation_failed" };
}
function writeYeonjangSessionRow(db, input) {
    const existingSession = db
        .prepare("SELECT started_at FROM yeonjang_instance_sessions WHERE session_id = ?")
        .get(input.sessionId);
    const startedAt = existingSession?.started_at ?? input.startedAt;
    db.prepare(`INSERT INTO yeonjang_instance_sessions (
      session_id, instance_id, node_id, client_id, startup_mode, window_mode, tray_state,
      session_state, session_message, started_at, last_seen_at, ended_at, created_at, updated_at
    ) VALUES (
      @session_id, @instance_id, @node_id, @client_id, @startup_mode, @window_mode, @tray_state,
      @session_state, @session_message, @started_at, @last_seen_at, @ended_at, @created_at, @updated_at
    )
    ON CONFLICT(session_id) DO UPDATE SET
      instance_id = excluded.instance_id,
      node_id = excluded.node_id,
      client_id = excluded.client_id,
      startup_mode = excluded.startup_mode,
      window_mode = excluded.window_mode,
      tray_state = excluded.tray_state,
      session_state = excluded.session_state,
      session_message = excluded.session_message,
      last_seen_at = excluded.last_seen_at,
      ended_at = excluded.ended_at,
      updated_at = excluded.updated_at`).run({
        session_id: input.sessionId,
        instance_id: input.instanceId,
        node_id: input.nodeId,
        client_id: input.clientId,
        startup_mode: input.startupMode,
        window_mode: input.windowMode,
        tray_state: input.trayState,
        session_state: input.sessionState,
        session_message: input.sessionMessage,
        started_at: startedAt,
        last_seen_at: input.lastSeenAt,
        ended_at: input.endedAt,
        created_at: existingSession ? startedAt : input.lastSeenAt,
        updated_at: input.lastSeenAt,
    });
}
function insertYeonjangHeartbeat(db, input) {
    db.prepare(`INSERT INTO yeonjang_instance_heartbeats (
      heartbeat_id, session_id, instance_id, state, message, observed_at, method_count, capability_hash, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`yeonjang-heartbeat-${input.observedAt}-${randomUUID().slice(0, 8)}`, input.sessionId, input.instanceId, input.sessionState, input.message, input.observedAt, input.methodCount, input.capabilityHash, stringifyJson({
        nodeId: input.nodeId,
        supportProfile: input.supportProfile,
        platform: input.platform ?? null,
        arch: input.arch ?? null,
        transport: input.transport,
        workspaceScopeId: input.workspaceScopeId ?? null,
        pairingFingerprint: previewFingerprint(input.pairingFingerprint),
    }));
}
export function recordYeonjangGovernanceAudit(input) {
    try {
        insertAuditLog({
            timestamp: Date.now(),
            session_id: null,
            run_id: null,
            request_group_id: null,
            channel: null,
            source: "yeonjang-governance",
            tool_name: input.action,
            params: JSON.stringify({
                ...(input.actor !== undefined ? { actor: input.actor } : {}),
                ...(input.instanceId !== undefined ? { instanceId: input.instanceId } : {}),
                ...(input.instanceAlias !== undefined ? { instanceAlias: input.instanceAlias } : {}),
                ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
                ...(input.workspaceScopeId !== undefined ? { workspaceScopeId: input.workspaceScopeId } : {}),
                ...(input.trustState !== undefined ? { trustState: input.trustState } : {}),
                ...(input.reason !== undefined ? { reason: input.reason } : {}),
                ...(input.detail ?? {}),
            }),
            output: null,
            result: input.result ?? "success",
            duration_ms: null,
            approval_required: 0,
            approved_by: input.actor ?? null,
        });
    }
    catch {
        // Governance audit must not crash registry writes or tool execution.
    }
}
export function upsertYeonjangRegistryObservation(input, options = {}) {
    const validated = validateObservationIdentity(input);
    if ("ok" in validated)
        return validated;
    const observedAt = Number.isFinite(input.observedAt) ? Number(input.observedAt) : nowMs();
    const db = options.db ?? getDb();
    const permissions = isRecord(input.permissions) ? input.permissions : null;
    const toolHealth = isRecord(input.toolHealth) ? input.toolHealth : null;
    const capabilityMatrix = isRecord(input.capabilityMatrix) ? input.capabilityMatrix : null;
    const displayNormalized = normalizeYeonjangCallName(validated.displayName);
    const availability = ensureCallNameAvailability(db, validated.instanceId, validated.normalizedCallName, displayNormalized);
    if (availability)
        return availability;
    const initialLocalIdentity = isAutoLocalIdentity({
        nodeId: validated.nodeId,
        hostFingerprint: sanitizeOptionalString(input.hostFingerprint),
    });
    const initialTrustState = normalizeYeonjangTrustState(input.trustState ?? (initialLocalIdentity ? "trusted" : "pending"));
    const initialWorkspaceScopeId = sanitizeOptionalString(input.workspaceScopeId)
        ?? (initialLocalIdentity ? defaultWorkspaceScopeId() : null);
    const initialOwnerUserId = initialTrustState === "trusted"
        ? defaultOwnerUserId()
        : null;
    const incomingHostFingerprint = sanitizeOptionalString(input.hostFingerprint);
    const incomingInstallFingerprint = sanitizeOptionalString(input.installFingerprint);
    const incomingWorkspaceScopeId = sanitizeOptionalString(input.workspaceScopeId);
    const incomingPairingFingerprint = sanitizeOptionalString(input.pairingFingerprint);
    let claimOutcome = "accepted";
    let claimReasonCode = null;
    let replacedSessionIds = [];
    const tx = db.transaction(() => {
        const existing = db
            .prepare("SELECT * FROM yeonjang_instances WHERE instance_id = ?")
            .get(validated.instanceId);
        const existingSessions = db
            .prepare(`SELECT session_id, instance_id, node_id, client_id, startup_mode, window_mode, tray_state,
                session_state, session_message, started_at, last_seen_at, ended_at
         FROM yeonjang_instance_sessions
         WHERE instance_id = ?
         ORDER BY last_seen_at DESC, started_at DESC`)
            .all(validated.instanceId);
        const claim = evaluateYeonjangSessionClaim({
            existingInstance: existing ?? null,
            existingSessions,
            incomingSessionId: validated.sessionId,
            incomingInstallFingerprint,
            incomingHostFingerprint,
            incomingWorkspaceScopeId,
            incomingPairingFingerprint,
            incomingObservedAt: observedAt,
        });
        claimOutcome = claim.outcome;
        claimReasonCode = claim.reasonCode ?? null;
        replacedSessionIds = claim.replaceSessionIds ?? [];
        const createdAt = existing?.created_at ?? observedAt;
        const hasLocalMarker = db
            .prepare("SELECT COUNT(1) as count FROM yeonjang_instances WHERE local_marker = 1")
            .get()
            ?.count
            ?? 0;
        const initialLocalMarker = existing
            ? undefined
            : (initialLocalIdentity && hasLocalMarker === 0 ? 1 : 0);
        const sessionState = sanitizeOptionalString(input.connectionState) ?? "discovered";
        const incomingSessionMessage = sanitizeOptionalString(input.message);
        const transport = asTransport(input.transport);
        const methodCount = Math.max(0, input.methodCount ?? 0);
        const capabilityHash = sanitizeOptionalString(input.capabilityHash);
        if (claimOutcome !== "quarantined") {
            if (claimOutcome === "replaced" && replacedSessionIds.length > 0) {
                db.prepare(`UPDATE yeonjang_instance_sessions
           SET session_state = 'session_replaced',
               session_message = ?,
               ended_at = ?,
               updated_at = ?
           WHERE instance_id = ?
             AND session_id <> ?
             AND ended_at IS NULL`).run(`Replaced by newer session ${validated.sessionId}.`, observedAt, observedAt, validated.instanceId, validated.sessionId);
            }
            db.prepare(`INSERT INTO yeonjang_instances (
          instance_id, instance_alias, display_name, normalized_call_name, node_id, support_profile,
          platform, arch, host_fingerprint, install_fingerprint, version, protocol_version,
          connection_state, state_message, capability_hash, transport_json, permissions_json,
          tool_health_json, capability_matrix_json, method_count, owner_user_id, workspace_scope_id,
          pairing_fingerprint, trust_state, trust_reason, local_marker, trust_updated_at,
          trust_updated_by, approved_at, revoked_at, created_at, updated_at
        ) VALUES (
          @instance_id, @instance_alias, @display_name, @normalized_call_name, @node_id, @support_profile,
          @platform, @arch, @host_fingerprint, @install_fingerprint, @version, @protocol_version,
          @connection_state, @state_message, @capability_hash, @transport_json, @permissions_json,
          @tool_health_json, @capability_matrix_json, @method_count, @owner_user_id, @workspace_scope_id,
          @pairing_fingerprint, @trust_state, @trust_reason, @local_marker, @trust_updated_at,
          @trust_updated_by, @approved_at, @revoked_at, @created_at, @updated_at
        )
        ON CONFLICT(instance_id) DO UPDATE SET
          instance_alias = excluded.instance_alias,
          display_name = excluded.display_name,
          normalized_call_name = excluded.normalized_call_name,
          node_id = excluded.node_id,
          support_profile = excluded.support_profile,
          platform = excluded.platform,
          arch = excluded.arch,
          host_fingerprint = excluded.host_fingerprint,
          install_fingerprint = excluded.install_fingerprint,
          version = excluded.version,
          protocol_version = excluded.protocol_version,
          connection_state = excluded.connection_state,
          state_message = excluded.state_message,
          capability_hash = excluded.capability_hash,
          transport_json = excluded.transport_json,
          permissions_json = excluded.permissions_json,
          tool_health_json = excluded.tool_health_json,
          capability_matrix_json = excluded.capability_matrix_json,
          method_count = excluded.method_count,
          owner_user_id = COALESCE(yeonjang_instances.owner_user_id, excluded.owner_user_id),
          workspace_scope_id = COALESCE(yeonjang_instances.workspace_scope_id, excluded.workspace_scope_id),
          pairing_fingerprint = COALESCE(yeonjang_instances.pairing_fingerprint, excluded.pairing_fingerprint),
          trust_state = yeonjang_instances.trust_state,
          trust_reason = yeonjang_instances.trust_reason,
          local_marker = yeonjang_instances.local_marker,
          trust_updated_at = yeonjang_instances.trust_updated_at,
          trust_updated_by = yeonjang_instances.trust_updated_by,
          approved_at = yeonjang_instances.approved_at,
          revoked_at = yeonjang_instances.revoked_at,
          updated_at = excluded.updated_at`).run({
                instance_id: validated.instanceId,
                instance_alias: validated.instanceAlias,
                display_name: validated.displayName,
                normalized_call_name: validated.normalizedCallName,
                node_id: validated.nodeId,
                support_profile: normalizeString(input.supportProfile) || "desktop_interactive",
                platform: sanitizeOptionalString(input.platform),
                arch: sanitizeOptionalString(input.arch),
                host_fingerprint: incomingHostFingerprint,
                install_fingerprint: incomingInstallFingerprint,
                version: sanitizeOptionalString(input.version),
                protocol_version: sanitizeOptionalString(input.protocolVersion),
                connection_state: sessionState,
                state_message: incomingSessionMessage,
                capability_hash: capabilityHash,
                transport_json: stringifyJson(transport),
                permissions_json: stringifyJson(permissions),
                tool_health_json: stringifyJson(toolHealth),
                capability_matrix_json: stringifyJson(capabilityMatrix),
                method_count: methodCount,
                owner_user_id: initialOwnerUserId,
                workspace_scope_id: initialWorkspaceScopeId,
                pairing_fingerprint: incomingPairingFingerprint,
                trust_state: initialTrustState,
                trust_reason: initialLocalIdentity ? "auto_local_identity" : "pairing_required",
                local_marker: initialLocalMarker ?? 0,
                trust_updated_at: observedAt,
                trust_updated_by: initialLocalIdentity ? "system:auto-local" : "system:registry",
                approved_at: initialTrustState === "trusted" ? observedAt : null,
                revoked_at: initialTrustState === "revoked" ? observedAt : null,
                created_at: createdAt,
                updated_at: observedAt,
            });
            writeCallNames(db, validated.instanceId, validated.instanceAlias, validated.displayName, observedAt);
            writeYeonjangSessionRow(db, {
                sessionId: validated.sessionId,
                instanceId: validated.instanceId,
                nodeId: validated.nodeId,
                clientId: sanitizeOptionalString(input.clientId),
                startupMode: sanitizeOptionalString(input.startupMode),
                windowMode: sanitizeOptionalString(input.windowMode),
                trayState: sanitizeOptionalString(input.trayState),
                sessionState,
                sessionMessage: incomingSessionMessage,
                startedAt: observedAt,
                lastSeenAt: observedAt,
                endedAt: ["offline", "disconnected"].includes(sessionState.toLowerCase()) ? observedAt : null,
            });
        }
        else {
            writeYeonjangSessionRow(db, {
                sessionId: validated.sessionId,
                instanceId: validated.instanceId,
                nodeId: validated.nodeId,
                clientId: sanitizeOptionalString(input.clientId),
                startupMode: sanitizeOptionalString(input.startupMode),
                windowMode: sanitizeOptionalString(input.windowMode),
                trayState: sanitizeOptionalString(input.trayState),
                sessionState: "duplicate_instance_conflict",
                sessionMessage: claimReasonCode ?? "Duplicate instance claim rejected.",
                startedAt: observedAt,
                lastSeenAt: observedAt,
                endedAt: observedAt,
            });
            recordYeonjangGovernanceAudit({
                action: "yeonjang_duplicate_session_quarantined",
                actor: "system:claim-validation",
                instanceId: validated.instanceId,
                instanceAlias: existing?.instance_alias ?? validated.instanceAlias,
                displayName: existing?.display_name ?? validated.displayName,
                workspaceScopeId: existing?.workspace_scope_id ?? incomingWorkspaceScopeId,
                trustState: existing?.trust_state ?? initialTrustState,
                reason: claimReasonCode ?? "duplicate_instance_conflict",
                detail: {
                    rejectedSessionId: validated.sessionId,
                    clientId: sanitizeOptionalString(input.clientId),
                    installFingerprint: previewFingerprint(incomingInstallFingerprint),
                    hostFingerprint: previewFingerprint(incomingHostFingerprint),
                },
            });
        }
        insertYeonjangHeartbeat(db, {
            observedAt,
            sessionId: validated.sessionId,
            instanceId: validated.instanceId,
            sessionState: claimOutcome === "quarantined" ? "duplicate_instance_conflict" : sessionState,
            message: claimOutcome === "quarantined"
                ? (claimReasonCode ?? "Duplicate instance claim rejected.")
                : incomingSessionMessage,
            methodCount,
            capabilityHash,
            nodeId: validated.nodeId,
            supportProfile: normalizeString(input.supportProfile) || "desktop_interactive",
            platform: sanitizeOptionalString(input.platform),
            arch: sanitizeOptionalString(input.arch),
            transport,
            workspaceScopeId: incomingWorkspaceScopeId,
            pairingFingerprint: incomingPairingFingerprint,
        });
    });
    tx();
    return {
        ok: true,
        instanceId: validated.instanceId,
        sessionId: validated.sessionId,
        claimOutcome,
        ...(claimReasonCode ? { reasonCode: claimReasonCode } : {}),
        ...(replacedSessionIds.length > 0 ? { replacedSessionIds } : {}),
    };
}
function getInstanceRow(db, instanceId) {
    return db
        .prepare("SELECT * FROM yeonjang_instances WHERE instance_id = ?")
        .get(instanceId);
}
export function approveYeonjangInstancePairing(input) {
    const db = input.db ?? getDb();
    const instance = getInstanceRow(db, normalizeString(input.instanceId));
    if (!instance) {
        return { ok: false, code: "instance_not_found", message: "대상 Yeonjang 인스턴스를 찾지 못했습니다." };
    }
    const pairingSecret = normalizeString(input.pairingSecret);
    if (!pairingSecret) {
        return { ok: false, code: "pairing_secret_required", message: "pairing secret이 필요합니다." };
    }
    const fingerprint = sanitizeOptionalString(instance.pairing_fingerprint);
    if (!fingerprint) {
        return { ok: false, code: "pairing_secret_unavailable", message: "인스턴스가 pairing fingerprint를 아직 보고하지 않았습니다." };
    }
    if (hashYeonjangPairingSecret(pairingSecret) !== fingerprint) {
        return { ok: false, code: "invalid_pairing_secret", message: "pairing secret 검증에 실패했습니다." };
    }
    const actor = normalizeString(input.actor) || "system:unknown";
    const ownerUserId = sanitizeOptionalString(input.ownerUserId) ?? actor;
    const workspaceScopeId = sanitizeOptionalString(input.workspaceScopeId)
        ?? sanitizeOptionalString(instance.workspace_scope_id)
        ?? defaultWorkspaceScopeId();
    const reason = sanitizeOptionalString(input.reason) ?? "pairing_approved";
    const updatedAt = nowMs();
    db.prepare(`UPDATE yeonjang_instances
     SET owner_user_id = ?,
         workspace_scope_id = ?,
         trust_state = 'trusted',
         trust_reason = ?,
         trust_updated_at = ?,
         trust_updated_by = ?,
         approved_at = ?,
         revoked_at = NULL
     WHERE instance_id = ?`).run(ownerUserId, workspaceScopeId, reason, updatedAt, actor, updatedAt, instance.instance_id);
    recordYeonjangGovernanceAudit({
        action: "yeonjang_pairing_approved",
        actor,
        instanceId: instance.instance_id,
        instanceAlias: instance.instance_alias,
        displayName: instance.display_name,
        workspaceScopeId,
        trustState: "trusted",
        reason,
        detail: {
            ownerUserId,
            pairingFingerprint: previewFingerprint(fingerprint),
        },
    });
    return { ok: true, instanceId: instance.instance_id, trustState: "trusted" };
}
export function updateYeonjangInstanceTrustState(input) {
    const db = input.db ?? getDb();
    const instance = getInstanceRow(db, normalizeString(input.instanceId));
    if (!instance) {
        return { ok: false, code: "instance_not_found", message: "대상 Yeonjang 인스턴스를 찾지 못했습니다." };
    }
    const trustState = normalizeYeonjangTrustState(input.trustState);
    if (!trustState) {
        return { ok: false, code: "invalid_trust_state", message: "유효하지 않은 trust state 입니다." };
    }
    const actor = normalizeString(input.actor) || "system:unknown";
    const reason = sanitizeOptionalString(input.reason) ?? `manual_${trustState}`;
    const updatedAt = nowMs();
    db.prepare(`UPDATE yeonjang_instances
     SET trust_state = ?,
         trust_reason = ?,
         trust_updated_at = ?,
         trust_updated_by = ?,
         approved_at = CASE WHEN ? = 'trusted' THEN COALESCE(approved_at, ?) ELSE approved_at END,
         revoked_at = CASE WHEN ? IN ('revoked', 'quarantined') THEN ? ELSE revoked_at END
     WHERE instance_id = ?`).run(trustState, reason, updatedAt, actor, trustState, updatedAt, trustState, updatedAt, instance.instance_id);
    recordYeonjangGovernanceAudit({
        action: "yeonjang_trust_state_changed",
        actor,
        instanceId: instance.instance_id,
        instanceAlias: instance.instance_alias,
        displayName: instance.display_name,
        workspaceScopeId: instance.workspace_scope_id,
        trustState,
        reason,
    });
    return { ok: true, instanceId: instance.instance_id, trustState };
}
export function renameYeonjangRegistryInstance(input) {
    const db = input.db ?? getDb();
    const instance = getInstanceRow(db, normalizeString(input.instanceId));
    if (!instance) {
        return { ok: false, code: "instance_not_found", message: "대상 Yeonjang 인스턴스를 찾지 못했습니다." };
    }
    const nextAlias = normalizeString(input.instanceAlias) || instance.instance_alias;
    const nextDisplayName = normalizeString(input.displayName) || instance.display_name;
    const validated = validateObservationIdentity({
        instanceId: instance.instance_id,
        instanceAlias: nextAlias,
        displayName: nextDisplayName,
        nodeId: instance.node_id,
        supportProfile: instance.support_profile,
        sessionId: "rename-session",
    });
    if ("ok" in validated) {
        return {
            ok: false,
            code: validated.code,
            message: validated.message,
        };
    }
    const displayNormalized = normalizeYeonjangCallName(validated.displayName);
    const availability = ensureCallNameAvailability(db, validated.instanceId, validated.normalizedCallName, displayNormalized);
    if (availability)
        return availability;
    const updatedAt = nowMs();
    db.prepare(`UPDATE yeonjang_instances
     SET instance_alias = ?,
         display_name = ?,
         normalized_call_name = ?,
         updated_at = ?
     WHERE instance_id = ?`).run(nextAlias, nextDisplayName, validated.normalizedCallName, updatedAt, instance.instance_id);
    writeCallNames(db, instance.instance_id, nextAlias, nextDisplayName, updatedAt);
    recordYeonjangGovernanceAudit({
        action: "yeonjang_instance_renamed",
        actor: normalizeString(input.actor) || "system:unknown",
        instanceId: instance.instance_id,
        instanceAlias: nextAlias,
        displayName: nextDisplayName,
        workspaceScopeId: instance.workspace_scope_id,
        trustState: instance.trust_state,
        reason: sanitizeOptionalString(input.reason) ?? "rename",
    });
    return { ok: true, instanceId: instance.instance_id, instanceAlias: nextAlias, displayName: nextDisplayName };
}
export function assignYeonjangLocalMarker(input) {
    const db = input.db ?? getDb();
    const instance = getInstanceRow(db, normalizeString(input.instanceId));
    if (!instance) {
        return { ok: false, code: "instance_not_found", message: "대상 Yeonjang 인스턴스를 찾지 못했습니다." };
    }
    const tx = db.transaction(() => {
        db.prepare("UPDATE yeonjang_instances SET local_marker = 0 WHERE local_marker = 1").run();
        db.prepare("UPDATE yeonjang_instances SET local_marker = 1, updated_at = ? WHERE instance_id = ?").run(nowMs(), instance.instance_id);
    });
    tx();
    recordYeonjangGovernanceAudit({
        action: "yeonjang_local_marker_changed",
        actor: normalizeString(input.actor) || "system:unknown",
        instanceId: instance.instance_id,
        instanceAlias: instance.instance_alias,
        displayName: instance.display_name,
        workspaceScopeId: instance.workspace_scope_id,
        trustState: instance.trust_state,
        reason: sanitizeOptionalString(input.reason) ?? "local_marker_reassigned",
    });
    return { ok: true, instanceId: instance.instance_id };
}
export function listYeonjangGovernanceHistory(options = {}) {
    const db = options.db ?? getDb();
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
    const rows = db
        .prepare(`SELECT id, timestamp, tool_name, result, params, approved_by
       FROM audit_logs
       WHERE source = 'yeonjang-governance'
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`)
        .all(limit);
    return rows.map((row) => {
        const params = parseJson(row.params) ?? {};
        return {
            id: row.id,
            at: row.timestamp,
            action: row.tool_name,
            result: row.result,
            actor: sanitizeOptionalString(params["actor"]) ?? row.approved_by,
            instanceId: sanitizeOptionalString(params["instanceId"]),
            instanceAlias: sanitizeOptionalString(params["instanceAlias"]),
            displayName: sanitizeOptionalString(params["displayName"]),
            workspaceScopeId: sanitizeOptionalString(params["workspaceScopeId"]),
            trustState: sanitizeOptionalString(params["trustState"]),
            reason: sanitizeOptionalString(params["reason"]),
        };
    });
}
export function listYeonjangRegistryInstances(options = {}) {
    const db = options.db ?? getDb();
    const now = options.now ?? nowMs();
    const instances = db
        .prepare("SELECT * FROM yeonjang_instances ORDER BY updated_at DESC, created_at DESC")
        .all();
    const sessions = db
        .prepare(`SELECT session_id, instance_id, node_id, client_id, startup_mode, window_mode, tray_state,
              session_state, session_message, started_at, last_seen_at, ended_at
       FROM yeonjang_instance_sessions
       ORDER BY last_seen_at DESC, started_at DESC`)
        .all();
    const sessionsByInstance = new Map();
    for (const session of sessions) {
        const bucket = sessionsByInstance.get(session.instance_id) ?? [];
        bucket.push(session);
        sessionsByInstance.set(session.instance_id, bucket);
    }
    const activeWorkspaceScopeId = resolveActiveWorkspaceScopeId(instances);
    const items = instances.map((instance) => {
        const instanceSessions = sessionsByInstance.get(instance.instance_id) ?? [];
        const latestSession = selectPreferredSession(instanceSessions, now);
        const liveSessionCount = instanceSessions.filter((session) => isSessionLive(session, now)).length;
        const state = resolveInstanceState(instance, instanceSessions, now);
        const localMarker = instance.local_marker === 1;
        const isLocalCandidate = localMarker || isAutoLocalIdentity({ nodeId: instance.node_id, hostFingerprint: instance.host_fingerprint });
        const sessionView = toSessionView(latestSession, now);
        const scopeAccess = resolveScopeAccess(instance.workspace_scope_id, activeWorkspaceScopeId);
        const runnableState = buildRunnableState({
            state,
            trustState: instance.trust_state,
            scopeAccess,
            duplicateLiveSessionDetected: liveSessionCount > 1,
            session: sessionView,
        });
        return {
            instanceId: instance.instance_id,
            instanceAlias: instance.instance_alias,
            displayName: instance.display_name,
            normalizedCallName: instance.normalized_call_name,
            nodeId: instance.node_id,
            supportProfile: instance.support_profile,
            platform: instance.platform,
            arch: instance.arch,
            version: instance.version,
            protocolVersion: instance.protocol_version,
            capabilityHash: instance.capability_hash,
            methodCount: instance.method_count,
            state,
            stateMessage: instance.state_message,
            lastSeenAt: latestSession?.last_seen_at ?? instanceSessions[0]?.last_seen_at ?? null,
            liveSessionCount,
            duplicateLiveSessionDetected: liveSessionCount > 1,
            isLocalCandidate,
            localMarker,
            ownerUserId: instance.owner_user_id,
            workspaceScopeId: instance.workspace_scope_id,
            scopeAccess,
            trustState: instance.trust_state,
            trustReason: instance.trust_reason,
            pairingFingerprintPreview: previewFingerprint(instance.pairing_fingerprint),
            ...runnableState,
            hostFingerprintPreview: previewFingerprint(instance.host_fingerprint),
            installFingerprintPreview: previewFingerprint(instance.install_fingerprint),
            transport: parseJson(instance.transport_json) ?? [],
            session: sessionView,
        };
    });
    return items.sort((left, right) => {
        if (left.localMarker !== right.localMarker)
            return left.localMarker ? -1 : 1;
        if (left.isLocalCandidate !== right.isLocalCandidate)
            return left.isLocalCandidate ? -1 : 1;
        const leftTrusted = left.trustState === "trusted" ? 1 : 0;
        const rightTrusted = right.trustState === "trusted" ? 1 : 0;
        if (leftTrusted !== rightTrusted)
            return rightTrusted - leftTrusted;
        const leftOnline = left.state === "online" ? 1 : 0;
        const rightOnline = right.state === "online" ? 1 : 0;
        if (leftOnline !== rightOnline)
            return rightOnline - leftOnline;
        return `${left.displayName}\u0000${left.instanceAlias}`.localeCompare(`${right.displayName}\u0000${right.instanceAlias}`, "ko");
    });
}
export function getYeonjangRegistrySummary(options = {}) {
    const db = options.db ?? getDb();
    const instances = listYeonjangRegistryInstances(options);
    const duplicateConflictCount = db
        .prepare("SELECT count(*) AS count FROM yeonjang_instance_sessions WHERE session_state = 'duplicate_instance_conflict'")
        .get()?.count ?? 0;
    return {
        totalInstances: instances.length,
        online: instances.filter((item) => item.state === "online").length,
        offline: instances.filter((item) => item.state === "offline").length,
        degraded: instances.filter((item) => item.state === "degraded").length,
        permissionRequired: instances.filter((item) => item.state === "permission_required").length,
        updateRequired: instances.filter((item) => item.state === "update_required").length,
        discovered: instances.filter((item) => item.state === "discovered").length,
        duplicateLiveSessionInstances: instances.filter((item) => item.duplicateLiveSessionDetected).length,
        duplicateConflictCount,
        localCandidates: instances.filter((item) => item.isLocalCandidate).length,
        localInstances: instances.filter((item) => item.isLocalCandidate).length,
        remoteInstances: instances.filter((item) => !item.isLocalCandidate).length,
        trusted: instances.filter((item) => item.trustState === "trusted").length,
        pending: instances.filter((item) => item.trustState === "pending").length,
        revoked: instances.filter((item) => item.trustState === "revoked").length,
        quarantined: instances.filter((item) => item.trustState === "quarantined").length,
        foreignInstances: instances.filter((item) => item.scopeAccess === "foreign").length,
        unassignedScopeInstances: instances.filter((item) => item.scopeAccess === "unassigned").length,
        activeWorkspaceScopeId: instances.find((item) => item.scopeAccess === "allowed")?.workspaceScopeId ?? defaultWorkspaceScopeId(),
        localMarkerInstanceId: instances.find((item) => item.localMarker)?.instanceId ?? null,
    };
}
//# sourceMappingURL=registry.js.map