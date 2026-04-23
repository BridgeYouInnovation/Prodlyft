import { Icons } from "./Icons";

export function Topbar({
  crumbs,
  right,
}: {
  crumbs: string[];
  right?: React.ReactNode;
}) {
  return (
    <div className="topbar">
      <div className="flex items-center gap-2 text-[13px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className={i === crumbs.length - 1 ? "text-ink font-medium" : "text-muted"}>{c}</span>
            {i < crumbs.length - 1 && <Icons.Chevron size={12} className="text-muted-2" />}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 px-2.5 h-[30px] bg-white border border-line rounded-md text-[12.5px] text-muted w-[260px]">
        <Icons.Search size={13} />
        <span>Search products, imports...</span>
        <div className="flex-1" />
        <kbd className="kbd">⌘K</kbd>
      </div>
      <div className="w-3" />
      {right ?? (
        <>
          <button className="btn-ghost btn-icon">
            <Icons.Bell size={15} />
          </button>
          <div
            className="w-7 h-7 rounded-full ml-1"
            style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}
          />
        </>
      )}
    </div>
  );
}
