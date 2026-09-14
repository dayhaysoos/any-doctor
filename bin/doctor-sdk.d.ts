import type { AnalysisCalls, ExpressionRef, IdentityQuery, IdentityValue, SemanticResult, ValueDisposition, ValueDispositionQuery } from "./contract.js";
/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export declare function identityResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: IdentityQuery): SemanticResult<IdentityValue>;
/** Host-owned bounded value disposition. It follows exact expression identity,
 * immutable aliases and the already-supported local relationships; unsupported
 * transfers stay unknown instead of becoming discarded. */
export declare function valueDispositionResult(file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: ValueDispositionQuery): SemanticResult<ValueDisposition>;
