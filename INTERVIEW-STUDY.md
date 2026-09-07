# Interview Study Guide

## 30-second project explanation

Study Assistant is a Next.js modular monolith that turns pasted study material into flashcards and a multiple-choice quiz. The browser sends the material to a server route, the server makes one Groq request, and the result passes through Zod validation and normalization before it reaches the UI. The API key stays on the server, while React hooks manage client behavior and components focus on presentation.

## Request flow

```text
User enters notes
  -> InputPanel
  -> useGeneration
  -> POST /api/generate
  -> route validates the request
  -> generate.server.ts calls Groq
  -> normalize.ts validates model output
  -> client validates the response again
  -> flashcards and quiz render
```

## Files to study

1. `src/app/api/generate/route.ts` — HTTP transport and status codes
2. `src/features/study-session/api/schema.ts` — shared Zod contract
3. `src/features/study-session/server/generate.server.ts` — Groq request and error mapping
4. `src/features/study-session/normalize.ts` — unreliable model-output handling
5. `src/features/study-session/hooks/useGeneration.ts` — cache, cancellation, and stale-response protection
6. `src/features/study-session/components/Workspace.tsx` — feature composition

## Main architecture decisions

### Why Next.js

Next.js provides the React UI and server route handlers in one project. The server boundary protects the Groq API key, and the client and server can share the same Zod schemas.

### Why a modular monolith

The application has one main feature and one external provider. Keeping everything in one deployable project makes development and deployment simple while still separating transport, server logic, contracts, normalization, and presentation.

### Why feature-based folders

The study-session feature keeps its own components, hooks, server code, contract, and normalization logic together. This makes the feature boundary clear and allows another feature to be added without scattering its files across global folders.

### Why Zod

Zod provides runtime validation and TypeScript inference from the same definitions. The schemas validate requests, model output, API responses, and the JSON Schema sent to Groq.

### Why tool calling

The session schema is converted into a JSON Schema and sent as a forced Groq tool call. This reduces malformed output, but the returned tool arguments are still model-generated text, so they must be parsed and validated.

### Why normalize model output

A model can return valid JSON with the wrong shape, invalid answer indexes, duplicate IDs, or incomplete items. `normalize.ts` repairs safe representations, drops unusable items, and rejects the result when nothing useful remains. It never invents study content.

### Why validate on the client too

The server validates the response before returning it. The client validates it again to protect against an unexpected response or a client and server contract mismatch. A controlled error is better than a rendering crash.

## Important behavior in `useGeneration.ts`

### AbortController

A new request cancels the previous request. Unmounting the component also cancels an in-flight request.

### Request ID guard

Cancellation is asynchronous, so a previous request may still finish. Each request receives an increasing ID, and only the latest request can update state. This prevents an old response from overwriting a newer result.

### Local cache

The request text and settings are hashed into a localStorage key. Repeating the same request can return immediately without another Groq call.

### Reducer

Generation has related states such as idle, loading, success, and error. `useReducer` keeps those transitions together instead of allowing several independent state values to become inconsistent.

## Likely interview questions

### What happens when the model returns invalid data?

The normalizer extracts JSON, repairs safe formatting problems, validates each flashcard and quiz question, drops malformed items, and reports warnings. If no usable content remains, the request returns an error.

### How do you prevent stale responses?

I use both an AbortController and a monotonic request ID. The controller stops work, while the request ID prevents an older response from writing to state if cancellation races with completion.

### Why do components not call fetch?

Network state belongs in hooks. Components receive state as props and emit user actions through callbacks, which keeps presentation separate from transport and makes components easier to test.

### Why no React Query, Zustand, or Context?

This app has one non-idempotent generation request, one local session library, and a shallow component tree. Custom hooks, a reducer, and props are enough. Those libraries would add behavior the app does not currently need.

### How is the API key protected?

The key is read only in server-side code. The browser calls `/api/generate`, never Groq directly, and no `NEXT_PUBLIC_` environment variable contains the key.

### What would you improve next?

I would add unit tests for `normalize.ts`, add rate limiting to the generation endpoint, and consider item-level streaming so validated flashcards can appear progressively.

## Strong closing summary

> The main design decision is to isolate unreliable model output at one normalization boundary. The UI receives validated data, the API key remains server-side, and the request state handles cancellation, caching, and stale responses explicitly.

## Security reminder

Never commit or share `.env.local`. If an API key is exposed, revoke it and create a replacement immediately.
