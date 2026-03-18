import {
  type LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { isSupportedImageMediaType, type RivetAssistantFunctionCall, type RivetPrompt } from './rivet-chat-prompt';
import { convertToBase64 } from '@ai-sdk/provider-utils';

export function convertToRivetChatMessages(
  prompt: LanguageModelV2Prompt,
): RivetPrompt {
  const messages: RivetPrompt = [];

  for (let i = 0; i < prompt.length; i++) {
    const pr = prompt[i];
		if (!pr) continue // or handle as needed
    const { role, content } = pr;

    switch (role) {
      case 'system': {
        messages.push({ type: 'system', message: content });
        break;
      }

      case 'user': {
        messages.push({
          type: 'user',
          message: content.map(part => {
            switch (part.type) {
              case 'text': {
                return part.text;
              }

              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;

									if (isSupportedImageMediaType(mediaType)) {
										return {
											type: 'url',
											mediaType: mediaType,
											url:
												part.data instanceof URL
													? part.data.toString()
													: `data:${mediaType};base64,${convertToBase64(part.data)}`,
										}
									} else {
										throw new UnsupportedFunctionalityError({
											functionality: 'Invalid images mediaType',
										})
									}
                }
								else if (part.mediaType === 'application/pdf') {
                   return {
                    	type: 'file',
											filename: part.filename || 'file.pdf',
								 			mediaType: 'application/pdf',
                      data: part.data.toString(),
                   }
                }
								// else if (part.mediaType === 'application/pdf') {
                //   return {
                //     type: 'document',
								// 		mediaType: 'application/pdf',
                //     data: part.data.toString(),
                //   }
                // }
								else {
                  throw new UnsupportedFunctionalityError({
                    functionality:
                      'Only images and PDF file parts are supported',
                  })
                }
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: Array<RivetAssistantFunctionCall> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
              });
              break;
            }
            case 'reasoning': {
              text += part.text;
              break;
            }
            default: {
              throw new Error(
                `Unsupported content type in assistant message: ${part.type}`,
              );
            }
          }
        }

        messages.push({
          type: 'assistant',
          message: text,
          function_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }
      case 'tool': {
        for (const toolResponse of content) {
          const output = toolResponse.output;
          let contentValue: string;

          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
          }

          messages.push({
            type: 'function',
            message: contentValue,
            name: toolResponse.toolCallId,
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
