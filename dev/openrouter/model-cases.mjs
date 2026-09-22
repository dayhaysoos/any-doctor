const u='https://openrouter.ai/api/v1/chat/completions';
const raw=body=>`fetch('${u}',{signal:null,body:JSON.stringify(${body})})`;
const setup=`import {OpenRouter as Client} from '@openrouter/sdk'; const client=new Client();`;
export const cases=[
 ['conditional-factory',`import {createOpenRouter} from '@openrouter/ai-sdk-provider';const p=flag?createOpenRouter():external;p('openai/gpt-4.1')`,0,1],
 ['reassigned-factory',`import {createOpenRouter} from '@openrouter/ai-sdk-provider';let p=createOpenRouter();p=external;p('openai/gpt-4.1')`,0,1],
 ['request',raw("{model:'openai/gpt-4.1'}"),1,0],
 ['multiline',`${setup}\nclient.chat.send(\n{model:\n'openai/gpt-4.1'}\n)`,1,0],
 ['model-alias',`${setup}const pin='openai/gpt-4.1';const config={model:pin};client.chat.send(config)`,1,0],
 ['factory',`import {createOpenRouter as make} from '@openrouter/ai-sdk-provider';const p=make();p('openai/gpt-4.1')`,1,0],
 ['factory-alias',`import {openrouter as p} from '@openrouter/ai-sdk-provider';const q=p;q('openai/gpt-4.1')`,1,0],
 ['same-looking',`${setup}console.log('openai/gpt-4.1');const other={model:'openai/gpt-4.1'};client.chat.send({model:'~openai/gpt-latest'})`,0,0],
 ['ordinary',`function createOpenRouter(){return x=>x}const p=createOpenRouter();p('openai/gpt-4.1')`,0,0],
 ['shadow',`${setup}function f(client){client.chat.send({model:'openai/gpt-4.1'})}`,0,0],
 ['other-provider',`import OpenAI from 'openai';const c=new OpenAI();c.chat.completions.create({model:'openai/gpt-4.1'})`,0,0],
 ['computed-property',raw("{['model']:'openai/gpt-4.1'}"),1,0],
 ['spread-pin',raw("{...{model:'~openai/gpt-latest'},model:'openai/gpt-4.1'}"),1,0],
 ['spread-alias',raw("{model:'openai/gpt-4.1',...{model:'~openai/gpt-latest'}}"),0,0],
 ['external-model',`${setup}client.chat.send({model:env.MODEL})`,0,1],
 ['conditional',`${setup}client.chat.send({model:flag?'openai/gpt-4.1':'~openai/gpt-latest'})`,0,1],
 ['unknown-spread',`${setup}client.chat.send({model:'openai/gpt-4.1',...config})`,0,1],
 ['prototype-model',`${setup}client.chat.send({__proto__:{model:'openai/gpt-4.1'}})`,0,1],
 ['reassigned-model',`${setup}let pin='openai/gpt-4.1';pin=external;client.chat.send({model:pin})`,0,1],
 ['opaque-config',`${setup}client.chat.send(makeConfig())`,0,1],
 ['unknown-neighbor',`${setup}client.chat.send({model:env.MODEL});client.chat.send({model:'openai/gpt-4.1'})`,1,1],
 ['two',`${setup}const pin='openai/gpt-4.1';client.chat.send({model:pin});client.chat.send({model:pin})`,2,0],
 ['literal-boundaries',`${setup}client.chat.send({model:'https://host/openai/gpt-4.1'});client.chat.send({model:'2026-09-15'});client.chat.send({model:'fixtures/test-1.ts'})`,0,0],
].map(([name,source,count,unknown])=>({name,source,count,unknown}));
