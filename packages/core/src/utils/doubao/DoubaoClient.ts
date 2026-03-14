/**
 * DoubaoClient — Volcano Engine ARK Responses API client.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  API endpoint:  POST https://ark.cn-beijing.volces.com/api/v3/responses │
 * │  Auth:          Authorization: Bearer <ARK_API_KEY>                     │
 * │  Default model: doubao-seed-1-8-251228                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ── Quick start ──────────────────────────────────────────────────────────────
 *
 *   // Simple text chat
 *   const r = await DoubaoClient.chat('Tell me a joke');
 *   console.log(r.text);
 *
 *   // Multimodal (image URL or base64)
 *   const r = await DoubaoClient.chatWithImages(
 *     [{ url: 'https://example.com/photo.jpg', detail: 'What is in this image?' }],
 *     'Describe everything you see'
 *   );
 *
 *   // Web search (built-in real-time search)
 *   const r = await DoubaoClient.chatWithSearch('Latest AI news today');
 *
 *   // Multi-turn continuation (stateful, server keeps context)
 *   const r1 = await DoubaoClient.chat('My name is Alice');
 *   const r2 = await DoubaoClient.continue(r1.response.id, 'What is my name?');
 *
 *   // Streaming (async generator, yields text deltas)
 *   for await (const chunk of DoubaoClient.stream('Write a poem')) {
 *     process.stdout.write(chunk.text ?? '');
 *   }
 *
 *   // Function calling
 *   const r = await DoubaoClient.chatWithTools('What is the weather in Beijing?', [{
 *     type: 'function',
 *     name: 'get_weather',
 *     description: 'Get weather for a city',
 *     parameters: {
 *       type: 'object',
 *       properties: { city: { type: 'string', description: 'City name' } },
 *       required: ['city']
 *     }
 *   }]);
 *
 * ── Multimodal input notes ────────────────────────────────────────────────────
 *
 *   Images are passed as content parts with type: 'input_image'.
 *   Supported image sources:
 *     - HTTPS URL       → image_url: 'https://...'
 *     - Base64 data URI → image_url: 'data:image/jpeg;base64,<base64>'
 *
 *   Files (PDF, DOCX, etc.) use type: 'input_file' with a file_url.
 *
 *   chatWithImages() is a convenience wrapper. For full control, use request()
 *   or chat() with a pre-built InputMessage[] array.
 *
 * ── Web search notes ──────────────────────────────────────────────────────────
 *
 *   Add { type: 'web_search' } to the tools array.
 *   The model automatically decides when to search.
 *   max_tool_calls controls how many search rounds are allowed (default 3).
 *   Cannot be combined with context caching.
 *
 *   Search results appear as OutputTextItem with annotations containing
 *   citation metadata (URL, title, etc.).
 *
 * ── Multi-turn notes ──────────────────────────────────────────────────────────
 *
 *   Pass previous_response_id to continue a conversation without re-sending
 *   the full history. The server stores the context (store: true by default).
 *   Add ~100ms delay between turns to avoid race conditions.
 *
 * ── Reasoning / thinking notes ────────────────────────────────────────────────
 *
 *   Deep thinking is ON by default for seed models.
 *   Control effort with reasoning: { effort: 'low' | 'medium' | 'high' }.
 *   Disable entirely with thinking: { type: 'disabled' }.
 *   Reasoning tokens are included in max_output_tokens count.
 */

