# Bundled doctor modernization

Updated September 22, 2026. This is the current architecture map for bundled
doctors. “Modernized” means a doctor uses host-owned facts for language mechanics,
declares every required capability and unknown policy, and keeps only technology
meaning behind its own interface. It does not mean every doctor is expressed as
a recipe or that passing fixtures proves accuracy on arbitrary repositories.

| Doctor | Shared mechanics | Deliberately local policy |
| --- | --- | --- |
| Async | Identity, option presence, value disposition and resource lifetime through three certified recipes | Which native request, promise-array and React timer observations merit review |
| Convex | Calls, bindings, types, function ownership, branches, directives and value flow | Convex registration/context/query-chain semantics; generic recipes do not express correlated query paths or context capabilities |
| Deepgram | Calls, identity and Value Path for property proof | Endpoint/model matrices, transport support, Read validation, hosts and browser credential policy |
| OpenRouter | Calls, identity, option presence, the required-option recipe and Value Path | Stream provenance, same-chunk guards, response-dependent retry loops and model-pin policy |
| Effect | Structural search plus shared calls, identity, bindings and exact spans | The Effect v4 skill's policy choices and test-file convention |
| Slop | Exact spans, calls/value flow, lexical bindings, project consumers and structural fingerprints | Corpus-derived thresholds and the interpretation of maintenance review candidates |

## Audit outcomes

- Effect no longer counts braces, scans raw lines for API calls, or parses zod
  argument lists. It resolves imports and aliases, honors shadowing, accepts
  multiline names, uses exact class/function ranges, and reports full evidence.
- Slop's hostname, overlapping-substring, tri-state and abbreviation checks no
  longer depend on same-line formatting. Receiver identity and actual call
  argument roles remove nearby-lookalike false positives.
- Deepgram no longer revives a private property-walker answer after Value Path
  returns unknown. A nested configuration passed through an opaque object now
  narrows because mutation cannot be excluded.
- Async, OpenRouter and Convex already used the accepted shared seams. Their
  specialized policy remains local because moving it into a generic recipe would
  enlarge the interface without a second equivalent consumer.

## Maintainer rule

Do not judge modernization by file size or recipe count. Apply the deletion test:
move a mechanic into the host when deleting the shared module would force the same
language reasoning back into multiple doctors. Keep technology-specific meaning
local. Add a Doctor SDK or Value Path capability only from a reproduced miss or
false positive with definite-positive, negative, uncertain and mixed-neighbor
evidence. Unsupported flow narrows; it never becomes confident absence.

For a release, run the complete suite, `verify --all`, capability-gap certification,
package dry-run and packed-consumer checks. Compare any changed findings against
fixed source, not just counts.
