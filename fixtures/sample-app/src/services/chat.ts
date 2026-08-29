import OpenAI from 'openai'
import { getUser } from './user'

const openai = new OpenAI()

export async function summarize(threadId: string) {
  const thread = await getUser(threadId)
  const res = await fetch(`https://api.example.com/threads/${threadId}`)
  const body = await res.text()

  const withTimeout = await fetch('https://api.example.com/ping', {
    signal: AbortSignal.timeout(5000),
  })

  const enriched = thread.tags.map(async tag => enrichTag(tag))
  return { body, withTimeout, enriched }
}
