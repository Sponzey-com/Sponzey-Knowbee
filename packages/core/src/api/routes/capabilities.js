import { randomUUID } from "node:crypto";
import { authMiddleware, getApiAuthenticationPrincipal } from "../middleware/auth.js";
import { createCapabilities } from "../../control-plane/index.js";
import { resolveOrchestrationModeSnapshotSync } from "../../orchestration/mode.js";
import { getApiRuntimeConfig } from "../runtime-context.js";
import { getCapabilityMutationReceiptByNonce, listAgentCapabilityBindings, listAgentConfigs, listSkillCatalogEntries, reserveCapabilityMutationReceipt, updateCapabilityMutationReceipt, upsertAgentCapabilityBinding, upsertSkillCatalogEntry } from "../../db/index.js";
import { buildSkillCatalogPage, } from "../../capabilities/skill-catalog-query.js";
import { createSkillPublicRef } from "../../capabilities/skill-public-reference.js";
import { createAgentPublicRef } from "../../capabilities/agent-public-reference.js";
import { buildSkillBindingProjection } from "../../capabilities/skill-binding-projection.js";
import { inspectLocalSkillSource } from "../../capabilities/skill-source-filesystem.js";
import { evaluateSkillSourceValidation } from "../../capabilities/skill-source-validation.js";
import { executeSkillCreateCommand } from "../../capabilities/skill-create-command.js";
import { executeSkillUpdateCommand } from "../../capabilities/skill-update-command.js";
import { executeSkillBindingCommand } from "../../capabilities/skill-binding-command.js";
import { executeSkillDeleteCommand } from "../../capabilities/skill-delete-command.js";
import { createLogger } from "../../logger/index.js";
const capabilityLogger = createLogger("api:capabilities");
const defaultSkillCatalogRepository = {
    listSkills: () => listSkillCatalogEntries(),
    listBindings: () => listAgentCapabilityBindings({ capabilityKind: "skill" }),
};
function buildCapabilitiesResponse(options, config) {
    return {
        items: createCapabilities({ ...options, config }),
        orchestration: resolveOrchestrationModeSnapshotSync({ config }),
        generatedAt: Date.now(),
    };
}
export function registerCapabilitiesRoute(app, options = {}) {
    const skillCatalogRepository = options.skillCatalogRepository ?? defaultSkillCatalogRepository;
    const skillBindingProjectionRepository = options.skillBindingProjectionRepository ?? { listAgents: () => listAgentConfigs(), listBindings: () => listAgentCapabilityBindings({ capabilityKind: "skill", includeArchived: true }) };
    const skillPublicRefForId = options.skillPublicRefForId ?? createSkillPublicRef;
    const agentPublicRefForId = options.agentPublicRefForId ?? createAgentPublicRef;
    const skillSourceInspector = options.skillSourceInspector ?? inspectLocalSkillSource;
    const runtimeConfigForRequest = options.runtimeConfigForRequest ?? ((request) => getApiRuntimeConfig(request));
    const now = options.now ?? Date.now;
    const mutationActorForRequest = options.mutationActorForRequest ?? ((request) => {
        const principal = getApiAuthenticationPrincipal(request);
        if (principal)
            return principal.principalRef;
        const address = request.socket?.remoteAddress ?? "";
        return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address) ? "api:localhost-owner" : null;
    });
    const currentSkillRevision = () => Math.max(listSkillCatalogEntries({ includeArchived: true }).reduce((revision, row) => Math.max(revision, row.updated_at), 0), listAgentCapabilityBindings({ capabilityKind: "skill", includeArchived: true }).reduce((revision, row) => Math.max(revision, row.updated_at), 0));
    const reserveSkillReceipt = ({ envelope, state, now: reservedAt }) => reserveCapabilityMutationReceipt({ mutationId: envelope.mutationId, nonce: envelope.nonce, actorRef: envelope.actorRef, scope: envelope.scope, purpose: envelope.purpose, capabilityKind: "skill", targetRevision: envelope.targetRevision, state, now: reservedAt });
    const updateSkillReceipt = (receipt) => { updateCapabilityMutationReceipt(receipt); };
    const executeCreate = options.skillCreateExecutor ?? (async (input) => executeSkillCreateCommand({ envelope: input.envelope, draft: input.draft }, {
        now,
        currentRevision: currentSkillRevision,
        nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)),
        reserveReceipt: reserveSkillReceipt,
        updateReceipt: updateSkillReceipt,
        existingNames: () => listSkillCatalogEntries().map((row) => row.display_name),
        inspectSource: ({ requestedPath }) => skillSourceInspector({ requestedPath, allowedRoots: input.allowedRoots }),
        createInternalSkillId: () => randomUUID(),
        persist: ({ internalSkillId, skillKind, draft, canonicalPath, expectedRevision, targetRevision }) => {
            const actualRevision = currentSkillRevision();
            if (actualRevision !== expectedRevision)
                return { ok: false, revision: actualRevision, reasonCode: "mutation_revision_conflict" };
            upsertSkillCatalogEntry({ skillId: internalSkillId, displayName: draft.displayName, status: "enabled", metadata: { skillKind, description: draft.description.trim(), sourceKind: draft.sourceKind, ...(canonicalPath ? { canonicalPath } : {}) }, updatedAt: targetRevision }, { source: "manual", now: targetRevision });
            return { ok: true, revision: targetRevision };
        },
        apply: () => ({ ok: true }),
        verify: ({ internalSkillId, targetRevision }) => ({ ok: listSkillCatalogEntries({ includeArchived: true }).some((row) => row.skill_id === internalSkillId && row.status === "enabled" && row.updated_at === targetRevision), reasonCode: "skill_catalog_verify_failed" }),
        rollback: ({ internalSkillId, baseRevision }) => {
            const row = listSkillCatalogEntries({ includeArchived: true }).find((item) => item.skill_id === internalSkillId);
            if (!row)
                return { ok: true };
            upsertSkillCatalogEntry({ skillId: internalSkillId, displayName: row.display_name, status: "archived", updatedAt: baseRevision }, { source: "manual", now: baseRevision });
            return { ok: true };
        },
        publicRefForSkillId: skillPublicRefForId,
    }));
    const parseObject = (value) => {
        if (!value)
            return {};
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    };
    const parseStringArray = (value) => {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
        }
        catch {
            return [];
        }
    };
    const resolveUpdateSnapshot = (skillRef) => {
        const matches = listSkillCatalogEntries({ includeArchived: true }).filter((row) => skillPublicRefForId(row.skill_id) === skillRef && row.status !== "archived");
        if (matches.length !== 1)
            return null;
        const row = matches[0];
        const metadata = parseObject(row.metadata_json);
        return { internalSkillId: row.skill_id, skillRef, displayName: row.display_name, description: typeof metadata.description === "string" ? metadata.description : "", sourceKind: metadata.builtin === true || metadata.sourceKind === "builtin" ? "builtin" : "local", runtimeStatus: row.status === "enabled" ? "active" : "inactive", revision: row.updated_at };
    };
    const writeUpdateSnapshot = (input) => {
        const row = listSkillCatalogEntries({ includeArchived: true }).find((item) => item.skill_id === input.internalSkillId);
        if (!row)
            return false;
        upsertSkillCatalogEntry({ skillId: row.skill_id, displayName: input.displayName, status: input.runtimeStatus === "active" ? "enabled" : "disabled", risk: row.risk, toolNames: parseStringArray(row.tool_names_json), metadata: { ...parseObject(row.metadata_json), description: input.description }, createdAt: row.created_at, updatedAt: input.revision }, { source: row.source, auditId: row.audit_id, now: input.revision });
        return true;
    };
    const executeUpdate = options.skillUpdateExecutor ?? (async (input) => executeSkillUpdateCommand(input, {
        now,
        currentRevision: currentSkillRevision,
        nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)),
        reserveReceipt: reserveSkillReceipt,
        updateReceipt: updateSkillReceipt,
        resolveSkill: resolveUpdateSnapshot,
        existingNames: () => listSkillCatalogEntries().map((row) => ({ internalSkillId: row.skill_id, displayName: row.display_name })),
        persist: ({ internalSkillId, displayName, description, runtimeStatus, expectedRevision, targetRevision }) => {
            const actualRevision = currentSkillRevision();
            if (actualRevision !== expectedRevision)
                return { ok: false, revision: actualRevision, reasonCode: "mutation_revision_conflict" };
            return writeUpdateSnapshot({ internalSkillId, displayName, description, runtimeStatus, revision: targetRevision }) ? { ok: true, revision: targetRevision } : { ok: false, revision: actualRevision, reasonCode: "skill_ref_not_found" };
        },
        apply: () => ({ ok: true }),
        verify: ({ internalSkillId, displayName, description, runtimeStatus, targetRevision }) => {
            const current = resolveUpdateSnapshot(skillPublicRefForId(internalSkillId));
            return { ok: Boolean(current && current.displayName === displayName && current.description === description && current.runtimeStatus === runtimeStatus && current.revision === targetRevision), reasonCode: "skill_update_verify_failed" };
        },
        rollback: ({ snapshot, baseRevision }) => ({ ok: writeUpdateSnapshot({ internalSkillId: snapshot.internalSkillId, displayName: snapshot.displayName, description: snapshot.description, runtimeStatus: snapshot.runtimeStatus, revision: baseRevision }), reasonCode: "skill_update_rollback_failed" }),
    }));
    const resolveAgent = (agentRef) => {
        const matches = listAgentConfigs({ enabledOnly: true }).filter((agent) => agentPublicRefForId(agent.agent_id) === agentRef);
        return matches.length === 1 ? { internalAgentId: matches[0].agent_id, name: matches[0].agent_name } : null;
    };
    const writeBinding = (input) => {
        const existing = listAgentCapabilityBindings({ capabilityKind: "skill", includeArchived: true }).find((binding) => binding.agent_id === input.internalAgentId && binding.catalog_id === input.internalSkillId);
        upsertAgentCapabilityBinding({
            ...(existing ? { bindingId: existing.binding_id, enabledToolNames: parseStringArray(existing.enabled_tool_names_json), disabledToolNames: parseStringArray(existing.disabled_tool_names_json), createdAt: existing.created_at } : {}),
            ...(existing?.secret_scope_id ? { secretScopeId: existing.secret_scope_id } : {}),
            ...(existing?.permission_profile_json ? { permissionProfile: parseObject(existing.permission_profile_json) } : {}),
            ...(existing?.rate_limit_json ? { rateLimit: parseObject(existing.rate_limit_json) } : {}),
            ...(existing?.approval_required_from ? { approvalRequiredFrom: existing.approval_required_from } : {}),
            agentId: input.internalAgentId, capabilityKind: "skill", catalogId: input.internalSkillId, status: input.enabled ? "enabled" : "archived", updatedAt: input.revision,
        }, { source: existing?.source ?? "manual", auditId: existing?.audit_id ?? null, now: input.revision });
        return true;
    };
    const executeBinding = options.skillBindingExecutor ?? (async (input) => executeSkillBindingCommand(input, {
        now, currentRevision: currentSkillRevision, nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)), reserveReceipt: reserveSkillReceipt, updateReceipt: updateSkillReceipt,
        resolveSkill: (skillRef) => { const skill = resolveUpdateSnapshot(skillRef); return skill ? { internalSkillId: skill.internalSkillId, active: skill.runtimeStatus === "active" } : null; },
        resolveAgent,
        bindingEnabled: ({ internalSkillId, internalAgentId }) => listAgentCapabilityBindings({ capabilityKind: "skill", includeArchived: true }).some((binding) => binding.catalog_id === internalSkillId && binding.agent_id === internalAgentId && binding.status === "enabled"),
        persist: ({ internalSkillId, internalAgentId, enabled, expectedRevision, targetRevision }) => currentSkillRevision() === expectedRevision && writeBinding({ internalSkillId, internalAgentId, enabled, revision: targetRevision }) ? { ok: true, revision: targetRevision } : { ok: false, revision: currentSkillRevision(), reasonCode: "mutation_revision_conflict" },
        verify: ({ internalSkillId, internalAgentId, enabled, targetRevision }) => { const binding = listAgentCapabilityBindings({ capabilityKind: "skill", includeArchived: true }).find((item) => item.catalog_id === internalSkillId && item.agent_id === internalAgentId); return { ok: Boolean(binding && (binding.status === "enabled") === enabled && binding.updated_at === targetRevision), reasonCode: "skill_binding_verify_failed" }; },
        rollback: ({ internalSkillId, internalAgentId, enabled, baseRevision }) => ({ ok: writeBinding({ internalSkillId, internalAgentId, enabled, revision: baseRevision }), reasonCode: "skill_binding_rollback_failed" }),
    }));
    const executeDelete = options.skillDeleteExecutor ?? (async (input) => executeSkillDeleteCommand(input, {
        now, currentRevision: currentSkillRevision, nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)), reserveReceipt: reserveSkillReceipt, updateReceipt: updateSkillReceipt,
        resolveSkill: (skillRef) => { const skill = resolveUpdateSnapshot(skillRef); return skill ? { internalSkillId: skill.internalSkillId, skillRef, displayName: skill.displayName, description: skill.description, sourceKind: skill.sourceKind, runtimeStatus: skill.runtimeStatus, revision: skill.revision } : null; },
        boundAgentNames: (internalSkillId) => { const ids = new Set(listAgentCapabilityBindings({ capabilityKind: "skill", enabledOnly: true }).filter((binding) => binding.catalog_id === internalSkillId).map((binding) => binding.agent_id)); return listAgentConfigs({ enabledOnly: true }).filter((agent) => ids.has(agent.agent_id)).map((agent) => agent.agent_name); },
        persistArchive: ({ snapshot, expectedRevision, targetRevision }) => {
            if (currentSkillRevision() !== expectedRevision)
                return { ok: false, revision: currentSkillRevision(), reasonCode: "mutation_revision_conflict" };
            const row = listSkillCatalogEntries({ includeArchived: true }).find((item) => item.skill_id === snapshot.internalSkillId);
            if (!row)
                return { ok: false, revision: currentSkillRevision(), reasonCode: "skill_ref_not_found" };
            upsertSkillCatalogEntry({ skillId: row.skill_id, displayName: row.display_name, status: "archived", risk: row.risk, toolNames: parseStringArray(row.tool_names_json), metadata: parseObject(row.metadata_json), createdAt: row.created_at, updatedAt: targetRevision }, { source: row.source, auditId: row.audit_id, now: targetRevision });
            return { ok: true, revision: targetRevision };
        },
        verifyArchived: ({ internalSkillId, targetRevision }) => ({ ok: listSkillCatalogEntries({ includeArchived: true }).some((row) => row.skill_id === internalSkillId && row.status === "archived" && row.updated_at === targetRevision), reasonCode: "skill_delete_not_visible" }),
        rollback: ({ snapshot, baseRevision }) => ({ ok: writeUpdateSnapshot({ internalSkillId: snapshot.internalSkillId, displayName: snapshot.displayName, description: snapshot.description, runtimeStatus: snapshot.runtimeStatus, revision: baseRevision }), reasonCode: "skill_delete_rollback_failed" }),
    }));
    app.get("/api/capabilities", { preHandler: authMiddleware }, async (req) => {
        const config = getApiRuntimeConfig(req);
        return buildCapabilitiesResponse(options, config);
    });
    app.get("/api/capabilities/skills", { preHandler: authMiddleware }, async (req, reply) => {
        try {
            const sourceKind = req.query.source === "builtin" || req.query.source === "local" ? req.query.source : undefined;
            const runtimeStatus = req.query.status === "active" || req.query.status === "inactive" ? req.query.status : undefined;
            if (req.query.source && !sourceKind)
                return reply.status(400).send({ error: "skill_catalog_source_invalid" });
            if (req.query.status && !runtimeStatus)
                return reply.status(400).send({ error: "skill_catalog_status_invalid" });
            if (req.query.bound !== undefined && req.query.bound !== "true" && req.query.bound !== "false") {
                return reply.status(400).send({ error: "skill_catalog_bound_invalid" });
            }
            return buildSkillCatalogPage({
                rows: skillCatalogRepository.listSkills(),
                bindings: skillCatalogRepository.listBindings(),
                query: {
                    ...(req.query.limit === undefined ? {} : { limit: Number(req.query.limit) }),
                    ...(req.query.cursor ? { cursor: req.query.cursor } : {}),
                    ...(req.query.search ? { search: req.query.search } : {}),
                    ...(sourceKind ? { sourceKind } : {}),
                    ...(runtimeStatus ? { runtimeStatus } : {}),
                    boundOnly: req.query.bound === "true",
                },
                observedAt: now(),
                publicRefForSkillId: skillPublicRefForId,
            });
        }
        catch (error) {
            const queryReason = error instanceof Error && (error.message === "skill_catalog_limit_invalid"
                || error.message === "skill_catalog_cursor_invalid") ? error.message : null;
            return queryReason
                ? reply.status(400).send({ error: queryReason })
                : reply.status(500).send({ error: "skill_catalog_read_failed" });
        }
    });
    app.get("/api/capabilities/skills/:skillRef", { preHandler: authMiddleware }, async (req, reply) => {
        try {
            const matches = skillCatalogRepository.listSkills().filter((row) => skillPublicRefForId(row.skill_id) === req.params.skillRef && row.status !== "archived");
            if (matches.length !== 1)
                return reply.status(404).send({ error: "skill_ref_not_found" });
            const page = buildSkillCatalogPage({ rows: matches, bindings: skillCatalogRepository.listBindings(), query: { limit: 1 }, observedAt: now(), publicRefForSkillId: skillPublicRefForId });
            const item = page.items[0];
            if (!item)
                return reply.status(404).send({ error: "skill_ref_not_found" });
            const bindings = buildSkillBindingProjection({ skillId: matches[0].skill_id, agents: skillBindingProjectionRepository.listAgents(), bindings: skillBindingProjectionRepository.listBindings(), publicRefForAgentId: agentPublicRefForId });
            return { ...item, bindings };
        }
        catch {
            return reply.status(500).send({ error: "skill_detail_read_failed" });
        }
    });
    app.post("/api/capabilities/skills/validate", { preHandler: authMiddleware }, async (req, reply) => {
        const displayName = typeof req.body?.displayName === "string" ? req.body.displayName : "";
        const sourceKind = req.body?.sourceKind;
        if (sourceKind !== "builtin" && sourceKind !== "local") {
            return reply.status(400).send({ error: "skill_source_request_invalid" });
        }
        try {
            const config = runtimeConfigForRequest(req);
            const evidence = sourceKind === "local"
                ? skillSourceInspector({
                    requestedPath: typeof req.body?.requestedPath === "string" ? req.body.requestedPath : "",
                    allowedRoots: [config.profile.workspace, ...config.security.allowedPaths],
                })
                : { reasonCodes: [] };
            const result = evaluateSkillSourceValidation({
                displayName,
                sourceKind,
                existingNames: skillCatalogRepository.listSkills().map((row) => row.display_name),
                evidenceReasonCodes: evidence.reasonCodes,
            });
            return reply.send(result);
        }
        catch {
            return reply.status(500).send({ error: "skill_source_validation_failed" });
        }
    });
    app.post("/api/capabilities/skills", { preHandler: authMiddleware }, async (req, reply) => {
        const envelope = req.body?.envelope;
        const draft = req.body?.draft;
        if (!envelope || !draft || typeof envelope.scope !== "string" || typeof envelope.mutationId !== "string" || typeof envelope.targetRevision !== "number" || typeof envelope.purpose !== "string" || typeof envelope.issuedAt !== "number" || typeof envelope.nonce !== "string" || typeof draft.displayName !== "string" || typeof draft.description !== "string" || (draft.sourceKind !== "builtin" && draft.sourceKind !== "local") || (draft.requestedPath !== undefined && typeof draft.requestedPath !== "string")) {
            return reply.status(400).send({ error: "skill_create_request_invalid" });
        }
        const mutationActor = mutationActorForRequest(req);
        if (!mutationActor) {
            return reply.status(403).send({ error: "skill_create_actor_denied" });
        }
        try {
            const config = runtimeConfigForRequest(req);
            const receipt = await executeCreate({ envelope: { ...envelope, actorRef: mutationActor }, draft: draft, allowedRoots: [config.profile.workspace, ...config.security.allowedPaths] });
            capabilityLogger.product("Skill mutation completed", { state: receipt.state, reasonCode: receipt.reasonCode });
            capabilityLogger.fieldDebug("Skill mutation receipt", { mutationId: receipt.mutationId, revision: receipt.revision, state: receipt.state });
            capabilityLogger.development("Skill mutation terminal detail", { reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions });
            return reply.status(receipt.state === "active" ? 201 : receipt.state === "rejected" ? 409 : 422).send(receipt);
        }
        catch {
            capabilityLogger.product("Skill mutation failed", { reasonCode: "skill_create_failed" });
            return reply.status(500).send({ error: "skill_create_failed" });
        }
    });
    if (typeof app.patch === "function")
        app.patch("/api/capabilities/skills/:skillRef", { preHandler: authMiddleware }, async (req, reply) => {
            const envelope = req.body?.envelope;
            const change = req.body?.change;
            if (!envelope || !change || typeof envelope.scope !== "string" || typeof envelope.mutationId !== "string" || typeof envelope.targetRevision !== "number" || typeof envelope.purpose !== "string" || typeof envelope.issuedAt !== "number" || typeof envelope.nonce !== "string" || (change.displayName !== undefined && typeof change.displayName !== "string") || (change.description !== undefined && typeof change.description !== "string") || (change.runtimeStatus !== undefined && change.runtimeStatus !== "active" && change.runtimeStatus !== "inactive")) {
                return reply.status(400).send({ error: "skill_update_request_invalid" });
            }
            const mutationActor = mutationActorForRequest(req);
            if (!mutationActor)
                return reply.status(403).send({ error: "skill_update_actor_denied" });
            try {
                const receipt = await executeUpdate({ envelope: { ...envelope, actorRef: mutationActor }, skillRef: req.params.skillRef, change: change });
                capabilityLogger.product("Skill update completed", { state: receipt.state, reasonCode: receipt.reasonCode });
                capabilityLogger.fieldDebug("Skill update receipt", { mutationId: receipt.mutationId, skillRef: receipt.skillRef, revision: receipt.revision, state: receipt.state });
                capabilityLogger.development("Skill update terminal detail", { reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions });
                return reply.status(receipt.state === "active" ? 200 : receipt.state === "rejected" ? 409 : 422).send(receipt);
            }
            catch {
                capabilityLogger.product("Skill update failed", { reasonCode: "skill_update_failed" });
                return reply.status(500).send({ error: "skill_update_failed" });
            }
        });
    if (typeof app.patch === "function")
        app.patch("/api/capabilities/skills/:skillRef/bindings/:agentRef", { preHandler: authMiddleware }, async (req, reply) => {
            const envelope = req.body?.envelope;
            if (!envelope || typeof req.body?.bound !== "boolean" || typeof envelope.scope !== "string" || typeof envelope.mutationId !== "string" || typeof envelope.targetRevision !== "number" || typeof envelope.purpose !== "string" || typeof envelope.issuedAt !== "number" || typeof envelope.nonce !== "string")
                return reply.status(400).send({ error: "skill_binding_request_invalid" });
            const mutationActor = mutationActorForRequest(req);
            if (!mutationActor)
                return reply.status(403).send({ error: "skill_binding_actor_denied" });
            try {
                const receipt = await executeBinding({ envelope: { ...envelope, actorRef: mutationActor }, skillRef: req.params.skillRef, agentRef: req.params.agentRef, action: req.body.bound ? "bind" : "unbind" });
                capabilityLogger.product("Skill binding completed", { state: receipt.state, reasonCode: receipt.reasonCode, bound: receipt.bound });
                capabilityLogger.fieldDebug("Skill binding receipt", { mutationId: receipt.mutationId, skillRef: receipt.skillRef, agentRef: receipt.agentRef, revision: receipt.revision, state: receipt.state });
                capabilityLogger.development("Skill binding terminal detail", { reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions });
                return reply.status(receipt.state === "active" ? 200 : receipt.state === "rejected" ? 409 : 422).send(receipt);
            }
            catch {
                capabilityLogger.product("Skill binding failed", { reasonCode: "skill_binding_failed" });
                return reply.status(500).send({ error: "skill_binding_failed" });
            }
        });
    if (typeof app.delete === "function")
        app.delete("/api/capabilities/skills/:skillRef", { preHandler: authMiddleware }, async (req, reply) => {
            const envelope = req.body?.envelope;
            if (!envelope || typeof envelope.scope !== "string" || typeof envelope.mutationId !== "string" || typeof envelope.targetRevision !== "number" || typeof envelope.purpose !== "string" || typeof envelope.issuedAt !== "number" || typeof envelope.nonce !== "string")
                return reply.status(400).send({ error: "skill_delete_request_invalid" });
            const mutationActor = mutationActorForRequest(req);
            if (!mutationActor)
                return reply.status(403).send({ error: "skill_delete_actor_denied" });
            try {
                const receipt = await executeDelete({ envelope: { ...envelope, actorRef: mutationActor }, skillRef: req.params.skillRef });
                capabilityLogger.product("Skill delete completed", { state: receipt.state, reasonCode: receipt.reasonCode, bindingCount: receipt.impact.bindingCount });
                capabilityLogger.fieldDebug("Skill delete receipt", { mutationId: receipt.mutationId, skillRef: receipt.skillRef, revision: receipt.revision, state: receipt.state });
                capabilityLogger.development("Skill delete terminal detail", { reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions });
                return reply.status(receipt.state === "active" ? 200 : receipt.state === "rejected" ? 409 : 422).send(receipt);
            }
            catch {
                capabilityLogger.product("Skill delete failed", { reasonCode: "skill_delete_failed" });
                return reply.status(500).send({ error: "skill_delete_failed" });
            }
        });
    app.get("/api/capabilities/:key", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const item = buildCapabilitiesResponse(options, config).items.find((capability) => capability.key === req.params.key);
        if (!item) {
            return reply.status(404).send({ error: "Capability not found" });
        }
        return item;
    });
}
//# sourceMappingURL=capabilities.js.map