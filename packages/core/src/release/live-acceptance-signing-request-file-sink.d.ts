import type { LiveAcceptanceSigningRequestSink } from "./live-acceptance-runner.js";
export interface LiveAcceptanceSigningRequestArtifactPolicy {
    readonly purpose: "external_release_signature";
    readonly audience: "external_signer";
    readonly redaction: "raw_by_design";
    readonly access: "filesystem_private_file";
    readonly retention: "operator_cleanup";
    readonly rawDataAllowed: true;
    readonly route: "none";
    readonly directoryName: "release/live-acceptance-signing-requests";
    readonly fileMode: "0600";
}
export declare const LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY: LiveAcceptanceSigningRequestArtifactPolicy;
export interface AtomicSigningRequestFileHandle {
    writeFile(data: string, options: {
        encoding: "utf8";
    }): Promise<unknown>;
    sync(): Promise<void>;
    close(): Promise<void>;
}
export interface AtomicSigningRequestFileSystem {
    lstat(path: string): Promise<{
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
    }>;
    realpath(path: string): Promise<string>;
    openExclusive(path: string): Promise<AtomicSigningRequestFileHandle>;
    link(existingPath: string, newPath: string): Promise<void>;
    unlink(path: string): Promise<void>;
}
export declare function createLiveAcceptanceSigningRequestFileSink(input: {
    readonly outputDir: string;
    readonly maxBytes?: number;
    readonly randomId?: () => string;
    readonly fileSystem?: AtomicSigningRequestFileSystem;
}): LiveAcceptanceSigningRequestSink;
//# sourceMappingURL=live-acceptance-signing-request-file-sink.d.ts.map