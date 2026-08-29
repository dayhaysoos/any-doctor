"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESULT_SENTINEL = exports.PROTOCOL_VERSION = void 0;
exports.compareFindings = compareFindings;
exports.PROTOCOL_VERSION = 1;
exports.RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
function compareFindings(expected, actual) {
    const key = (f) => `${f.file}:${f.line}`;
    const expectedKeys = new Set(expected.map(key));
    const actualKeys = new Set(actual.map(key));
    const missing = expected.filter(f => !actualKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
    const unexpected = actual.filter(f => !expectedKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
    return { missing, unexpected };
}
