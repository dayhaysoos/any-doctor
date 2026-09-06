export type KeyHandler = (key: string) => void;
export declare function createKeyFeed(onKey: KeyHandler): (chunk: string | Buffer) => void;
