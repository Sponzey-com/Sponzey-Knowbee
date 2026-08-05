import { classifySkillCatalogKind, } from "../capabilities/skill-catalog-kind.js";
function parseToolNames(value, allowEmpty = false) {
    try {
        const parsed = JSON.parse(value);
        if (allowEmpty && parsed === null)
            return [];
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string"))
            return undefined;
        const toolNames = [...new Set(parsed.map((item) => item.trim()).filter(Boolean))].sort();
        return toolNames.length > 0 || allowEmpty ? toolNames : undefined;
    }
    catch {
        return undefined;
    }
}
function selectionRisk(risk) {
    if (risk === "safe")
        return "safe";
    if (risk === "dangerous")
        return "denied";
    return "approval_required";
}
function selectionFindingReason(reasonCode) {
    return reasonCode === "skill_tool_names_invalid" ? "tool_names_invalid" : reasonCode;
}
function classifyCatalogEntry(entry) {
    const capabilityId = entry.skillId.trim();
    const classification = classifySkillCatalogKind({
        toolNamesJson: entry.toolNamesJson,
        metadataJson: entry.metadataJson,
    });
    if (!classification.ok) {
        return {
            kind: "invalid",
            capabilityId,
            reasonCode: selectionFindingReason(classification.reasonCode),
        };
    }
    if (classification.kind === "tool_bundle_skill") {
        return {
            kind: "tool_bundle_skill",
            capabilityId,
            status: entry.status,
            risk: selectionRisk(entry.risk),
            toolNames: classification.toolNames,
        };
    }
    return {
        kind: "instruction_skill",
        capabilityId,
        status: entry.status,
        risk: selectionRisk(entry.risk),
        sourceRef: classification.sourceRef,
    };
}
export function projectCapabilitySelectionCatalog(input) {
    const ownerAgentId = input.ownerAgentId.trim();
    if (!ownerAgentId) {
        return { ok: false, reasonCode: "capability_selection_catalog_invalid" };
    }
    const catalog = new Map();
    const duplicateCapabilityIds = new Set();
    for (const entry of input.catalogEntries) {
        const capabilityId = entry.skillId.trim();
        if (!capabilityId) {
            return { ok: false, reasonCode: "capability_selection_catalog_invalid" };
        }
        if (catalog.has(capabilityId))
            duplicateCapabilityIds.add(capabilityId);
        else
            catalog.set(capabilityId, entry);
    }
    const ownerBindings = input.bindings.filter((binding) => binding.agentId.trim() === ownerAgentId);
    const ownerCapabilityIds = new Set();
    const skillDefinitions = [];
    const skillBindings = [];
    const instructionSkills = [];
    const findings = [];
    for (const binding of ownerBindings) {
        const capabilityId = binding.catalogId.trim();
        if (!capabilityId ||
            ownerCapabilityIds.has(capabilityId) ||
            duplicateCapabilityIds.has(capabilityId)) {
            return { ok: false, reasonCode: "capability_selection_catalog_invalid" };
        }
        ownerCapabilityIds.add(capabilityId);
        const entry = catalog.get(capabilityId);
        if (!entry) {
            findings.push({ capabilityId, reasonCode: "catalog_entry_missing" });
            continue;
        }
        const classified = classifyCatalogEntry(entry);
        if (classified.kind === "invalid") {
            findings.push({
                capabilityId: classified.capabilityId,
                reasonCode: classified.reasonCode,
            });
            continue;
        }
        if (classified.kind === "instruction_skill") {
            instructionSkills.push({
                capabilityId,
                targetId: ownerAgentId,
                status: binding.status,
                risk: classified.risk,
                sourceRef: classified.sourceRef,
            });
            continue;
        }
        const enabledToolNames = binding.enabledToolNamesJson
            ? parseToolNames(binding.enabledToolNamesJson, true)
            : undefined;
        const disabledToolNames = binding.disabledToolNamesJson
            ? parseToolNames(binding.disabledToolNamesJson, true)
            : undefined;
        if ((binding.enabledToolNamesJson && !enabledToolNames) ||
            (binding.disabledToolNamesJson && !disabledToolNames)) {
            findings.push({ capabilityId, reasonCode: "tool_scope_invalid" });
            continue;
        }
        const disabled = new Set(disabledToolNames ?? []);
        const selectedToolNames = normalizedUniqueToolScope((enabledToolNames && enabledToolNames.length > 0
            ? enabledToolNames
            : classified.toolNames).filter((toolName) => !disabled.has(toolName)));
        skillDefinitions.push({
            capabilityId,
            toolNames: classified.toolNames,
        });
        skillBindings.push({
            capabilityId,
            targetId: ownerAgentId,
            status: binding.status,
            risk: classified.risk,
            sourceSupported: classified.status === "enabled",
            toolNames: selectedToolNames,
        });
    }
    skillDefinitions.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
    skillBindings.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
    instructionSkills.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
    findings.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
    return {
        ok: true,
        skillDefinitions,
        skillBindings,
        instructionSkills,
        findings,
    };
}
function normalizedUniqueToolScope(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
//# sourceMappingURL=capability-selection-catalog.js.map