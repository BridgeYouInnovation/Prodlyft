import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number; stroke?: number };

const I = ({ size = 16, stroke = 1.5, children, ...rest }: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

export const Icons = {
  Home: (p: IconProps) => (<I {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></I>),
  Import: (p: IconProps) => (<I {...p}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></I>),
  Box: (p: IconProps) => (<I {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></I>),
  Bolt: (p: IconProps) => (<I {...p}><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></I>),
  Plug: (p: IconProps) => (<I {...p}><path d="M9 2v4"/><path d="M15 2v4"/><path d="M7 6h10v5a5 5 0 0 1-10 0V6Z"/><path d="M12 16v6"/></I>),
  Settings: (p: IconProps) => (<I {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></I>),
  Search: (p: IconProps) => (<I {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></I>),
  Bell: (p: IconProps) => (<I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></I>),
  Plus: (p: IconProps) => (<I {...p}><path d="M12 5v14"/><path d="M5 12h14"/></I>),
  ArrowRight: (p: IconProps) => (<I {...p}><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></I>),
  Check: (p: IconProps) => (<I {...p}><path d="m5 12 5 5L20 7"/></I>),
  X: (p: IconProps) => (<I {...p}><path d="M6 6l12 12"/><path d="m18 6-12 12"/></I>),
  Chevron: (p: IconProps) => (<I {...p}><path d="m9 6 6 6-6 6"/></I>),
  ChevronDown: (p: IconProps) => (<I {...p}><path d="m6 9 6 6 6-6"/></I>),
  Link: (p: IconProps) => (<I {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></I>),
  Dots: (p: IconProps) => (<I {...p}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></I>),
  Filter: (p: IconProps) => (<I {...p}><path d="M3 5h18l-7 9v6l-4-2v-4L3 5Z"/></I>),
  Sort: (p: IconProps) => (<I {...p}><path d="M7 3v18"/><path d="m3 7 4-4 4 4"/><path d="M17 21V3"/><path d="m13 17 4 4 4-4"/></I>),
  Clock: (p: IconProps) => (<I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>),
  Download: (p: IconProps) => (<I {...p}><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></I>),
  Upload: (p: IconProps) => (<I {...p}><path d="M12 21V8"/><path d="m7 13 5-5 5 5"/><path d="M4 3h16"/></I>),
  Eye: (p: IconProps) => (<I {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></I>),
  Sparkle: (p: IconProps) => (<I {...p}><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2.5 2.5"/><path d="m15.5 15.5 2.5 2.5"/><path d="M6 18l2.5-2.5"/><path d="m15.5 8.5 2.5-2.5"/></I>),
  Branch: (p: IconProps) => (<I {...p}><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10"/><path d="M8 5h4a4 4 0 0 1 4 4v1"/></I>),
  Play: (p: IconProps) => (<I {...p}><path d="M7 4v16l13-8L7 4Z"/></I>),
  Globe: (p: IconProps) => (<I {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></I>),
};
