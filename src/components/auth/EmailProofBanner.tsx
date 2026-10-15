import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import {useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import {resolveApiV3Base} from '@/lib/api/backendOrigin';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field';
import {TurnstileWidget} from '@/components/security/TurnstileWidget';
import {Mail} from 'lucide-react';

export function EmailProofBanner(){
  useUiTranslation();
 const {user}=useAuth();const [open,setOpen]=useState(false),[captcha,setCaptcha]=useState(''),[token,setToken]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[verified,setVerified]=useState(false);
 if(import.meta.env.VITE_OPERATIONS_AUTH_ENABLED!=='true'||!user?.app_metadata?.tatakai_email_proof_required||verified)return null;
 async function request(action:'send'|'verify'){
  setBusy(true);setMessage('');try{const session=(await supabase.auth.getSession()).data.session;const response=await fetch(`${resolveApiV3Base()}/auth/email-proof/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify(action==='send'?{captchaToken:captcha}:{token})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Verification unavailable');if(action==='send')setMessage(uiI18n.t('app.check_your_inbox_for_a_six_digit_code_c55abd66'));else{await supabase.auth.refreshSession();setVerified(true);setOpen(false);}}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <><Alert className="my-3"><Mail/><AlertTitle>{uiI18n.t('app.verify_your_email_to_contribute_461247e7')}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{uiI18n.t('app.you_can_browse_verify_your_email_before_posting__bd0c0896')}</span><Button size="sm" variant="outline" onClick={()=>setOpen(true)}>{uiI18n.t('app.verify_email_eb57dd1d')}</Button></AlertDescription></Alert><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{uiI18n.t('app.verify_your_email_84fdc780')}</DialogTitle><DialogDescription>{uiI18n.t('app.send_a_code_to_the_email_on_your_account_when_em_5e75995e')}</DialogDescription></DialogHeader><div className="flex flex-col gap-4"><TurnstileWidget onToken={setCaptcha} onExpire={()=>setCaptcha('')}/><Button disabled={busy||!captcha} onClick={()=>request('send')}>{uiI18n.t('app.send_verification_code_cfbbd927')}</Button><FieldGroup><Field><FieldLabel htmlFor="email-proof-code">{uiI18n.t('app.six_digit_code_52e07d3b')}</FieldLabel><Input id="email-proof-code" value={token} onChange={event=>setToken(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6}/></Field></FieldGroup><Button disabled={busy||token.length!==6} onClick={()=>request('verify')}>{uiI18n.t('app.verify_email_eb57dd1d')}</Button>{message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}</div></DialogContent></Dialog></>;
}
