/**
 * Keyboard control tools.
 * Requires Yeonjang for execution.
 */
import type { AgentTool } from "../../types.js";
import { type YeonjangTargetedToolParams } from "../yeonjang-target.js";
interface KeyboardTypeParams extends YeonjangTargetedToolParams {
    text: string;
}
interface KeyboardShortcutParams extends YeonjangTargetedToolParams {
    keys: string[];
}
interface KeyboardActionParams extends YeonjangTargetedToolParams {
    action: "type_text" | "shortcut" | "key_press" | "key_down" | "key_up";
    text?: string;
    key?: string;
    modifiers?: string[];
}
export declare const keyboardTypeTool: AgentTool<KeyboardTypeParams>;
export declare const keyboardShortcutTool: AgentTool<KeyboardShortcutParams>;
export declare const keyboardActionTool: AgentTool<KeyboardActionParams>;
export {};
//# sourceMappingURL=keyboard.d.ts.map