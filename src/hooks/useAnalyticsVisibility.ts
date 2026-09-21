import { useCallback, useState } from 'react';

/**
 * Show / hide a page's charts. Charts start HIDDEN every time a module is opened;
 * the «Аналитика» button in the header reveals them.
 */
export function useAnalyticsVisibility(_page: string, initial = false): [boolean, () => void] {
  const [visible, setVisible] = useState<boolean>(initial);
  const toggle = useCallback(() => setVisible((v) => !v), []);
  return [visible, toggle];
}
