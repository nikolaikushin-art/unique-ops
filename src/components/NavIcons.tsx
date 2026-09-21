import type { ReactNode, SVGProps } from 'react';

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

interface NavIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function NavSvg({ size = 22, children, ...props }: NavIconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke} {...props}>
      {children}
    </svg>
  );
}

export function NavIconMenu(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </NavSvg>
  );
}

export function NavIconPlus(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M12 5v14M5 12h14" />
    </NavSvg>
  );
}

export function NavIconBell(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </NavSvg>
  );
}

export function NavIconLock(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </NavSvg>
  );
}

export function NavIconSettings(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </NavSvg>
  );
}

export function NavIconSun(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </NavSvg>
  );
}

export function NavIconMoon(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </NavSvg>
  );
}

export function NavIconCheck(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </NavSvg>
  );
}

export function NavIconWarning(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </NavSvg>
  );
}

export function NavIconCamera(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </NavSvg>
  );
}

export function NavIconPrint(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </NavSvg>
  );
}

export function NavIconZap(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </NavSvg>
  );
}

export function NavIconFile(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </NavSvg>
  );
}

export function NavIconPlay(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </NavSvg>
  );
}

export function NavIconSend(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </NavSvg>
  );
}

export function NavIconLogout(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </NavSvg>
  );
}

export function NavIconChevronUp(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="m18 15-6-6-6 6" />
    </NavSvg>
  );
}

export function NavIconChevronDown(props: NavIconProps) {
  return (
    <NavSvg {...props}>
      <path d="m6 9 6 6 6-6" />
    </NavSvg>
  );
}
