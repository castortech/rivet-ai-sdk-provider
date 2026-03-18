export type RivetPrompt = Array<RivetMessage>;

const SUPPORTED_IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
] as const

export type SupportedImageMediaTypes = typeof SUPPORTED_IMAGE_MEDIA_TYPES[number]
export type SupportedDocumentMediaTypes = 'application/pdf' | 'text/plain';

export type RivetAssistantFunctionCall = {
  id: string | undefined;
  name: string;
  arguments: string; // JSON string
};

export type RivetChatMessagePart =
  | string
  | { type: 'image'; mediaType: SupportedImageMediaTypes; data: Uint8Array }
  | { type: 'url'; url: string }
  | {
      type: 'file';
      filename: string | undefined;
      mediaType: SupportedDocumentMediaTypes;
      data: string;
    }
  | {
      type: 'document';
      title: string | undefined;
      context: string | undefined;
      mediaType: SupportedDocumentMediaTypes;
      data: Uint8Array;
      enableCitations: boolean;
    };

export type RivetMessage =
  | RivetSystemMessage
  | RivetUserMessage
  | RivetAssistantMessage
  | RivetToolMessage;

export interface RivetSystemMessage {
  type: 'system';
  message: RivetChatMessagePart | RivetChatMessagePart[]
	isCacheBreakpoint?: boolean;
}

export interface RivetUserMessage {
  type: 'user';
  message: RivetChatMessagePart | RivetChatMessagePart[]
}

export interface RivetAssistantMessage {
  type: 'assistant';
  message: string;
  function_calls: RivetAssistantFunctionCall[] | undefined;
	isCacheBreakpoint?: boolean;
}

export interface RivetToolMessage {
  type: 'function';
  name: string; //use to return the 'tool_call_id' value
  message: string;
	isCacheBreakpoint?: boolean;
}

export type RivetTool = {  //same as Rivet GptFunction
  name: string;
  namespace?: string;
  description: string;
  parameters: object;
  strict?: boolean;
}

export type RivetToolChoice = {
	toolChoice?: 'none' | 'auto' | 'required' | 'function'
  toolChoiceFunction?: string
}

export const isSupportedImageMediaType = (
  mediaType: string,
): mediaType is SupportedImageMediaTypes =>
  SUPPORTED_IMAGE_MEDIA_TYPES.includes(mediaType as SupportedImageMediaTypes)

//This has to match verbatim what is in Rivet type ChatCompletionResponse
export type RivetUsage = {
	completion_tokens: number;
	prompt_tokens: number;
	total_tokens: number;

	prompt_tokens_details: {
		cached_tokens: number;
		audio_tokens: number;
		text_tokens: number;
		image_tokens: number;
	}

	completion_tokens_details: {
		reasoning_tokens: number;
		audio_tokens: number;
		accepted_prediction_tokens: number;
		rejected_prediction_tokens: number;
		text_tokens: number;
	}
}
