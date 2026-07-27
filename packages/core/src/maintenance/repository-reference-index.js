const BOUNDARIES = [
    "runtime",
    "test",
    "registry",
    "migration",
    "deployment",
    "build",
    "retention",
    "ui",
];
function validRepositoryPath(value) {
    const normalized = value.replaceAll("\\", "/");
    return Boolean(normalized && !normalized.startsWith("/") && !normalized.split("/").includes(".."));
}
export function buildRepositoryReferenceIndex(input) {
    for (const boundary of BOUNDARIES) {
        if (input.scanStatus[boundary] !== "complete" && input.scanStatus[boundary] !== "incomplete") {
            throw new Error(`Invalid repository reference scan status: ${boundary}`);
        }
    }
    const unique = new Map();
    for (const record of input.records) {
        if (!BOUNDARIES.includes(record.boundary) ||
            !validRepositoryPath(record.targetArtifactId) ||
            !record.owner.trim() ||
            !record.detail.trim()) {
            throw new Error("Invalid repository reference record");
        }
        const normalized = {
            ...record,
            targetArtifactId: record.targetArtifactId.replaceAll("\\", "/").replace(/^\.\//u, ""),
            owner: record.owner.trim(),
            detail: record.detail.trim(),
        };
        unique.set([normalized.boundary, normalized.targetArtifactId, normalized.owner, normalized.detail].join("\u0000"), normalized);
    }
    return {
        scanStatus: Object.freeze({ ...input.scanStatus }),
        records: Object.freeze([...unique.values()]),
    };
}
export function createIndexedReferenceAdapters(index) {
    const referencesByBoundaryAndTarget = new Map();
    for (const { boundary, targetArtifactId, owner, detail } of index.records) {
        const key = `${boundary}\u0000${targetArtifactId}`;
        const references = referencesByBoundaryAndTarget.get(key) ?? [];
        references.push({ owner, detail });
        referencesByBoundaryAndTarget.set(key, references);
    }
    return Object.fromEntries(BOUNDARIES.map((boundary) => [
        boundary,
        async (artifact) => {
            if (index.scanStatus[boundary] !== "complete") {
                throw new Error(`${boundary} reference index is incomplete`);
            }
            return referencesByBoundaryAndTarget.get(`${boundary}\u0000${artifact.artifactId}`) ?? [];
        },
    ]));
}
//# sourceMappingURL=repository-reference-index.js.map