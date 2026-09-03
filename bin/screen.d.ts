export interface Writable {
    write(s: string): void;
}
export declare class Screen {
    private out;
    private prev;
    private usedAlt;
    constructor(out: Writable);
    render(lines: string[]): void;
    exit(): void;
}
