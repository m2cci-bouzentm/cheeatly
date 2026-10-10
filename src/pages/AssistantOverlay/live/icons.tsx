// Icon set of the approved live call design (paths copied from docs/prototypes/live-call-v17.html).
import React from 'react';

type IconProps = { children: React.ReactNode };

const Icon: React.FC<IconProps> = ({ children }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

export const PauseIcon = () => (
  <Icon>
    <path d="M9 6v12M15 6v12" />
  </Icon>
);
export const PlayIcon = () => (
  <Icon>
    <path d="M8 6l10 6-10 6z" fill="currentColor" />
  </Icon>
);
export const EyeOffIcon = () => (
  <Icon>
    <path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4 9.5 6a13 13 0 0 1-2.6 3.4M6.5 7.6C4.5 9 3.2 10.8 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);
export const EyeIcon = () => (
  <Icon>
    <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const ShorterIcon = () => (
  <Icon>
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
  </Icon>
);
export const AngleIcon = () => (
  <Icon>
    <path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3" />
  </Icon>
);
export const CopyIcon = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);
export const StopIcon = () => (
  <Icon>
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
  </Icon>
);
export const XIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const UpIcon = () => (
  <Icon>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);
export const DownIcon = () => (
  <Icon>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);
export const ScanIcon = () => (
  <Icon>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="11.5" cy="11.5" r="3.5" />
    <path d="M16 16l-2-2" />
  </Icon>
);
export const LoaderIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Icon>
);
export const BoltIcon = () => (
  <Icon>
    <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
  </Icon>
);
export const CameraIcon = () => (
  <Icon>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);
export const BackIcon = () => (
  <Icon>
    <path d="M10 7l-5 5 5 5M5 12h10a4 4 0 0 1 4 4v1" />
  </Icon>
);
export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icon>
);

export const LogoMark = () => (
  <svg className="pill-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M18 6a8 8 0 1 0 0 12M17 8a5.5 5.5 0 1 0 0 8"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export const GripDots = () => (
  <svg viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.3" />
    <circle cx="9" cy="3" r="1.3" />
    <circle cx="3" cy="7" r="1.3" />
    <circle cx="9" cy="7" r="1.3" />
    <circle cx="3" cy="11" r="1.3" />
    <circle cx="9" cy="11" r="1.3" />
  </svg>
);
