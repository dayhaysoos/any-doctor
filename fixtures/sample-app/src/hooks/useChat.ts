import { Anthropic } from "@anthropic-ai/sdk"
import { useEffect, useState } from 'react'

export function useChat(id: string) {
  const [msgs, setMsgs] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chat-' + id)
      setMsgs(raw ? JSON.parse(raw) : [])
    } catch (e) {}
  }, [id])

  return msgs
}
