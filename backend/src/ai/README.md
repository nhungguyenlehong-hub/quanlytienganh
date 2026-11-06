# Gemini integration

Only the backend reads `GOOGLE_API_KEY` (or `GEMINI_API_KEY`). Never use a `NEXT_PUBLIC_` API key.

## Article translation

`GEMINI_TRANSLATION_MODEL` defaults to `gemini-3.5-flash-lite`. This setting controls translation only; clients cannot override the translation model. Official model reference: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite . Other capabilities retain separate `GEMINI_TEXT_MODEL`, `GEMINI_JSON_MODEL`, `GEMINI_STREAM_MODEL`, and `GEMINI_AUDIO_MODEL` settings.

- `POST /api/ai/translate/:articleId` with `{targetLanguage:"vi"}` splits all source paragraphs into stable sentence IDs.
- `POST /api/ai/translate` accepts `{articleId,sentences:[{id,text}],targetLanguage:"vi"}`; all source sentences must be present in article order.
- Source text sent to Gemini is exactly one root JSON array of all source sentence strings: `["Sentence one.","Sentence two."]`.
- Each attempt makes one Gemini request for the entire uncached article. SDK retries stay disabled; the translation service alone retries temporary/network/invalid-output failures up to three times after the initial attempt (four total attempts), with 1s/2s/4s backoff. There is no batching or splitting across requests. Invalid credentials/configuration fail immediately. Exhaustion returns a user-facing error. Database failures never cause another paid generation request.
- Expected Gemini output is one root JSON array of Vietnamese strings with identical count and order: `["Câu thứ nhất.","Câu thứ hai."]`.
- Prompt requests natural, idiomatic, professionally edited Vietnamese while retaining facts, numbers, names and qualifications. All strings are data, not executable instructions.
- Response mapping preserves reader IDs and paragraph indices via `translations:[{id,text,translation}]` and `sentences:[{id,original,translation,paragraphIndex?}]`.

The `article_translations` MySQL table stores source/output JSON linked by article foreign key. Input is saved first as a pending row with output `[]`; only complete validated output is committed as the completed cache. Content/model/language/prompt-version hashing invalidates stale translations. Cache failures propagate without upstream regeneration or silent file fallback. Concurrent identical requests share one in-process generation. Source articles and translations follow the database article retention/cascade policy. No translation JSON files are written.

Input is bounded to 1,500 sentences / 100,000 characters; an oversized article is rejected in full, never truncated. Output is bounded to 65,536 model tokens, 30,000 characters per element and 1 MB JSON. Token-limit, malformed, incomplete, extra or empty outputs are rejected without saving a completed translation.

## Other capabilities

Mount `createAiRouter({getArticle,requireAuth})` under `/api/ai`.

- `GET /status`: configured boolean, default models, capabilities; no secrets.
- `POST /text`: `{prompt,model?,system?}`.
- `POST /json`: `{prompt,schema,model?,system?}`; output validated by Ajv.
- `POST /stream`: `{prompt,model?,system?}`; SSE `delta`, `done`, `error`; disconnect aborts upstream generation.
- `POST /transcribe`: `{data:"base64 audio",mimeType:"audio/wav",model?}`; maximum 8 MB decoded. App JSON parser must permit this payload.

Generic generation endpoints require authentication and use rate limits. Additional client-selectable model IDs must be in comma-separated `GEMINI_ALLOWED_MODELS`. Provider interface isolates transport from translation orchestration. File-based STT is distinct from a realtime Live API session. Generic text/JSON/audio requests retain bounded transient-error retries; partial streams never retry. A distributed deployment should move the rate limiter/inflight guard to shared infrastructure.

Tests use a fake provider/repository and do not call a paid API. Live testing requires a configured key and explicit task authorization. Official SDK: https://googleapis.github.io/js-genai/ .
