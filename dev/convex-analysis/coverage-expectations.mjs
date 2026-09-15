// Migration contract for the unchanged historical seeds. Previously these three
// unresolved ranges produced info findings. They now require zero findings AND
// exact check/file/reason narrowing. Original expected findings remain in cases.mjs.
export const coverageExpectations=new Map([
 ['range-overwritten-unrelated',{expected:0,reason:'unsupported-expression',occurrences:1}],
 ['range-mixed-returns',{expected:0,reason:'unsupported-expression',occurrences:1}],
 ['mutation-invalidates-range',{expected:0,reason:'unsupported-expression',occurrences:1}],
]);
