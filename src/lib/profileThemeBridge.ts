/** The only script allowed inside a custom profile's sandboxed document. */
export function profileThemeBridge(nonce: string): string {
  return `
const token=${JSON.stringify(nonce)};
const send=(value)=>parent.postMessage({channel:'tatakai-profile-theme',token,...value},'*');
const badgeTarget=event=>event.target instanceof Element?event.target.closest('[data-profile-badge]'):null;
let hoverTimer;
const hideBadge=()=>{clearTimeout(hoverTimer);send({action:'badge-hide'});};
function badgeData(element){
  const rect=element.getBoundingClientRect();
  let parent=element.parentElement,colors={background:'rgb(23,23,25)',foreground:'rgb(238,238,238)'};
  while(parent){const style=getComputedStyle(parent);if(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent'){colors={background:style.backgroundColor,foreground:style.color,border:style.borderColor,fontFamily:style.fontFamily};break;}parent=parent.parentElement;}
  return {key:element.getAttribute('data-profile-badge'),rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},colors};
}
document.addEventListener('pointerover',event=>{const badge=badgeTarget(event);if(badge&&!(event.relatedTarget instanceof Element&&event.relatedTarget.closest('[data-profile-badge]')===badge)){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>send({action:'badge-hover',...badgeData(badge)}),80);}});
document.addEventListener('pointerout',event=>{const badge=badgeTarget(event);if(badge&&!(event.relatedTarget instanceof Element&&event.relatedTarget.closest('[data-profile-badge]')===badge))hideBadge();});
document.addEventListener('focusin',event=>{const badge=badgeTarget(event);if(badge){clearTimeout(hoverTimer);send({action:'badge-hover',...badgeData(badge)});}});
document.addEventListener('focusout',event=>{if(badgeTarget(event))hideBadge();});
document.addEventListener('scroll',hideBadge,true);
window.addEventListener('blur',hideBadge);
document.addEventListener('keydown',event=>{const badge=badgeTarget(event);if(badge&&(event.key==='Enter'||event.key===' ')){event.preventDefault();hideBadge();send({action:'badge-details',...badgeData(badge)});}});
document.addEventListener('click',event=>{
  const badge=badgeTarget(event);if(badge){event.preventDefault();hideBadge();send({action:'badge-details',...badgeData(badge)});return;}
  const target=event.target instanceof Element?event.target.closest('button[data-profile-action],a[href]'):null;if(!target)return;
  if(target.tagName==='A'){const href=target.getAttribute('href');if(href&&href.startsWith('/')&&!href.startsWith('//')){event.preventDefault();send({action:'navigate',href});}}
  else{event.preventDefault();send({action:target.getAttribute('data-profile-action')});}
});
const measure=()=>send({action:'resize',height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)});
new ResizeObserver(measure).observe(document.body);window.addEventListener('load',measure);measure();`;
}
