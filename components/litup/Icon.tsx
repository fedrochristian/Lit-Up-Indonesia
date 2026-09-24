export type IconName = "explore" | "book" | "bookmark" | "spark" | "arrow" | "search" | "close" | "check" | "external" | "clock" | "sliders" | "play" | "headphones" | "code" | "user" | "send" | "leaf" | "chevron";
const shapes: Record<IconName, React.ReactNode> = {
  explore: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></>,
  book: <><path d="M12 5v15M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Z"/></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 1 3 2 1"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  search: <><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  external: <><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-7 0v6"/></>,
  play: <path d="m8 4 12 8-12 8Z"/>,
  headphones: <><path d="M3 13v-1a9 9 0 0 1 18 0v1"/><rect x="3" y="11" width="4" height="9" rx="2"/><rect x="17" y="11" width="4" height="9" rx="2"/></>,
  code: <path d="m7 6-6 6 6 6m10-12 6 6-6 6M14 3l-4 18"/>,
  user: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  send: <><path d="m3 3 19 9-19 9 3-9Z"/><path d="M6 12h16"/></>,
  leaf: <><path d="M20 3c1 12-3 17-10 17-8 0-10-13 10-17Z"/><path d="M4 22 15 10"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
};
export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{shapes[name]}</svg>;
}
