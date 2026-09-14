async function settle(tasks){return await Promise.all(tasks)}
const tasks=[1,2].map(async x=>x); await settle(tasks);