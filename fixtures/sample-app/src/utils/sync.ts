export function syncLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    logger.warn('sync failed', e)
  }
}

export function prefetch(url: string) {
  fetch(url, { headers: { 'x-mode': 'background' } })
}

export async function hydrate(ids: string[]) {
  const done = await Promise.all(ids.map(async id => fetchRecord(id)))
  return done
}
