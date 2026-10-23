/**
 * Translation service implementations.
 *
 * Ported from the subtitle-translator reference project (src/app/lib/translation/
 * services/traditional.ts + shared.ts), reduced to the paths Tatakai needs:
 * the two free zero-config endpoints, the keyed cloud APIs, one OpenAI-compatible
 * chat translator, and thin wrappers around the existing on-device engine.
 *
 * Every service takes the SAME input shape and returns one output string per
 * input line, so the orchestrator stays provider-agnostic.
 */

import { getTranslationLanguageName } from './languages';
import { decodeHtmlEntities } from '@/lib/commentMarkup';

export type TranslateServiceParams = {
  /** Lines to translate. Multi-line chunks are split/joined by the service. */
  text: string;
  sourceLanguage: string; // 'auto' where the engine supports detection
  targetLanguage: string;
  url?: string;
  apiKey?: string;
  model?: string;
  region?: string;
  signal?: AbortSignal;
};

export type TranslationService = (params: TranslateServiceParams) => Promise<string>;

// ─── shared helpers (from reference services/shared.ts) ─────────────────────

export class TranslationConfigError extends Error {}

const requireApiKey = (serviceName: string, apiKey: string | undefined): string => {
  const key = apiKey?.trim();
  if (!key) throw new TranslationConfigError(`${serviceName} API key is required`);
  return key;
};

const requireUrl = (serviceName: string, url: string | undefined): string => {
  const endpoint = url?.trim().replace(/\/+$/, '');
  if (!endpoint) throw new TranslationConfigError(`${serviceName} endpoint URL is required`);
  return endpoint;
};

const formatHttpError = (data: unknown, status: number): string => {
  const obj = data as Record<string, unknown> | null;
  const errorObj = obj?.error as Record<string, unknown> | string | undefined;
  if (errorObj && typeof errorObj === 'object') {
    const msg = errorObj.message;
    if (typeof msg === 'string' && msg.trim()) return `[${status}] ${msg}`;
  }
  const topLevel =
    (typeof errorObj === 'string' ? errorObj : null) ??
    (typeof obj?.message === 'string' ? (obj.message as string) : null);
  if (topLevel?.trim()) return `[${status}] ${topLevel}`;
  return `HTTP error! status: ${status}`;
};

export const parseRetryAfterMs = (header: string | null): number | undefined => {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : new Date(header).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.min(ms, 120_000);
};

export const fetchJSON = async (url: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = Object.assign(new Error(formatHttpError(data, response.status)), {
      status: response.status,
    });
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      if (retryAfterMs !== undefined) Object.assign(error, { retryAfterMs });
    }
    throw error;
  }
  return response.json();
};

/** Complete user-pasted OpenAI-compat base URLs to a chat/completions endpoint. */
export const completeOpenAICompatUrl = (url: string): string => {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned) return cleaned;
  if (cleaned.endsWith('/chat/completions')) return cleaned;
  if (/\/v\d+\/(responses|completions)$/.test(cleaned))
    return cleaned.replace(/\/(responses|completions)$/, '/chat/completions');
  if (/\/v\d+$/.test(cleaned)) return `${cleaned}/chat/completions`;
  try {
    const parsed = new URL(cleaned);
    if (parsed.pathname === '' || parsed.pathname === '/')
      return `${parsed.protocol}//${parsed.host}/v1/chat/completions${parsed.search}`;
  } catch {
    /* fetch will report the invalid URL */
  }
  return cleaned;
};

// Intrinsic-reasoning models inline <think>…</think> inside content; strip it.
const LEADING_THINK_BLOCK_RE = /^(?:\s*<think>[\s\S]*?<\/think>)+\s*/i;

const getOpenAICompatContent = (data: unknown, serviceName: string): string => {
  const choice = (data as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> } | null)
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string') throw new Error(`Invalid response format from ${serviceName} API`);
  if (choice?.finish_reason === 'length')
    throw new Error(`${serviceName} response truncated — max_tokens reached`);
  return content.replace(LEADING_THINK_BLOCK_RE, '').trim();
};

