import { createHash, timingSafeEqual } from "node:crypto";
import { parseUnsignedInstallerManifest, } from "./installer-contract.js";
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
function sha256(value) {
    return createHash("sha256").update(value).digest();
}
/** Validates v2 structure only; artifact hashes do not authenticate the manifest publisher. */
export function verifyUnsignedInstallerManifest(input) {
    if (!(input.rawManifestBytes instanceof Uint8Array) ||
        input.rawManifestBytes.byteLength === 0 ||
        input.rawManifestBytes.byteLength > MAX_MANIFEST_BYTES) {
        return { status: "rejected", reasonCode: "manifest_bytes_invalid" };
    }
    let externalValue;
    try {
        externalValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.rawManifestBytes));
    }
    catch {
        return { status: "rejected", reasonCode: "manifest_invalid" };
    }
    const parsed = parseUnsignedInstallerManifest(externalValue);
    if (parsed.status === "rejected")
        return parsed;
    return {
        status: "verified",
        manifest: parsed.manifest,
        manifestSha256: `sha256:${sha256(input.rawManifestBytes).toString("hex")}`,
        originTrust: "unsigned_origin_unverified",
    };
}
export function verifyInstallerArtifactBytes(input) {
    if (input.bytes.byteLength !== input.artifact.sizeBytes) {
        return { status: "rejected", reasonCode: "artifact_size_mismatch" };
    }
    const observed = sha256(input.bytes);
    const expected = Buffer.from(input.artifact.sha256, "hex");
    if (expected.byteLength !== observed.byteLength || !timingSafeEqual(observed, expected)) {
        return { status: "rejected", reasonCode: "artifact_digest_mismatch" };
    }
    return {
        status: "verified",
        target: input.artifact.target,
        sizeBytes: input.bytes.byteLength,
        sha256: observed.toString("hex"),
    };
}
//# sourceMappingURL=installer-integrity.js.map