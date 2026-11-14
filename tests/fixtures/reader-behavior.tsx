import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { ReaderImage } from '@/components/reader/ReaderImage';
import { ReaderPagedImages } from '@/components/reader/ReaderPagedImages';
import { ReaderChapterWindow } from '@/components/reader/ReaderChapterWindow';
import { ReaderInteractionControls } from '@/components/reader/ReaderInteractionControls';
import { readerImageStyles } from '@/components/reader/readerImageStyles';
import { DEFAULT_SETTINGS, type ReaderSettings } from '@/lib/reader/settings';
import { usePrepareReaderChapter } from '@/pages/manga/hooks/usePrepareReaderChapter';
import { useReaderInteractions } from '@/pages/manga/hooks/useReaderInteractions';
import { useReaderAutoScroll } from '@/pages/manga/hooks/useReaderAutoScroll';
import { useReaderVisiblePages } from '@/pages/manga/hooks/useReaderVisiblePages';
import '@/components/reader/reader-chrome.css';

const chapterPages = (chapter: number) => [14000, 1200].map((height, index) => ({
  pageNumber: index + 1, width: 800, height,
  imageUrl: `/tests/fixtures/reader-${index ? 'short' : 'long'}-page.svg?chapter=${chapter}`,
}));

function Fixture() {
  const [settings, setSettings] = useState<ReaderSettings>({ ...DEFAULT_SETTINGS, readingMode: 'paged', pageFit: 'height' });
  const [chapter, setChapter] = useState(0), [count, setCount] = useState(1), [page, setPage] = useState(0);
  const [ready, setReady] = useState(-1), [open, setOpen] = useState(false), [timings, setTimings] = useState<number[]>([]);
  const root = useRef<HTMLDivElement>(null), started = useRef(0);
  const update = useCallback(<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => setSettings(previous => ({ ...previous, [key]: value })), []);
  const next = () => {
    if (chapter >= 19) return;
    started.current = performance.now();
    setReady(-1); setPage(0); setCount(value => Math.max(value, chapter + 2)); setChapter(chapter + 1);
  };
  usePrepareReaderChapter({ identity: chapter < 19 ? `fixture:${chapter + 1}` : '', ready: ready === chapter, settings,
    load: async () => ({ pages: chapterPages(chapter + 1), scope: `fixture:${chapter + 1}` }),
  });
  useReaderInteractions({ rootRef: root, settings, paused: open, reducedMotion: false,
    onSettings: () => setOpen(true), onNextPage: () => setPage(value => Math.min(1, value + 1)), onStopAutoScroll: () => update('autoScroll', false),
  });
  useReaderAutoScroll(root, settings, open);
  useReaderVisiblePages(root, settings.readingMode === 'vertical', String(settings.readingMode), element => {
    const active = Number(element.closest('[data-ch]')?.getAttribute('data-ch'));
    if (Number.isFinite(active)) { setChapter(active); setPage(Number(element.dataset.page) - 1); }
  });
  useLayoutEffect(() => {
    if (settings.readingMode !== 'vertical') return;
    const target = root.current?.querySelector<HTMLElement>(`[data-ch="${chapter}"]`);
    if (target && root.current) root.current.scrollTop += target.getBoundingClientRect().top - root.current.getBoundingClientRect().top;
  }, [chapter, settings.readingMode]);
  useEffect(() => {
    if (ready === chapter && started.current) requestAnimationFrame(() => {
      setTimings(values => [...values, performance.now() - started.current]); started.current = 0;
    });
  }, [ready, chapter]);
  const sorted = [...timings].sort((a, b) => a - b);
  const style = readerImageStyles(settings, false);
  return <div style={{ padding: 12 }}>
    <h1>Reader behavior checks</h1>
    <p data-testid="reader-fixture-status">Chapter {chapter + 1}/20 · Page {page + 1} · {ready === chapter ? 'Ready' : 'Loading'} · {settings.autoScroll ? 'Auto scrolling' : 'Auto scroll off'}</p>
    <p data-testid="reader-fixture-timing">Prepared transitions: {timings.length}; p95: {sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1) : '—'}ms</p>
    <div style={{ display: 'flex', gap: 12, padding: '12px 0' }}>
      <button onClick={() => update('readingMode', settings.readingMode === 'paged' ? 'vertical' : 'paged')}>Switch reading mode</button>
      <button onClick={() => setPage(value => 1 - value)}>Turn page</button>
      <button onClick={next} disabled={chapter >= 19}>Next chapter</button>
      <button onClick={() => { setReady(-1); setChapter(0); setPage(0); }}>Back to first chapter</button>
      <button onClick={() => setOpen(value => !value)}>Reader settings</button>
      <button onClick={() => update('autoScroll', !settings.autoScroll)}>Toggle auto scroll</button>
    </div>
    {open && <div style={{ position: 'fixed', right: 12, top: 150, width: 360, zIndex: 50, background: '#171b20', padding: 16 }}>
      <button onClick={() => setOpen(false)}>Close reader settings</button><ReaderInteractionControls settings={settings} update={update} />
    </div>}
    <div ref={root} data-reader-scroll style={{ height: 'calc(100vh - 150px)', overflow: 'auto', background: '#171b20' }}>
      {settings.readingMode === 'paged' ? <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ReaderPagedImages pages={chapterPages(chapter)} chapterScope={String(chapter)} resourceScope={`fixture:${chapter}`}
          pageIndex={page} settings={settings} style={style.paged} touchOrNative={false} onPageLoaded={number => { if (number === 1) setReady(chapter); }} />
      </div> : Array.from({ length: count }, (_, index) => <section key={index} data-ch={index}>
        <p>Chapter {index + 1}</p><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ReaderChapterWindow active={Math.abs(index - chapter) <= 1} geometry={String(settings.widthPercent)} pageStyle={style.vertical}>
            {chapterPages(index).map((image, pageIndex) => <ReaderImage key={pageIndex} page={image} resourceScope={`fixture:${index}`} mode={settings.loadingMethod}
              style={style.vertical} eager priority={pageIndex ? 10 : 20} onPageLoaded={number => { if (index === chapter && number === 1) setReady(chapter); }} />)}
          </ReaderChapterWindow>
        </div>
      </section>)}
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
