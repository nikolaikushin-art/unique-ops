import type { ReactNode } from 'react';

interface DxCardProps {
  eyebrow?: string;
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  id?: string;
}

/** Standard dashboard card: eyebrow, title, optional right slot. */
export function DxCard({ eyebrow, title, right, children, id }: DxCardProps) {
  return (
    <div className="dx-card" id={id}>
      {(eyebrow || title || right) && (
        <div className="dx-card-head">
          <div>
            {eyebrow && <div className="dx-eyebrow">{eyebrow}</div>}
            {title && <div className="dx-title">{title}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
