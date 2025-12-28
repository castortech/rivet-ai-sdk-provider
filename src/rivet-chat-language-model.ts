import type {
  LanguageModelV2,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  type FetchFunction,
  generateId,
  parseProviderOptions,
  type ParseResult,
	type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertToRivetChatMessages } from './convert-to-rivet-chat-messages';
import { getResponseMetadata } from './get-response-metadata';
import { mapRivetFinishReason } from './map-rivet-finish-reason';
import {
	type RivetChatConfigOptions,
  type RivetChatModelId,
  type RivetLanguageModelOptions,
  rivetLanguageModelOptions,
} from './rivet-chat-options';
import { rivetFailedResponseHandler } from './rivet-error';
import { prepareTools } from './rivet-prepare-tools';
import { debugLog, printObject } from './utils';
import { createEventSourceResponseHandler, postJsonToApi } from './post-to-api';
import type { RivetUsage } from './rivet-chat-prompt';

type RivetChatConfig = {
  provider: string;
  baseURL: string;
  apiKey?: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId?: () => string;
};

export class RivetChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';

  readonly modelId: RivetChatModelId;
  private readonly config: RivetChatConfig;
  private readonly generateId: () => string;

  constructor(modelId: RivetChatModelId, config: RivetChatConfig) {
    this.modelId = modelId;
    this.config = config;
    this.generateId = config.generateId ?? generateId;
  }

  get provider(): string {
    return this.config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    'application/pdf': [/^https:\/\/.*$/],
  };

	// Response Schema name and content to be passed in earlier if needed

  private async getArgs({
    prompt, //in Rivet separate
    maxOutputTokens, //in Rivet chat config
    temperature,  //in Rivet chat config
    topP, //in Rivet chat config
    topK, //in Rivet chat config (some models like Anthropic and Google)
    frequencyPenalty, //in Rivet chat config
    presencePenalty, //in Rivet chat config
    stopSequences, //in Rivet chat config
    responseFormat, //in Rivet chat config
    seed, //in Rivet chat config
    providerOptions,
    tools, //in Rivet separate
    toolChoice, //in Rivet tool section
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    const warnings: LanguageModelV2CallWarning[] = [];

		const emptyOptions: RivetLanguageModelOptions = {
			runParams: {},
			chatConfig: {},
			rivetInputs: {}
		}

		debugLog(`providerOptions:${printObject(providerOptions)}`)

    const options = (await parseProviderOptions<RivetLanguageModelOptions>({
			provider: 'rivet',
			providerOptions,
			schema: rivetLanguageModelOptions,
		})) ?? emptyOptions;

		debugLog(`options:${printObject(options)}`)

    const {
      tools: rivetTools,
      toolSchemas: rivetSchemas,
      toolChoice: rivetToolChoice,
      toolWarnings,
    } = await prepareTools({ tools, toolChoice });

		// Ensure inner objects exist even if parseProviderOptions returns partials
		options.runParams = options.runParams ?? {}
		options.chatConfig = options.chatConfig ?? {}
		options.rivetInputs = options.rivetInputs ?? {}

    const chatConfig: RivetChatConfigOptions = { ...options.chatConfig }

		chatConfig.maxTokens = chatConfig.maxTokens ?? maxOutputTokens
		chatConfig.temperature = chatConfig.temperature ?? temperature
		chatConfig.top_p = chatConfig.top_p ?? topP
		chatConfig.top_k = chatConfig.top_k ?? topK
		chatConfig.stop_sequences = chatConfig.stop_sequences ?? stopSequences
		chatConfig.frequencyPenalty = chatConfig.frequencyPenalty ?? frequencyPenalty
		chatConfig.presencePenalty = chatConfig.presencePenalty ?? presencePenalty
		chatConfig.seed = chatConfig.seed ?? seed

		if (responseFormat) {
			const isJson = responseFormat?.type === 'json'
			const hasSchema = isJson && !!responseFormat?.schema

			chatConfig.responseFormat = isJson
				? hasSchema ? 'json_schema' : 'json'
				: responseFormat?.type

			chatConfig.responseSchemaName = isJson && hasSchema
				? responseFormat.schema
				: undefined
		}

		if (rivetToolChoice) {
			chatConfig.toolChoice = rivetToolChoice.toolChoice
			chatConfig.toolChoiceFunction = rivetToolChoice.toolChoiceFunction
		}

		const messages = convertToRivetChatMessages(prompt)

    return {
      args: {
				chatConfig: {
					type: 'object',
					value: chatConfig,
				},
				input: {  //assign chat messages to the input node
					type: 'chat-message[]',
					value: messages,
				},
				tools: {
					type: 'gpt-function[]',
					value: rivetTools,
				},
				toolSchemas: {
					type: 'gpt-function[]',
					value: rivetSchemas,
				},
				runParams: { ...options.runParams },
    		...(options.rivetInputs ?? {})
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args: body, warnings } = await this.getArgs(options);
		const headers = combineHeaders(this.config.headers(), options.headers)
		let responseId = headers['X-Completion-Id']
		responseId = responseId ?? this.generateId()

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers,
      body,
      failedResponseHandler: rivetFailedResponseHandler,
      successfulResponseHandler: rivetChatResponseHandler(`rivetcmpl-${responseId}`, this.modelId),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
		if (!choice) {
			throw new Error('No choices found')
		}
    const content: Array<LanguageModelV2Content> = [];

    // process content parts in order to preserve sequence
    if (choice.message.content != null && Array.isArray(choice.message.content)) {
      for (const part of choice.message.content) {
        if (part.type === 'thinking') {
          const reasoningText = extractReasoningContent(part.thinking);
          if (reasoningText.length > 0) {
            content.push({ type: 'reasoning', text: reasoningText });
          }
        } else if (part.type === 'text') {
          if (part.text.length > 0) {
            content.push({ type: 'text', text: part.text });
          }
        }
      }
    } else { // handle legacy string content
      const text = extractTextContent(choice.message.content);
      if (text != null && text.length > 0) {
        content.push({ type: 'text', text });
      }
    }

    if (choice.message.tool_calls != null) { // tool calls:
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: toolCall.function.arguments!,
        });
      }
    }

    return {
      content,
      finishReason: mapRivetFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

	async doStream(
		options: Parameters<LanguageModelV2['doStream']>[0]
	): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
		const { args, warnings } = await this.getArgs(options)
		const body = args
		debugLog(`body:${printObject(body)}`)

		const headers = combineHeaders(this.config.headers(), options.headers)
		let responseId = headers['X-Completion-Id'] ?? this.generateId()
		const model = this.modelId

		const { responseHeaders, value: response } = await postJsonToApi({
			url: `${this.config.baseURL}/${this.modelId}`,
			headers,
			body,
			failedResponseHandler: rivetFailedResponseHandler,
			successfulResponseHandler: createRivetEventSourceResponseHandler(`rivetcmpl-${responseId}`, model),
			abortSignal: options.abortSignal,
			fetch: this.config.fetch,
		})

		let finishReason: LanguageModelV2FinishReason = 'unknown'
		const usage: LanguageModelV2Usage = {
			inputTokens: undefined,
			outputTokens: undefined,
			totalTokens: undefined,
		}

		let isFirstChunk = true
		let activeText = false
		let activeReasoningId: string | null = null
		const generateId = this.generateId

		return {
			stream: response.pipeThrough(
				new TransformStream<
					ParseResult<z.infer<typeof rivetChatChunkSchema>>,
					LanguageModelV2StreamPart
				>({
					start(controller) {
						controller.enqueue({ type: 'stream-start', warnings })
					},
					transform(chunk, controller) {
            // Emit raw chunk if requested (before anything else)
						if (options.includeRawChunks) {
							controller.enqueue({ type: 'raw', rawValue: chunk.rawValue })
						}
						if (!chunk.success) {
							controller.enqueue({ type: 'error', error: chunk.error })
							return
						}
						const value = chunk.value

						if (isFirstChunk) {
							isFirstChunk = false
							controller.enqueue({
								type: 'response-metadata',
								...getResponseMetadata(value),
							})
						}

						if (value.usage != null) {
							usage.inputTokens = value.usage.prompt_tokens
							usage.outputTokens = value.usage.completion_tokens
							usage.totalTokens = value.usage.total_tokens
						}

						const choice = value.choices[0]
						if (!choice) {
  						throw new Error('No choices found')
						}
						const delta = choice.delta
						const textContent = extractTextContent(delta.content)

						if (delta.content != null && Array.isArray(delta.content)) {
							for (const part of delta.content) {
								if (part.type === 'thinking') {
									const reasoningDelta = extractReasoningContent(part.thinking)
									if (reasoningDelta.length > 0) {
										if (activeReasoningId == null) {
                      // end any active text before starting reasoning
											if (activeText) {
												controller.enqueue({ type: 'text-end', id: '0' })
												activeText = false
											}
											activeReasoningId = generateId()
											controller.enqueue({
												type: 'reasoning-start',
												id: activeReasoningId,
											})
										}
										controller.enqueue({
											type: 'reasoning-delta',
											id: activeReasoningId,
											delta: reasoningDelta,
										})
									}
								}
							}
						}

						if (textContent != null && textContent.length > 0) {
							if (!activeText) {
                // if we were in reasoning mode, end it before starting text
								if (activeReasoningId != null) {
									controller.enqueue({
										type: 'reasoning-end',
										id: activeReasoningId,
									})
									activeReasoningId = null
								}
								controller.enqueue({ type: 'text-start', id: '0' })
								activeText = true
							}
							controller.enqueue({
								type: 'text-delta',
								id: '0',
								delta: textContent,
							})
						}

						if (delta?.tool_calls != null) {
							for (const toolCall of delta.tool_calls) {
								const toolCallId = toolCall.id
								const toolName = toolCall.function.name
								const input = toolCall.function.arguments

								controller.enqueue({
									type: 'tool-input-start',
									id: toolCallId,
									toolName,
								})
								controller.enqueue({
									type: 'tool-input-delta',
									id: toolCallId,
									delta: input,
								})
								controller.enqueue({
									type: 'tool-input-end',
									id: toolCallId,
								})
								controller.enqueue({
									type: 'tool-call',
									toolCallId,
									toolName,
									input,
								})
							}
						}

						if (choice.finish_reason != null) {
							finishReason = mapRivetFinishReason(choice.finish_reason)
						}
					},
					flush(controller) {
						if (activeReasoningId != null) {
							controller.enqueue({
								type: 'reasoning-end',
								id: activeReasoningId,
							})
						}
						if (activeText) {
							controller.enqueue({ type: 'text-end', id: '0' })
						}
						controller.enqueue({
							type: 'finish',
							finishReason,
							usage,
						})
					},
				}),
			),
			request: { body },
			response: { headers: responseHeaders },
		}
	}
}

