import type { AgentTool } from "../types.js";
interface TelegramSendFileParams {
    filePath?: string;
    artifactRef?: string;
    caption?: string | undefined;
}
export declare const telegramSendFileTool: AgentTool<TelegramSendFileParams>;
export {};
//# sourceMappingURL=telegram-send.d.ts.map