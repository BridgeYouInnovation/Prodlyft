import { Icons } from "./Icons";

export function Topbar({
  crumbs,
  right,
  onMenuClick,
}: {
  crumbs: string[];
  right?: React.ReactNode;
  onMenuClick?: () => void;
}) {
  const last = crumbs[crumbs.length - 1];
  return (
    <div className="topbar px-3 md:px-5 gap-1 md:gap-0">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="btn-ghost btn-icon md:hidden mr-1 flex-shrink-0"
          aria-label="Open menu"
        >
          <Icons.Menu size={18} />
        </button>
      )}

      {/* Mobile: last crumb only */}
      <div className="md:hidden text-[13px] font-medium text-ink truncate min-w-0">{last}</div>

      {/* Desktop: full breadcrumb */}
      <div className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className={i === crumbs.length - 1 ? "text-ink font-medium" : "text-muted"}>{c}</span>
            {i < crumbs.length - 1 && <Icons.Chevron size={12} className="text-muted-2" />}
          </span>
        ))}
      </div>

      <div className="flex-1" />

      <div className="hidden lg:flex items-center gap-2 px-2.5 h-[30px] bg-white border border-line rounded-md text-[12.5px] text-muted w-[260px]">
        <Icons.Search size={13} />
        <span>Search products, imports...</span>
        <div className="flex-1" />
        <kbd className="kbd">⌘K</kbd>
      </div>
      <div className="w-3 hidden lg:block" />

      {right ?? (
        <>
          <button className="btn-ghost btn-icon">
            <Icons.Bell size={15} />
          </button>
          <div
            className="w-7 h-7 rounded-full ml-1 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}
          />
        </>
      )}
    </div>
  );
}
