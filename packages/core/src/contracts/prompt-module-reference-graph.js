function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function unique(values, field) {
    const normalized = values.map((value) => required(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
function cyclicModules(edges) {
    const visited = new Set();
    const active = new Set();
    const cyclic = new Set();
    const visit = (moduleId) => {
        if (active.has(moduleId)) {
            cyclic.add(moduleId);
            return;
        }
        if (visited.has(moduleId))
            return;
        active.add(moduleId);
        for (const next of edges.get(moduleId) ?? []) {
            if (active.has(next)) {
                cyclic.add(moduleId);
                cyclic.add(next);
            }
            else
                visit(next);
            if (cyclic.has(next))
                cyclic.add(moduleId);
        }
        active.delete(moduleId);
        visited.add(moduleId);
    };
    for (const moduleId of edges.keys())
        visit(moduleId);
    return cyclic;
}
export function evaluatePromptModuleReferenceGraph(input) {
    const issues = [];
    const add = (code, subjectId) => { issues.push({ code, subjectId }); };
    const manifests = new Map();
    for (const manifest of input.manifests) {
        const moduleId = required(manifest.moduleId, "Prompt module ID");
        required(manifest.version, "Prompt module version");
        const normalized = { ...manifest, ownedResponsibilityIds: unique(manifest.ownedResponsibilityIds, "Owned responsibility"), allowedReferenceResponsibilityIds: unique(manifest.allowedReferenceResponsibilityIds, "Allowed reference responsibility") };
        if (manifests.has(moduleId))
            add("module_duplicate", moduleId);
        manifests.set(moduleId, normalized);
    }
    const owners = new Map();
    for (const owner of input.owners) {
        const ruleKey = required(owner.ruleKey, "Canonical rule key");
        const moduleId = required(owner.moduleId, "Canonical owner module ID");
        required(owner.ruleId, "Canonical rule ID");
        required(owner.responsibilityId, "Canonical responsibility ID");
        required(owner.version, "Canonical rule version");
        required(owner.definitionFingerprint, "Canonical definition fingerprint");
        if (owners.has(ruleKey))
            add("canonical_owner_duplicate", ruleKey);
        owners.set(ruleKey, owner);
        const manifest = manifests.get(moduleId);
        if (!manifest)
            add("module_unknown", moduleId);
        else if (!manifest.ownedResponsibilityIds.includes(owner.responsibilityId))
            add("definition_responsibility_out_of_scope", ruleKey);
    }
    const edges = new Map();
    for (const reference of input.references) {
        const sourceId = required(reference.sourceModuleId, "Reference source module ID");
        const targetId = required(reference.targetModuleId, "Reference target module ID");
        const ruleKey = required(reference.ruleKey, "Reference rule key");
        const source = manifests.get(sourceId);
        const target = manifests.get(targetId);
        if (!source)
            add("module_unknown", sourceId);
        if (!target)
            add("module_unknown", targetId);
        const owner = owners.get(ruleKey);
        if (!owner) {
            add("canonical_owner_missing", ruleKey);
            continue;
        }
        if (owner.moduleId !== targetId || owner.ruleId !== reference.targetRuleId || owner.responsibilityId !== reference.targetResponsibilityId)
            add("reference_target_mismatch", ruleKey);
        if (owner.version !== reference.expectedVersion)
            add("reference_version_stale", ruleKey);
        if (owner.definitionFingerprint !== reference.expectedDefinitionFingerprint)
            add("reference_fingerprint_stale", ruleKey);
        if (reference.repeatsDefinitionBody)
            add("reference_repeats_definition", ruleKey);
        if (source && !source.allowedReferenceResponsibilityIds.includes(reference.targetResponsibilityId))
            add("reference_responsibility_out_of_scope", `${sourceId}:${ruleKey}`);
        const targets = edges.get(sourceId) ?? new Set();
        targets.add(targetId);
        edges.set(sourceId, targets);
    }
    for (const moduleId of cyclicModules(edges))
        add("reference_cycle", moduleId);
    const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}`, issue])).values()];
    return uniqueIssues.length > 0
        ? { status: "blocked", issues: uniqueIssues }
        : { status: "eligible", moduleIds: [...manifests.keys()], ruleKeys: [...owners.keys()] };
}
export async function writeReferenceEligiblePromptModules(input) {
    if (input.decision.status !== "eligible")
        return input.decision;
    return { status: "written", result: await input.write(input.decision) };
}
//# sourceMappingURL=prompt-module-reference-graph.js.map