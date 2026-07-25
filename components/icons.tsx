// Small icon set (Lucide-style strokes). No emoji as icons.
type P = { className?: string };
const S = ({ children, ...p }: React.SVGProps<SVGSVGElement> & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);

export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>;
export const IconDoc = (p: P) => <S {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></S>;
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconX = (p: P) => <S {...p} strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12" /></S>;
export const IconCheck = (p: P) => <S {...p} strokeWidth={3}><path d="M20 6 9 17l-5-5" /></S>;
export const IconLayers = (p: P) => <S {...p} strokeWidth={1.8}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></S>;
export const IconLock = (p: P) => <S {...p} strokeWidth={1.8}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>;
export const IconActivity = (p: P) => <S {...p} strokeWidth={1.8}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></S>;
export const IconChart = (p: P) => <S {...p}><path d="M3 3v18h18" /><path d="m7 14 3-3 3 3 5-6" /></S>;
export const IconBookmark = (p: P) => <S {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></S>;
export const IconInfo = (p: P) => <S {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></S>;
export const IconPin = (p: P) => <S {...p}><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></S>;
export const IconMoney = (p: P) => <S {...p}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></S>;
export const IconExt = (p: P) => <S {...p}><path d="M7 17 17 7M7 7h10v10" /></S>;
export const IconRefresh = (p: P) => <S {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></S>;
export const IconSun = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>;
export const IconMoon = (p: P) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>;
export const IconLogout = (p: P) => <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></S>;
export const IconSave = ({ filled, ...p }: P & { filled?: boolean }) => <S {...p} fill={filled ? "currentColor" : "none"}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></S>;
export const IconTrash = (p: P) => <S {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" /></S>;
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>;