// ─── language code maps (from reference services/traditional.ts) ────────────

const DEEPL_TARGET_MAP: Record<string, string> = {
  en: 'EN-US',
  zh: 'ZH-HANS',
  'zh-hant': 'ZH-HANT',
  fil: 'TL',
  tl: 'TL',
  pt: 'PT-PT',
};
const toDeepLTarget = (lang: string): string => DEEPL_TARGET_MAP[lang] ?? lang.toUpperCase();

const AZURE_LANG_MAP: Record<string, string> = { ckb: 'ku', tl: 'fil', no: 'nb' };
const toAzureCode = (lang: string): string => AZURE_LANG_MAP[lang] ?? lang;

const GOOGLE_LANG_MAP: Record<string, string> = { prs: 'fa-AF', 'zh-hant': 'zh-TW' };
const toGoogleCode = (lang: string): string => GOOGLE_LANG_MAP[lang] ?? lang;

const httpStatusError = (response: Response): Error => {
  const error = new Error(`HTTP error! status: ${response.status}`);
  Object.assign(error, { status: response.status });
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    if (retryAfterMs !== undefined) Object.assign(error, { retryAfterMs });
  }
  return error;
};

// ─── GTX (Google translate-pa) — free, no key ───────────────────────────────

const GTX_ENDPOINT = 'https://translate-pa.googleapis.com/v1/translateHtml';
// Public key embedded in Google's te_lib loader — shared free backend, not a secret.
const GTX_PUBLIC_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// translateHtml returns serialized HTML: apostrophes and quotes come back as
// &#39;/&quot; literals that must not reach plain-text renderers.
const unescapeHtml = (s: string) => decodeHtmlEntities(s);

export const gtxFreeAPI: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, url, signal } = params;
  const endpoint = url?.trim() || GTX_ENDPOINT;

  // translateHtml parses input as HTML: send one escaped element per line and
  // rejoin. Blank elements 400 — skip them and re-insert by position.
  const lines = text.split('\n');
  const sentIndices: number[] = [];
  const payload: string[] = [];
  lines.forEach((line, i) => {
    if (line.trim()) {
      sentIndices.push(i);
      payload.push(escapeHtml(line));
    }
  });
  if (payload.length === 0) return text;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json+protobuf', 'X-Goog-API-Key': GTX_PUBLIC_KEY },
    body: JSON.stringify([
      [payload, sourceLanguage === 'auto' ? 'auto' : toGoogleCode(sourceLanguage), toGoogleCode(targetLanguage)],
      'te_lib',
    ]),
    signal,
  });
  if (!response.ok) throw httpStatusError(response);

  const data = await response.json();
  if (!Array.isArray(data?.[0])) throw new Error('Invalid response format from Google Translate (gtx)');
  const translated = data[0];
  const out = [...lines];
  sentIndices.forEach((lineIdx, j) => {
    const t = translated[j];
    if (typeof t !== 'string')
      throw new Error('Invalid response format from Google Translate (gtx) — missing translation for a sent line');
    out[lineIdx] = unescapeHtml(t);
  });
  return out.join('\n');
};

// ─── Edge free backend (Azure Translator engine) — free, no key ─────────────

const EDGE_TRANSLATE_ENDPOINT = 'https://edge.microsoft.com/translate/translatetext';

export const edgeFreeAPI: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, url, signal } = params;
  const target = toAzureCode(targetLanguage);
  const source = sourceLanguage !== 'auto' ? toAzureCode(sourceLanguage) : '';
  const endpoint = url?.trim() || EDGE_TRANSLATE_ENDPOINT;
  const requestUrl = `${endpoint}?from=${encodeURIComponent(source)}&to=${encodeURIComponent(target)}&isEnterpriseClient=false`;
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([text]),
    signal,
  });
  if (!response.ok) throw httpStatusError(response);
  const data = (await response.json()) as Array<{ translations?: Array<{ text?: string }> }> | null;
  const translatedText = data?.[0]?.translations?.[0]?.text;
  if (typeof translatedText !== 'string') throw new Error('Invalid response format from Edge Translate');
  return translatedText;
};

