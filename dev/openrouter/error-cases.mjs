const setup=`import {OpenRouter} from '@openrouter/sdk';const client=new OpenRouter();const stream=await client.chat.send({stream:true});`;
const content='out += chunk.choices[0].delta.content;';
const loop=body=>`${setup}for await(const chunk of stream){${body}}`;
export const cases=[
 ['compound-guard',loop(`if(chunk.error||chunk.choices[0].finish_reason==='error')throw 0;${content}`),0,0],
 ['loop-destructuring',`${setup}for await(const {choices:[{delta}]} of stream){out+=delta.content}`,1,0],
 ['direct',loop(content),1,0],
 ['early-error',loop(`if(chunk.error)throw new Error('failed');${content}`),0,0],
 ['finish-reason',loop(`if(chunk.choices[0].finish_reason==='error')throw new Error('failed');${content}`),0,0],
 ['late-error',loop(`${content}if(chunk.error)throw new Error('failed');`),1,0],
 ['other-error',loop(`if(other.error)throw new Error('failed');${content}`),1,0],
 ['alias',loop(`const event=chunk;out+=event.choices[0].delta.content;`),1,0],
 ['destructured',loop(`const {choices}=chunk;const [{delta}]=choices;out+=delta.content;`),1,0],
 ['computed',loop(`out+=chunk['choices'][0]['delta']['content'];`),1,0],
 ['multiline',loop(`out += chunk\n.choices[0]\n.delta.content;`),1,0],
 ['stored-before-guard',loop(`const content=chunk.choices[0].delta.content;if(chunk.error)throw new Error('failed');out+=content;`),0,0],
 ['two',loop(`${content}${content}`),2,0],
 ['two-streams',`${setup}const other=await client.chat.send({stream:true});for await(const chunk of stream){if(chunk.error)throw 0;${content}}for await(const chunk of other){${content}}`,1,0],
 ['shadow',`${setup}function consume(stream){for(const chunk of stream){${content}}}`,0,0],
 ['unrelated-function',loop(`function handle(other){if(other.error)throw 0}${content}`),1,0],
 ['opaque-consumer',loop(`consume(chunk);`),0,1],
 ['opaque-neighbor',loop(`consume(chunk);${content}`),1,1],
 ['reassignment',loop(`let event=chunk;event=external;out+=event.choices[0].delta.content;`),0,1],
 ['conditional',loop(`const event=flag?chunk:external;out+=event.choices[0].delta.content;`),0,1],
 ['unknown-handler',loop(`if(hasError(chunk))throw 0;${content}`),0,2],
 ['error-lookalike',`const openrouter='marker';for(const chunk of unrelated){${content}}`,0,0],
].map(([name,source,count,unknown])=>({name,source,count,unknown}));
