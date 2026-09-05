import { Severity } from "./contract.js";
export interface PickerItem {
    id: string;
    label: string;
    sub?: string;
    severity?: Severity;
}
export declare function pickerFrame(title: string, items: PickerItem[], selected: number, query: string, useColor: boolean, notice?: string): string;
export declare function filterPickerItems(items: PickerItem[], query: string): PickerItem[];
export declare function isPrintable(s: string): boolean;
export declare function pickItem(items: PickerItem[], useColor: boolean, title?: string, notice?: string): Promise<PickerItem | null>;
