export const fixtures=[{name:'three reusable recipes',seed:{'example.ts':'import {onDispose} from "ui-kit";\n[1].flatMap(async value=>value);\nsend("payload",{});\nonDispose(()=>{requestAnimationFrame(()=>{});},[]);'},expected:[
  {rule:'unhandled-flat-map-work',file:'example.ts',line:2,column:0},
  {rule:'send-without-retry-option',file:'example.ts',line:3,column:0},
  {rule:'animation-frame-without-release',file:'example.ts',line:4,column:15},
]},{name:'warning recipe occurrence identity',seed:{'locations.ts':'import {onDispose} from "ui-kit";\n[1].flatMap(async value=>value);\n[2].flatMap(async value=>value);\nonDispose(()=>{requestAnimationFrame(()=>{});},[]);\nonDispose(()=>{requestAnimationFrame(()=>{});},[]);'},expected:[
  {rule:'unhandled-flat-map-work',file:'locations.ts',line:2,column:0},
  {rule:'unhandled-flat-map-work',file:'locations.ts',line:3,column:0},
  {rule:'animation-frame-without-release',file:'locations.ts',line:4,column:15},
  {rule:'animation-frame-without-release',file:'locations.ts',line:5,column:15},
]}];
