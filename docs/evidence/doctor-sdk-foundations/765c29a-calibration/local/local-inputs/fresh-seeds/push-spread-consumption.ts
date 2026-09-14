const tasks=[1].map(async x=>x);const pending=[];pending.push(...tasks);await Promise.all(pending);
[1].map(async x=>x);