export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      className="grid place-items-center rounded-[5px] bg-ink text-bg font-mono font-bold"
    >
      P
    </div>
  );
}
