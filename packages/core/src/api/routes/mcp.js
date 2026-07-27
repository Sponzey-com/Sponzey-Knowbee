import { createAgentPublicRef } from "../../capabilities/agent-public-reference.js";
import { buildCapabilityBindingProjection } from "../../capabilities/capability-binding-projection.js";
import { executeMcpBindingCommand, } from "../../capabilities/mcp-binding-command.js";
import { buildMcpCatalogPage, buildMcpCatalogSnapshot, } from "../../capabilities/mcp-catalog-query.js";
import { probeMcpConnectionDraft, } from "../../capabilities/mcp-connection-probe.js";
import { validateMcpConnectionDraft } from "../../capabilities/mcp-connection-validation.js";
import { validateMcpProtectedUpdateShape } from "../../capabilities/mcp-protected-update.js";
import { createMcpPublicRef } from "../../capabilities/mcp-public-reference.js";
import { buildMcpToolAccessProjection } from "../../capabilities/mcp-tool-access-projection.js";
import { buildRuntimeAppliedConfigurationCommand, buildRuntimeFailedConfigurationCommand, } from "../../config/command-state.js";
import { testMcpServerConnection } from "../../control-plane/setup-extensions.js";
import { getCapabilityMutationReceiptByNonce, listAgentCapabilityBindings, listAgentConfigs, listMcpServerCatalogEntries, reserveCapabilityMutationReceipt, updateCapabilityMutationReceipt, upsertAgentCapabilityBinding, } from "../../db/index.js";
import { createLogger } from "../../logger/index.js";
import { redactMcpLogText } from "../../mcp/client.js";
import { mcpRegistry } from "../../mcp/registry.js";
import { authMiddleware, getApiAuthenticationPrincipal } from "../middleware/auth.js";
import { getApiRuntimeConfig } from "../runtime-context.js";
function buildMcpServersResponse() {
    return {
        servers: mcpRegistry.getStatuses().map(({ command: _command, url: _url, ...status }) => ({
            ...status,
            ...(status.error ? { error: redactMcpLogText(status.error) } : {}),
        })),
        summary: mcpRegistry.getSummary(),
    };
}
const mcpRouteLogger = createLogger("api:mcp");
const defaultCatalogRepository = {
    listCatalog: () => listMcpServerCatalogEntries(),
    listBindings: () => listAgentCapabilityBindings({ capabilityKind: "mcp_server", includeArchived: true }),
};
export function registerMcpRoute(app, options = {}) {
    const catalogRepository = options.catalogRepository ?? defaultCatalogRepository;
    const runtimeRepository = options.runtimeRepository ?? {
        listStatuses: () => mcpRegistry.getStatuses(),
    };
    const publicRefForMcpId = options.publicRefForMcpId ?? createMcpPublicRef;
    const publicRefForAgentId = options.publicRefForAgentId ?? createAgentPublicRef;
    const bindingProjectionRepository = options.bindingProjectionRepository ??
        (options.catalogRepository || options.runtimeRepository
            ? { listAgents: () => [], listBindings: () => [] }
            : {
                listAgents: () => listAgentConfigs(),
                listBindings: () => listAgentCapabilityBindings({ capabilityKind: "mcp_server", includeArchived: true }),
            });
    const now = options.now ?? Date.now;
    const probeActorForRequest = options.probeActorForRequest ??
        ((request) => {
            const principal = getApiAuthenticationPrincipal(request);
            if (principal)
                return principal.principalRef;
            const address = request.socket?.remoteAddress ?? "";
            return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)
                ? "api:localhost-owner"
                : null;
        });
    const runtimeWorkspaceForRequest = options.runtimeWorkspaceForRequest ??
        ((request) => getApiRuntimeConfig(request).profile.workspace);
    const mutationActorForRequest = options.mutationActorForRequest ?? probeActorForRequest;
    const mutationRuntime = options.mutationRuntime;
    const currentMcpRevision = () => Math.max(listMcpServerCatalogEntries({ includeArchived: true }).reduce((revision, row) => Math.max(revision, row.updated_at), 0), listAgentCapabilityBindings({ capabilityKind: "mcp_server", includeArchived: true }).reduce((revision, row) => Math.max(revision, row.updated_at), 0));
    const reserveMcpReceipt = ({ envelope, state, now: reservedAt, }) => reserveCapabilityMutationReceipt({
        mutationId: envelope.mutationId,
        nonce: envelope.nonce,
        actorRef: envelope.actorRef,
        scope: envelope.scope,
        purpose: envelope.purpose,
        capabilityKind: "mcp_server",
        targetRevision: envelope.targetRevision,
        state,
        now: reservedAt,
    });
    const parseObject = (value) => {
        try {
            const parsed = value ? JSON.parse(value) : {};
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed
                : {};
        }
        catch {
            return {};
        }
    };
    const parseStringArray = (value) => {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed)
                ? parsed.filter((item) => typeof item === "string")
                : [];
        }
        catch {
            return [];
        }
    };
    const resolveMcpIdentity = (mcpRef) => {
        const catalog = listMcpServerCatalogEntries({ includeArchived: true }).filter((row) => row.status !== "archived" && publicRefForMcpId(row.mcp_server_id) === mcpRef);
        const catalogMatch = catalog.length === 1 ? catalog[0] : undefined;
        if (catalogMatch)
            return {
                internalMcpId: catalogMatch.mcp_server_id,
                active: catalogMatch.status === "enabled",
            };
        const runtime = runtimeRepository
            .listStatuses()
            .filter((row) => publicRefForMcpId(`mcp:${row.name.trim()}`) === mcpRef);
        const runtimeMatch = runtime.length === 1 ? runtime[0] : undefined;
        return runtimeMatch
            ? {
                internalMcpId: `mcp:${runtimeMatch.name.trim()}`,
                active: runtimeMatch.enabled && runtimeMatch.ready,
            }
            : null;
    };
    const resolveAgent = (agentRef) => {
        const matches = listAgentConfigs({ enabledOnly: true }).filter((agent) => publicRefForAgentId(agent.agent_id) === agentRef);
        const match = matches.length === 1 ? matches[0] : undefined;
        return match ? { internalAgentId: match.agent_id, name: match.agent_name } : null;
    };
    const writeBinding = (input) => {
        const existing = listAgentCapabilityBindings({
            capabilityKind: "mcp_server",
            includeArchived: true,
        }).find((binding) => binding.agent_id === input.internalAgentId && binding.catalog_id === input.internalMcpId);
        upsertAgentCapabilityBinding({
            ...(existing
                ? {
                    bindingId: existing.binding_id,
                    enabledToolNames: parseStringArray(existing.enabled_tool_names_json),
                    disabledToolNames: parseStringArray(existing.disabled_tool_names_json),
                    createdAt: existing.created_at,
                }
                : {}),
            ...(existing?.secret_scope_id ? { secretScopeId: existing.secret_scope_id } : {}),
            ...(existing?.permission_profile_json
                ? { permissionProfile: parseObject(existing.permission_profile_json) }
                : {}),
            ...(existing?.rate_limit_json
                ? { rateLimit: parseObject(existing.rate_limit_json) }
                : {}),
            ...(existing?.approval_required_from
                ? { approvalRequiredFrom: existing.approval_required_from }
                : {}),
            agentId: input.internalAgentId,
            capabilityKind: "mcp_server",
            catalogId: input.internalMcpId,
            status: input.enabled ? "enabled" : "archived",
            updatedAt: input.revision,
        }, {
            source: existing?.source ?? "manual",
            auditId: existing?.audit_id ?? null,
            now: input.revision,
        });
        return true;
    };
    const executeBinding = options.bindingExecutor ??
        (async (input) => executeMcpBindingCommand(input, {
            now,
            currentRevision: currentMcpRevision,
            nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)),
            reserveReceipt: reserveMcpReceipt,
            updateReceipt: (receipt) => {
                updateCapabilityMutationReceipt(receipt);
            },
            resolveMcp: resolveMcpIdentity,
            resolveAgent,
            bindingEnabled: ({ internalMcpId, internalAgentId }) => listAgentCapabilityBindings({ capabilityKind: "mcp_server", includeArchived: true }).some((binding) => binding.catalog_id === internalMcpId &&
                binding.agent_id === internalAgentId &&
                binding.status === "enabled"),
            persist: ({ internalMcpId, internalAgentId, enabled, expectedRevision, targetRevision }) => currentMcpRevision() === expectedRevision &&
                writeBinding({ internalMcpId, internalAgentId, enabled, revision: targetRevision })
                ? { ok: true, revision: targetRevision }
                : {
                    ok: false,
                    revision: currentMcpRevision(),
                    reasonCode: "mutation_revision_conflict",
                },
            verify: ({ internalMcpId, internalAgentId, enabled, targetRevision }) => {
                const binding = listAgentCapabilityBindings({
                    capabilityKind: "mcp_server",
                    includeArchived: true,
                }).find((entry) => entry.catalog_id === internalMcpId && entry.agent_id === internalAgentId);
                return {
                    ok: Boolean(binding &&
                        (binding.status === "enabled") === enabled &&
                        binding.updated_at === targetRevision),
                    reasonCode: "mcp_binding_verify_failed",
                };
            },
            rollback: ({ internalMcpId, internalAgentId, enabled, baseRevision }) => ({
                ok: writeBinding({ internalMcpId, internalAgentId, enabled, revision: baseRevision }),
                reasonCode: "mcp_binding_rollback_failed",
            }),
        }));
    const executeProbe = options.probeExecutor ??
        (async (input) => probeMcpConnectionDraft(input.draft, {
            now,
            probe: async (draft) => {
                const result = await testMcpServerConnection({
                    id: "probe",
                    name: draft.displayName,
                    transport: draft.transport,
                    command: draft.command,
                    argsText: draft.args.join("\n"),
                    cwd: draft.cwd,
                    url: draft.url ?? "",
                    required: draft.required,
                    enabled: true,
                    status: "planned",
                    tools: [],
                }, input.defaultCwd, {
                    ...(options.mcpProcessEnv ? { baseEnv: options.mcpProcessEnv } : {}),
                    signal: input.signal,
                });
                return {
                    ok: result.ok,
                    ...(result.ok ? {} : { reasonCode: "mcp_connection_probe_failed" }),
                    tools: result.tools.map((name) => ({ name, description: "" })),
                };
            },
        }, input.signal));
    const readSnapshot = () => ({
        rows: catalogRepository.listCatalog(),
        bindings: catalogRepository.listBindings(),
        runtimeStatuses: runtimeRepository.listStatuses(),
        observedAt: now(),
        publicRefForMcpId,
    });
    const projectedMcpId = (mcpRef, rows, statuses) => {
        const catalogMatches = rows.filter((row) => row.status !== "archived" && publicRefForMcpId(row.mcp_server_id) === mcpRef);
        const catalogMatch = catalogMatches.length === 1 ? catalogMatches[0] : undefined;
        if (catalogMatch)
            return catalogMatch.mcp_server_id;
        const runtimeMatches = statuses.filter((row) => publicRefForMcpId(`mcp:${row.name.trim()}`) === mcpRef);
        const runtimeMatch = runtimeMatches.length === 1 ? runtimeMatches[0] : undefined;
        return runtimeMatch ? `mcp:${runtimeMatch.name.trim()}` : null;
    };
    const normalizeQuery = (raw) => {
        const limit = raw.limit === undefined
            ? undefined
            : typeof raw.limit === "number"
                ? raw.limit
                : Number(raw.limit);
        const transport = raw.transport === undefined || raw.transport === "" ? undefined : raw.transport;
        const runtimeStatus = raw.runtimeStatus ?? raw.status;
        if (transport !== undefined && transport !== "stdio" && transport !== "http")
            throw new Error("mcp_catalog_transport_invalid");
        if (runtimeStatus !== undefined &&
            runtimeStatus !== "" &&
            !["ready", "unavailable", "inactive", "not_loaded"].includes(String(runtimeStatus)))
            throw new Error("mcp_catalog_runtime_status_invalid");
        const bound = raw.boundOnly ?? raw.bound;
        if (bound !== undefined &&
            bound !== true &&
            bound !== false &&
            bound !== "true" &&
            bound !== "false")
            throw new Error("mcp_catalog_bound_invalid");
        const normalizedRuntimeStatus = runtimeStatus === "ready" ||
            runtimeStatus === "unavailable" ||
            runtimeStatus === "inactive" ||
            runtimeStatus === "not_loaded"
            ? runtimeStatus
            : undefined;
        return {
            ...(limit !== undefined ? { limit } : {}),
            ...(typeof raw.cursor === "string" && raw.cursor ? { cursor: raw.cursor } : {}),
            ...(typeof raw.search === "string" && raw.search ? { search: raw.search } : {}),
            ...(transport ? { transport } : {}),
            ...(normalizedRuntimeStatus ? { runtimeStatus: normalizedRuntimeStatus } : {}),
            boundOnly: bound === true || bound === "true",
        };
    };
    app.get("/api/capabilities/mcp", { preHandler: authMiddleware }, async (req, reply) => {
        try {
            const result = buildMcpCatalogPage({
                ...readSnapshot(),
                query: normalizeQuery((req.query ?? {})),
            });
            mcpRouteLogger.fieldDebug("MCP catalog read", {
                itemCount: result.items.length,
                hasNextPage: result.nextCursor !== null,
            });
            return result;
        }
        catch (cause) {
            const reason = cause instanceof Error ? cause.message : "mcp_catalog_read_failed";
            if ([
                "mcp_catalog_limit_invalid",
                "mcp_catalog_cursor_invalid",
                "mcp_catalog_transport_invalid",
                "mcp_catalog_runtime_status_invalid",
                "mcp_catalog_bound_invalid",
            ].includes(reason))
                return reply.status(400).send({ error: reason });
            mcpRouteLogger.product("MCP catalog read failed", {
                reasonCode: "mcp_catalog_projection_failed",
            });
            mcpRouteLogger.development("MCP catalog projection detail", { reasonCode: reason });
            return reply.status(500).send({ error: "mcp_catalog_projection_failed" });
        }
    });
    app.get("/api/capabilities/mcp/:mcpRef", { preHandler: authMiddleware }, async (req, reply) => {
        if (!/^mcp_v1_[a-f0-9]{24}$/.test(req.params.mcpRef))
            return reply.status(400).send({ error: "mcp_ref_invalid" });
        try {
            const source = readSnapshot();
            const snapshot = buildMcpCatalogSnapshot(source);
            const item = snapshot.items.find((entry) => entry.mcpRef === req.params.mcpRef);
            mcpRouteLogger.fieldDebug("MCP catalog detail read", {
                found: Boolean(item),
                toolCount: item?.tools.length ?? 0,
            });
            if (!item)
                return reply.status(404).send({ error: "mcp_ref_not_found" });
            const internalMcpId = projectedMcpId(req.params.mcpRef, source.rows, source.runtimeStatuses);
            if (!internalMcpId)
                return reply.status(404).send({ error: "mcp_ref_not_found" });
            const agents = bindingProjectionRepository.listAgents();
            const bindingRows = bindingProjectionRepository.listBindings();
            const bindings = buildCapabilityBindingProjection({
                catalogId: internalMcpId,
                agents,
                bindings: bindingRows,
                publicRefForAgentId,
            });
            const internalKey = internalMcpId.replace(/^mcp:/u, "");
            const runtime = source.runtimeStatuses.find((status) => status.name.trim().replace(/^mcp:/u, "") === internalKey);
            const toolAccess = buildMcpToolAccessProjection({
                catalogId: internalMcpId,
                serverName: runtime?.name ?? internalKey,
                tools: runtime?.tools ?? [],
                agents,
                bindings: bindingRows.map((binding) => ({
                    ...binding,
                    enabled_tool_names: parseStringArray(binding.enabled_tool_names_json ?? "[]"),
                    disabled_tool_names: parseStringArray(binding.disabled_tool_names_json ?? "[]"),
                })),
                publicRefForAgentId,
            });
            const tools = toolAccess.tools.map((tool) => tool.access.length > 0 ? tool : { name: tool.name, description: tool.description });
            return { ...item, tools, bindings };
        }
        catch {
            mcpRouteLogger.product("MCP catalog detail failed", {
                reasonCode: "mcp_catalog_projection_failed",
            });
            return reply.status(500).send({ error: "mcp_catalog_projection_failed" });
        }
    });
    app.post("/api/capabilities/mcp/probe", { preHandler: authMiddleware }, async (req, reply) => {
        const body = req.body;
        if (!body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "draft") ||
            !("draft" in body))
            return reply.status(400).send({ error: "mcp_probe_request_invalid" });
        const validation = validateMcpConnectionDraft(body.draft);
        if (validation.reasonCodes.includes("mcp_draft_field_unknown"))
            return reply.status(400).send({ error: "mcp_probe_request_invalid" });
        const actorRef = probeActorForRequest(req);
        if (!actorRef)
            return reply.status(403).send({ error: "mcp_probe_actor_denied" });
        if (!validation.valid) {
            const rejected = {
                state: "rejected",
                ready: false,
                reasonCode: validation.reasonCodes[0] ?? "mcp_draft_invalid",
                tools: [],
                observedAt: now(),
            };
            mcpRouteLogger.product("MCP connection probe completed", {
                state: rejected.state,
                ready: false,
                toolCount: 0,
            });
            mcpRouteLogger.development("MCP probe validation detail", {
                reasonCodes: validation.reasonCodes,
            });
            return reply.status(422).send(rejected);
        }
        const controller = new AbortController();
        const raw = req.raw;
        const abort = () => controller.abort();
        raw?.once?.("aborted", abort);
        const startedAt = now();
        try {
            const receipt = await executeProbe({
                actorRef,
                draft: body.draft,
                defaultCwd: runtimeWorkspaceForRequest(req),
                signal: controller.signal,
            });
            mcpRouteLogger.product("MCP connection probe completed", {
                state: receipt.state,
                ready: receipt.ready,
                toolCount: receipt.tools.length,
            });
            mcpRouteLogger.fieldDebug("MCP connection probe detail", {
                transport: validation.draft?.transport ?? "invalid",
                durationMs: Math.max(0, now() - startedAt),
                reasonCode: receipt.reasonCode,
            });
            if (receipt.state === "rejected")
                return reply.status(422).send(receipt);
            if (receipt.state === "cancelled")
                return reply.status(408).send(receipt);
            return receipt;
        }
        catch {
            mcpRouteLogger.product("MCP connection probe failed", {
                reasonCode: "mcp_connection_probe_failed",
            });
            return reply.status(500).send({ error: "mcp_connection_probe_failed" });
        }
        finally {
            raw?.off?.("aborted", abort);
        }
    });
    const envelopeFrom = (value, actorRef) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return null;
        const envelope = value;
        const allowed = new Set([
            "scope",
            "mutationId",
            "targetRevision",
            "purpose",
            "issuedAt",
            "nonce",
        ]);
        if (Object.keys(envelope).some((key) => !allowed.has(key)))
            return null;
        if (typeof envelope.scope !== "string" ||
            typeof envelope.mutationId !== "string" ||
            typeof envelope.targetRevision !== "number" ||
            typeof envelope.purpose !== "string" ||
            typeof envelope.issuedAt !== "number" ||
            typeof envelope.nonce !== "string")
            return null;
        return {
            actorRef,
            scope: envelope.scope,
            mutationId: envelope.mutationId,
            targetRevision: envelope.targetRevision,
            purpose: envelope.purpose,
            issuedAt: envelope.issuedAt,
            nonce: envelope.nonce,
        };
    };
    const mutationStatus = (receipt, successStatus) => {
        if (receipt.state === "active")
            return successStatus;
        if (receipt.reasonCode === "mcp_ref_not_found" || receipt.reasonCode === "agent_ref_not_found")
            return 404;
        if (receipt.reasonCode === "mutation_scope_denied" ||
            receipt.reasonCode === "mutation_purpose_denied")
            return 403;
        if ([
            "mutation_revision_conflict",
            "capability_revision_conflict",
            "mutation_nonce_replayed",
            "mcp_name_duplicated",
            "mcp_public_ref_collision",
            "mcp_server_key_conflict",
            "mcp_delete_in_use",
        ].includes(receipt.reasonCode ?? ""))
            return 409;
        return 422;
    };
    if (typeof app.patch === "function")
        app.patch("/api/capabilities/mcp/:mcpRef/bindings/:agentRef", { preHandler: authMiddleware }, async (req, reply) => {
            if (!/^mcp_v1_[a-f0-9]{24}$/u.test(req.params.mcpRef) ||
                !/^agent_v1_[a-f0-9]{24}$/u.test(req.params.agentRef))
                return reply.status(400).send({ error: "mcp_binding_ref_invalid" });
            const body = req.body;
            if (!body ||
                typeof body !== "object" ||
                Array.isArray(body) ||
                Object.keys(body).some((key) => key !== "envelope" && key !== "bound") ||
                typeof body.bound !== "boolean")
                return reply.status(400).send({ error: "mcp_binding_request_invalid" });
            const actorRef = mutationActorForRequest(req);
            if (!actorRef)
                return reply.status(403).send({ error: "mcp_binding_actor_denied" });
            const envelope = envelopeFrom(body.envelope, actorRef);
            if (!envelope)
                return reply.status(400).send({ error: "mcp_binding_request_invalid" });
            try {
                const startedAt = now();
                const receipt = await executeBinding({
                    envelope,
                    mcpRef: req.params.mcpRef,
                    agentRef: req.params.agentRef,
                    action: body.bound ? "bind" : "unbind",
                });
                mcpRouteLogger.product("MCP agent binding completed", {
                    state: receipt.state,
                    reasonCode: receipt.reasonCode,
                    bound: receipt.bound,
                });
                mcpRouteLogger.fieldDebug("MCP agent binding receipt", {
                    mutationId: receipt.mutationId,
                    revision: receipt.revision,
                    durationMs: Math.max(0, now() - startedAt),
                    reasonCode: receipt.reasonCode,
                });
                mcpRouteLogger.development("MCP agent binding terminal detail", {
                    state: receipt.state,
                    allowedActions: receipt.allowedActions,
                });
                return reply.status(mutationStatus(receipt, 200)).send(receipt);
            }
            catch {
                mcpRouteLogger.product("MCP agent binding failed", { reasonCode: "mcp_binding_failed" });
                return reply.status(500).send({ error: "mcp_binding_failed" });
            }
        });
    if (mutationRuntime) {
        app.post("/api/capabilities/mcp", { preHandler: authMiddleware }, async (req, reply) => {
            const body = req.body;
            if (!body ||
                typeof body !== "object" ||
                Array.isArray(body) ||
                Object.keys(body).some((key) => key !== "envelope" && key !== "draft") ||
                !("envelope" in body) ||
                !("draft" in body))
                return reply.status(400).send({ error: "mcp_create_request_invalid" });
            const draftValidation = validateMcpConnectionDraft(body.draft);
            if (draftValidation.reasonCodes.includes("mcp_draft_field_unknown"))
                return reply.status(400).send({ error: "mcp_create_request_invalid" });
            const actorRef = mutationActorForRequest(req);
            if (!actorRef)
                return reply.status(403).send({ error: "mcp_create_actor_denied" });
            const envelope = envelopeFrom(body.envelope, actorRef);
            if (!envelope)
                return reply.status(400).send({ error: "mcp_create_request_invalid" });
            const controller = new AbortController();
            const raw = req.raw;
            const abort = () => controller.abort();
            raw?.once?.("aborted", abort);
            const startedAt = now();
            try {
                const receipt = await mutationRuntime.executeCreate({
                    envelope,
                    draft: body.draft,
                    signal: controller.signal,
                });
                mcpRouteLogger.product("MCP mutation completed", {
                    state: receipt.state,
                    reasonCode: receipt.reasonCode,
                });
                mcpRouteLogger.fieldDebug("MCP mutation receipt", {
                    mutationId: receipt.mutationId,
                    transport: draftValidation.draft?.transport ?? "invalid",
                    durationMs: Math.max(0, now() - startedAt),
                    reasonCode: receipt.reasonCode,
                });
                mcpRouteLogger.development("MCP mutation terminal detail", {
                    state: receipt.state,
                    reasonCode: receipt.reasonCode,
                    allowedActions: receipt.allowedActions,
                });
                return reply.status(mutationStatus(receipt, 201)).send(receipt);
            }
            catch {
                mcpRouteLogger.product("MCP mutation failed", { reasonCode: "mcp_create_failed" });
                return reply.status(500).send({ error: "mcp_create_failed" });
            }
            finally {
                raw?.off?.("aborted", abort);
            }
        });
        app.post("/api/capabilities/mcp/:mcpRef/probe", { preHandler: authMiddleware }, async (req, reply) => {
            if (!/^mcp_v1_[a-f0-9]{24}$/u.test(req.params.mcpRef))
                return reply.status(400).send({ error: "mcp_ref_invalid" });
            if (req.body &&
                (typeof req.body !== "object" ||
                    Array.isArray(req.body) ||
                    Object.keys(req.body).length > 0))
                return reply.status(400).send({ error: "mcp_existing_probe_request_invalid" });
            const actorRef = mutationActorForRequest(req);
            if (!actorRef)
                return reply.status(403).send({ error: "mcp_existing_probe_actor_denied" });
            const controller = new AbortController();
            const raw = req.raw;
            const abort = () => controller.abort();
            raw?.once?.("aborted", abort);
            const startedAt = now();
            try {
                const receipt = await mutationRuntime.inspectExisting({
                    mcpRef: req.params.mcpRef,
                    signal: controller.signal,
                });
                mcpRouteLogger.product("MCP saved connection probe completed", {
                    state: receipt.state,
                    ready: receipt.ready,
                });
                mcpRouteLogger.fieldDebug("MCP saved connection probe detail", {
                    durationMs: Math.max(0, now() - startedAt),
                    reasonCode: receipt.reasonCode,
                });
                if (receipt.state === "not_found")
                    return reply.status(404).send(receipt);
                if (receipt.state === "cancelled")
                    return reply.status(408).send(receipt);
                return receipt;
            }
            catch {
                mcpRouteLogger.product("MCP saved connection probe failed", {
                    reasonCode: "mcp_connection_probe_failed",
                });
                return reply.status(500).send({ error: "mcp_connection_probe_failed" });
            }
            finally {
                raw?.off?.("aborted", abort);
            }
        });
        app.post("/api/capabilities/mcp/:mcpRef/recover", { preHandler: authMiddleware }, async (req, reply) => {
            if (!/^mcp_v1_[a-f0-9]{24}$/u.test(req.params.mcpRef))
                return reply.status(400).send({ error: "mcp_ref_invalid" });
            const body = req.body;
            if (!body ||
                typeof body !== "object" ||
                Array.isArray(body) ||
                Object.keys(body).some((key) => key !== "envelope") ||
                !("envelope" in body))
                return reply.status(400).send({ error: "mcp_recovery_request_invalid" });
            const actorRef = mutationActorForRequest(req);
            if (!actorRef)
                return reply.status(403).send({ error: "mcp_recovery_actor_denied" });
            const envelope = envelopeFrom(body.envelope, actorRef);
            if (!envelope)
                return reply.status(400).send({ error: "mcp_recovery_request_invalid" });
            const controller = new AbortController();
            const raw = req.raw;
            const abort = () => controller.abort();
            raw?.once?.("aborted", abort);
            const startedAt = now();
            try {
                const receipt = await mutationRuntime.executeRecovery({
                    envelope,
                    mcpRef: req.params.mcpRef,
                    signal: controller.signal,
                });
                mcpRouteLogger.product("MCP recovery completed", {
                    state: receipt.state,
                    ready: receipt.ready,
                    reasonCode: receipt.reasonCode,
                });
                mcpRouteLogger.fieldDebug("MCP recovery receipt", {
                    mutationId: receipt.mutationId,
                    revision: receipt.revision,
                    toolCount: receipt.toolCount,
                    durationMs: Math.max(0, now() - startedAt),
                    reasonCode: receipt.reasonCode,
                });
                mcpRouteLogger.development("MCP recovery terminal detail", {
                    state: receipt.state,
                    allowedActions: receipt.allowedActions,
                });
                return reply.status(mutationStatus(receipt, 200)).send(receipt);
            }
            catch {
                mcpRouteLogger.product("MCP recovery failed", { reasonCode: "mcp_recovery_failed" });
                return reply.status(500).send({ error: "mcp_recovery_failed" });
            }
            finally {
                raw?.off?.("aborted", abort);
            }
        });
        if (typeof app.patch === "function")
            app.patch("/api/capabilities/mcp/:mcpRef", { preHandler: authMiddleware }, async (req, reply) => {
                if (!/^mcp_v1_[a-f0-9]{24}$/u.test(req.params.mcpRef))
                    return reply.status(400).send({ error: "mcp_ref_invalid" });
                const body = req.body;
                if (!body ||
                    typeof body !== "object" ||
                    Array.isArray(body) ||
                    Object.keys(body).some((key) => key !== "envelope" && key !== "draft" && key !== "change") ||
                    !("envelope" in body) ||
                    "draft" in body === "change" in body)
                    return reply.status(400).send({ error: "mcp_update_request_invalid" });
                const protectedChange = "change" in body;
                const shapeReason = protectedChange ? validateMcpProtectedUpdateShape(body.change) : null;
                const draftValidation = protectedChange ? null : validateMcpConnectionDraft(body.draft);
                if (shapeReason === "mcp_update_change_field_unknown" ||
                    shapeReason === "mcp_replacement_invalid" ||
                    draftValidation?.reasonCodes.includes("mcp_draft_field_unknown"))
                    return reply.status(400).send({ error: "mcp_update_request_invalid" });
                const actorRef = mutationActorForRequest(req);
                if (!actorRef)
                    return reply.status(403).send({ error: "mcp_update_actor_denied" });
                const envelope = envelopeFrom(body.envelope, actorRef);
                if (!envelope)
                    return reply.status(400).send({ error: "mcp_update_request_invalid" });
                const controller = new AbortController();
                const raw = req.raw;
                const abort = () => controller.abort();
                raw?.once?.("aborted", abort);
                const startedAt = now();
                try {
                    const receipt = protectedChange
                        ? await mutationRuntime.executeProtectedUpdate({
                            envelope,
                            mcpRef: req.params.mcpRef,
                            change: body.change,
                            signal: controller.signal,
                        })
                        : await mutationRuntime.executeUpdate({
                            envelope,
                            mcpRef: req.params.mcpRef,
                            draft: body.draft,
                            signal: controller.signal,
                        });
                    mcpRouteLogger.product("MCP update completed", {
                        state: receipt.state,
                        reasonCode: receipt.reasonCode,
                    });
                    mcpRouteLogger.fieldDebug("MCP update receipt", {
                        mutationId: receipt.mutationId,
                        transport: draftValidation?.draft?.transport ?? (protectedChange ? "protected" : "invalid"),
                        durationMs: Math.max(0, now() - startedAt),
                        reasonCode: receipt.reasonCode,
                    });
                    mcpRouteLogger.development("MCP update terminal detail", {
                        state: receipt.state,
                        reasonCode: receipt.reasonCode,
                        allowedActions: receipt.allowedActions,
                    });
                    return reply.status(mutationStatus(receipt, 200)).send(receipt);
                }
                catch {
                    mcpRouteLogger.product("MCP update failed", { reasonCode: "mcp_update_failed" });
                    return reply.status(500).send({ error: "mcp_update_failed" });
                }
                finally {
                    raw?.off?.("aborted", abort);
                }
            });
        if (typeof app.patch === "function")
            app.patch("/api/capabilities/mcp/:mcpRef/status", { preHandler: authMiddleware }, async (req, reply) => {
                if (!/^mcp_v1_[a-f0-9]{24}$/u.test(req.params.mcpRef))
                    return reply.status(400).send({ error: "mcp_ref_invalid" });
                const body = req.body;
                if (!body ||
                    typeof body !== "object" ||
                    Array.isArray(body) ||
                    Object.keys(body).some((key) => key !== "envelope" && key !== "enabled") ||
                    typeof body.enabled !== "boolean")
                    return reply.status(400).send({ error: "mcp_status_request_invalid" });
                const actorRef = mutationActorForRequest(req);
                if (!actorRef)
                    return reply.status(403).send({ error: "mcp_status_actor_denied" });
                const envelope = envelopeFrom(body.envelope, actorRef);
                if (!envelope)
                    return reply.status(400).send({ error: "mcp_status_request_invalid" });
                const controller = new AbortController();
                const raw = req.raw;
                const abort = () => controller.abort();
                raw?.once?.("aborted", abort);
                const startedAt = now();
                try {
                    const action = body.enabled ? "enable" : "disable";
                    const receipt = await mutationRuntime.executeLifecycle({
                        envelope,
                        mcpRef: req.params.mcpRef,
                        action,
                        signal: controller.signal,
                    });
                    mcpRouteLogger.product("MCP lifecycle completed", {
                        state: receipt.state,
                        status: receipt.status,
                        reasonCode: receipt.reasonCode,
                    });
                    mcpRouteLogger.fieldDebug("MCP lifecycle receipt", {
                        mutationId: receipt.mutationId,
                        action,
                        durationMs: Math.max(0, now() - startedAt),
                        reasonCode: receipt.reasonCode,
                    });
                    mcpRouteLogger.development("MCP lifecycle terminal detail", {
                        state: receipt.state,
                        allowedActions: receipt.allowedActions,
                    });
                    return reply.status(mutationStatus(receipt, 200)).send(receipt);
                }
                catch {
                    mcpRouteLogger.product("MCP lifecycle failed", { reasonCode: "mcp_lifecycle_failed" });
                    return reply.status(500).send({ error: "mcp_lifecycle_failed" });
                }
                finally {
                    raw?.off?.("aborted", abort);
                }
            });
        if (typeof app.delete === "function")
            app.delete("/api/capabilities/mcp/:mcpRef", { preHandler: authMiddleware }, async (req, reply) => {
                if (!/^mcp_v1_[a-f0-9]{24}$/u.test(req.params.mcpRef))
                    return reply.status(400).send({ error: "mcp_ref_invalid" });
                const body = req.body;
                if (!body ||
                    typeof body !== "object" ||
                    Array.isArray(body) ||
                    Object.keys(body).some((key) => key !== "envelope") ||
                    !("envelope" in body))
                    return reply.status(400).send({ error: "mcp_delete_request_invalid" });
                const actorRef = mutationActorForRequest(req);
                if (!actorRef)
                    return reply.status(403).send({ error: "mcp_delete_actor_denied" });
                const envelope = envelopeFrom(body.envelope, actorRef);
                if (!envelope)
                    return reply.status(400).send({ error: "mcp_delete_request_invalid" });
                const controller = new AbortController();
                const raw = req.raw;
                const abort = () => controller.abort();
                raw?.once?.("aborted", abort);
                const startedAt = now();
                try {
                    const receipt = await mutationRuntime.executeLifecycle({
                        envelope,
                        mcpRef: req.params.mcpRef,
                        action: "delete",
                        signal: controller.signal,
                    });
                    mcpRouteLogger.product("MCP delete completed", {
                        state: receipt.state,
                        deleted: receipt.deleted,
                        bindingCount: receipt.impact.bindingCount,
                        reasonCode: receipt.reasonCode,
                    });
                    mcpRouteLogger.fieldDebug("MCP delete receipt", {
                        mutationId: receipt.mutationId,
                        durationMs: Math.max(0, now() - startedAt),
                        reasonCode: receipt.reasonCode,
                    });
                    mcpRouteLogger.development("MCP delete terminal detail", {
                        state: receipt.state,
                        allowedActions: receipt.allowedActions,
                    });
                    return reply.status(mutationStatus(receipt, 200)).send(receipt);
                }
                catch {
                    mcpRouteLogger.product("MCP delete failed", { reasonCode: "mcp_delete_failed" });
                    return reply.status(500).send({ error: "mcp_delete_failed" });
                }
                finally {
                    raw?.off?.("aborted", abort);
                }
            });
    }
    app.get("/api/mcp/servers", { preHandler: authMiddleware }, async () => {
        return buildMcpServersResponse();
    });
    app.post("/api/mcp/reload", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        try {
            if (options.mcpProcessEnv)
                await mcpRegistry.reloadFromConfig(config, { ...options.mcpProcessEnv });
            else
                await mcpRegistry.reloadFromConfig(config);
            return {
                ...buildMcpServersResponse(),
                runtimeConfigSource: "startup_snapshot",
                runtimeConfigApplied: true,
                configCommand: buildRuntimeAppliedConfigurationCommand("mcp.reload"),
            };
        }
        catch {
            return reply.status(500).send({
                error: "mcp_runtime_reload_failed",
                runtimeConfigSource: "startup_snapshot",
                runtimeConfigApplied: false,
                configCommand: buildRuntimeFailedConfigurationCommand("mcp.reload", "mcp_runtime_reload_failed"),
            });
        }
    });
}
//# sourceMappingURL=mcp.js.map