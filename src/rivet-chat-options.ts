import { z } from 'zod/v4';

export type RivetChatModelId = string;

const rivetRunParamsSchema = z.object({
  openaiApiKey: z.string().optional(),
  openaiEndpoint: z.string().optional(),
  openaiOrganization: z.string().optional(),
  exposeCost: z.boolean().optional(),
  exposeUsage: z.boolean().optional(),
  logTrace: z.boolean().optional(),
  stream: z.string().optional(),
  streamNode: z.string().optional(),
  events: z.string().optional()
})

const graphInputSchema = z.record(
	z.string(), // key type
  z.object({
    type: z.string(),
    value: z.unknown(),
  })
).optional()

const standardChatConfigSchema = z.object({
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  maxTokens: z.number().optional(),
	stop_sequences: z.array(z.string()).optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  seed: z.number().optional(),
  toolChoice: z.enum(['none', 'auto', 'required', 'function']).optional(),
  toolChoiceFunction: z.string().optional(),
  responseFormat: z.enum(['', 'text', 'json', 'json_schema']).optional(),
  responseSchemaName: z.string().optional(),
})

const rivetCustomChatConfigSchema = z.object({
  useTopP: z.boolean().optional(),
  stop: z.string().optional(),
  enableFunctionUse: z.boolean().optional(),
  user: z.string().optional(),
  numberOfChoices: z.number().optional(),
  endpoint: z.string().optional(),
  overrideModel: z.string().optional(),
  overrideMaxTokens: z.number().optional(),
  headers: z.array(
		z.object({
			key: z.string(),
			value: z.string(),
		})
	).optional(),
  parallelFunctionCalling: z.boolean().optional(),
  additionalParameters: z.array(
		z.object({
			key: z.string(),
			value: z.string(),
		})
	).optional(),
  useServerTokenCalculation: z.boolean().optional(),
  outputUsage: z.boolean().optional(),
  usePredictedOutput: z.boolean().optional(),
  reasoningEffort: z.enum(['', 'low', 'medium', 'high']).optional(),
  modalitiesIncludeText: z.boolean().optional(),
  modalitiesIncludeAudio: z.boolean().optional(),
  audioVoice: z.string().optional(),
  audioFormat: z.enum(['wav', 'mp3', 'flac', 'opus', 'pcm16']).optional(),
})

export const rivetLanguageModelOptions = z.object({
  runParams: rivetRunParamsSchema,
  chatConfig: rivetCustomChatConfigSchema,
	rivetInputs: graphInputSchema
})

// Union of standard and custom options for outgoing config
const rivetChatConfigSchema = standardChatConfigSchema.merge(rivetCustomChatConfigSchema)

export const rivetToolOptions = z.record(
  z.string(),
	z.object({ //See RivetTool
		name: z.string(),
		namespace: z.string().optional(),
		description: z.string(),
		parameters: z.object({}).passthrough(),
		strict: z.boolean().optional()
	})
)

export type RivetLanguageModelOptions = z.infer<
  typeof rivetLanguageModelOptions
>

export type RivetCustomChatConfigOptions = z.infer<
  typeof rivetCustomChatConfigSchema
>

export type RivetRunParamsOptions = z.infer<
  typeof rivetRunParamsSchema
>

export type RivetChatConfigOptions = z.infer<
	typeof rivetChatConfigSchema
>
