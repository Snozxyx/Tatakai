import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TTS_INTEGRATIONS, loadTtsIntegrations, ttsIntegrationKey, TTS_INTEGRATION_EVENT, openAiVoicesForModel, type ExternalTtsEngine, type TtsIntegrationConfig } from '@/lib/novel/ttsIntegrations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function TtsIntegrationSettings({ engine }: { engine: ExternalTtsEngine }) {
  useUiTranslation();
  const { user } = useAuth();
  const [config, setConfig] = useState(() => loadTtsIntegrations(user?.id));
  const [error, setError] = useState('');
  useEffect(() => { setConfig(loadTtsIntegrations(user?.id)); }, [user?.id]);
  const save = (next: TtsIntegrationConfig) => {
    setConfig(next);
    try { localStorage.setItem(ttsIntegrationKey(user?.id), JSON.stringify(next)); setError(''); }
    catch { setError(uiI18n.t('app.could_not_save_these_settings_on_this_device_fre_026735b9')); }
    window.dispatchEvent(new Event(TTS_INTEGRATION_EVENT));
  };
  const update = (key: keyof TtsIntegrationConfig, value: string) => save({ ...config, [key]: value });
  const field = (key: keyof TtsIntegrationConfig, label: string, secret = false, placeholder?: string) => <label className="block space-y-2 text-sm font-medium" key={key}>{label}<Input value={config[key]} onChange={event => update(key, event.target.value)} type={secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={placeholder} /></label>;
  return <div className="my-4 space-y-4 rounded-xl border border-border p-4">
    <p className="text-sm leading-relaxed text-muted-foreground">{engine === 'openai' ? uiI18n.t('app.read_aloud_with_an_ai_generated_openai_voice_cha_f59c9518') : engine === 'elevenlabs' ? uiI18n.t('app.use_your_elevenlabs_account_chapter_text_is_sent_0772a564') : uiI18n.t('app.connect_a_running_model_server_with_an_openai_co_1fd62494')}</p>
    {engine === 'openai' ? <>
      {field('openAIKey', 'API key', true)}
      <label className="block space-y-2 text-sm font-medium">{uiI18n.t('app.model_68c2cc7f')}<ThemedSelect className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={config.openAIModel} onChange={event => { const model=event.target.value; const voices=openAiVoicesForModel(model); save({...config,openAIModel:model,openAIVoice:voices.includes(config.openAIVoice)?config.openAIVoice:voices[0]}); }}>{['gpt-4o-mini-tts','tts-1','tts-1-hd'].map(model => <option key={model}>{model}</option>)}</ThemedSelect></label>
      <label className="block space-y-2 text-sm font-medium">{uiI18n.t('app.voice_3091c844')}<ThemedSelect className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={config.openAIVoice} onChange={event => update('openAIVoice',event.target.value)}>{openAiVoicesForModel(config.openAIModel).map(voice => <option key={voice}>{voice}</option>)}</ThemedSelect></label>
      <a className="inline-block text-sm text-primary underline underline-offset-4" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">{uiI18n.t('app.manage_openai_api_keys_fb90aeb0')}</a>
    </> : engine === 'elevenlabs' ? <>
      {field('elevenLabsKey', 'API key', true)}
      {field('elevenLabsVoice', 'Voice ID', false, 'Copy a voice ID from ElevenLabs')}
      {field('elevenLabsModel', 'Model ID', false, DEFAULT_TTS_INTEGRATIONS.elevenLabsModel)}
      <a className="inline-block text-sm text-primary underline underline-offset-4" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">{uiI18n.t('app.manage_elevenlabs_api_keys_838f8870')}</a>
    </> : <>
      {field('localEndpoint', 'Speech endpoint URL', false, DEFAULT_TTS_INTEGRATIONS.localEndpoint)}
      {field('localModel', 'Model', false, 'kokoro')}
      {field('localVoice', 'Voice', false, 'af_heart')}
      {field('localKey', 'API key (optional)', true)}
      <p className="text-xs text-muted-foreground">{uiI18n.t('app.the_endpoint_accepts_model_voice_and_input_and_r_9647ba37')}</p>
    </>}
    <p className="text-xs text-muted-foreground">{uiI18n.t('app.connection_settings_and_keys_stay_on_this_device_b4792e76')}</p>
    <Button variant="outline" size="sm" onClick={() => update(engine === 'openai' ? 'openAIKey' : engine === 'elevenlabs' ? 'elevenLabsKey' : 'localKey', '')}>{uiI18n.t('app.clear_api_key_98e54e78')}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
