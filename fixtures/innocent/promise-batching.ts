type Job = { id: string; done: boolean };

async function run(jobs: Job[], apply: (j: Job) => Promise<void>) {
  // Immediate members of an awaited combiner are consumed.
  const [first, second] = await Promise.all([
    apply(jobs[0]),
    apply(jobs[1]),
  ]);

  // Pushed promises awaited together are consumed.
  const pending: Promise<void>[] = [];
  for (const job of jobs.slice(2)) {
    pending.push(apply(job));
  }
  await Promise.all(pending);

  // A returned promise is consumed by the caller.
  const next = async () => apply(jobs[0]);
  return [first, second, next];
}

export const batching = { run };
