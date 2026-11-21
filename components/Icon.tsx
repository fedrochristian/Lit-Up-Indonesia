export type IconName =
  | "compass"
  | "book"
  | "chat"
  | "group"
  | "play"
  | "close"
  | "send"
  | "logout"
  | "trash"
  | "shuffle"
  | "search"
  | "alert"
  | "check"
  | "external"
  | "user";

const shapes: Record<IconName, React.ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" />
    </>
  ),
  book: <path d="M12 6v14M12 6C9 3.5 5 4 3 5v14c2.5-1 6-1.5 9 1 3-2.5 6.5-2 9-1V5c-2-1-6-1.5-9 1Z" />,
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h7M8.5 14h4" />
    </>
  ),
  group: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M17 14a4 4 0 0 1 4 4v1.5" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  send: <path d="m4 4 17 8-17 8 3-8Zm3 8h14" />,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  shuffle: <path d="M3 7h4c5 0 5 10 10 10h4m-3-3 3 3-3 3M3 17h4c1.6 0 2.7-1 3.6-2.4M14 9.4C14.9 8 16 7 17.6 7H21m-3-3 3 3-3 3" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  external: <path d="M14 4h6v6m0-6L10 14M10 5H4v15h15v-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </>
  ),
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}
