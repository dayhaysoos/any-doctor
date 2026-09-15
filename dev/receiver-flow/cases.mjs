// Source markers specify independent expected operation coordinates.
export const cases=[];
const query=body=>`import {query} from './_generated/server';\nquery({args:{},handler:async(ctx,args)=>{\n${body}\n}});\n`;
function add(name,body,narrowed=[]){
 let source='',rest=query(body);const expected=[];
 for(;;){const match=/\/\*@([a-z-]+)\*\//.exec(rest);if(!match)break;source+=rest.slice(0,match.index);rest=rest.slice(match.index+match[0].length);expected.push({rule:match[1],line:source.split('\n').length,column:source.length-source.lastIndexOf('\n')-1});}
 cases.push({name,source:source+rest,expected,narrowed:narrowed.map(entry=>({check:Array.isArray(entry)?entry[0]:entry,reason:Array.isArray(entry)?entry[1]:'unresolved-identity',occurrences:1}))});
}
const builder=`ctx.db.query('rows')./*@index-without-range*/withIndex('by_x')./*@index-filter-combo*/filter(q=>q.eq(q.field('x'),1))`;
const plain=builder.replace(/\/\*@[^*]+\*\//g,'');
const neighbor=`\nawait ctx.db.query('neighbors')./*@unbounded-collect*/collect();`;
const uncertainty=['index-without-range','index-filter-combo'];
for(const [name,expression] of [
 ['direct',builder],['parentheses',`(((${builder})))`],['as',`(${builder} as any)`],
 ['satisfies',`(${builder} satisfies unknown)`],['non-null',`(${builder})!`],['type-assertion',`(<any>${builder})`],
 ['literal-live',`(true ? ${builder} : external)`],['literal-false',`(false ? external : ${builder})`],
])add(name,`return ${expression}.collect();`);
add('stored',`const rows=${builder};return rows.collect();`);
// One execution joins identical facts and uses the earliest relevant operation.
add('two-convex',`return (args.flag ? ${builder} : ${plain}).collect();`);
add('reconverging',`const rows=${builder};const left=rows;const right=rows;return (args.flag?left:right).collect();`);
for(const [name,expression] of [
 ['mixed',`(args.flag?external:${plain})`],
 ['nested',`(args.flag?external:(args.other?${plain}:external))`],
 ['nullish',`(external??${plain})`],['or',`(external||${plain})`],['and',`(external&&${plain})`],
 ['wrapper',`wrap(${plain})`],['method-wrapper',`external.wrap(${plain})`],['construct-wrapper',`new Wrapper(${plain})`],['unknown-method',`${plain}.transform()`],
])add(name,`await ${expression}.collect();${neighbor}`,name.includes('wrapper')||name==='unknown-method'?[...uncertainty,'filter-table-scan','unbounded-collect']:uncertainty);
add('reassigned',`let rows=${plain};rows=external;await rows.collect();${neighbor}`,uncertainty);
add('mutated',`const rows=${plain};rows.filter=external;await rows.collect();${neighbor}`,uncertainty);
add('cyclic',`let rows=${plain};const alias=rows;rows=alias;await rows.collect();${neighbor}`,uncertainty);
add('ordinary',`const rows={collect(){return [];}};return rows.collect();`);
add('ordinary-wrapper',`return wrap(external).collect();`);
add('dead-convex',`return (true?external:${plain}).collect();`);
add('independent-decisions',`return (args.flag?ctx.db.query('rows').withIndex('by_x',q=>opaque(q)):ctx.db.query('rows').withIndex('by_x',q=>q.eq('x',1)))./*@index-filter-combo*/filter(q=>q.eq(q.field('x'),1)).collect();`,[['index-without-range','unsupported-expression']]);
// Reconverging aliases are a DAG, not 2^depth execution paths.
let aliases=`const a0=${builder};\n`;
for(let i=1;i<=80;i++)aliases+=`const a${i}=args.flag?a${i-1}:a${i-1};\n`;
add('depth-80',`${aliases}return a80.collect();`);
let nested=plain;for(let i=0;i<60;i++)nested=`(args.flag?external:${nested})`;
add('nested-60',`await ${nested}.collect();${neighbor}`,uncertainty);

add('correlated-paths',`return (args.flag?ctx.db.query('rows').filter(q=>q.eq(q.field('x'),1)):ctx.db.query('rows').withIndex('by_x')).collect();`,['filter-table-scan','index-without-range']);

for(const [name,expression] of [
 ['object-projection',`({rows:${plain}}).rows`],['array-projection',`[${plain}][0]`],
 ['object-wrapper',`wrap({rows:${plain}})`],
])add(name,`await ${expression}.collect();${neighbor}`,[...uncertainty,'filter-table-scan','unbounded-collect']);
add('ordinary-object-projection',`return ({rows:external,other:${plain}}).rows.collect();`);
add('ordinary-array-projection',`return [external,${plain}][0].collect();`);
add('ordinary-container-wrapper',`return wrap({rows:external}).collect();`);
add('sequence-result',`return (external,${builder}).collect();`);
add('sequence-discarded',`return (${plain},external).collect();`);
add('assignment-result',`let rows;return (rows=${builder}).collect();`);
for(const [name,branches] of [['date-first','Date.now:performance.now'],['date-last','performance.now:Date.now']])
 add(name,`const clock=args.flag?${branches};return clock();`,[['query-clock-reactivity','unresolved-identity']]);

add('ordinary-stored-projection',`const object={rows:external,other:${plain}};return object.rows.collect();`);
add('stored-projection',`const object={rows:${plain}};await object.rows.collect();${neighbor}`,[...uncertainty,'filter-table-scan','unbounded-collect']);

add('array-hole',`return [,${plain}][0].collect();`);

add('member-write',`const box={rows:external};box.rows=${plain};await box.rows.collect();${neighbor}`,[...uncertainty,'filter-table-scan','unbounded-collect']);
add('member-write-alias',`const box={rows:external};const alias=box;alias.rows=${plain};await box.rows.collect();${neighbor}`,[...uncertainty,'filter-table-scan','unbounded-collect']);
add('unrelated-member-write',`const box={rows:external};box.other=${plain};return box.rows.collect();`);
add('getter',`await ({get rows(){return ${plain};}}).rows.collect();${neighbor}`,[...uncertainty,'filter-table-scan','unbounded-collect']);
add('ordinary-getter',`return ({get rows(){return external;}}).rows.collect();`);

for(const [name,expression] of [['literal-nullish',`(null??${builder})`],['literal-or',`(false||${builder})`],['literal-and',`(true&&${builder})`]])add(name,`return ${expression}.collect();`);
for(const operator of ['??=','||=','&&='])add('logical-assignment-'+operator.charCodeAt(0),`let rows=external;await (rows${operator}${plain}).collect();${neighbor}`,uncertainty);
add('void-result',`return (void ${plain}).collect();`);

add('global-member-write',`external.rows=${plain};await external.rows.collect();${neighbor}`,[...uncertainty,'filter-table-scan','unbounded-collect']);
add('unrelated-global-member',`external.rows=${plain};return unrelated.rows.collect();`);
add('unrelated-global-property',`external.other=${plain};return external.rows.collect();`);
