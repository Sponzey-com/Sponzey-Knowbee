export function createDeterministicTokenEstimator() {
    const encoder = new TextEncoder();
    return Object.freeze({
        version: "utf8-byte4-v1",
        estimateTokens(text) {
            if (!text)
                return 0;
            return Math.ceil(encoder.encode(text).byteLength / 4);
        },
    });
}
//# sourceMappingURL=web-token-estimator.js.map