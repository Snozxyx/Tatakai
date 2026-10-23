import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExtensionServersSettings } from '@/components/settings/ExtensionServersSettings';
export default function ConnectServerPage() {
  const [params] = useSearchParams();
  const [input] = useState(() => {
    const target = window as Window & { __tatakaiServerLink?: { search: string } };
    const captured = new URLSearchParams(target.__tatakaiServerLink?.search || params.toString());
    return { url: captured.get('server') || '', code: captured.get('code') || '' };
  });
  useEffect(() => { delete (window as Window & { __tatakaiServerLink?: unknown }).__tatakaiServerLink; window.history.replaceState(null, '', '/connect-server'); }, []);
  return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="mb-6 text-2xl font-semibold">Connect Tatakai Server</h1><ExtensionServersSettings initialUrl={input.url} pairingCode={input.code} /></main>;
}
