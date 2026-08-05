import { constants, accessSync, lstatSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
function insideRoot(target, root) {
    const relation = relative(root, target);
    return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}
export function inspectLocalSkillSource(input) {
    const requested = input.requestedPath.trim();
    const reasons = new Set();
    if (!requested)
        return { reasonCodes: ["skill_path_missing"] };
    if (requested.includes("\0"))
        return { reasonCodes: ["skill_path_null_byte"] };
    if (requested.split(/[\\/]+/).includes(".."))
        return { reasonCodes: ["skill_path_traversal"] };
    const roots = input.allowedRoots.flatMap((root) => {
        try {
            return [realpathSync(root)];
        }
        catch {
            return [];
        }
    });
    const candidate = isAbsolute(requested) ? requested : resolve(roots[0] ?? "", requested);
    let linkStat;
    let canonical;
    try {
        linkStat = lstatSync(candidate);
        canonical = realpathSync(candidate);
    }
    catch {
        return { reasonCodes: ["skill_path_not_found"] };
    }
    if (!roots.some((root) => insideRoot(canonical, root))) {
        return { reasonCodes: [linkStat.isSymbolicLink() ? "skill_symlink_escape" : "skill_path_outside_root"] };
    }
    const targetStat = statSync(canonical);
    if (!targetStat.isDirectory() && !targetStat.isFile())
        reasons.add("skill_path_unsupported_type");
    try {
        accessSync(canonical, constants.R_OK);
    }
    catch {
        reasons.add("skill_path_unreadable");
    }
    if (typeof process.getuid === "function" && targetStat.uid !== process.getuid())
        reasons.add("skill_owner_mismatch");
    const manifest = targetStat.isDirectory() ? join(canonical, "SKILL.md") : canonical;
    if (targetStat.isFile() && basename(canonical) !== "SKILL.md")
        reasons.add("skill_manifest_missing");
    else {
        try {
            const manifestStat = statSync(manifest);
            if (!manifestStat.isFile())
                reasons.add("skill_manifest_missing");
            else
                accessSync(manifest, constants.R_OK);
        }
        catch {
            reasons.add("skill_manifest_missing");
        }
    }
    return { reasonCodes: [...reasons], ...(reasons.size === 0 ? { canonicalPath: canonical } : {}) };
}
//# sourceMappingURL=skill-source-filesystem.js.map