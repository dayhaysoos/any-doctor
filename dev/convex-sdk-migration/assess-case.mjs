// Check one file without mistaking the host's cross-file aggregation for a failure.
export function assessCase(c,actual,narrowed) {
 const file=`${c.name}.ts`;
 const findingsPass=actual.length===c.expected;
 const coveragePass=c.narrowed
  ? narrowed.length===1&&narrowed[0].reason===c.reason
    &&narrowed[0].files.filter(f=>f.file===file).length===1
    &&narrowed[0].files.find(f=>f.file===file).occurrences===1
    &&new Set(narrowed[0].files.map(f=>f.file)).size===narrowed[0].files.length
    &&narrowed[0].occurrences===narrowed[0].files.reduce((sum,f)=>sum+f.occurrences,0)
  : narrowed.length===0;
 const locationsPass=JSON.stringify(actual.map(({line,column})=>({line,column})))===JSON.stringify(c.expectedLocations);
 return {findingsPass,coveragePass,locationsPass,passed:findingsPass&&coveragePass&&locationsPass};
}
