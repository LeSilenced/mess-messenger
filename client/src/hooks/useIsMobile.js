import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT_PX = 768;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT_PX) {
  const query = `(max-width: ${breakpoint}px)`;

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-mobile', isMobile);
    document.documentElement.classList.toggle('is-desktop', !isMobile);
    return () => {
      document.documentElement.classList.remove('is-mobile', 'is-desktop');
    };
  }, [isMobile]);

  return isMobile;
}
