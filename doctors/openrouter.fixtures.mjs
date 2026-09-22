export const fixtures = [
  {
    name: "midstream: delta consumed with no error check anywhere in the file",
    seed: {
      "src/stream-bad.ts": [
        'const url = "https://openrouter.ai/api/v1/chat/completions";',
        "const res = await fetch(url, { stream: true, signal: controller.signal });",
        "for await (const chunk of stream) {",
        "  out += chunk.choices[0].delta.content;",
        "}",
      ].join("\n"),
    },
    expected: [], // Revision 1 expected line 4; free stream is not connected to the response.
  },
  {
    name: "midstream: an error check before consumption silences it",
    seed: {
      "src/stream-good.ts": [
        'const url = "https://openrouter.ai/api/v1/chat/completions";',
        "for await (const chunk of stream) {",
        '  if (chunk.error || chunk.choices[0].finish_reason === "error") throw new Error("stream failed");',
        "  out += chunk.choices[0].delta.content;",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "sse: hand-rolled data-line loop with no comment guard",
    seed: {
      "src/sse-bad.ts": [
        'const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: controller.signal });',
        "const reader = res.body.getReader();",
        'const text = new TextDecoder().decode(await reader.read());',
        'for (const line of text.split("\\n")) {',
        '  if (line.startsWith("data: ")) {',
        "    const chunk = JSON.parse(line.slice(6));",
        "    if (chunk.error) throw new Error(chunk.error.message);",
        "    out += chunk.choices[0].delta.content;",
        "  }",
        "}",
      ].join("\n"),
    },
    expected: [], // Revision 1 expected line 6; the data-prefix guard excludes comments.
  },
  {
    name: "sse: comment lines skipped before parsing",
    seed: {
      "src/sse-good.ts": [
        'const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: controller.signal });',
        "const reader = res.body.getReader();",
        'for (const line of text.split("\\n")) {',
        '  if (line.startsWith(":")) continue;',
        '  if (line.startsWith("data: ")) {',
        "    const chunk = JSON.parse(line.slice(6));",
        "    if (chunk.error) throw new Error(chunk.error.message);",
        "    out += chunk.choices[0].delta.content;",
        "  }",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "abort: openrouter fetch whose statement passes no signal",
    seed: {
      "src/abort-bad.ts": [
        "export async function ask(prompt: string) {",
        '  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {',
        '    method: "POST",',
        '    body: JSON.stringify({ model: "~openai/gpt-4o-latest", messages: [{ role: "user", content: prompt }] }),',
        "  });",
        "  return res.choices[0].message.content;",
        "}",
      ].join("\n"),
    },
    expected: [{ rule: "missing-abort-signal", file: "src/abort-bad.ts", line: 2 }],
  },
  {
    name: "abort: signal threaded through the same statement",
    seed: {
      "src/abort-good.ts": [
        "export async function ask(prompt: string, signal: AbortSignal) {",
        '  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {',
        "    signal,",
        '    method: "POST",',
        '    body: JSON.stringify({ model: "~openai/gpt-4o-latest", messages: [{ role: "user", content: prompt }] }),',
        "  });",
        "  return res.choices[0].message.content;",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "retry: attempt loop around an openrouter call with no Retry-After",
    seed: {
      "src/retry-bad.ts": [
        "export async function askWithRetry(prompt: string) {",
        "  for (let attempt = 0; attempt < 3; attempt++) {",
        "    try {",
        '      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: controller.signal });',
        "      return res.choices[0].message.content;",
        "    } catch (e) {",
        "      await new Promise((r) => setTimeout(r, 1000));",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    },
    expected: [], // Revision 1 expected catch line 6; no response-dependent HTTP retry is established.
  },
  {
    name: "retry: Retry-After read before waiting",
    seed: {
      "src/retry-good.ts": [
        "export async function askWithRetry(prompt: string) {",
        "  for (let attempt = 0; attempt < 3; attempt++) {",
        "    try {",
        '      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: controller.signal });',
        '      if (!res.ok) throw new Error("rate limited");',
        "      return res.choices[0].message.content;",
        "    } catch (e) {",
        '      const wait = Number(res.headers.get("Retry-After") ?? 1);',
        "      await new Promise((r) => setTimeout(r, wait * 1000));",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "slug: dated model slug hardcoded",
    seed: {
      "src/model-bad.ts": [
        'import { createOpenRouter } from "@openrouter/ai-sdk-provider";',
        "",
        "export const models = {",
        '  fast: "openai/gpt-4o-mini",',
        "};",
      ].join("\n"),
    },
    expected: [], // Revision 1 expected line 4; unused catalog is not a model selection.
  },
  {
    name: "slug: ~latest alias survives provider removals",
    seed: {
      "src/model-good.ts": [
        'import { createOpenRouter } from "@openrouter/ai-sdk-provider";',
        "",
        "export const models = {",
        '  fast: "~openai/gpt-4o-mini-latest",',
        "};",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "gate: no openrouter context, nothing to check",
    seed: {
      "src/other.ts": [
        'export const model = "openai/gpt-4o";',
        "export const consume = (chunk: any) => chunk.choices[0].delta.content;",
      ].join("\n"),
    },
    expected: [],
  },
];

// Revision 2 cancellation is an informational, occurrence-scoped review.
fixtures.push({name:'abort: two native calls retain distinct positions',seed:{'src/two.ts':
 'fetch("https://openrouter.ai/api/v1/chat/completions");\nfetch("https://openrouter.ai/api/v1/chat/completions");'},expected:[
 {rule:'missing-abort-signal',file:'src/two.ts',line:1,column:0},
 {rule:'missing-abort-signal',file:'src/two.ts',line:2,column:0},
]});

fixtures.push({name:'slug: two actual model selections',seed:{'src/pins.ts':
 "import {openrouter} from '@openrouter/ai-sdk-provider';\nopenrouter('openai/gpt-4.1');\nopenrouter('openai/gpt-4.1');"},expected:[
 {rule:'hardcoded-dated-model-slug',file:'src/pins.ts',line:2,column:0},
 {rule:'hardcoded-dated-model-slug',file:'src/pins.ts',line:3,column:0},
]});

fixtures.push({name:'sse: two unfiltered parse occurrences',seed:{'src/framing.ts':[
 'const c=new AbortController();',
 'const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{signal:c.signal,body:JSON.stringify({stream:true})});',
 'const reader=response.body.getReader();',
 'const {value}=await reader.read();',
 'const text=new TextDecoder().decode(value);',
 'for(const line of text.split("\\n")){',
 '  JSON.parse(line.slice(6));',
 '  JSON.parse(line.slice(6));',
 '}',
].join('\n')},expected:[{rule:'sse-comment-parse-crash',file:'src/framing.ts',line:7,column:2},{rule:'sse-comment-parse-crash',file:'src/framing.ts',line:8,column:2}]});

fixtures.push({name:'midstream: two same-stream content consumers',seed:{'src/errors.ts':[
 "import {OpenRouter} from '@openrouter/sdk';",
 'const client=new OpenRouter();const c=new AbortController();',
 'const stream=await client.chat.send({stream:true},{signal:c.signal});',
 'for await(const chunk of stream){',
 '  out+=chunk.choices[0].delta.content;',
 '  out+=chunk.choices[0].delta.content;',
 '}',
].join('\n')},expected:[{rule:'midstream-error-ignored',file:'src/errors.ts',line:5,column:7},{rule:'midstream-error-ignored',file:'src/errors.ts',line:6,column:7}]});

fixtures.push({name:'midstream: aliased stream options are observed at the request call',seed:{'src/alias-stream.ts':[
 "import {OpenRouter} from '@openrouter/sdk';",
 'const client=new OpenRouter();const c=new AbortController();',
 'const options={stream:true};',
 'const stream=await client.chat.send(options,{signal:c.signal});',
 'options.stream=false;',
 'for await(const chunk of stream){',
 '  out+=chunk.choices[0].delta.content;',
 '}',
].join('\n')},expected:[{rule:'midstream-error-ignored',file:'src/alias-stream.ts',line:7,column:7}]});

fixtures.push({name:'retry: two response-dependent retry requests',seed:{'src/repeats.ts':[
 'async function first(){for(let i=0;i<3;i++){',
 '  const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{signal:null});',
 '  if(res.ok)return res;',
 '}}',
 'async function second(){for(let i=0;i<3;i++){',
 '  const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{signal:null});',
 '  if(res.ok)return res;',
 '}}',
].join('\n')},expected:[
 {rule:'retry-after-ignored',file:'src/repeats.ts',line:2,column:18},
 {rule:'retry-after-ignored',file:'src/repeats.ts',line:6,column:18},
 {rule:'missing-abort-signal',file:'src/repeats.ts',line:2,column:18},
 {rule:'missing-abort-signal',file:'src/repeats.ts',line:6,column:18},
]});
fixtures.push({name:'all checks abstain with provider omitted',analysis:'off',seed:{'src/off.ts':'fetch("https://openrouter.ai/api/v1/chat/completions");'},expected:[]});
