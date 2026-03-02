# Copilot Instructions for Rivet AI SDK Provider

## Overview
This repository provides the Rivet AI SDK for integration with various AI models. The architecture is designed to facilitate communication between the SDK and external AI services, enabling seamless interactions and data processing.

## Architecture
- **Core Components**: The main components include `rivet-provider.ts`, `rivet-chat-language-model.ts`, and `post-to-api.ts`. These files handle the core functionalities of the SDK, including API interactions and message formatting.
- **Service Boundaries**: Each component is responsible for specific functionalities, such as message conversion, API requests, and response handling. Understanding these boundaries is crucial for effective debugging and feature development.
- **Data Flows**: Data flows through the SDK from user inputs to API requests and back to the user. Key functions like `createRivet` and `postJsonToApi` manage these flows.

## Developer Workflows
- **Building the Project**: Use the command `pnpm run build` to compile the TypeScript files into JavaScript. The build process is defined in `tsup.config.ts`.
- **Running Tests**: Tests can be executed using `pnpm test`, which runs both node and edge tests as defined in the `package.json` scripts.
- **Debugging**: Utilize the `vitest` framework for debugging. The configuration files (`vitest.node.config.ts`, `vitest.edge.config.ts`, `vitest.e2e.config.ts`) specify the testing environments.

## Project Conventions
- **TypeScript Practices**: The project adheres to strict TypeScript conventions, as outlined in `tsconfig.json`. Ensure to follow the defined rules for type safety and code quality.
- **File Structure**: Organize files by functionality. For example, all test files are located in the `e2e` directory, while core functionalities reside in the `src` directory.

## Integration Points
- **External Dependencies**: The SDK relies on several external packages, including `@ai-sdk/provider` and `@ai-sdk/provider-utils`. These are specified in `package.json` and should be installed via `pnpm`.
- **Cross-Component Communication**: Components communicate through well-defined interfaces. For instance, `RivetChatLanguageModel` interacts with `post-to-api` to send and receive messages.

## Examples
- **Creating a Rivet Instance**: Use the following code to create an instance of the Rivet SDK:
  ```typescript
  const rivet = createRivet({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: `${process.env.OPENROUTER_API_BASE}/api/v1`,
  });
  ```
- **Sending Messages**: To send a message, utilize the `generateText` function from the `ai` package:
  ```typescript
  const response = await generateText({
    model,
    messages: messageHistory,
  });
  ```

## Conclusion
This document serves as a guide for AI coding agents to navigate and utilize the Rivet AI SDK effectively. For further details, refer to the specific files mentioned above and the overall project documentation.