// ─── Keyed cloud services ────────────────────────────────────────────────────

export const google: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, apiKey, signal } = params;
  const key = requireApiKey('Google Translate', apiKey);
  const requestBody = {
    q: text,
    target: toGoogleCode(targetLanguage),
    format: 'text',
    ...(sourceLanguage !== 'auto' && { source: toGoogleCode(sourceLanguage) }),
  };
  const data = (await fetchJSON(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  })) as { data?: { translations?: Array<{ translatedText?: string }> } } | null;
  const translatedText = data?.data?.translations?.[0]?.translatedText;
  if (typeof translatedText !== 'string') throw new Error('Invalid response format from Google Translate');
  return translatedText;
};

export const deepl: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, url, apiKey, signal } = params;
  const key = requireApiKey('DeepL', apiKey);
  const endpoint = url?.trim() || 'https://api-free.deepl.com/v2/translate';
  const requestBody = {
    text: [text],
    target_lang: toDeepLTarget(targetLanguage),
    ...(sourceLanguage !== 'auto' && { source_lang: sourceLanguage.toUpperCase() }),
  };
  const data = (await fetchJSON(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${key}` },
    body: JSON.stringify(requestBody),
    signal,
  })) as { translations?: Array<{ text?: string }> } | null;
  const translatedText = data?.translations?.[0]?.text;
  if (typeof translatedText !== 'string') throw new Error('Invalid response format from DeepL');
  return translatedText;
};

export const deeplx: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, url, signal } = params;
  const endpoint = requireUrl('DeepLX', url);
  const requestBody = {
    text,
    target_lang: toDeepLTarget(targetLanguage),
    ...(sourceLanguage !== 'auto' && { source_lang: sourceLanguage.toUpperCase() }),
  };
  const data = (await fetchJSON(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  })) as { data?: string } | null;
  const translatedText = data?.data;
  if (typeof translatedText !== 'string') throw new Error('Invalid response format from DeepLX');
  return translatedText;
};

export const azure: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, apiKey, region, signal } = params;
  const key = requireApiKey('Azure Translate', apiKey);
  const resolvedRegion = region?.trim();
  if (!resolvedRegion) throw new TranslationConfigError('Azure Translate region is required');
  const azureTarget = toAzureCode(targetLanguage);
  const azureSource = sourceLanguage !== 'auto' ? toAzureCode(sourceLanguage) : null;
  const apiEndpoint = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${azureTarget}${azureSource ? `&from=${azureSource}` : ''}`;
  const data = (await fetchJSON(apiEndpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': resolvedRegion,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: text }]),
    signal,
  })) as Array<{ translations?: Array<{ text?: string }> }> | null;
  const translatedText = data?.[0]?.translations?.[0]?.text;
  if (typeof translatedText !== 'string') throw new Error('Invalid response format from Azure Translate');
  return translatedText;
};

// ─── OpenAI-compatible chat translator (DeepSeek, OpenAI, Ollama, LM Studio…) ─

export const openaiCompat: TranslationService = async (params) => {
  const { text, targetLanguage, sourceLanguage, url, apiKey, model, signal } = params;
  const endpoint = completeOpenAICompatUrl(requireUrl('Custom LLM', url));
  const targetName = getTranslationLanguageName(targetLanguage);
  const sourceName =
    sourceLanguage !== 'auto' ? getTranslationLanguageName(sourceLanguage) : 'its original language';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

  const maxTokens = Math.min(4096, Math.max(256, Math.ceil(text.length * 2) + 256));
  const data = (await fetchJSON(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(model?.trim() ? { model: model.trim() } : {}),
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the user's text from ${sourceName} into ${targetName}. Output ONLY the translation — no explanations, no quotes. Preserve line breaks, emojis, and placeholders like ‹0› exactly.`,
        },
        { role: 'user', content: text },
      ],
      stream: false,
    }),
    signal,
  })) as unknown;
  return getOpenAICompatContent(data, 'Custom LLM');
};
