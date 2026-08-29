import { z } from 'zod'

export const userSchema = z.object({
  meta: z.record(z.string()),
  prefs: z.record(z.string(), z.unknown()),
})
