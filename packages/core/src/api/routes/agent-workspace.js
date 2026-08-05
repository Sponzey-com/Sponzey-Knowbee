import { randomUUID } from "node:crypto";
import { queryAgentCapabilityBindings, } from "../../agents/agent-capability-binding-projection.js";
import { publicAgentIdentityReceipt, } from "../../agents/agent-identity-command.js";
import { projectAgentOperationalSettingsMutationLog, } from "../../agents/agent-operational-settings-command.js";
import { queryAgentRelationshipProjection, } from "../../agents/agent-relationship-projection.js";
import { projectAgentWorkspaceQueryLog, queryAgentWorkspace, resolveAgentWorkspaceDetail, } from "../../agents/agent-workspace-query.js";
import { authMiddleware } from "../middleware/auth.js";
function capabilityKind(value) {
    return value === "skill" || value === "mcp_server" || value === "yeonjang" ? value : null;
}
function capabilityRefValid(kind, value) {
    if (kind === "skill")
        return /^skill_v1_[a-f0-9]{24}$/u.test(value);
    if (kind === "mcp_server")
        return /^mcp_v1_[a-f0-9]{24}$/u.test(value);
    return /^yeonjang_v1_[a-f0-9]{24}$/u.test(value);
}
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function requiredText(value) {
    return typeof value === "string" && value.trim() ? value : null;
}
function onlyKeys(value, allowed) {
    const allowlist = new Set(allowed);
    return Object.keys(value).every((key) => allowlist.has(key));
}
function capabilityRiskLevel(value) {
    return (value === "safe" ||
        value === "moderate" ||
        value === "external" ||
        value === "sensitive" ||
        value === "dangerous");
}
function operationalSettingsCommand(input) {
    const body = record(input.body);
    if (!onlyKeys(body, ["kind", "targetRevision", "value", "confirmElevation"]))
        return null;
    if (!Number.isInteger(body.targetRevision) || body.targetRevision < 1)
        return null;
    const requestKeyValue = input.request.headers["idempotency-key"];
    const requestKey = Array.isArray(requestKeyValue) ? requestKeyValue[0] : requestKeyValue;
    if (requestKey !== undefined && !/^[a-zA-Z0-9._:-]{8,128}$/u.test(requestKey))
        return null;
    const mutationId = requestKey ? `agent-settings:${requestKey}` : input.createMutationId();
    const envelope = {
        actorRef: "webui",
        scope: body.confirmElevation === true
            ? "agent_permission:elevate"
            : "agent_settings:write",
        mutationId,
        targetRevision: body.targetRevision,
        purpose: `agent_settings_${String(body.kind)}`,
        issuedAt: input.now,
        nonce: mutationId,
    };
    if (body.kind === "clear_model") {
        if (body.value !== undefined || body.confirmElevation !== undefined)
            return null;
        return { kind: "clear_model", agentRef: input.agentRef, envelope };
    }
    const value = record(body.value);
    if (body.kind === "update_model") {
        if (body.confirmElevation !== undefined ||
            !onlyKeys(value, ["providerName", "modelName", "effort", "fallbackModelName"]))
            return null;
        return {
            kind: "update_model",
            agentRef: input.agentRef,
            envelope,
            value: {
                providerName: typeof value.providerName === "string" ? value.providerName : "",
                modelName: typeof value.modelName === "string" ? value.modelName : "",
                ...(typeof value.effort === "string" ? { effort: value.effort } : {}),
                ...(typeof value.fallbackModelName === "string"
                    ? { fallbackModelName: value.fallbackModelName }
                    : {}),
            },
        };
    }
    if (body.kind === "update_memory") {
        if (body.confirmElevation !== undefined ||
            !onlyKeys(value, [
                "retentionPolicy",
                "capsuleMode",
                "rawWindowSize",
                "compactThreshold",
                "writebackReviewRequired",
            ]) ||
            (value.retentionPolicy !== "session" &&
                value.retentionPolicy !== "short_term" &&
                value.retentionPolicy !== "long_term") ||
            (value.capsuleMode !== "session_compaction" && value.capsuleMode !== "rolling_summary") ||
            typeof value.rawWindowSize !== "number" ||
            typeof value.compactThreshold !== "number" ||
            typeof value.writebackReviewRequired !== "boolean")
            return null;
        return {
            kind: "update_memory",
            agentRef: input.agentRef,
            envelope,
            value: {
                retentionPolicy: value.retentionPolicy,
                capsuleMode: value.capsuleMode,
                rawWindowSize: value.rawWindowSize,
                compactThreshold: value.compactThreshold,
                writebackReviewRequired: value.writebackReviewRequired,
            },
        };
    }
    if (body.kind === "update_permission") {
        if ((body.confirmElevation !== undefined && typeof body.confirmElevation !== "boolean") ||
            !onlyKeys(value, [
                "riskCeiling",
                "approvalRequiredFrom",
                "allowExternalNetwork",
                "allowFilesystemWrite",
                "allowShellExecution",
                "allowScreenControl",
            ]) ||
            !capabilityRiskLevel(value.riskCeiling) ||
            !capabilityRiskLevel(value.approvalRequiredFrom) ||
            typeof value.allowExternalNetwork !== "boolean" ||
            typeof value.allowFilesystemWrite !== "boolean" ||
            typeof value.allowShellExecution !== "boolean" ||
            typeof value.allowScreenControl !== "boolean")
            return null;
        return {
            kind: "update_permission",
            agentRef: input.agentRef,
            envelope,
            value: {
                riskCeiling: value.riskCeiling,
                approvalRequiredFrom: value.approvalRequiredFrom,
                allowExternalNetwork: value.allowExternalNetwork,
                allowFilesystemWrite: value.allowFilesystemWrite,
                allowShellExecution: value.allowShellExecution,
                allowScreenControl: value.allowScreenControl,
            },
        };
    }
    return null;
}
function operationalSettingsStatus(receipt) {
    if (receipt.state === "active")
        return 200;
    if (receipt.state === "conflict")
        return 409;
    if (receipt.reasonCode === "agent_ref_not_found")
        return 404;
    if (receipt.reasonCode === "agent_settings_inactive")
        return 410;
    if (receipt.reasonCode === "mutation_scope_denied")
        return 403;
    if (receipt.reasonCode?.endsWith("_invalid") || receipt.reasonCode === "agent_ref_invalid")
        return 400;
    return 422;
}
function mutationEnvelope(value) {
    const body = record(value);
    const envelope = record(body.mutation);
    const mutationId = requiredText(envelope.mutationId);
    const nonce = requiredText(envelope.nonce);
    const actorRef = requiredText(envelope.actorRef);
    if (!mutationId || !nonce || !actorRef || envelope.scope !== "agent_identity")
        return null;
    return { mutationId, nonce, actorRef, scope: "agent_identity" };
}
function mutationStatus(receipt) {
    if (receipt.state === "active")
        return 200;
    if (receipt.state === "conflict")
        return 409;
    return 400;
}
function executeMutation(request, reply, options, command) {
    if (!command || !options.executeIdentityCommand)
        return reply.status(400).send({ error: "agent_mutation_invalid" });
    const receipt = options.executeIdentityCommand(request, command);
    options.logger?.product({
        level: "product",
        status: receipt.state,
        kind: receipt.kind,
        ...(receipt.name ? { name: receipt.name } : {}),
        ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
    });
    options.logger?.fieldDebug({
        level: "field_debug",
        status: receipt.state,
        kind: receipt.kind,
        transitions: receipt.transitions,
        ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
    });
    if (receipt.state !== "active")
        options.logger?.development({
            level: "development",
            transition: receipt.transitions.at(-1),
            kind: receipt.kind,
            ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
        });
    return reply.status(mutationStatus(receipt)).send(publicAgentIdentityReceipt(receipt));
}
function queryInput(value) {
    const query = value && typeof value === "object" ? value : {};
    const limit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : undefined;
    const status = query.status === "enabled" ||
        query.status === "disabled" ||
        query.status === "archived" ||
        query.status === "degraded"
        ? query.status
        : undefined;
    return {
        ...(typeof query.search === "string" ? { search: query.search } : {}),
        ...(status ? { status } : {}),
        ...(typeof query.cursor === "string" ? { cursor: query.cursor } : {}),
        ...(typeof limit === "number" && Number.isFinite(limit) ? { limit } : {}),
    };
}
export function registerAgentWorkspaceRoute(app, options) {
    app.post("/api/agent-workspace", { preHandler: authMiddleware }, async (request, reply) => {
        const body = record(request.body);
        const envelope = mutationEnvelope(request.body);
        const name = typeof body.name === "string" ? body.name : null;
        const role = typeof body.role === "string" ? body.role : null;
        return executeMutation(request, reply, options, envelope && name !== null && role !== null
            ? {
                kind: "create",
                envelope,
                name,
                role,
                ...(requiredText(body.modelName)
                    ? { modelName: requiredText(body.modelName) }
                    : {}),
            }
            : null);
    });
    app.get("/api/agent-workspace", { preHandler: authMiddleware }, async (request, reply) => {
        const startedAt = (options.now ?? Date.now)();
        const input = queryInput(request.query);
        const result = queryAgentWorkspace(options.projection(request), input);
        const logInput = {
            status: result.cursorValid ? "passed" : "failed",
            resultCount: result.items.length,
            durationMs: Math.max(0, (options.now ?? Date.now)() - startedAt),
            filterCount: Number(Boolean(input.search)) + Number(Boolean(input.status)),
            ...(!result.cursorValid ? { reasonCode: "agent_cursor_invalid" } : {}),
        };
        options.logger?.product(projectAgentWorkspaceQueryLog({ ...logInput, level: "product" }));
        options.logger?.fieldDebug(projectAgentWorkspaceQueryLog({ ...logInput, level: "field_debug" }));
        if (!result.cursorValid) {
            options.logger?.development(projectAgentWorkspaceQueryLog({ ...logInput, level: "development" }));
            return reply.status(400).send({ error: "agent_cursor_invalid" });
        }
        return result;
    });
    app.get("/api/agent-workspace/:agentRef/settings", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        if (!options.settingsProjection)
            return reply.status(501).send({ error: "agent_settings_query_unavailable" });
        const projection = options.settingsProjection(request, request.params.agentRef);
        if (!projection) {
            const fields = { status: "failed", reasonCode: "agent_ref_not_found" };
            options.logger?.product({ level: "product", ...fields });
            options.logger?.fieldDebug({ level: "field_debug", ...fields });
            options.logger?.development({ level: "development", ...fields });
            return reply.status(404).send({ error: "agent_ref_not_found" });
        }
        const fields = {
            status: projection.status === "archived" ? "failed" : "passed",
            agentStatus: projection.status,
            revision: projection.revision,
            diagnosticCount: projection.diagnosticCodes.length,
            ...(projection.status === "archived" ? { reasonCode: "agent_archived" } : {}),
        };
        options.logger?.product({ level: "product", ...fields });
        options.logger?.fieldDebug({ level: "field_debug", ...fields });
        if (projection.status === "archived") {
            options.logger?.development({ level: "development", ...fields });
            return reply.status(410).send({ error: "agent_archived" });
        }
        return projection;
    });
    app.patch("/api/agent-workspace/:agentRef/settings", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        if (!options.executeOperationalSettingsCommand)
            return reply.status(501).send({ error: "agent_settings_mutation_unavailable" });
        const command = operationalSettingsCommand({
            request,
            agentRef: request.params.agentRef,
            body: request.body,
            now: (options.now ?? Date.now)(),
            createMutationId: options.createMutationId ?? randomUUID,
        });
        if (!command)
            return reply.status(400).send({ error: "agent_settings_request_invalid" });
        const receipt = await options.executeOperationalSettingsCommand(request, command);
        options.logger?.product(projectAgentOperationalSettingsMutationLog("product", receipt));
        options.logger?.fieldDebug(projectAgentOperationalSettingsMutationLog("field_debug", receipt));
        if (receipt.state !== "active")
            options.logger?.development(projectAgentOperationalSettingsMutationLog("development", receipt));
        return reply.status(operationalSettingsStatus(receipt)).send(receipt);
    });
    app.get("/api/agent-workspace/:agentRef", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        const detail = resolveAgentWorkspaceDetail(options.projection(request), request.params.agentRef);
        return detail ?? reply.status(404).send({ error: "agent_ref_not_found" });
    });
    app.get("/api/agent-workspace/:agentRef/capabilities", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        if (!options.capabilityProjection)
            return reply.status(501).send({ error: "agent_capability_query_unavailable" });
        const projection = options.capabilityProjection(request, request.params.agentRef);
        if (!projection)
            return reply.status(404).send({ error: "agent_ref_not_found" });
        const query = record(request.query);
        const kind = query.kind === undefined ? undefined : capabilityKind(query.kind);
        if (query.kind !== undefined && !kind)
            return reply.status(400).send({ error: "capability_kind_invalid" });
        const limit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : undefined;
        return queryAgentCapabilityBindings(projection, {
            ...(typeof query.search === "string" ? { search: query.search } : {}),
            ...(kind ? { kind } : {}),
            ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
        });
    });
    app.get("/api/agent-workspace/relationships", { preHandler: authMiddleware }, async (request, reply) => {
        if (!options.relationshipProjection)
            return reply.status(501).send({ error: "agent_relationship_query_unavailable" });
        const query = record(request.query);
        const limit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : undefined;
        return queryAgentRelationshipProjection(options.relationshipProjection(request), {
            ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
        });
    });
    app.patch("/api/agent-workspace/:childRef/parent", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.childRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        const body = record(request.body);
        const kind = body.kind === "connect" || body.kind === "reparent" || body.kind === "disconnect"
            ? body.kind
            : null;
        const parentRef = body.parentRef === null ? null : requiredText(body.parentRef);
        const mutation = record(body.mutation);
        if (!kind ||
            (kind === "disconnect" ? body.parentRef !== null : !parentRef) ||
            (parentRef !== null && !/^agent_v1_[a-f0-9]{24}$/u.test(parentRef)) ||
            !requiredText(mutation.actorRef) ||
            mutation.scope !== "agent_relationship:write" ||
            !requiredText(mutation.mutationId) ||
            !Number.isInteger(mutation.targetRevision) ||
            !requiredText(mutation.purpose) ||
            typeof mutation.issuedAt !== "number" ||
            !Number.isFinite(mutation.issuedAt) ||
            !requiredText(mutation.nonce) ||
            !options.executeRelationshipCommand)
            return reply.status(400).send({ error: "agent_relationship_request_invalid" });
        const receipt = await options.executeRelationshipCommand(request, {
            kind,
            childRef: request.params.childRef,
            parentRef,
            envelope: {
                actorRef: mutation.actorRef,
                scope: "agent_relationship:write",
                mutationId: mutation.mutationId,
                targetRevision: mutation.targetRevision,
                purpose: mutation.purpose,
                issuedAt: mutation.issuedAt,
                nonce: mutation.nonce,
            },
        });
        const fields = {
            kind: receipt.kind,
            state: receipt.state,
            revision: receipt.revision,
            ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
        };
        options.logger?.product({ level: "product", ...fields });
        options.logger?.fieldDebug({ level: "field_debug", ...fields });
        if (receipt.state !== "active")
            options.logger?.development({ level: "development", ...fields });
        const status = receipt.state === "active" ? 200 : receipt.state === "conflict" ? 409 : 422;
        return reply.status(status).send(receipt);
    });
    app.patch("/api/agent-workspace/:agentRef/capabilities/:capabilityRef", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        const body = record(request.body);
        const kind = capabilityKind(body.kind);
        const envelope = record(body.mutation);
        if (!kind ||
            !capabilityRefValid(kind, request.params.capabilityRef) ||
            typeof body.bound !== "boolean" ||
            !requiredText(envelope.actorRef) ||
            envelope.scope !== "capability:write" ||
            !requiredText(envelope.mutationId) ||
            typeof envelope.targetRevision !== "number" ||
            !requiredText(envelope.purpose) ||
            typeof envelope.issuedAt !== "number" ||
            !requiredText(envelope.nonce) ||
            !options.executeCapabilityBindingCommand)
            return reply.status(400).send({ error: "agent_capability_binding_request_invalid" });
        const receipt = await options.executeCapabilityBindingCommand(request, {
            kind,
            agentRef: request.params.agentRef,
            capabilityRef: request.params.capabilityRef,
            bound: body.bound,
            envelope: {
                actorRef: envelope.actorRef,
                scope: "capability:write",
                mutationId: envelope.mutationId,
                targetRevision: envelope.targetRevision,
                purpose: envelope.purpose,
                issuedAt: envelope.issuedAt,
                nonce: envelope.nonce,
            },
        });
        options.logger?.product({
            level: "product",
            kind: receipt.kind,
            state: receipt.state,
            ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
        });
        options.logger?.fieldDebug({
            level: "field_debug",
            kind: receipt.kind,
            state: receipt.state,
            revision: receipt.revision,
            ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
        });
        if (receipt.state !== "active")
            options.logger?.development({
                level: "development",
                transition: receipt.state,
                kind: receipt.kind,
                ...(receipt.reasonCode ? { reasonCode: receipt.reasonCode } : {}),
            });
        const status = receipt.state === "active" ? 200 : receipt.state === "conflict" ? 409 : 422;
        return reply.status(status).send(receipt);
    });
    app.patch("/api/agent-workspace/:agentRef", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        const body = record(request.body);
        const envelope = mutationEnvelope(request.body);
        const name = typeof body.name === "string" ? body.name : null;
        const role = typeof body.role === "string" ? body.role : null;
        const baseRevision = typeof body.baseRevision === "number" && Number.isInteger(body.baseRevision)
            ? body.baseRevision
            : null;
        return executeMutation(request, reply, options, envelope && name !== null && role !== null && baseRevision !== null
            ? {
                kind: "update",
                envelope,
                agentRef: request.params.agentRef,
                baseRevision,
                name,
                role,
            }
            : null);
    });
    app.post("/api/agent-workspace/:agentRef/archive", { preHandler: authMiddleware }, async (request, reply) => {
        if (!/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef))
            return reply.status(400).send({ error: "agent_ref_invalid" });
        const body = record(request.body);
        const envelope = mutationEnvelope(request.body);
        const baseRevision = typeof body.baseRevision === "number" && Number.isInteger(body.baseRevision)
            ? body.baseRevision
            : null;
        return executeMutation(request, reply, options, envelope && baseRevision !== null
            ? {
                kind: "archive",
                envelope,
                agentRef: request.params.agentRef,
                baseRevision,
                confirmed: body.confirmed === true,
            }
            : null);
    });
}
//# sourceMappingURL=agent-workspace.js.map