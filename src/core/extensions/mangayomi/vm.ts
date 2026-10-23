import type { QuickJSWASMModule } from 'quickjs-emscripten';
import { evaluateSora, type SoraHttpRequest, type SoraHttpResponse, type SoraMethod } from '../sora/vm';

export const MANGAYOMI_METHODS = ['getHeaders', 'getPopular', 'getLatestUpdates', 'search', 'getDetail', 'getPageList', 'getVideoList', 'getSourcePreferences'] as const;
export type MangayomiMethod = 'probe' | typeof MANGAYOMI_METHODS[number];
export interface MangayomiContext { source: Record<string, unknown>; preferences: Record<string, unknown> }

// These are host API definitions, not rewritten provider code. The downloaded script
// is evaluated separately and unchanged, then its original DefaultExtension is called.
function setup(context: MangayomiContext) {
  return `
    const __source = ${JSON.stringify(context.source)};
    const __preferences = ${JSON.stringify(context.preferences)};
    const __writes = Object.create(null);
    class MProvider { get source(){ return __source; } }
    class Client {
      constructor(options){ if(options && Object.keys(options).length) throw Error('Custom Client options are not supported by this host yet'); }
      async request(method,url,headers,body){
        headers = headers || {};
        if(body != null && typeof body !== 'string') {
          const json = Object.entries(headers).some(([k,v])=>k.toLowerCase()==='content-type' && String(v).includes('application/json'));
          body = json ? JSON.stringify(body) : Object.entries(body).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
          if(!json && !Object.keys(headers).some(k=>k.toLowerCase()==='content-type')) headers={...headers,'Content-Type':'application/x-www-form-urlencoded'};
        }
        const data=JSON.parse(await __nativeFetch(JSON.stringify({url,headers,method,body})));
        return {body:data.body,statusCode:data.status,headers:data.headers,isRedirect:data.status>=300&&data.status<400};
      }
      get(url,headers){return this.request('GET',url,headers);}
      head(url,headers){return this.request('HEAD',url,headers);}
      post(url,headers,body){return this.request('POST',url,headers,body);}
      put(url,headers,body){return this.request('PUT',url,headers,body);}
      patch(url,headers,body){return this.request('PATCH',url,headers,body);}
      delete(url,headers,body){return this.request('DELETE',url,headers,body);}
    }
    class SharedPreferences {
      get(key,fallback=null){return Object.prototype.hasOwnProperty.call(__writes,key)?__writes[key]:Object.prototype.hasOwnProperty.call(__preferences,key)?__preferences[key]:fallback;}
      getString(key,fallback){return this.get(key)??fallback;}
      setString(key,value){ if(typeof key!=='string'||key.length>200||typeof value!=='string'||value.length>16384)throw Error('Invalid preference'); __writes[key]=value; return true; }
    }
    const __dom = (id,op,arg)=>JSON.parse(__nativeHost(JSON.stringify({id,op,arg})));
    class Element {
      constructor(id){this.key=id;}
      get text(){return __dom(this.key,'text');} get innerHtml(){return __dom(this.key,'innerHtml');}
      get outerHtml(){return __dom(this.key,'outerHtml');} get className(){return this.attr('class');}
      get localName(){return __dom(this.key,'localName');} get namespaceUri(){return __dom(this.key,'namespaceUri');}
      get children(){return __dom(this.key,'children').map(id=>new Element(id));}
      get parent(){const id=__dom(this.key,'parent');return id==null?null:new Element(id);}
      get nextElementSibling(){const id=__dom(this.key,'next');return id==null?null:new Element(id);}
      get previousElementSibling(){const id=__dom(this.key,'previous');return id==null?null:new Element(id);}
      get getSrc(){return this.attr('src');} get getDataSrc(){return this.attr('data-src');}
      get getImg(){return this.attr('data-src')||this.attr('src');} get getHref(){return this.attr('href');}
      attr(name){return __dom(this.key,'attr',name);} hasAttr(name){return __dom(this.key,'hasAttr',name);}
      select(selector){return __dom(this.key,'select',selector).map(id=>new Element(id));}
      selectFirst(selector){const id=__dom(this.key,'selectFirst',selector);return id==null?null:new Element(id);}
      getElementsByTagName(name){return __dom(this.key,'tag',name).map(id=>new Element(id));}
      getElementsByClassName(name){return __dom(this.key,'class',name).map(id=>new Element(id));}
      getElementById(name){const id=__dom(this.key,'byId',name);return id==null?null:new Element(id);}
      xpath(){throw Error('XPath host API is not implemented');} xpathFirst(){throw Error('XPath host API is not implemented');}
    }
    class Document extends Element {
      constructor(html){super(__dom(null,'parse',html));}
      get body(){return this.selectFirst('body');} get head(){return this.selectFirst('head');}
      get documentElement(){return this.selectFirst('html');}
    }
    String.prototype.substringAfter=function(p){const i=this.indexOf(p);return i<0?String(this):this.slice(i+p.length);};
    String.prototype.substringBefore=function(p){const i=this.indexOf(p);return i<0?String(this):this.slice(0,i);};
    String.prototype.substringAfterLast=function(p){const i=this.lastIndexOf(p);return i<0?String(this):this.slice(i+p.length);};
    String.prototype.substringBeforeLast=function(p){const i=this.lastIndexOf(p);return i<0?String(this):this.slice(0,i);};
    String.prototype.substringBetween=function(a,b){const i=this.indexOf(a);if(i<0)return '';const j=this.indexOf(b,i+a.length);return j<0?'':this.slice(i+a.length,j);};
    function __initializePreferences(provider){
      if(typeof provider.getSourcePreferences!=='function') return;
      let rows;
      try {rows=provider.getSourcePreferences();} catch(error) {if(String(error?.message).toLowerCase().includes('getsourcepreferences not implemented'))return;throw error;}
      if(!Array.isArray(rows)||rows.length>200)throw Error('Unsupported source preferences');
      for(const row of rows){
        if(!row||typeof row.key!=='string'||Object.prototype.hasOwnProperty.call(__preferences,row.key))continue;
        const data=row.checkBoxPreference||row.switchPreferenceCompat||row.listPreference||row.multiSelectListPreference||row.editTextPreference;
        if(data) Object.defineProperty(__preferences,row.key,{value:data.value??data.values??data.entryValues?.[data.valueIndex||0]??null,writable:true,enumerable:true,configurable:true});
      }
    }
  `;
}

export function evaluateMangayomi(engine: QuickJSWASMModule, code: string, method: MangayomiMethod, args: unknown[], context: MangayomiContext, http: (request: SoraHttpRequest) => Promise<SoraHttpResponse>, dom: (request: unknown) => unknown, signal?: AbortSignal) {
  return evaluateSora(engine, code, method as SoraMethod, args, http, signal, {
    methods: MANGAYOMI_METHODS, setup: setup(context), filename: 'original-mangayomi-module.js', synchronous: dom,
    expression: (method, args) => `(async()=>{const provider=new DefaultExtension();__initializePreferences(provider);const result=${method === 'probe'
      ? `{${MANGAYOMI_METHODS.map(name => `${name}:typeof provider.${name}==='function'`).join(',')}}`
      : `await provider[${JSON.stringify(method)}](...${JSON.stringify(args)})`};return JSON.stringify({value:result,preferences:__writes});})()`,
  });
}
