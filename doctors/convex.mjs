export const meta = {
  "id": "convex",
  "description": "Convex discipline: indexed reads, bounded collects, query clocks, discarded promises, validated args, awaited writes, honest runtime boundaries.",
  "severity": "warning",
  "category": "convex",
  "blindSpots": [
    "All checks require shared calls and structural value facts; without analysis they abstain. Parse or adapter failures remain loud.",
    "Convex policy follows current 1.x registration/context contracts, checked against official documentation and retained Convex 1.32.0 evidence. Custom registration wrappers, cross-file implementations and arbitrary type aliases are unresolved; future major APIs need re-evaluation.",
    "Registrations resolve named/namespace imports, immutable aliases, direct functions and local handler/config bindings. Reassigned bindings and dynamic configuration properties cannot establish absence of validators.",
    "Database identity comes from registered context parameters, aliases/destructuring, or imported Convex context/database type annotations on helpers, including local aliases and Pick projections. Type annotations state a contract, not runtime type proof. Untyped cross-file helpers are not inferred.",
    "Query chains follow single expression receiver links; split builder statements, search-index ranges, schema validity, data size and measured cost are not modeled. Unknown returned ranges narrow only the affected check; they are not findings. Immutable stored builders retain their chain; reassignment narrows the affected read.",
    "Clock rules cover direct registered handlers, not nested or delegated helper clocks. Discard checks establish immediate discarded results, not eventual settlement of returned, passed or stored promises.",
    "Public API candidates do not establish intended audience or authorization. Unbound api-shaped references are explicitly unresolved; no client-caller absence inference is made.",
    "Presence fields and known dedicated table names are bounded conventions, not measurements of update rate or fanout. Other segmentation schemes remain review candidates.",
    "Spread findings concern top-level field copying, not mass assignment. Validation and server-selection evidence is described when available; arbitrary field ownership is not proven.",
    "Loop observations require a direct await and same-function loop ancestry; stored-then-awaited calls and interprocedural execution are not followed. Retry/backoff and cursor dependencies must be preserved.",
    "Diagnostic files are .ts/.tsx/.js/.jsx/.mjs under normal authored/test/generated scope; .mts/.cts/.cjs exports remain outside diagnostics. Fixture-named target files are skipped."
  ],
  "checks": [
    {
      "id": "filter-table-scan",
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "description": "A database filter without an index may scan many documents to find matching results.",
      "severity": "warning",
      "revision": 2,
      "impact": "Without an index restriction, finding matching results may read many table documents. Cost grows with the scanned candidate set, even when few results are returned.",
      "why": "A post-read filter does not establish an index range, so few returned results need not mean few reads.",
      "fix": "Review read volume and existing schema indexes. Move suitable predicates into an index range when it preserves filtering and order.",
      "claim": "A binding-resolved Convex database query uses filter without an index or search index.",
      "lookalikes": [
        "chains with withIndex",
        "unrelated database-shaped objects, array filters and shadowed bindings"
      ]
    },
    {
      "id": "index-without-range",
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "description": "An indexed collect with a proven absence of a returned range restriction.",
      "severity": "warning",
      "revision": 3,
      "impact": "Selecting index order alone does not restrict the candidate set. Actual cardinality and returned-range uncertainty need review.",
      "why": "Only supported returned range relationships count; an unrelated or unreachable range call is not a bound.",
      "fix": "Review the returned range and move suitable predicates into it. Preserve complete processing; use pagination or resumable batches when all records are required.",
      "claim": "A resolved Convex indexed collect has no returned range restriction; unsupported callback flow is coverage uncertainty.",
      "lookalikes": [
        "multi-line callbacks with real bounds",
        "take/first/unique terminators"
      ]
    },
    {
      "id": "query-clock-reactivity",
      "description": "A direct query clock read: review time-dependent subscription behavior.",
      "severity": "warning",
      "revision": 2,
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "claim": "A global Date.now() call directly inside an import-resolved Convex query handler.",
      "lookalikes": [
        "mutation expiry timestamps",
        "action clocks",
        "shadowed Date",
        "nested or unresolved helper functions"
      ],
      "impact": "Time passing does not itself rerun a subscribed query; time-dependent results may become stale and cache reuse can suffer.",
      "why": "Convex query reactivity follows database changes, not the wall clock.",
      "fix": "Preserve server-authoritative expiration and authorization checks. For time-driven UI refresh, consider scheduled state transitions or a trusted coarse time mechanism; never substitute an untrusted client timestamp for server enforcement."
    },
    {
      "id": "transaction-clock-duration",
      "description": "Subtracting two Date.now() readings in one transaction produces zero elapsed time.",
      "severity": "warning",
      "revision": 2,
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "claim": "A subtraction of two global Date.now() calls, or immutable direct aliases, in the same import-resolved query/mutation handler.",
      "lookalikes": [
        "historical timestamps or expiry cutoffs",
        "action duration measurement",
        "random branching",
        "reassigned timestamps"
      ],
      "impact": "The transaction clock is fixed at function start, so this calculation cannot measure work duration.",
      "why": "Both operands read the same transaction-start timestamp. Math.random is a seeded sequence and is not diagnosed.",
      "fix": "Measure wall-clock duration outside the transaction; preserve server-authoritative expiration checks."
    },
    {
      "id": "unbounded-collect",
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "description": "A Convex collect without an observed result limit or index range: review growth.",
      "severity": "warning",
      "revision": 2,
      "impact": "This collect may read a growing candidate set. Current size and latency are not measured, and an index range alone does not prove small cardinality.",
      "why": "The observed chain has no supported bound; the application must establish that full collection stays appropriately small.",
      "fix": "Check expected growth and completeness requirements. Use pagination or resumable batches for full processing; use a result limit only when intentionally returning a subset.",
      "claim": "A .collect() on a chain with no take, no paginate, and no bounding index range.",
      "lookalikes": [
        "collect bounded by an index range",
        "collect bounded by take"
      ]
    },
    {
      "id": "index-filter-combo",
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "claim": "A .withIndex() chain - range-narrowed or result-bounded - whose same chain also calls .filter().",
      "lookalikes": [
        "multi-field indexes serving both bounds"
      ],
      "description": "An indexed chain that also filters - a multi-field index candidate whether the index is range-narrowed or the results are bounded.",
      "severity": "info",
      "revision": 2,
      "impact": "If many candidates fail the filter, a suitable compound index may reduce reads. No bottleneck or result cardinality was measured.",
      "why": "This chain combines an index with a post-read filter. Its benefit depends on selectivity, ordering and workload.",
      "fix": "Measure candidate reads and review whether an existing or new compound index preserves ordering and predicates. Keep the filter when the bounded workload makes it appropriate."
    },
    {
      "id": "presence-patch-on-shared-document",
      "reportingUnit": "occurrence",
      "description": "A presence field (lastSeen/heartbeat-shaped) patched onto a document.",
      "severity": "info",
      "revision": 2,
      "impact": "If this document is widely read and updated frequently, presence writes can cause subscription invalidation. Frequency and fanout are not established.",
      "why": "The patch writes a presence-shaped field. Explicit dedicated heartbeats/presence-table targets are spared.",
      "fix": "Check target table, update frequency and readers. Keep deliberate segmentation; consider a separate presence document only when sharing causes meaningful invalidation.",
      "claim": "A binding-resolved Convex patch sets a canonical presence field, without an established dedicated presence-table target.",
      "lookalikes": [
        "presence segmented into its own table"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "missing-args-validator",
      "reportingUnit": "occurrence",
      "description": "A query/mutation/action defined without argument validators.",
      "severity": "warning",
      "revision": 2,
      "impact": "Public functions without runtime validators can receive unexpected client arguments. Internal functions are not client-callable and validators there are optional.",
      "why": "Registration identity and actual configuration properties establish validator presence independently of names, order or shorthand. TypeScript types alone do not validate runtime input.",
      "fix": "Add suitable argument validators to public functions, including an empty object for no-arg functions. For internal functions, consider validators as an optional contract; do not describe their absence as client exposure.",
      "claim": "An import-resolved Convex query, mutation or action registration has no args property in a resolved config, or uses the direct-handler form.",
      "lookalikes": [
        "chrome.tabs.query and other namespaced APIs",
        "explicit args: {}"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "public-api-in-server-call",
      "reportingUnit": "occurrence",
      "description": "A server-side run call referencing the public api namespace - a review candidate; namespace alone does not establish an authorization flaw.",
      "severity": "info",
      "revision": 2,
      "impact": "Public references may be intentionally shared with clients. This call does not establish accidental exposure or an authorization flaw.",
      "why": "Server use does not establish server-only intent. An unresolved global api reference is a namespace-shaped candidate, not proof of public registration.",
      "fix": "Review intended callers and authorization. Preserve required frontend/public access; use an internal endpoint only when server-only intent is established. Absence of discovered client calls does not establish that intent.",
      "claim": "A resolved Convex context run call references the generated public api namespace, or an unresolved global api-shaped reference.",
      "lookalikes": [
        "functions legitimately consumed by both client and server"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "write-in-query",
      "reportingUnit": "occurrence",
      "description": "A write, scheduler, or mutation/action call inside a query.",
      "severity": "warning",
      "revision": 2,
      "impact": "Queries are read-only transactions - the write methods do not exist on a query's context, so the function fails on its first real call rather than at deploy time. ctx.runQuery IS allowed (same read snapshot); only mutations, actions, and scheduling are forbidden.",
      "why": "A query body runs inside a deterministic read transaction: its context carries db reads, auth and storage, runQuery, nothing else. Writes and scheduling belong in a mutation.",
      "fix": "Move the write into a mutation the client or an action invokes; if the read and the write must be atomic, the whole operation is a mutation that reads first.",
      "claim": "A resolved query context invokes a database write, scheduler operation, runMutation or runAction.",
      "lookalikes": [
        "ctx.runQuery inside queries"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "db-in-action",
      "reportingUnit": "occurrence",
      "description": "ctx.db used inside an action.",
      "severity": "warning",
      "revision": 2,
      "impact": "Actions have no db on their context - the call throws at runtime, usually on the first request that reaches that path.",
      "why": "Actions run outside the transaction: their context offers runQuery/runMutation/runAction, scheduler, storage and auth. Database access goes through a function the action invokes.",
      "fix": "Replace ctx.db.<x> with await ctx.runQuery(...) for reads or await ctx.runMutation(...) for writes.",
      "claim": "A resolved action context invokes a database method, although actions do not provide db.",
      "lookalikes": [
        "ctx.runQuery/runMutation from actions"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "unawaited-convex-call",
      "description": "A known Promise-returning Convex context call is discarded as a standalone expression.",
      "severity": "warning",
      "revision": 2,
      "needs": [
        "calls"
      ],
      "onUnknown": "skip",
      "reportingUnit": "occurrence",
      "claim": "A direct discarded Promise-returning call on a resolved Convex context, including supported aliases and helper context contracts.",
      "lookalikes": [
        "returned callbacks",
        "arguments to helpers",
        "stored promises",
        "query builders",
        "shadowed context bindings"
      ],
      "impact": "Discarding the promise can lose errors or leave work unfinished when the function returns.",
      "why": "This call's result is an expression statement; nearby awaits do not receive it.",
      "fix": "Await or return this promise. For broader flow checks use typescript-eslint/no-floating-promises."
    },
    {
      "id": "node-runtime-transaction",
      "reportingUnit": "occurrence",
      "description": "A query or mutation defined in a \"use node\" file.",
      "severity": "warning",
      "revision": 2,
      "impact": "Deploy fails: queries and mutations must run in Convex's deterministic runtime, which is what makes their transaction guarantees replayable.",
      "why": "\"use node\" opts the file into the Node runtime, which only actions can use. Queries and mutations must be deterministic so re-execution produces identical results.",
      "fix": "Split the file: keep the query/mutation in the default runtime and move the Node-dependent work into an action it schedules.",
      "claim": "An import-resolved query or mutation registration occurs in a file with a structural use node directive.",
      "lookalikes": [
        "actions in use-node files"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "sequential-run-in-loop",
      "reportingUnit": "occurrence",
      "description": "A run call awaited inside a for/while loop - a batching review candidate; deliberate retry loops (OCC with backoff) share this shape.",
      "severity": "info",
      "revision": 2,
      "impact": "Awaiting each iteration can serialize latency. Transaction and commit behavior depends on run method and calling context; queries can share a read snapshot.",
      "why": "This particular call is awaited in the loop. Retry, backoff, cursor dependency and bounded incremental work can require sequential execution.",
      "fix": "First check retries, ordering, cursor dependencies and per-call limits. Preserve deliberate sequential work. Batch or use bounded concurrency only for independent work when transaction semantics and completeness remain correct.",
      "claim": "A resolved Convex context runQuery, runMutation or runAction call is directly awaited in a loop body in the same function.",
      "lookalikes": [
        "deliberate OCC retry loops with backoff"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    },
    {
      "id": "spread-into-patch",
      "reportingUnit": "occurrence",
      "description": "ctx.db.patch/replace called with a spread - a review candidate; presence alone does not prove client-controlled fields.",
      "severity": "info",
      "revision": 2,
      "impact": "The patch copies fields from another value. This is not evidence of arbitrary client-controlled writes: validators, selected server fields and deliberate state copies may already constrain them.",
      "why": "Top-level object spread is an observable field-copy operation. Runtime object validators reject undeclared keys; field ownership and authorization need separate review.",
      "fix": "Review the copied fields and their runtime validators and ownership rules. Preserve intentional server selection and existing-state copies; change field selection only if unintended writable fields are demonstrated.",
      "claim": "A resolved Convex patch or replace receives an object with a top-level spread; nested object and array spreads are excluded.",
      "lookalikes": [
        "validated server-built objects spread deliberately"
      ],
      "needs": [
        "calls"
      ],
      "onUnknown": "skip"
    }
  ]
};

// Framework policy over shared identity, property, return and execution facts.
function model(facts,ctx,file) {
  const s=facts.structure, values=new Map(s.values.map(v=>[v.start,v])), bindings=new Map(s.bindings.map(b=>[b.binding,b]));
  const calls=new Map(facts.calls.map(c=>[c.end,c]));
  function resolveValue(id,seen=new Set()) {
    if(seen.has(id))return null;seen=new Set(seen).add(id);
    const v=values.get(id);if(!v)return null;
    if(v.kind==='alias')return resolveValue(v.value,seen);
    if(v.kind==='reference' && v.target.binding!==null && !v.target.reassigned){
      const b=bindings.get(v.target.binding);
      if(b?.mutated)return null;
      if(b && !b.reassigned && b.initializer!==undefined){
        let result=resolveValue(b.initializer,seen);
        // An options object passed through unknown code may acquire properties.
        if(result?.kind==='object' && b.escapes?.some(t=>!registration(t) && !['db.patch','db.replace'].includes(context(t)?.members.join('.'))))return null;
        for(const name of [...(b.path??[]),...v.target.members]){
          if(result?.kind==='reference')result={...result,target:{...result.target,members:[...result.target.members,name]}};
          else result=property(result,name,seen);
        }
        return result;
      }
    }
    return v;
  }
  function property(v,name,seen=new Set()) {
    if(v?.kind!=='object')return null;
    let result=null;
    for(const p of v.properties){
      if(p.spread || p.name===null)result=null;
      else if(p.name===name)result=p.accessor?null:resolveValue(p.value,seen);
    }
    return result;
  }
  function resolveTarget(t,seen=new Set()) {
    if(!t || t.reassigned || seen.has(t.binding))return null;
    const b=bindings.get(t.binding);
    if(b?.reassigned || b?.mutated)return null;
    if(b?.initializer!==undefined){
      const v=resolveValue(b.initializer);
      if(v?.kind==='reference'){
        const base=resolveTarget(v.target,new Set(seen).add(t.binding));
        if(base)return {...base,members:[...base.members,...(b.path??[]),...t.members]};
      }
    }
    return t;
  }
  function framework(t){return t?.source==='convex/server' || /(?:^|\/)_generated\/server(?:\.[cm]?[jt]s)?$/.test(t?.source??'');}
  function registrationOrigin(t){
    if(!framework(t))return null;
    const name=t.importedName==='*' && t.members.length===1?t.members[0]:t.members.length===0?t.importedName:null;
    if(!/^(query|mutation|action|internalQuery|internalMutation|internalAction|queryGeneric|mutationGeneric|actionGeneric|internalQueryGeneric|internalMutationGeneric|internalActionGeneric|httpAction|httpActionGeneric)$/.test(name??''))return null;
    return {kind:name.replace(/Generic$/,'').replace(/^internal/,'').toLowerCase(),internal:name.startsWith('internal')};
  }
  function registration(t){return registrationOrigin(resolveTarget(t));}
  // Candidate provenance survives unsupported selection/reassignment. A local
  // ordinary function with no imported registration origin is still outside scope.
  function possibleTargets(t,seen=new Set()) {
    if(!t || seen.has(t.binding))return [];
    if(t.source||t.binding===null)return [t];
    const b=bindings.get(t.binding);if(!b)return [];
    seen=new Set(seen).add(t.binding);
    function fromValue(id,visited=new Set()){
      if(visited.has(id))return [];visited=new Set(visited).add(id);
      const v=values.get(id);if(!v)return [];
      if(v.kind==='alias')return fromValue(v.value,visited);
      if(v.kind==='choice')return v.alternatives.flatMap(id=>fromValue(id,visited));
      if(v.kind==='reference')return possibleTargets({...v.target,members:[...v.target.members,...(b.path??[]),...t.members]},seen);
      return [];
    }
    return [...fromValue(b.initializer),...(b.writes??[]).flatMap(w=>fromValue(w.value))];
  }
  const registrations=[], handlers=new Map();
  for(const call of facts.calls){
    const known=registration(call.target),possible=known?[known]:possibleTargets(call.target).map(registrationOrigin).filter(Boolean);
    if(!possible.length)continue;
    const reg={...possible[0],kinds:[...new Set(possible.map(p=>p.kind))],uncertain:!known};
    const config=call.arguments[0] && resolveValue(call.arguments[0].start);
    const handler=config?.kind==='function'?config:property(config,'handler');
    const entry={...reg,call,config,handler,args:property(config,'args')};registrations.push(entry);
    if(handler?.kind==='function'){
      const old=handlers.get(handler.value);
      handlers.set(handler.value,old && old.kind!==entry.kind?{...entry,kinds:[...new Set([...old.kinds,...entry.kinds])],uncertain:true}:entry);
    }
  }
  function context(t,seen=new Set()){
    t=resolveTarget(t);if(!t || t.binding===null)return null;
    const b=bindings.get(t.binding);if(!b || b.reassigned || seen.has(t.binding))return null;
    seen=new Set(seen).add(t.binding);
    const h=b.parameter?.index===0?handlers.get(b.parameter.functionStart):null;
    if(h && h.kind!=='unknown')return {...h,members:[...(b.path??[]),...t.members]};
    const declared=(b.types??[]).map(({target:type,members})=>{
      if(!framework(type) || type.reassigned || (members && !members.includes(t.members[0])))return null;
      const name=type.importedName==='*'?type.members[0]:type.importedName;
      const names={QueryCtx:'query',MutationCtx:'mutation',ActionCtx:'action',GenericQueryCtx:'query',GenericMutationCtx:'mutation',GenericActionCtx:'action',DatabaseReader:'query',DatabaseWriter:'mutation',GenericDatabaseReader:'query',GenericDatabaseWriter:'mutation'};
      return names[name]?{kind:names[name],members:[...(/Database/.test(name)?['db']:[]),...(b.path??[]),...t.members],typed:true}:null;
    });
    if(declared.length && declared.every(d=>d && d.members.join('.')===declared[0].members.join('.')))
      return {...declared[0],kind:declared.every(d=>d.kind===declared[0].kind)?declared[0].kind:'mixed'};
    if(b.parameter){
      const incoming=facts.calls.filter(call=>{
        const t=resolveTarget(call.target),local=t && bindings.get(t.binding);
        const fn=local?.initializer!==undefined?resolveValue(local.initializer):null;
        return fn?.kind==='function' && fn.value===b.parameter.functionStart;
      });
      const origins=incoming.map(call=>{
        const arg=call.arguments[b.parameter.index],v=arg && resolveValue(arg.start);
        return v?.kind==='reference'?context(v.target,seen):null;
      });
      if(origins.length && origins.every(o=>o && o.kind===origins[0].kind && o.members.join('.')===origins[0].members.join('.')))
        return {...origins[0],members:[...origins[0].members,...(b.path??[]),...t.members]};
    }
    return null;
  }
  const reported=new Set();
  function narrow(rule,location,reason='unsupported-expression'){
    const key=`${rule}:${location.start}:${reason}`;
    if(reported.has(key))return;reported.add(key);
    ctx.report.narrowing({check:rule,file,reason,capability:'calls'});
  }
  function emit(rule,location,extra={}){
    const uncertainHandler=[...handlers].some(([start,owner])=>{
      const fn=facts.functions.find(fn=>fn.start===start);
      return owner.uncertain&&fn&&fn.start<=location.start&&location.end<=fn.end;
    });
    if(uncertainHandler||registrations.some(r=>r.uncertain&&r.call.start<=location.start&&location.end<=r.call.end)){
      narrow(rule,location,'unresolved-identity');return;
    }
    ctx.report.finding({rule,file,line:location.line,column:location.column,...extra});
  }
  return {s,values,bindings,calls,resolveValue,resolveTarget,possibleTargets,property,registrations,handlers,context,narrow,emit};
}
const hasKind=(owner,kind)=>(owner?.kinds??[owner?.kind]).includes(kind);
export async function doctor(ctx){
  if(!ctx.analysis.available)return;
  for(const file of ctx.files.list(['.ts','.tsx','.js','.jsx','.mjs'])){
    if(/\.fixtures\.mjs$/.test(file))continue;
    const facts=ctx.analysis.calls(file);if(!facts.structure)throw Error('Convex doctor requires structural call facts from the current Any Doctor host');
    const m=model(facts,ctx,file);
    for(const reg of m.registrations){
      if(reg.kinds.every(kind=>kind==='httpaction'))continue;
      const config=reg.config;
      const absent=config?.kind==='function' || (config?.kind==='object' && !config.properties.some(p=>p.spread || p.name===null || p.name==='args'));
      if(!absent && !reg.args && config?.kind!=='function')m.narrow('missing-args-validator',reg.call);
      if(absent)m.emit('missing-args-validator',reg.call,reg.internal?{severity:'info',message:'Internal function omits args validators; optional contract review, not client exposure.'}:{});
      if(m.s.directives.includes('use node') && (hasKind(reg,'query')||hasKind(reg,'mutation')))m.emit('node-runtime-transaction',reg.call);
    }
    const clocks=new Map(),clockBindings=new Map();
    for(const call of facts.calls){
      const c=m.context(call.target),member=c?.members.join('.');
      if(c){
        if(call.usage==='discarded' && /^(?:db\.(?:insert|patch|replace|delete|get)|scheduler\.(?:runAfter|runAt|cancel)|run(?:Query|Mutation|Action)|storage\.(?:get|store|delete|generateUploadUrl|getUrl))$/.test(member))m.emit('unawaited-convex-call',call);
        if(hasKind(c,'query') && /^(?:db\.(?:insert|patch|replace|delete)|scheduler\.[^.]+|runMutation|runAction)$/.test(member))m.emit('write-in-query',call);
        if(hasKind(c,'action') && /^db\.[^.]+$/.test(member))m.emit('db-in-action',call);
        if(/^run(Query|Mutation|Action)$/.test(member)){
          const arg=call.arguments[0] && m.resolveValue(call.arguments[0].start),t=arg?.kind==='reference'?m.resolveTarget(arg.target):null;
          const imported=t && /(?:^|\/)_generated\/api(?:\.[cm]?[jt]s)?$/.test(t.source??'') && ((t.importedName==='api' && t.members.length>0)||(t.importedName==='*' && t.members[0]==='api'));
          const unresolved=t?.binding===null && t.root==='api' && t.members.length>0;
          if(unresolved)m.narrow('public-api-in-server-call',call,'unresolved-identity');
          if(imported)m.emit('public-api-in-server-call',call,{message:'Generated public API reference in a server call; preserve required client access and review authorization and intended callers.'});
          if(call.usage==='awaited' && m.s.loops.some(l=>l.functionStart===call.functionStart && l.start<=call.start && call.end<=l.end))m.emit('sequential-run-in-loop',call);
        }
        if(member==='db.patch'||member==='db.replace')checkPatch(ctx,file,call,c,m);
      }
      const t=m.resolveTarget(call.target),isClock=t=>t?.root==='Date'&&t.binding===null&&t.members.join('.')==='now';
      const clockUncertain=!isClock(t)&&m.possibleTargets(call.target).some(isClock);
      if(isClock(t)||clockUncertain){
        const owner=m.handlers.get(call.functionStart);
        if(hasKind(owner,'query')||hasKind(owner,'mutation')){
          const clock={...call,uncertain:clockUncertain};
          clocks.set(call.start,clock);if(call.resultBinding!==undefined)clockBindings.set(call.resultBinding,clock);
          if(hasKind(owner,'query')){
            if(clockUncertain)m.narrow('query-clock-reactivity',call,'unresolved-identity');
            else m.emit('query-clock-reactivity',call);
          }
        }
      }
    }
    for(const diff of facts.differences){
      const get=o=>o.call!==undefined?clocks.get(o.call):clockBindings.get(o.binding),a=get(diff.left),b=get(diff.right);
      if(a&&b&&a.functionStart===diff.functionStart&&b.functionStart===diff.functionStart){
        if(a.uncertain||b.uncertain)m.narrow('transaction-clock-duration',diff,'unresolved-identity');
        else m.emit('transaction-clock-duration',diff);
      }
    }
    checkQueryChains(ctx,file,facts,m);
  }
}
function checkPatch(ctx,file,call,c,m){
  const patchArg=call.arguments.length===3?call.arguments[2]:call.arguments[1];
  const patch=patchArg && m.resolveValue(patchArg.start);if(patch?.kind!=='object')return;
  const spreads=patch.properties.filter(p=>p.spread);
  if(spreads.length){
    const selected=spreads.every(p=>{const v=m.resolveValue(p.value);return v?.kind==='object' && v.properties.every(p=>p.name!==null && !p.spread);});
    m.emit('spread-into-patch',call,{message:selected?'Patch copies explicitly named fields from local server-built objects; review intent, not an arbitrary-client-fields finding.':'Patch copies top-level object fields. Runtime validators, deliberate state copying and server field selection may make this correct; field ownership is not established.'});
  }
  if(!patch.properties.some(p=>/^(lastSeen|lastPing|lastActive|lastHeartbeat|heartbeat|pingAt|lastOnline)$/.test(p.name??'')))return;
  const explicitTable=call.arguments.length===3?m.resolveValue(call.arguments[0].start):null;
  let segmented=explicitTable?.kind==='literal' && ['heartbeats','presence'].includes(explicitTable.literal);
  const id=call.arguments[0] && m.resolveValue(call.arguments[0].start);
  if(id?.kind==='reference'){
    const b=m.bindings.get(id.target.binding);
    const path=[...(b?.path??[]),...id.target.members];
    if(b?.parameter?.index===1 && path.length===1){
      const reg=m.handlers.get(b.parameter.functionStart),validator=m.property(reg?.args,path[0]);
      const vc=validator?.kind==='call'?m.calls.get(validator.value):null,t=vc && m.resolveTarget(vc.target);
      if(t?.source==='convex/values' && t.importedName==='v' && t.members.join('.')==='id'){
        const table=vc.arguments[0] && m.resolveValue(vc.arguments[0].start);
        segmented=table?.kind==='literal' && ['heartbeats','presence'].includes(table.literal);
      }
    }
  }
  if(!segmented)m.emit('presence-patch-on-shared-document',call);
}
function checkQueryChains(ctx,file,facts,m){
  const byEnd=m.calls, receivers=new Set(facts.calls.map(c=>c.receiverCall).filter(x=>x!==undefined));
  for(const terminal of facts.calls){
    if(receivers.has(terminal.end))continue;
    const steps=[],seen=new Set();let step=terminal,uncertainChain=false;
    while(step&&!seen.has(step.end)){
      seen.add(step.end);steps.unshift(step);
      if(step.receiverCall!==undefined){step=byEnd.get(step.receiverCall);continue;}
      const binding=m.bindings.get(step.target.binding);
      if(step.target.members.length!==1||binding?.initializer===undefined)break;
      const value=m.resolveValue(binding.initializer);
      uncertainChain ||= !!(binding.reassigned||binding.mutated||step.target.reassigned);
      step=value?.kind==='call'?byEnd.get(value.value):null;
    }
    const c=m.context(steps[0].target);if(c?.members.join('.')!=='db.query')continue;
    const method=c=>c.target.members.at(-1),index=steps.find(c=>method(c)==='withIndex'),filter=steps.find(c=>method(c)==='filter');
    if(steps.some(c=>method(c)==='withSearchIndex'))continue;
    const collect=steps.find(c=>method(c)==='collect'),bounded=steps.some(c=>['take','first','unique','paginate'].includes(method(c)));
    if(!collect&&!bounded)continue;
    let ranged=false,unknown=false;
    if(index && index.arguments.length>1){
      const fn=m.resolveValue(index.arguments[1].start),flow=fn?.kind==='function'?m.s.functions.find(f=>f.start===fn.value):null;
      const param=fn?.kind==='function'?facts.functions.find(f=>f.start===fn.value)?.parameters[0]:null;
      function bound(id,seen=new Set()){
        const v=m.resolveValue(id);if(!v||seen.has(v.start))return 'unknown';seen=new Set(seen).add(v.start);
        if(v.kind==='choice'){const rs=v.alternatives.map(id=>bound(id,seen));return rs.every(r=>r==='yes')?'yes':rs.every(r=>r==='no')?'no':'unknown';}
        if(v.kind==='reference'){
          const t=m.resolveTarget(v.target);
          if(t?.binding===param && !t.members.length)return 'no';
          const b=m.bindings.get(v.target.binding);
          if(!v.target.members.length && b?.initializer!==undefined && b.writes?.length && bound(b.initializer,seen)==='yes'){
            // Every modeled reassignment extends the same already-constrained range.
            const extendsRange=write=>{
              if(write.functionStart!==fn.value || write.value===undefined)return false;
              const w=m.resolveValue(write.value);let call=w?.kind==='call'?m.calls.get(w.value):null;
              if(!call)return false;
              while(call){
                if(!['eq','gt','gte','lt','lte'].includes(method(call)))return false;
                if(call.receiverCall===undefined)return call.target.binding===b.binding && call.target.members.length===1;
                call=m.calls.get(call.receiverCall);
              }
              return false;
            };
            if(b.writes.every(extendsRange))return 'yes';
          }
          return 'unknown';
        }
        if(v.kind==='call'){
          let call=m.calls.get(v.value);let saw=false;
          while(call){if(['eq','gt','gte','lt','lte'].includes(method(call)))saw=true;else return 'unknown';if(call.receiverCall===undefined){const t=m.resolveTarget(call.target);return t?.binding===param && saw?'yes':'unknown';}call=m.calls.get(call.receiverCall);}
        }
        return 'unknown';
      }
      if(!flow||param===null||param===undefined)unknown=true;
      else {const results=flow.returns.map(id=>bound(id));ranged=!flow.unknownReturn&&results.length>0&&results.every(r=>r==='yes');unknown=flow.unknownReturn||!results.length||results.some(r=>r==='unknown')||(!ranged&&results.some(r=>r==='yes'));}
    }
    let rule;
    if(filter&&!index)rule='filter-table-scan';else if(index&&!ranged&&!bounded)rule='index-without-range';else if(index&&filter)rule='index-filter-combo';else if(collect&&!bounded&&!ranged)rule='unbounded-collect';
    if(!rule)continue;
    const trigger=rule==='index-filter-combo'?filter:steps.find(c=>['withIndex','filter','collect'].includes(method(c)));
    if(uncertainChain)m.narrow(rule,trigger,'unresolved-identity');
    else if(unknown && rule==='index-without-range')m.narrow(rule,trigger);
    else m.emit(rule,trigger.memberRange??trigger);
  }
}
