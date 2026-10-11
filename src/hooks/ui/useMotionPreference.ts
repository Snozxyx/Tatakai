import { useEffect, useState } from 'react';

const readMotionPreference = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.body.classList.contains('reduce-motion')
  || document.documentElement.classList.contains('reduce-motion')
  || document.documentElement.dataset.reducedMotion === 'true';

/** OS preference and the existing in-app setting, including live changes. */
export function useMotionPreference() {
  const [reduced, setReduced] = useState(readMotionPreference);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(readMotionPreference());
    const observer = new MutationObserver(sync);
    query.addEventListener('change', sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-reduced-motion'] });
    sync();
    return () => {
      query.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}
