import { createHash } from "node:crypto";
const SKILL_PUBLIC_REF_NAMESPACE = "knowbee:skill:v1:";
export function createSkillPublicRef(skillId) {
    if (!skillId.trim())
        throw new Error("skill_public_ref_source_invalid");
    const digest = createHash("sha256")
        .update(SKILL_PUBLIC_REF_NAMESPACE)
        .update(skillId)
        .digest("hex")
        .slice(0, 24);
    return `skill_v1_${digest}`;
}
//# sourceMappingURL=skill-public-reference.js.map