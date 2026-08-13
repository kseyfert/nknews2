import { z } from 'zod'

export const baseEnvSchema = z.object({
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum([
    'development',
    'production',
    'test'
  ]).default('development'),
})

export const pipelineEnvSchema = baseEnvSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
})

export type BaseEnv = z.infer<typeof baseEnvSchema>
export type PipelineEnv = z.infer<typeof pipelineEnvSchema>

export function validateEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:')
    for (let issue of result.error.issues) {
      console.error(`\t${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1)
  }
  return result.data
}