/**
 * DoubaoTypes — all type definitions for the Volcano Engine ARK Responses API.
 * Endpoint: POST https://ark.cn-beijing.volces.com/api/v3/responses
 */

// ─── Models ───────────────────────────────────────────────────────────────────

export type DoubaoModel =
  | 'doubao-seed-1-8-251228'           // default — balanced reasoning + speed
  | 'doubao-seed-2-0-pro-260215'        // most capable (temp/top_p fixed)
  | 'doubao-seed-2-0-lite-260215'       // lightweight, fast (temp/top_p fixed)
  | 'doubao-seed-2-0-mini-260215'       // ultra-lightweight
  | 'doubao-seed-2-0-code-preview-260215'; // code-optimised

export type ReasoningEffort = 'low' | 'medium' | 'high';

// ─── Input ────────────────────────────────────────────────────────────────────

/** Plain text input part */
export interface InputTextPart {
  type: 'input_text';
  text: string;
}

/**
 * Image input part.
 * Supports:
 *   - HTTP/HTTPS URL  → { image_url: "https://..." }
 *   - Base64 data URI → { image_url: "data:image/jpeg;base64,..." }
 */
export interface InputImagePart {
  type: 'input_image';
  image_url: string;
}

/**
 * File input part (PDF, DOCX, etc.)
 * Supported formats depend on the model.
 */
export interface InputFilePart {
  type: 'input_file';
  file_url: string;
}

export type ContentPart = InputTextPart | InputImagePart | InputFilePart;

/** A structured message with role + content (text or multimodal parts) */
export interface InputMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

/** Input can be a simple string or an array of messages */
export type DoubaoInput = string | InputMessage[];

// ─── Tools ────────────────────────────────────────────────────────────────────

/**
 * Built-in web search tool.
 * Enables the model to perform real-time internet searches.
 *
 * @example
 *   tools: [{ type: 'web_search' }]
 *
 * Notes:
 *   - Default max_tool_calls = 3 (overridable)
 *   - Cannot be combined with `caching`
 */
export interface WebSearchTool {
  type: 'web_search';
}

/**
 * Custom function tool (Function Calling).
 *
 * @example
 *   tools: [{
 *     type: 'function',
 *     name: 'get_weather',
 *     description: 'Get current weather for a city',
 *     parameters: {
 *       type: 'object',
 *       properties: { city: { type: 'string', description: 'City name' } },
 *       required: ['city']
 *     }
 *   }]
 */
export interface FunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type:         string;
      description?: string;
      enum?:        string[];
      items?:       { type: string };
    }>;
    required?: string[];
  };
}

export type DoubaoTool = WebSearchTool | FunctionTool;

// ─── Request ──────────────────────────────────────────────────────────────────

export interface DoubaoRequest {
  model:                 DoubaoModel;
  input:                 DoubaoInput;
  /** System prompt / developer instruction (not inherited across turns) */
  instructions?:         string;
  /** Previous response ID for multi-turn continuation */
  previous_response_id?: string;
  /** Enable streaming (SSE) — default false */
  stream?:               boolean;
  /** [0,2] — fixed to 1 for seed-2-0-pro/lite */
  temperature?:          number;
  /** [0,1] — fixed to 0.95 for seed-2-0-pro/lite */
  top_p?:                number;
  max_output_tokens?:    number;
  /** Enable or disable deep thinking mode */
  thinking?:             { type: 'enabled' | 'disabled' };
  /** Thinking work budget — less effort = faster + fewer tokens */
  reasoning?:            { effort: ReasoningEffort };
  tools?:                DoubaoTool[];
  /** Max tool-call rounds [1,10]. web_search default=3, function default=auto */
  max_tool_calls?:       number;
  /** Store response for retrieval via previous_response_id — default true */
  store?:                boolean;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export interface DoubaoUsage {
  input_tokens:  number;
  output_tokens: number;
  total_tokens:  number;
  /** Tokens served from cache (if caching enabled) */
  cached_tokens?: number;
}

/** A web search citation attached to an output_text item */
export interface UrlCitation {
  type:          'url_citation';
  title:         string;
  url:           string;
  site_name?:    string;
  publish_time?: string;
  summary?:      string;
  logo_url?:     string;
  cover_image?:  { url: string; width: number; height: number };
}

export type OutputAnnotation = UrlCitation | { type: string; [k: string]: unknown };

export interface OutputTextItem {
  type:         'output_text';
  text:         string;
  annotations?: OutputAnnotation[];
}

/** One web_search_call output item — records the query the model sent */
export interface WebSearchCallItem {
  type:   'web_search_call';
  id:     string;
  status: string;
  action: { type: 'search'; query: string };
}

/**
 * The actual text lives inside a message item's content array.
 * output[].type === 'message' → content[].type === 'output_text'
 */
export interface MessageOutputItem {
  type:    'message';
  role:    'assistant';
  status:  string;
  id:      string;
  content: OutputTextItem[];
}

export interface ReasoningItem {
  type: 'reasoning';
  summary: Array<{ type: 'summary_text'; text: string }>;
}

export interface FunctionCallItem {
  type:      'function_call';
  id:        string;
  name:      string;
  arguments: string; // JSON string
}

export type DoubaoOutputItem = OutputTextItem | MessageOutputItem | ReasoningItem | FunctionCallItem | WebSearchCallItem | { type: string; [k: string]: unknown };

export interface DoubaoResponse {
  id:      string;
  model:   string;
  status:  'completed' | 'in_progress' | 'failed' | 'cancelled';
  output:  DoubaoOutputItem[];
  usage?:  DoubaoUsage;
  error?:  { code: string; message: string };
  /** Unix timestamp (seconds) when the stored response expires */
  expires_at?: number;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamEvent {
  type:         string;
  /** Present on output_text.delta events */
  delta?:       string;
  /** Present on response.completed events */
  response?:    DoubaoResponse;
  /** Sequence index of this output item */
  output_index?: number;
  [k: string]:  unknown;
}

// ─── High-level helpers ───────────────────────────────────────────────────────

export interface ChatOptions {
  model?:             DoubaoModel;
  instructions?:      string;
  temperature?:       number;
  top_p?:             number;
  max_output_tokens?: number;
  reasoning?:         { effort: ReasoningEffort };
  thinking?:          { type: 'enabled' | 'disabled' };
  store?:             boolean;
  max_tool_calls?:    number;
}

/**
 * Extra metadata populated when web_search is used.
 * Contains every URL the model cited plus the search queries it issued.
 */
export interface DoubaoExtraData {
  /** All URL citations from the response annotations (deduped by url) */
  citations:      UrlCitation[];
  /** The search queries the model actually sent (from web_search_call items) */
  search_queries: string[];
}

export interface DoubaoTextResult {
  /** Full response object */
  response:    DoubaoResponse;
  /** Concatenated plain text from all output_text items */
  text:        string;
  /** Reasoning summary text (if available) */
  reasoning?:  string;
  /** Token usage */
  usage?:      DoubaoUsage;
  /**
   * Populated when web_search is enabled.
   * Contains citations (url, title, site_name, summary, publish_time)
   * and the search queries the model issued.
   */
  extra_data?: DoubaoExtraData;
}
