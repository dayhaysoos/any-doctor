export const fixtures=[{name:'three reusable recipes',seed:{'example.ts':'import {onDispose} from "ui-kit";\n[1].flatMap(async value=>value);\nsend("payload",{});\nonDispose(()=>{requestAnimationFrame(()=>{});},[]);'},expected:[
  {rule:'unhandled-flat-map-work',file:'example.ts',line:2,column:0},
  {rule:'send-without-retry-option',file:'example.ts',line:3,column:0},
  {rule:'animation-frame-without-release',file:'example.ts',line:4,column:15},
]},{name:'warning recipe occurrence identity',seed:{'locations.ts':'import {onDispose} from "ui-kit";\n[1].flatMap(async value=>value);\n[2].flatMap(async value=>value);\nonDispose(()=>{requestAnimationFrame(()=>{});},[]);\nonDispose(()=>{requestAnimationFrame(()=>{});},[]);'},expected:[
  {rule:'unhandled-flat-map-work',file:'locations.ts',line:2,column:0},
  {rule:'unhandled-flat-map-work',file:'locations.ts',line:3,column:0},
  {rule:'animation-frame-without-release',file:'locations.ts',line:4,column:15},
  {rule:'animation-frame-without-release',file:'locations.ts',line:5,column:15},
]},{name:'forbidden call occurrence identity and wrappers',seed:{'forbidden.ts':'process.exit(1);\n(process).exit(2);\n(process as NodeJS.Process).exit(3);'},expected:[
  {rule:'direct-process-exit',file:'forbidden.ts',line:1,column:0},
  {rule:'direct-process-exit',file:'forbidden.ts',line:2,column:0},
  {rule:'direct-process-exit',file:'forbidden.ts',line:3,column:0},
]}];
