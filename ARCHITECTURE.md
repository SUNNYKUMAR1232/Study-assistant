# Architecture and Decisions

## Summary

Study Assistant is a modular monolith. It keeps the UI, API routes, validation, and Groq integration in one deployable application while preserving clear feature boundaries.

The application turns pasted study material into flashcards and a multiple-choice quiz. A single Groq request uses a tool definition generated from the Zod schema. The response is normalized and validated before it reaches the UI.

## Structure

```text
src/
  app/
    api/                         HTTP transport
  features/study-session/
    api/schema.ts                shared request and response contract
    server/                      Groq client and server use cases
    normalize.ts                 model-output parsing and validation
    dev/chaos.ts                 development failure injection
    hooks/                       client state and behavior
    components/                  presentation
    types.ts                     types inferred from the schema
  shared/
    ui/                          reusable UI components
    lib/                         reusable utilities
    hooks/                       reusable hooks
```

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Transport | `src/app/api/*/route.ts` | Parse HTTP requests, validate input, delegate, and create HTTP responses. |
| Server | `features/study-session/server/` | Run generation and health use cases, call Groq, and map provider failures. |
| Contract | `features/study-session/api/schema.ts` | Define the shared request, response, and model-output shapes. |
| Normalization | `features/study-session/normalize.ts` | Parse, repair, drop, and validate unreliable model output. |
| Presentation | `features/study-session/hooks/`, `components/` | Manage interaction state and render the UI. |

The route handlers do not contain prompts or provider logic. Components do not call `fetch`. The API key is read only on the server.

## Why a modular monolith

The project has one main feature and one external provider. A modular monolith keeps local development and deployment simple without giving up separation of responsibilities. A service can be extracted later if scale, team ownership, or operational needs justify it.

## Patterns used

### Feature-based organization

Code is grouped around the `study-session` feature instead of being scattered across global component, hook, and utility folders. A future feature can have its own boundary without restructuring the existing one.

### Layered architecture

Transport, server integration, contracts, normalization, client behavior, and presentation have separate responsibilities. Dependencies point inward from routes and UI toward feature logic and shared contracts.

### Adapter pattern

Next.js route handlers adapt HTTP to server functions. The Groq client isolates provider-specific SDK and API-key handling from the rest of the application.

### Contract-first design

Zod schemas are the source of truth for runtime validation and TypeScript types. The same session schema is also converted into the JSON Schema used by the Groq tool definition.

### Normalization boundary

All model output passes through `normalizeStudySession` before reaching the UI. It may repair safe representations or drop malformed items, but it does not invent study content and never returns data that fails the contract.

### Reducer-based state machine

Generation uses a reducer because loading, success, error, cancellation, caching, and stale responses are related states. Smaller interactions use local state where no state machine is needed.

## Important decisions

### Tool calling instead of plain JSON

The provider receives the schema as a forced tool call. This reduces prose and shape errors without pretending that the SDK validates the returned arguments. The returned arguments still pass through JSON parsing and normalization.

### Client-side response validation

The client validates the server response with the shared schema. This turns API drift or a stale client bundle into a controlled error instead of a rendering crash.

### Abort and stale-response protection

Each generation has an `AbortController` to stop work and a monotonic request ID to prevent an older response from overwriting a newer one. Both are needed because aborting is asynchronous.

### No React Query, Zustand, or Context

The app has one non-idempotent generation request, one local session library, and a shallow component tree. Custom hooks, a reducer, and props are sufficient. A server-backed session list or genuinely cross-cutting state would justify revisiting these choices.

### Chaos mode

Development-only chaos modes feed controlled failures through the real normalization path. This makes malformed output, partial success, timeouts, and provider errors reproducible without spending API quota. Chaos mode is disabled in production.

## Trade-offs and next steps

- `normalize.ts` should receive focused unit tests because it owns the largest set of model failure cases.
- Streaming would require validating and emitting items individually rather than streaming an unvalidated session object.
- Rate limiting should be added before exposing the generation endpoint to real users.