import { DoubaoConfig } from './DoubaoConfig';
import type {
  DoubaoRequest,
  DoubaoResponse,
  DoubaoInput,
  DoubaoTool,
  DoubaoModel,
  ChatOptions,
  DoubaoTextResult,
  DoubaoExtraData,
  UrlCitation,
  StreamEvent,
  InputMessage,
  InputImagePart,
  InputTextPart,
  WebSearchCallItem,
} from './DoubaoTypes';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${DoubaoConfig.getApiKey()}`,
    'Content-Type':  'application/json',
  };
}

function buildUrl(): string {
  return `${DoubaoConfig.getBaseUrl()}/responses`;
}

/**
 * Apply global defaults before sending.
 * - thinking: disabled  (saves ~300–2000ms per request; re-enable via opts.thinking)
 * Spread order: defaults first, then caller body — so caller always wins.
 */
function applyDefaults(body: DoubaoRequest): DoubaoRequest {
  return { thinking: { type: 'disabled' }, ...body };
}

/** Strip temperature/top_p for models where sampling params are fixed */
function cleanSampling(body: DoubaoRequest): DoubaoRequest {
  if (DoubaoConfig.isFixedSampling(body.model)) {
    const { temperature, top_p, ...rest } = body;
    void temperature; void top_p;
    return rest as DoubaoRequest;
  }
  return body;
}

/** Extract plain text from the response.
 *  The API returns:  output[].type === 'message' → content[].type === 'output_text'
 *  (text is never a direct top-level output item)
 */
function extractText(response: DoubaoResponse): string {
  const parts: string[] = [];
  for (const item of response.output) {
    if (item.type === 'message') {
      const msg = item as { type: 'message'; content: Array<{ type: string; text?: string }> };
      for (const c of msg.content) {
        if (c.type === 'output_text' && c.text) parts.push(c.text);
      }
    }
    // fallback: direct output_text (future-proofing)
    if (item.type === 'output_text') {
      const o = item as { type: 'output_text'; text: string };
      if (o.text) parts.push(o.text);
    }
  }
  return parts.join('');
}

/**
 * Extract extra_data: citations from annotations + search queries from web_search_call items.
 * Returns undefined when no web search was performed (no citations, no search calls).
 */
function extractExtraData(response: DoubaoResponse): DoubaoExtraData | undefined {
  const queries: string[] = [];
  const citationMap = new Map<string, UrlCitation>(); // dedup by url

  for (const item of response.output) {
    // collect search queries
    if (item.type === 'web_search_call') {
      const call = item as WebSearchCallItem;
      if (call.action?.query) queries.push(call.action.query);
    }
    // collect citations from message content annotations
    if (item.type === 'message') {
      const msg = item as { type: 'message'; content: Array<{ type: string; annotations?: unknown[] }> };
      for (const c of msg.content) {
        if (c.type !== 'output_text' || !c.annotations) continue;
        for (const ann of c.annotations) {
          const a = ann as { type: string; url?: string };
          if (a.type === 'url_citation' && a.url && !citationMap.has(a.url)) {
            citationMap.set(a.url, ann as UrlCitation);
          }
        }
      }
    }
  }

  if (queries.length === 0 && citationMap.size === 0) return undefined;
  return { citations: [...citationMap.values()], search_queries: queries };
}

/** Extract reasoning summary text if present */
function extractReasoning(response: DoubaoResponse): string | undefined {
  const r = response.output.find(o => o.type === 'reasoning') as
    | { type: 'reasoning'; summary: Array<{ type: string; text: string }> }
    | undefined;
  if (!r) return undefined;
  return r.summary.map(s => s.text).join('\n');
}

function toTextResult(response: DoubaoResponse): DoubaoTextResult {
  return {
    response,
    text:       extractText(response),
    reasoning:  extractReasoning(response),
    usage:      response.usage,
    extra_data: extractExtraData(response),
  };
}

// ─── DoubaoClient ─────────────────────────────────────────────────────────────

export class DoubaoClient {
  // ─── Core request ─────────────────────────────────────────────────────────

  /**
   * Low-level: send any DoubaoRequest and return the raw DoubaoResponse.
   * Use this when the higher-level helpers don't cover your use case.
   */
  static async request(body: DoubaoRequest): Promise<DoubaoResponse> {
    const clean = cleanSampling(applyDefaults(body));
    const res   = await fetch(buildUrl(), {
      method:  'POST',
      headers: buildHeaders(),
      body:    JSON.stringify(clean),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[DoubaoClient] HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json() as DoubaoResponse;
    if (data.error) throw new Error(`[DoubaoClient] API error ${data.error.code}: ${data.error.message}`);
    return data;
  }

  // ─── Text chat ────────────────────────────────────────────────────────────

  /**
   * Single-turn text chat.
   *
   * @param input   User message (string or InputMessage array)
   * @param opts    Optional model / sampling / reasoning overrides
   */
  static async chat(
    input: DoubaoInput,
    opts: ChatOptions = {}
  ): Promise<DoubaoTextResult> {
    const model = opts.model ?? DoubaoConfig.getDefaultModel();
    const body: DoubaoRequest = {
      model,
      input,
      ...(opts.instructions      && { instructions:      opts.instructions }),
      ...(opts.temperature       && { temperature:       opts.temperature }),
      ...(opts.top_p             && { top_p:             opts.top_p }),
      ...(opts.max_output_tokens && { max_output_tokens: opts.max_output_tokens }),
      ...(opts.reasoning         && { reasoning:         opts.reasoning }),
      ...(opts.thinking          && { thinking:          opts.thinking }),
      ...(opts.store !== undefined && { store:           opts.store }),
    };
    return toTextResult(await DoubaoClient.request(body));
  }

  // ─── Multi-turn ───────────────────────────────────────────────────────────

  /**
   * Continue a previous conversation using its response ID.
   * The server maintains full context — no need to re-send history.
   *
   * Tip: add a ~100ms delay between turns in rapid sequences.
   *
   * @param previousResponseId  ID from a previous DoubaoResponse
   * @param input               New user message
   */
  static async continue(
    previousResponseId: string,
    input: DoubaoInput,
    opts: ChatOptions = {}
  ): Promise<DoubaoTextResult> {
    const model = opts.model ?? DoubaoConfig.getDefaultModel();
    const body: DoubaoRequest = {
      model,
      input,
      previous_response_id: previousResponseId,
      ...(opts.instructions      && { instructions:      opts.instructions }),
      ...(opts.temperature       && { temperature:       opts.temperature }),
      ...(opts.top_p             && { top_p:             opts.top_p }),
      ...(opts.max_output_tokens && { max_output_tokens: opts.max_output_tokens }),
      ...(opts.reasoning         && { reasoning:         opts.reasoning }),
      ...(opts.thinking          && { thinking:          opts.thinking }),
      ...(opts.store !== undefined && { store:           opts.store }),
    };
    return toTextResult(await DoubaoClient.request(body));
  }

  // ─── Multimodal ───────────────────────────────────────────────────────────

  /**
   * Chat with images (multimodal).
   *
   * Images can be supplied as HTTPS URLs or base64 data URIs.
   *
   * @param images  Array of { url, prompt? } — each image optionally has its own per-image text
   * @param text    Main user text accompanying the images
   * @param opts    Standard chat options
   *
   * @example
   *   await DoubaoClient.chatWithImages(
   *     [{ url: 'https://example.com/chart.png' }],
   *     'Explain this chart in detail'
   *   );
   *
   *   // Base64
   *   await DoubaoClient.chatWithImages(
   *     [{ url: 'data:image/jpeg;base64,/9j/4AAQ...' }],
   *     'What is in this image?'
   *   );
   */
  static async chatWithImages(
    images: Array<{ url: string; prompt?: string }>,
    text:   string,
    opts:   ChatOptions = {}
  ): Promise<DoubaoTextResult> {
    type Part = InputImagePart | InputTextPart;
    const parts: Part[] = [];
    for (const img of images) {
      if (img.prompt) parts.push({ type: 'input_text',  text:      img.prompt });
      parts.push(               { type: 'input_image',  image_url: img.url });
    }
    parts.push({ type: 'input_text', text });

    const contentParts = parts as InputMessage['content'];

    const message: InputMessage = { role: 'user', content: contentParts as InputMessage['content'] };
    return DoubaoClient.chat([message], opts);
  }

  // ─── Web search ───────────────────────────────────────────────────────────

  /**
   * Chat with real-time web search enabled.
   *
   * The model will automatically decide when to search the internet.
   * Response text may include citation annotations.
   *
   * @param input        User query
   * @param maxSearches  Max search rounds (default 3, range 1–10)
   * @param opts         Standard chat options
   *
   * @example
   *   const r = await DoubaoClient.chatWithSearch('Latest news about DeepSeek');
   *   console.log(r.text);
   */
  static async chatWithSearch(
    input:       DoubaoInput,
    maxSearches: number     = 3,
    opts:        ChatOptions = {}
  ): Promise<DoubaoTextResult> {
    const model = opts.model ?? DoubaoConfig.getDefaultModel();
    const body: DoubaoRequest = {
      model,
      input,
      tools: [{ type: 'web_search' }],
      max_tool_calls: maxSearches,
      ...(opts.instructions      && { instructions:      opts.instructions }),
      ...(opts.temperature       && { temperature:       opts.temperature }),
      ...(opts.top_p             && { top_p:             opts.top_p }),
      ...(opts.max_output_tokens && { max_output_tokens: opts.max_output_tokens }),
      ...(opts.reasoning         && { reasoning:         opts.reasoning }),
      ...(opts.thinking          && { thinking:          opts.thinking }),
      ...(opts.store !== undefined && { store:           opts.store }),
    };
    return toTextResult(await DoubaoClient.request(body));
  }

  // ─── Function calling ─────────────────────────────────────────────────────

  /**
   * Chat with custom function tools (Function Calling).
   *
   * The response may contain FunctionCallItem outputs that you should handle
   * and feed back as tool results for the next turn.
   *
   * @param input  User message
   * @param tools  Array of FunctionTool definitions
   * @param opts   Standard chat options
   */
  static async chatWithTools(
    input: DoubaoInput,
    tools: DoubaoTool[],
    opts:  ChatOptions = {}
  ): Promise<DoubaoTextResult> {
    const model = opts.model ?? DoubaoConfig.getDefaultModel();
    const body: DoubaoRequest = {
      model,
      input,
      tools,
      ...(opts.instructions      && { instructions:      opts.instructions }),
      ...(opts.max_tool_calls    && { max_tool_calls:    opts.max_tool_calls }),
      ...(opts.temperature       && { temperature:       opts.temperature }),
      ...(opts.top_p             && { top_p:             opts.top_p }),
      ...(opts.max_output_tokens && { max_output_tokens: opts.max_output_tokens }),
      ...(opts.reasoning         && { reasoning:         opts.reasoning }),
      ...(opts.thinking          && { thinking:          opts.thinking }),
      ...(opts.store !== undefined && { store:           opts.store }),
    };
    return toTextResult(await DoubaoClient.request(body));
  }

  // ─── Streaming ────────────────────────────────────────────────────────────

  /**
   * Stream a response via Server-Sent Events (SSE).
   *
   * Yields StreamEvent objects. The most useful events are:
   *   - type: 'response.output_text.delta'  → delta contains the text chunk
   *   - type: 'response.completed'          → response contains the full response
   *
   * @example
   *   for await (const event of DoubaoClient.stream('Write a haiku')) {
   *     if (event.type === 'response.output_text.delta') {
   *       process.stdout.write(event.delta ?? '');
   *     }
   *     if (event.type === 'response.completed') {
   *       console.log('\nDone. Usage:', event.response?.usage);
   *     }
   *   }
   *
   * @example with model override
   *   for await (const event of DoubaoClient.stream('Explain recursion', {
   *     model: 'doubao-seed-2-0-pro-260215',
   *     reasoning: { effort: 'high' }
   *   })) { ... }
   */
  static async *stream(
    input: DoubaoInput,
    opts:  ChatOptions & { previous_response_id?: string } = {}
  ): AsyncGenerator<StreamEvent> {
    const model = opts.model ?? DoubaoConfig.getDefaultModel();
    const body: DoubaoRequest = {
      model,
      input,
      stream: true,
      ...(opts.previous_response_id && { previous_response_id: opts.previous_response_id }),
      ...(opts.instructions         && { instructions:         opts.instructions }),
      ...(opts.temperature          && { temperature:          opts.temperature }),
      ...(opts.top_p                && { top_p:                opts.top_p }),
      ...(opts.max_output_tokens    && { max_output_tokens:    opts.max_output_tokens }),
      ...(opts.reasoning            && { reasoning:            opts.reasoning }),
      ...(opts.thinking             && { thinking:             opts.thinking }),
      ...(opts.store !== undefined  && { store:                opts.store }),
    };

    const clean = cleanSampling(body);
    const res   = await fetch(buildUrl(), {
      method:  'POST',
      headers: buildHeaders(),
      body:    JSON.stringify(clean),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[DoubaoClient] Stream HTTP ${res.status}: ${errText}`);
    }
    if (!res.body) throw new Error('[DoubaoClient] Response body is null');

    const decoder = new TextDecoder();
    let   buffer  = '';

    for await (const rawChunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(rawChunk, { stream: true });

      // SSE lines: "data: <json>\n\n"
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';           // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        if (!payload) continue;

        try {
          yield JSON.parse(payload) as StreamEvent;
        } catch {
          // malformed chunk — skip
        }
      }
    }

    // flush remaining buffer
    if (buffer.startsWith('data:')) {
      const payload = buffer.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try { yield JSON.parse(payload) as StreamEvent; } catch { /* ignore */ }
      }
    }
  }

  // ─── Convenience: stream → full text ─────────────────────────────────────

  /**
   * Stream a response and collect all text deltas into a single string.
   * Useful when you want streaming I/O progress but still need the full result.
   *
   * @param onDelta  Optional callback called with each text chunk as it arrives
   */
  static async streamToText(
    input:   DoubaoInput,
    opts:    ChatOptions & { previous_response_id?: string } = {},
    onDelta?: (chunk: string) => void
  ): Promise<DoubaoTextResult> {
    let text     = '';
    let lastResp: DoubaoResponse | undefined;

    for await (const event of DoubaoClient.stream(input, opts)) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        text += event.delta;
        onDelta?.(event.delta as string);
      }
      if (event.type === 'response.completed' && event.response) {
        lastResp = event.response as DoubaoResponse;
      }
    }

    if (!lastResp) {
      // Fallback: construct a minimal response object
      lastResp = {
        id:     '',
        model:  opts.model ?? DoubaoConfig.getDefaultModel(),
        status: 'completed',
        output: [{ type: 'output_text', text }],
      };
    }

    return {
      response:  lastResp,
      text:      text || extractText(lastResp),
      reasoning: extractReasoning(lastResp),
      usage:     lastResp.usage,
    };
  }
  // ─── Simple convenience methods ───────────────────────────────────────────

  /**
   * Web search — simplest possible interface.
   *
   * Sends a question to the model with real-time web search enabled.
   * The model decides when and how many times to search (up to maxSearches).
   *
   * @param question    Natural language question or query
   * @param maxSearches Max search rounds, default 3
   * @param model       Optional model override
   * @returns           Plain text answer (may include inline citations)
   *
   * @example
   *   const answer = await DoubaoClient.search('What happened in AI this week?');
   *   console.log(answer);
   */
  static async search(
    question:    string,
    maxSearches: number      = 3,
    model?:      DoubaoModel
  ): Promise<string> {
    const r = await DoubaoClient.chatWithSearch(
      question,
      maxSearches,
      model ? { model } : {}
    );
    return r.text;
  }

  /**
   * Analyse multiple images and/or files with a question.
   * Web search can optionally be enabled to supplement vision results.
   *
   * Supported sources per item:
   *   - HTTPS image URL         → { url: 'https://...' }
   *   - Base64 image data URI   → { url: 'data:image/jpeg;base64,...' }
   *   - File URL (PDF, DOCX…)   → { url: 'https://...', isFile: true }
   *   - Per-item caption        → { url: '...', caption: 'This is chart A' }
   *
   * @param items       Array of image/file sources (1–20 items)
   * @param question    Question or instruction about the items
   * @param opts.search Enable web search alongside vision (default false)
   * @param opts.model  Optional model override
   * @returns           Plain text analysis
   *
   * @example — compare two screenshots
   *   const answer = await DoubaoClient.analyseFiles(
   *     [
   *       { url: 'https://example.com/before.png', caption: 'Before' },
   *       { url: 'https://example.com/after.png',  caption: 'After'  },
   *     ],
   *     'What changed between the two screenshots?'
   *   );
   *
   * @example — read a PDF and search for context
   *   const answer = await DoubaoClient.analyseFiles(
   *     [{ url: 'https://example.com/report.pdf', isFile: true }],
   *     'Summarise the key findings',
   *     { search: true }
   *   );
   */
  static async analyseFiles(
    items:    Array<{ url: string; caption?: string; isFile?: boolean }>,
    question: string,
    opts:     { search?: boolean; model?: DoubaoModel } = {}
  ): Promise<string> {
    type Part = InputImagePart | InputTextPart | { type: 'input_file'; file_url: string };

    const parts: Part[] = [];
    for (const item of items) {
      if (item.caption) parts.push({ type: 'input_text',  text:      item.caption });
      if (item.isFile)  parts.push({ type: 'input_file',  file_url:  item.url });
      else              parts.push({ type: 'input_image', image_url: item.url });
    }
    parts.push({ type: 'input_text', text: question });

    const message: InputMessage = {
      role:    'user',
      content: parts as InputMessage['content'],
    };

    const tools: DoubaoTool[] = opts.search ? [{ type: 'web_search' }] : [];
    const model = opts.model ?? DoubaoConfig.getDefaultModel();

    const body: DoubaoRequest = {
      model,
      input: [message],
      ...(tools.length && { tools }),
    };

    const response = await DoubaoClient.request(body);
    return extractText(response);
  }
}

// Re-export types for consumers that import from this file
export type { DoubaoModel };
