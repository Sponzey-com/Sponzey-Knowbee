import { createHash } from "node:crypto";
const YEONJANG_PUBLIC_REF_NAMESPACE = "knowbee:yeonjang:v1:";
export function createYeonjangPublicRef(instanceId) {
    if (!instanceId.trim())
        throw new Error("yeonjang_public_ref_source_invalid");
    const digest = createHash("sha256")
        .update(YEONJANG_PUBLIC_REF_NAMESPACE)
        .update(instanceId)
        .digest("hex")
        .slice(0, 24);
    return `yeonjang_v1_${digest}`;
}
//# sourceMappingURL=yeonjang-public-reference.js.map