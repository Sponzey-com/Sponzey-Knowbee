import type { Bot } from "grammy";
import type { ArtifactStorageContext } from "../../artifacts/lifecycle.js";
export declare class FileHandler {
    private bot;
    private storage;
    constructor(bot: Bot, storage: ArtifactStorageContext);
    downloadFile(fileId: string, sessionId: string, filename: string): Promise<string>;
}
//# sourceMappingURL=file-handler.d.ts.map