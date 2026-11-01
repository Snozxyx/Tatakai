import { expect, test } from 'bun:test';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate, type NavigateFunction } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { useScrollRestoration } from './useScrollRestoration';
import { useHistoryPreference } from './useHistoryPreference';

test('Back restores filters and position after content is ready and respects user interruption', async () => {
  const dom = new JSDOM('<div id="app"></div>',{ url:'https://fixture.test' });
  const names = ['window','document','sessionStorage','MutationObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'] as const;
  const previous = Object.fromEntries(names.map(name => [name,(globalThis as any)[name]]));
  Object.assign(globalThis, { window:dom.window, document:dom.window.document, sessionStorage:dom.window.sessionStorage,
    MutationObserver:dom.window.MutationObserver, ResizeObserver:class { observe() {} disconnect() {} },
    requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0), cancelAnimationFrame:clearTimeout, IS_REACT_ACT_ENVIRONMENT:true });
  const scrolling = document.documentElement;
  Object.defineProperty(document,'scrollingElement',{ value:scrolling });
  Object.defineProperties(scrolling,{ clientHeight:{ value:500 }, scrollHeight:{ value:5000 } });
  let navigate: NavigateFunction, readyOnMount = true, setReady: (value:boolean)=>void;
  function List() {
    const [filter,setFilter] = useHistoryPreference('filter','all');
    const [ready,updateReady] = useState(readyOnMount); setReady = updateReady;
    useScrollRestoration('list',{useWindow:true,ready});
    return <button id="filter" onClick={()=>setFilter('reading')}>{filter}</button>;
  }
  function Router() { navigate=useNavigate(); return <Routes><Route path="/list" element={<List/>}/><Route path="/details" element={<p>Details</p>}/></Routes>; }
  const app = createRoot(document.getElementById('app')!);
  try {
    await act(async()=>app.render(<MemoryRouter initialEntries={['/list']}><Router/></MemoryRouter>));
    await act(async()=>document.getElementById('filter')!.click());
    scrolling.scrollTop=1200; window.dispatchEvent(new dom.window.Event('scroll'));
    await act(async()=>navigate('/details')); scrolling.scrollTop=0; readyOnMount=false;
    await act(async()=>navigate(-1));
    expect(document.getElementById('filter')!.textContent).toBe('reading');
    expect(scrolling.scrollTop).toBe(0);
    await act(async()=>setReady(true)); expect(scrolling.scrollTop).toBe(1200);
    await act(async()=>navigate('/details')); scrolling.scrollTop=0;
    await act(async()=>navigate(-1));
    scrolling.scrollTop=400; window.dispatchEvent(new dom.window.Event('wheel'));
    await act(async()=>setReady(true)); expect(scrolling.scrollTop).toBe(400);
  } finally { await act(async()=>app.unmount()); Object.assign(globalThis,previous); dom.window.close(); }
});
