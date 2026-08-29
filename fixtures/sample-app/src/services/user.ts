export async function getUser(id: string) {
  const cached = localStorage.getItem('user-' + id)
  if (cached) return JSON.parse(cached)
  try {
    const res = await fetch('/api/users/' + id)
    return res.json()
  } catch (e) {
    return null
  }
}
