/**
 * Mouse control tools.
 * Requires Yeonjang for execution.
 */
import type { AgentTool } from "../../types.js";
import { type YeonjangTargetedToolParams } from "../yeonjang-target.js";
interface MouseMoveParams extends YeonjangTargetedToolParams {
    x: number;
    y: number;
}
interface MouseClickParams extends YeonjangTargetedToolParams {
    x: number;
    y: number;
    button?: "left" | "right" | "middle";
    double?: boolean;
}
interface MouseActionParams extends YeonjangTargetedToolParams {
    action: "move" | "click" | "double_click" | "button_down" | "button_up" | "scroll";
    x?: number;
    y?: number;
    button?: "left" | "right" | "middle";
    deltaX?: number;
    deltaY?: number;
}
export declare const mouseMoveTool: AgentTool<MouseMoveParams>;
export declare const mouseClickTool: AgentTool<MouseClickParams>;
export declare const mouseActionTool: AgentTool<MouseActionParams>;
export {};
//# sourceMappingURL=mouse.d.ts.map