export const REQUIRED_GOAL_OWNERSHIP_CHAPTERS = [
    "2.1",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
];
export const GOAL_OWNERSHIP_CATALOG = [
    { responsibilityId: "document_ownership", chapter: "2.1", responsibilityKind: "document_ownership", canonicalArtifact: "packages/core/src/maintenance/goal-ownership.ts", allowedReferenceArtifacts: [".tasks/phase001/goal.md"] },
    { responsibilityId: "product_behavior_invariants", chapter: "3", responsibilityKind: "product_behavior", canonicalArtifact: ".tasks/phase001/goal.md", allowedReferenceArtifacts: ["prompts/system.md"] },
    { responsibilityId: "prompt_authoring_contract", chapter: "4", responsibilityKind: "prompt_authoring_contract", canonicalArtifact: ".tasks/phase001/goal.md", allowedReferenceArtifacts: ["packages/core/src/memory/knowbee-md.ts"] },
    { responsibilityId: "prompt_module_responsibilities", chapter: "5", responsibilityKind: "prompt_module_boundaries", canonicalArtifact: "packages/core/src/memory/prompt-regression.ts", allowedReferenceArtifacts: ["prompts/system.md", ".tasks/phase001/goal.md"] },
    { responsibilityId: "handoff_package_schema", chapter: "6", responsibilityKind: "handoff_schema", canonicalArtifact: "packages/core/src/contracts/sub-agent-orchestration.ts", allowedReferenceArtifacts: ["prompts/sub_agent_delegation.md", ".tasks/phase001/goal.md"] },
    { responsibilityId: "child_result_and_work_record_schema", chapter: "7", responsibilityKind: "child_result_schema", canonicalArtifact: "packages/core/src/contracts/sub-agent-orchestration.ts", allowedReferenceArtifacts: ["prompts/work_record.md", ".tasks/phase001/goal.md"] },
    { responsibilityId: "prompt_improvement_flow", chapter: "8", responsibilityKind: "prompt_improvement_flow", canonicalArtifact: "prompts/prompt_improvement.md", allowedReferenceArtifacts: [".tasks/phase001/goal.md"] },
    { responsibilityId: "prompt_improvement_harness", chapter: "9", responsibilityKind: "prompt_improvement_harness", canonicalArtifact: "packages/core/src/memory/prompt-improvement-harness.ts", allowedReferenceArtifacts: ["prompts/prompt_improvement.md", ".tasks/phase001/goal.md"] },
    { responsibilityId: "acceptance_review", chapter: "10", responsibilityKind: "acceptance_review", canonicalArtifact: "packages/core/src/contracts/goal-review-gate.ts", allowedReferenceArtifacts: [".tasks/phase001/goal.md"] },
    { responsibilityId: "open_product_decisions", chapter: "11", responsibilityKind: "open_decisions", canonicalArtifact: ".tasks/phase001/goal.md", allowedReferenceArtifacts: [] },
];
export function auditGoalRuleOwnership(input) {
    const catalog = input.catalog ?? GOAL_OWNERSHIP_CATALOG;
    const chapterByKind = new Map();
    for (const entry of catalog) {
        if (!chapterByKind.has(entry.responsibilityKind)) {
            chapterByKind.set(entry.responsibilityKind, entry.chapter);
        }
    }
    const diagnostics = [];
    const definitionsByRule = new Map();
    for (const occurrence of input.occurrences) {
        if (occurrence.occurrenceKind !== "definition")
            continue;
        const definitions = definitionsByRule.get(occurrence.ruleKey) ?? [];
        definitions.push(occurrence);
        definitionsByRule.set(occurrence.ruleKey, definitions);
    }
    const add = (code, occurrence, expectedChapter) => {
        diagnostics.push({
            code,
            ruleKey: occurrence.ruleKey,
            chapter: occurrence.chapter,
            expectedChapter,
            responsibilityKind: occurrence.responsibilityKind,
        });
    };
    for (const [ruleKey, definitions] of definitionsByRule) {
        if (definitions.length > 1) {
            for (const definition of definitions) {
                add("rule_definition_duplicate", definition, chapterByKind.get(definition.responsibilityKind) ?? "");
            }
        }
        for (const definition of definitions) {
            const expectedChapter = chapterByKind.get(definition.responsibilityKind);
            if (!expectedChapter) {
                add("responsibility_owner_missing", definition, "");
                continue;
            }
            if (definition.chapter !== expectedChapter) {
                add("rule_wrong_owner_chapter", definition, expectedChapter);
            }
            if (definition.chapter === "4" && definition.responsibilityKind !== "prompt_authoring_contract") {
                add("chapter4_responsibility_leak", definition, expectedChapter);
            }
        }
        void ruleKey;
    }
    const unique = [...new Map(diagnostics.map((item) => [
            `${item.code}\u0000${item.ruleKey}\u0000${item.chapter}\u0000${item.expectedChapter}\u0000${item.responsibilityKind}`,
            item,
        ])).values()].sort((left, right) => left.ruleKey.localeCompare(right.ruleKey) ||
        left.code.localeCompare(right.code) ||
        left.chapter.localeCompare(right.chapter, undefined, { numeric: true }));
    return {
        complete: unique.length === 0,
        state: unique.length === 0
            ? "proven"
            : unique.some((item) => item.code !== "responsibility_owner_missing")
                ? "contradicted"
                : "incomplete",
        diagnostics: unique,
    };
}
const EXPECTED_KIND_BY_CHAPTER = {
    "2.1": "document_ownership",
    "3": "product_behavior",
    "4": "prompt_authoring_contract",
    "5": "prompt_module_boundaries",
    "6": "handoff_schema",
    "7": "child_result_schema",
    "8": "prompt_improvement_flow",
    "9": "prompt_improvement_harness",
    "10": "acceptance_review",
    "11": "open_decisions",
};
function markdownChapters(markdown) {
    const chapters = new Set();
    for (const line of markdown.split(/\r?\n/u)) {
        const match = line.trim().match(/^#{2,4}\s+(\d+(?:\.\d+)*)\b/u);
        if (match?.[1])
            chapters.add(match[1]);
    }
    return chapters;
}
export function auditGoalOwnership(input) {
    const catalog = input.catalog ?? GOAL_OWNERSHIP_CATALOG;
    const chapters = markdownChapters(input.goalMarkdown);
    const diagnostics = [];
    const responsibilityCounts = new Map();
    const chapterCounts = new Map();
    for (const entry of catalog) {
        responsibilityCounts.set(entry.responsibilityId, (responsibilityCounts.get(entry.responsibilityId) ?? 0) + 1);
        chapterCounts.set(entry.chapter, (chapterCounts.get(entry.chapter) ?? 0) + 1);
        if (EXPECTED_KIND_BY_CHAPTER[entry.chapter] !== entry.responsibilityKind) {
            diagnostics.push({ code: "ownership_chapter_kind_mismatch", responsibilityId: entry.responsibilityId, chapter: entry.chapter, artifact: entry.canonicalArtifact });
        }
        if (entry.allowedReferenceArtifacts.includes(entry.canonicalArtifact)) {
            diagnostics.push({ code: "ownership_canonical_artifact_repeated_as_reference", responsibilityId: entry.responsibilityId, chapter: entry.chapter, artifact: entry.canonicalArtifact });
        }
        if (input.artifactExists && !input.artifactExists(entry.canonicalArtifact)) {
            diagnostics.push({ code: "ownership_artifact_missing", responsibilityId: entry.responsibilityId, chapter: entry.chapter, artifact: entry.canonicalArtifact });
        }
    }
    for (const entry of catalog) {
        if ((responsibilityCounts.get(entry.responsibilityId) ?? 0) > 1) {
            diagnostics.push({ code: "ownership_responsibility_duplicate", responsibilityId: entry.responsibilityId, chapter: entry.chapter, artifact: entry.canonicalArtifact });
        }
        if ((chapterCounts.get(entry.chapter) ?? 0) > 1) {
            diagnostics.push({ code: "ownership_chapter_duplicate", responsibilityId: entry.responsibilityId, chapter: entry.chapter, artifact: entry.canonicalArtifact });
        }
    }
    for (const chapter of REQUIRED_GOAL_OWNERSHIP_CHAPTERS) {
        if (!chapters.has(chapter) || (chapterCounts.get(chapter) ?? 0) === 0) {
            diagnostics.push({ code: "ownership_chapter_missing", responsibilityId: "", chapter, artifact: "" });
        }
    }
    const unique = [...new Map(diagnostics.map((item) => [`${item.code}\u0000${item.responsibilityId}\u0000${item.chapter}\u0000${item.artifact}`, item])).values()]
        .sort((left, right) => left.chapter.localeCompare(right.chapter, undefined, { numeric: true }) || left.code.localeCompare(right.code) || left.responsibilityId.localeCompare(right.responsibilityId));
    const contradicted = unique.some((item) => item.code.includes("duplicate") || item.code === "ownership_chapter_kind_mismatch" || item.code === "ownership_canonical_artifact_repeated_as_reference");
    return {
        complete: unique.length === 0,
        state: unique.length === 0 ? "proven" : contradicted ? "contradicted" : "incomplete",
        diagnostics: unique,
    };
}
export function validateGoalOwnershipCatalog(catalog = GOAL_OWNERSHIP_CATALOG) {
    const headings = REQUIRED_GOAL_OWNERSHIP_CHAPTERS.map((chapter) => `## ${chapter} owner`).join("\n");
    return auditGoalOwnership({ goalMarkdown: headings, catalog });
}
//# sourceMappingURL=goal-ownership.js.map