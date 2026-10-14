export interface TtsIntegrationConfig {
  openAIKey: string;
  openAIModel: string;
  openAIVoice: string;
  elevenLabsKey: string;
  elevenLabsVoice: string;
  elevenLabsModel: string;
  localEndpoint: string;
  localKey: string;
  localModel: string;
  localVoice: string;
}
export const DEFAULT_TTS_INTEGRATIONS: TtsIntegrationConfig = {
  openAIKey: '', openAIModel: 'gpt-4o-mini-tts', openAIVoice: 'marin',
  elevenLabsKey: '', elevenLabsVoice: '', elevenLabsModel: 'eleven_multilingual_v2',
  localEndpoint: 'http://127.0.0.1:8880/v1/audio/speech', localKey: '', localModel: 'kokoro', localVoice: 'af_heart',
};
export const ttsIntegrationKey = (userId?: string) => `tatakai-tts-integrations:${userId || 'guest'}`;
export const TTS_INTEGRATION_EVENT = 'tatakai-tts-integrations-changed';
export function loadTtsIntegrations(userId?: string): TtsIntegrationConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(ttsIntegrationKey(userId)) || '{}');
    return Object.fromEntries(Object.entries(DEFAULT_TTS_INTEGRATIONS).map(([key, fallback]) => [key, typeof raw[key] === 'string' ? raw[key] : fallback])) as unknown as TtsIntegrationConfig;
  } catch { return { ...DEFAULT_TTS_INTEGRATIONS }; }
}

export const OPENAI_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
export const openAiVoicesForModel = (model: string) => model === 'tts-1' || model === 'tts-1-hd' ? ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'] : OPENAI_TTS_VOICES;
export type ExternalTtsEngine = 'elevenlabs' | 'local-server' | 'openai';
export async function synthesizeExternalTts(text: string, engine: ExternalTtsEngine, config: TtsIntegrationConfig, rate: number, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.throwIfAborted(); signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 120_000);
  try {
    let endpoint: string, headers: Record<string, string>, body: object;
    if (engine === 'openai') {
      if (!config.openAIKey.trim()) throw new Error('Set your OpenAI API key in Narration settings first.');
      if (!config.openAIModel.trim() || !openAiVoicesForModel(config.openAIModel).includes(config.openAIVoice)) throw new Error('Choose a supported OpenAI speech model and voice in Narration settings.');
      endpoint = 'https://api.openai.com/v1/audio/speech';
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openAIKey.trim()}`, Accept: 'audio/mpeg' };
      body = { input: text, model: config.openAIModel.trim(), voice: config.openAIVoice, speed: rate, response_format: 'mp3' };
    } else if (engine === 'elevenlabs') {
      if (!config.elevenLabsKey.trim() || !config.elevenLabsVoice.trim()) throw new Error('Set your ElevenLabs API key and voice ID in Narration settings first.');
      endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoice.trim())}?output_format=mp3_44100_128`;
      headers = { 'Content-Type': 'application/json', 'xi-api-key': config.elevenLabsKey.trim(), Accept: 'audio/mpeg' };
      body = { text, model_id: config.elevenLabsModel.trim() || 'eleven_multilingual_v2' };
    } else {
      let url: URL;
      try { url = new URL(config.localEndpoint.trim()); } catch { throw new Error('Enter a valid local TTS speech endpoint URL.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS speech endpoint without credentials in the URL.');
      if (!config.localModel.trim() || !config.localVoice.trim()) throw new Error('Set your local TTS model and voice in Narration settings first.');
      endpoint = url.href;
      headers = { 'Content-Type': 'application/json', Accept: 'audio/wav' };
      if (config.localKey.trim()) headers.Authorization = `Bearer ${config.localKey.trim()}`;
      body = { input: text, model: config.localModel.trim(), voice: config.localVoice.trim(), speed: rate, response_format: 'wav' };
    }
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`${engine === 'openai' ? 'OpenAI' : engine === 'elevenlabs' ? 'ElevenLabs' : 'Local TTS'} returned HTTP ${response.status}. Check the key, voice, model and server settings.`);
    const type = response.headers.get('content-type') || '';
    if (type.includes('json') || type.includes('text/')) throw new Error('The TTS server returned text instead of audio. Check the speech endpoint.');
    const audio = await response.blob();
    if (!audio.size) throw new Error('The TTS server returned empty audio. Retry with another voice.');
    signal.throwIfAborted();
    const url = URL.createObjectURL(audio);
    return { url, playbackRate: engine === 'elevenlabs' ? rate : 1, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
    if (controller.signal.aborted) throw new Error('TTS request timed out. Check your server and retry.');
    if (error instanceof TypeError) throw new Error('Could not reach the TTS service. Check its URL, network access and CORS settings.');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
