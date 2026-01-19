import {
  type LanguageModelV2CallOptions,
  type LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import type { RivetTool, RivetToolChoice } from './rivet-chat-prompt';
import { parseProviderOptions } from '@ai-sdk/provider-utils';
import { rivetToolOptions } from './rivet-chat-options';
import { debugLog, printObject } from './utils';

export async function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
}): Promise<{
	tools: Array<RivetTool> | undefined;
	toolSchemas: Array<RivetTool> | undefined;
	toolChoice: RivetToolChoice | undefined;
	toolWarnings: LanguageModelV2CallWarning[];
}> {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolSchemas: undefined, toolChoice: undefined, toolWarnings };
  }

	debugLog(`\n\nprepare tools input:${printObject(tools)}`)

  const rivetTools: Array<RivetTool> = [];
  const rivetSchemas: Array<RivetTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
			const options = (await parseProviderOptions({
				provider: 'rivet',
				providerOptions: tool.providerOptions,
				schema: rivetToolOptions,
			})) ?? {};

      rivetTools.push({
        name: tool.name,
				namespace: 'openapi',
        description: tool.description || '',
				parameters: tool.inputSchema,
				strict: false
      });

			for (const [_, value] of Object.entries(options)) {
				rivetSchemas.push({
					name: value.name,
					description: value.description || '',
					parameters: value.parameters,
					strict: false
				});
			}
    }
  }

	debugLog(`rivetSchemas:${printObject(rivetSchemas)}`)

  if (toolChoice == null) {
    return { tools: rivetTools, toolSchemas: rivetSchemas, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: rivetTools, toolSchemas: rivetSchemas, toolChoice: { toolChoice: type }, toolWarnings };

    // Rivet toolChoice for 'tool' is called 'function',
    case 'tool':
      return {
        tools: rivetTools,
				toolSchemas: rivetSchemas,
        toolChoice: { toolChoice: 'function', toolChoiceFunction: toolChoice.toolName },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
