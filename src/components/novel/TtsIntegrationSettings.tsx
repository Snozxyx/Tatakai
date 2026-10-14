import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TTS_INTEGRATIONS, loadTtsIntegrations, ttsIntegrationKey, TTS_INTEGRATION_EVENT, openAiVoicesForModel, type ExternalTtsEngine, type TtsIntegrationConfig } from '@/lib/novel/ttsIntegrations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function TtsIntegrationSettings({ engine }: { engine: ExternalTtsEngine }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(() => loadTtsIntegrations(user?.id));
  const [error, setError] = useState('');
  useEffect(() => { setConfig(loadTtsIntegrations(user?.id)); }, [user?.id]);
  const save = (next: TtsIntegrationConfig) => {
    setConfig(next);
    try { localStorage.setItem(ttsIntegrationKey(user?.id), JSON.stringify(next)); setError(''); }
    catch { setError('Could not save these settings on this device. Free some browser storage and retry.'); }
    window.dispatchEvent(new Event(TTS_INTEGRATION_EVENT));
  };
  const update = (key: keyof TtsIntegrationConfig, value: string) => save({ ...config, [key]: value });
  const field = (key: keyof TtsIntegrationConfig, label: string, secret = false, placeholder?: string) => <label className="block space-y-2 text-sm font-medium" key={key}>{label}<Input value={config[key]} onChange={event => update(key, event.target.value)} type={secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={placeholder} /></label>;
  return <div className="my-4 space-y-4 rounded-xl border border-border p-4">
    <p className="text-sm leading-relaxed text-muted-foreground">{engine === 'openai' ? 'Read aloud with an AI-generated OpenAI voice. Chapter text is sent to OpenAI when you press Play. Uses your API account billing; a ChatGPT subscription does not supply API credits.' : engine === 'elevenlabs' ? 'Use your ElevenLabs account. Chapter text is sent to ElevenLabs when you press Play, and generation uses your account credits.' : 'Connect a running model server with an OpenAI-compatible speech endpoint. The server must allow requests from this app (CORS). On mobile, use a server URL reachable from your phone; localhost means the phone itself. Web browsers may require HTTPS for a server on another device.'}</p>
    {engine === 'openai' ? <>
      {field('openAIKey', 'API key', true)}
      <label className="block space-y-2 text-sm font-medium">Model<select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={config.openAIModel} onChange={event => { const model=event.target.value; const voices=openAiVoicesForModel(model); save({...config,openAIModel:model,openAIVoice:voices.includes(config.openAIVoice)?config.openAIVoice:voices[0]}); }}>{['gpt-4o-mini-tts','tts-1','tts-1-hd'].map(model => <option key={model}>{model}</option>)}</select></label>
      <label className="block space-y-2 text-sm font-medium">Voice<select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={config.openAIVoice} onChange={event => update('openAIVoice',event.target.value)}>{openAiVoicesForModel(config.openAIModel).map(voice => <option key={voice}>{voice}</option>)}</select></label>
      <a className="inline-block text-sm text-primary underline underline-offset-4" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Manage OpenAI API keys</a>
    </> : engine === 'elevenlabs' ? <>
      {field('elevenLabsKey', 'API key', true)}
      {field('elevenLabsVoice', 'Voice ID', false, 'Copy a voice ID from ElevenLabs')}
      {field('elevenLabsModel', 'Model ID', false, DEFAULT_TTS_INTEGRATIONS.elevenLabsModel)}
      <a className="inline-block text-sm text-primary underline underline-offset-4" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">Manage ElevenLabs API keys</a>
    </> : <>
      {field('localEndpoint', 'Speech endpoint URL', false, DEFAULT_TTS_INTEGRATIONS.localEndpoint)}
      {field('localModel', 'Model', false, 'kokoro')}
      {field('localVoice', 'Voice', false, 'af_heart')}
      {field('localKey', 'API key (optional)', true)}
      <p className="text-xs text-muted-foreground">The endpoint accepts model, voice and input, and returns WAV audio. Starting the model server is handled by your local TTS application.</p>
    </>}
    <p className="text-xs text-muted-foreground">Connection settings and keys stay on this device. They are not synced to your profile.</p>
    <Button variant="outline" size="sm" onClick={() => update(engine === 'openai' ? 'openAIKey' : engine === 'elevenlabs' ? 'elevenLabsKey' : 'localKey', '')}>Clear API key</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