function extractReasoningContent(
  thinking: Array<{ type: string; text: string }>,
) {
  return thinking
    .filter(chunk => chunk.type === 'text')
    .map(chunk => chunk.text)
    .join('');
}

function extractTextContent(content: z.infer<typeof rivetContentSchema>) {
  if (typeof content === 'string') {
    return content;
  }

  if (content == null) {
    return undefined;
  }

  const textContent: string[] = [];

  for (const chunk of content) {
    const { type } = chunk;

    switch (type) {
      case 'text':
        textContent.push(chunk.text);
        break;
      case 'thinking':
      case 'image_url':
      case 'reference':
        // thinking, image content, and reference content are currently ignored
        break;
      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  return textContent.length ? textContent.join('') : undefined;
}

const rivetContentSchema = z
  .union([
    z.string(),
    z.array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('text'),
          text: z.string(),
        }),
        z.object({
          type: z.literal('image_url'),
          image_url: z.union([
            z.string(),
            z.object({
              url: z.string(),
              detail: z.string().nullable(),
            }),
          ]),
        }),
        z.object({
          type: z.literal('reference'),
          reference_ids: z.array(z.number()),
        }),
        z.object({
          type: z.literal('thinking'),
          thinking: z.array(
            z.object({
              type: z.literal('text'),
              text: z.string(),
            }),
          ),
        }),
      ]),
    ),
  ])
  .nullish();

