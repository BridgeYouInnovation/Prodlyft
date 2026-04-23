import { Icons } from "./Icons";

const steps = ["Source", "Extract", "Review", "Export"];

export function Stepper({ active }: { active: number }) {
  return (
    <div className="flex items-center px-6 py-[22px] border-b border-line">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full grid place-items-center text-[11px] font-semibold font-mono"
              style={{
                background: i < active ? "var(--ink)" : "white",
                border: i === active ? "1.5px solid var(--ink)" : i < active ? "none" : "1px solid var(--line)",
                color: i < active ? "var(--bg)" : i === active ? "var(--ink)" : "var(--muted-2)",
              }}
            >
              {i < active ? <Icons.Check size={11} /> : i + 1}
            </div>
            <span
              className="text-[12.5px]"
              style={{
                fontWeight: i === active ? 500 : 400,
                color: i <= active ? "var(--ink)" : "var(--muted-2)",
              }}
            >
              {s}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-px mx-3.5"
              style={{ background: i < active ? "var(--ink)" : "var(--line)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
