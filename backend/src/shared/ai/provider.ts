import { GoogleGenAI } from '@google/genai';
import { Ajv } from 'ajv';

export class AiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Capability = 'text' | 'json' | 'stream' | 'audio';
export interface GenerationRequest { prompt: string; model?: string; system?: string; signal?: AbortSignal }
export interface JsonGenerationRequest extends GenerationRequest { schema: object; retry?: boolean; maxOutputTokens?: number }
export interface AiProvider {
  text(input: GenerationRequest): Promise<string>;
  json<T>(input: JsonGenerationRequest): Promise<T>;
  stream(input: GenerationRequest): AsyncGenerator<string>;
  transcribe(input: GenerationRequest & { data: string; mimeType: string }): Promise<string>;
}
export function aiConfig() {
  const fallback = 'gemini-flash-latest';
  const models = {
    text: process.env.GEMINI_TEXT_MODEL || fallback,
    json: process.env.GEMINI_JSON_MODEL || fallback,
    stream: process.env.GEMINI_STREAM_MODEL || fallback,
    audio: process.env.GEMINI_AUDIO_MODEL || fallback,
    translation: process.env.GEMINI_TRANSLATION_MODEL || 'gemini-3.5-flash-lite',
  };
  return { configured: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY), models };
}

export class GeminiProvider implements AiProvider {
  private client() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new AiError(503, 'Chưa cấu hình Gemini. Thêm GOOGLE_API_KEY vào backend/.env rồi khởi động lại backend.');
    return new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } } });
  }
  private model(capability: Capability, requested?: string) {
    const defaults = aiConfig().models;
    const allowed = new Set([...Object.values(defaults), ...(process.env.GEMINI_ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean)]);
    if (requested && !allowed.has(requested)) throw new AiError(400, 'Model không nằm trong GEMINI_ALLOWED_MODELS.');
    return requested || defaults[capability];
  }
  async text(input: GenerationRequest): Promise<string> {
    const model = this.model('text', input.model);
    const client = this.client();
    const result = await retry(() => client.models.generateContent({ model, contents: input.prompt,
      config: { systemInstruction: input.system, maxOutputTokens: 8192, abortSignal: input.signal } }));
    if (!result.text) throw new AiError(502, 'Gemini không trả về nội dung.');
    return result.text;
  }
  async json<T>(input: JsonGenerationRequest): Promise<T> {
    const model = this.model('json', input.model);
    const client = this.client();
    const ajv = new Ajv({ strict: false, allErrors: true });
    let validate;
    try { validate = ajv.compile(input.schema); }
    catch { throw new AiError(400, 'JSON schema không hợp lệ.'); }
    const generate = () => client.models.generateContent({ model, contents: input.prompt,
      config: { systemInstruction: input.system, responseMimeType: 'application/json', responseJsonSchema: input.schema,
        maxOutputTokens: input.maxOutputTokens || 16384, abortSignal: input.signal } });
    const result = input.retry === false ? await generate() : await retry(generate);
    if (result.candidates?.some(candidate => candidate.finishReason === 'MAX_TOKENS'))
      throw new AiError(502, 'Gemini đã chạm giới hạn đầu ra. Không lưu bản dịch bị cắt; hãy dùng bài ngắn hơn.');
    let parsed: unknown;
    try { parsed = JSON.parse(result.text || ''); } catch { throw new AiError(502, 'Gemini trả JSON không hợp lệ.'); }
    if (!validate(parsed)) throw new AiError(502, 'Kết quả Gemini không khớp JSON schema.');
    return parsed as T;
  }
  async *stream(input: GenerationRequest): AsyncGenerator<string> {
    const stream = await this.client().models.generateContentStream({ model: this.model('stream', input.model), contents: input.prompt,
      config: { systemInstruction: input.system, maxOutputTokens: 8192, abortSignal: input.signal } });
    // Never retry a partially delivered stream: that would duplicate generated tokens.
    for await (const chunk of stream) if (chunk.text) yield chunk.text;
  }
  async transcribe(input: GenerationRequest & { data: string; mimeType: string }): Promise<string> {
    const model = this.model('audio', input.model);
    const client = this.client();
    const result = await retry(() => client.models.generateContent({ model,
      contents: [{ role: 'user', parts: [ { inlineData: { data: input.data, mimeType: input.mimeType } },
        { text: input.prompt || 'Transcribe this audio faithfully in its original language. Return only the transcript.' } ] }],
      config: { maxOutputTokens: 8192, abortSignal: input.signal } }));
    if (!result.text) throw new AiError(502, 'Không nhận được bản chép lời.');
    return result.text;
  }
}

export async function retry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error: unknown) {
      const status = Number((error as { status?: number }).status || (error as { code?: number }).code);
      if (attempt >= attempts - 1 || ![408, 429, 500, 502, 503, 504].includes(status)) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
    }
  }
}

export function publicAiError(error: unknown): { status: number; error: string } {
  if (error instanceof AiError) return { status: error.status, error: error.message };
  if ((error as { code?: string }).code === 'DATABASE_UNAVAILABLE')
    return { status: 503, error: 'MySQL chưa kết nối. Bản dịch chỉ được đọc và lưu trong MySQL; kiểm tra cấu hình database phía backend.' };
  if ((error as { code?: string }).code === 'ARTICLE_NOT_FOUND')
    return { status: 404, error: 'Bài viết đã hết hạn lưu trữ hoặc không còn tồn tại.' };
  const status = Number((error as { status?: number }).status || (error as { code?: number }).code);
  if (status === 429) return { status: 429, error: 'Gemini đã hết hạn mức hoặc đang quá tải. Vui lòng thử lại sau.' };
  if ([400, 401, 403].includes(status)) return { status: 502, error: 'Gemini từ chối yêu cầu. Kiểm tra API key, quyền model và cấu hình tài khoản phía backend.' };
  if ((error as Error)?.name === 'AbortError') return { status: 504, error: 'Yêu cầu AI đã hết thời gian chờ.' };
  return { status: 502, error: 'Không thể kết nối Gemini. Vui lòng thử lại sau.' };
}
