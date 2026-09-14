import type { AnalysisCalls, ExpressionRef, IdentityQuery, IdentityValue, SemanticResult } from "./contract.js";
/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export declare function identityResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: IdentityQuery): SemanticResult<IdentityValue>;
