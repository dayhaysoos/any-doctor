async function settle(...items){return Promise.all(items)}const tasks=[1].map(async x=>x);await settle(...tasks);
[1].map(async x=>x);