const rivetUsageSchema = z.object({
   prompt_tokens: z.number(),
   completion_tokens: z.number(),
   total_tokens: z.number(),
 });

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const rivetChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: rivetContentSchema,
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              function: z.object({ name: z.string(), arguments: z.string() }),
            }),
          )
          .nullish(),
      }),
      index: z.number(),
      finish_reason: z.string().nullish(),
    }),
  ),
  object: z.literal('chat.completion'),
  usage: rivetUsageSchema,
});

type RivetChatResponse = z.infer<
	typeof rivetChatResponseSchema
>

const rivetChatResponseHandler = (
  id: string,
  model: string
): ResponseHandler<RivetChatResponse> => async ({
  url,
  requestBodyValues,
  response,
}) => {
  const raw = (await response.json()) as Record<string, any>
  const mapped = mapGraphOutputsToSDK(raw, id, model)
  return {
    value: rivetChatResponseSchema.parse(mapped),
  }
}

function mapGraphOutputsToSDK(
  outputs: Record<string, any>,
  id: string | null,
  model: string | null
) {
  return {
    id,
    created: Date.now(),
    model,
    object: 'chat.completion',
    choices: [
      {
        message: {
          role: 'assistant',
          content: outputs.output?.value ?? '',
        },
        index: 0,
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: outputs.requestTokens?.value ?? 0,
      completion_tokens: outputs.responseTokens?.value ?? 0,
      total_tokens:
        (outputs.requestTokens?.value ?? 0) +
        (outputs.responseTokens?.value ?? 0),
    },
  }
}

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const rivetChatChunkSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).optional(),
        content: rivetContentSchema,
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              function: z.object({ name: z.string(), arguments: z.string() }),
            }),
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
      index: z.number(),
    }),
  ),
  usage: rivetUsageSchema.nullish(),
});

