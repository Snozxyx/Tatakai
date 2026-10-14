// Browser clients authorize with their signed user session. Administrative
// credentials must never be embedded in a public client bundle.
export function withAdminSecretHeader(headers:Record<string,string>={}):Record<string,string>{return {...headers};}
export function installGlobalAdminSecretFetchPatch():void{}
