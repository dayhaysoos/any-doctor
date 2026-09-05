export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
export function compareFindings(expected, actual) {
    const key = (f) => `${f.file}:${f.line}`;
    const expectedKeys = new Set(expected.map(key));
    const actualKeys = new Set(actual.map(key));
    const missing = expected.filter(f => !actualKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
    const unexpected = actual.filter(f => !expectedKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
    return { missing, unexpected };
}
