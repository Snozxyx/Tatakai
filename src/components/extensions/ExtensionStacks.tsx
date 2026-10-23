import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { isExplicitExtensionContent } from '@/lib/contentSafety';
import { extensionDeadline } from '@/core/extensions/remote/deadline';
import { EXTENSION_API_BASE, EXTENSION_PORTAL_URL, toStoreExtension, type StoreExtensionRow } from '@/core/extensions/store-api';
import type { useExtensionInstaller } from '@/hooks/api/useExtensionStore';

interface Stack { id:string;title:string;description:string;language:string;extensions:StoreExtensionRow[] }
export function ExtensionStacks({installer}:{installer:ReturnType<typeof useExtensionInstaller>}) {
  const confirm = useConfirm();
  const native=useIsNativeApp();
  const {settings}=useContentSafetySettings();
  const [params]=useSearchParams();
  const requested=params.get('stack');
  const validId=requested&&/^[0-9a-f-]{36}$/i.test(requested)?requested:null;
  const [progress,setProgress]=useState('');
  const [busy,setBusy]=useState(false);
  const query=useQuery({queryKey:['extension-stacks',validId],enabled:!!EXTENSION_API_BASE,
    queryFn:async({signal}):Promise<Stack[]>=>{
      const response=await extensionDeadline(deadline=>fetch(`${EXTENSION_API_BASE}/stacks${validId?`/${validId}`:'?limit=12'}`,{signal:deadline}),15000,signal);
      if(!response.ok)throw new Error('Stacks could not be loaded');
      const result=await response.json();return validId?[result.data]:result.data??[];
    },staleTime:60000,retry:1});
  async function install(stack:Stack) {
    if(!native){window.location.href=`tatakai://extensions?stack=${encodeURIComponent(stack.id)}`;return;}
    const eligible=stack.extensions.map(toStoreExtension).filter(extension=>settings.showAdultEverywhere||!isExplicitExtensionContent(extension));
    const missing=eligible.filter(extension=>!installer.isInstalled(extension));
    if(!missing.length){toast.info('All available extensions in this stack are already installed or excluded by your content settings.');return;}
    if(!await confirm({title:`Install ${missing.length} extensions from “${stack.title}”?`,description:<span className="flex flex-col gap-3"><span className="max-h-48 overflow-y-auto whitespace-pre-line">{missing.map(extension=>extension.name).join('\n')}</span><span>Review extensions before granting their requested permissions.</span></span>,confirmLabel:'Install stack'}))return;
    setBusy(true);
    let succeeded=0;
    try{
      for(const [index,extension] of missing.entries()){
        setProgress(`${index+1}/${missing.length}: ${extension.name}`);
        try{await installer.install.mutateAsync({extension});succeeded++;}
        catch{toast.error(`Could not install ${extension.name}. Retry this stack to install missing extensions.`);break;}
      }
      if(succeeded)toast.success(`Installed ${succeeded} extension${succeeded===1?'':'s'}`);
    }finally{setBusy(false);setProgress('');}
  }
  if(!EXTENSION_API_BASE)return null;
  return <section className="flex flex-col gap-4"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Community stacks</h2><Button asChild variant="outline"><a href={`${EXTENSION_PORTAL_URL}/stacks`} target="_blank" rel="noreferrer">Create or browse stacks</a></Button></header>
    {query.isLoading&&<p role="status">Loading stacks…</p>}{query.isError&&<p role="alert">Stacks are unavailable. <Button variant="link" onClick={()=>query.refetch()}>Retry</Button></p>}
    {progress&&<p role="status">{progress}</p>}
    {!query.isLoading&&!query.isError&&!query.data?.length&&<p className="text-muted-foreground">Share your first extension collection from the extension portal.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{query.data?.map(stack=><Card key={stack.id}><CardHeader><CardTitle>{stack.title}</CardTitle><CardDescription>{stack.description}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">{stack.extensions.length} extensions · {stack.language.toUpperCase()}</p><ul className="mt-3 flex flex-col gap-1 text-sm">{stack.extensions.map(extension=><li key={extension.id}>{!settings.showAdultEverywhere&&isExplicitExtensionContent(toStoreExtension(extension))?"Hidden by content settings":extension.name}</li>)}</ul></CardContent><CardFooter><Button disabled={busy} onClick={()=>install(stack)}>{native?'Install stack':'Open in Tatakai'}</Button></CardFooter></Card>)}</div>
  </section>;
}