function createRivetEventSourceResponseHandler(
  id: string | null,
  model: string | null
): ReturnType<typeof createEventSourceResponseHandler> {
  return createEventSourceResponseHandler(z.any().transform((data) => {
		debugLog(`SSE event received:${printObject(data)}`)
    return mapRivetEventToOpenAIChunk(data, id, model)
  }))
}

function mapRivetEventToOpenAIChunk(
  eventData: any,
  id: string | null,
  model: string | null
): z.infer<typeof rivetChatChunkSchema> {
  const eventType = eventData.type

  switch (eventType) {
    case 'partialOutput':
      return {
        id,
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            delta: {
              role: 'assistant',
              content: eventData.delta ?? '',
              tool_calls: undefined,
            },
            finish_reason: null,
            index: 0,
          },
        ],
        usage: undefined,
      }
    case 'nodeFinish':  //Note that original has !hasDelta that was set via 'partialOutput'
			const rawContent =
				eventData.outputs?.response?.value ??
				eventData.outputs?.valueOutput?.value ??
				undefined

			const delta =
				typeof rawContent === 'string'
					? rawContent
					: rawContent !== undefined
						? JSON.stringify(rawContent)
						: undefined

      return {
        id,
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            delta: {
              role: 'assistant',
              content: delta ?? '',
              tool_calls: undefined,
            },
            finish_reason: null,
            index: 0,
          },
        ],
        usage: toOpenAIUsage(eventData?.output?.usages?.value?.[0]?.value),
      }
    case 'done':
      return {
        id,
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            delta: {
              role: 'assistant',
              content: eventData.graphOutput?.response?.value ?? '',
              tool_calls: undefined,
            },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: toOpenAIUsage(eventData.graphOutput.usages?.value?.[0]?.value),
      }
    default:
      // ignore unhandled events
			debugLog(`falling on default for type:${printObject(eventType)}`)
      return {
        id,
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            delta: {
              role: 'assistant',
              content: '',
              tool_calls: undefined,
            },
            finish_reason: null,
            index: 0,
          },
        ],
        usage: undefined,
      }
  }
}

const toOpenAIUsage = (usage?: RivetUsage) => {
	debugLog(`Usage to convert:${printObject(usage)}`)

	return usage
 		? {
			prompt_tokens: usage.prompt_tokens,
			completion_tokens: usage.completion_tokens,
			total_tokens: usage.total_tokens,
   	}
  	: undefined
}
