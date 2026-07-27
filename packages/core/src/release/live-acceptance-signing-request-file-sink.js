import { randomUUID } from "node:crypto";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
export const LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY = Object.freeze({
    purpose: "external_release_signature",
    audience: "external_signer",
    redaction: "raw_by_design",
    access: "filesystem_private_file",
    retention: "operator_cleanup",
    rawDataAllowed: true,
    route: "none",
    directoryName: "release/live-acceptance-signing-requests",
    fileMode: "0600",
});
const defaultFileSystem = {
    lstat,
    realpath,
    openExclusive: async (path) => open(path, "wx", 0o600),
    link,
    unlink,
};
const HASH = /^sha256:([a-f0-9]{64})$/u;
function errorCode(error) {
    return error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
}
function fileName(request) {
    const payload = HASH.exec(request.payloadSha256)?.[1];
    const key = HASH.exec(request.requestedKeyId)?.[1];
    return payload && key ? `${payload}-${key}.json` : null;
}
async function removeQuietly(fileSystem, path) {
    try {
        await fileSystem.unlink(path);
    }
    catch {
        // Cleanup remains best-effort and never exposes filesystem details.
    }
}
export function createLiveAcceptanceSigningRequestFileSink(input) {
    const outputDir = resolve(input.outputDir);
    const maxBytes = input.maxBytes ?? 1024 * 1024;
    const fileSystem = input.fileSystem ?? defaultFileSystem;
    const randomId = input.randomId ?? randomUUID;
    return Object.freeze({
        async write(request) {
            const name = fileName(request);
            if (!name || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
                return {
                    status: "rejected",
                    reasonCode: "live_signing_request_invalid",
                };
            }
            let content;
            try {
                content = `${JSON.stringify(request)}\n`;
            }
            catch {
                return {
                    status: "rejected",
                    reasonCode: "live_signing_request_invalid",
                };
            }
            if (Buffer.byteLength(content, "utf8") > maxBytes) {
                return {
                    status: "rejected",
                    reasonCode: "live_signing_request_too_large",
                };
            }
            let canonicalOutputDir;
            try {
                const stat = await fileSystem.lstat(outputDir);
                canonicalOutputDir = resolve(await fileSystem.realpath(outputDir));
                if (!stat.isDirectory() || stat.isSymbolicLink()) {
                    return {
                        status: "rejected",
                        reasonCode: "live_signing_request_root_invalid",
                    };
                }
            }
            catch {
                return {
                    status: "rejected",
                    reasonCode: "live_signing_request_root_invalid",
                };
            }
            const nonce = randomId();
            if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(nonce)) {
                return {
                    status: "rejected",
                    reasonCode: "live_signing_request_invalid",
                };
            }
            const destination = join(canonicalOutputDir, name);
            const temporary = join(canonicalOutputDir, `.${name}.${nonce}.tmp`);
            let handle;
            let published = false;
            try {
                handle = await fileSystem.openExclusive(temporary);
                await handle.writeFile(content, { encoding: "utf8" });
                await handle.sync();
                await handle.close();
                handle = undefined;
                await fileSystem.link(temporary, destination);
                published = true;
                await fileSystem.unlink(temporary);
                return { status: "written" };
            }
            catch (error) {
                try {
                    await handle?.close();
                }
                catch {
                    // Temporary cleanup below remains authoritative.
                }
                await removeQuietly(fileSystem, temporary);
                if (published)
                    await removeQuietly(fileSystem, destination);
                return {
                    status: "rejected",
                    reasonCode: errorCode(error) === "EEXIST"
                        ? "live_signing_request_destination_exists"
                        : "live_signing_request_write_failed",
                };
            }
        },
    });
}
//# sourceMappingURL=live-acceptance-signing-request-file-sink.js.map