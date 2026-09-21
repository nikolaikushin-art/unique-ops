import type { ReactNode } from 'react';

/** Local build: no password re-confirmation — sensitive sections open directly. */
export function ElevatedGate({
  children,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  return <>{children}</>;
}
