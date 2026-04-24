import Image from "next/image";

// The logo PNG is a wide wordmark (777×234). `size` is the rendered height;
// width is derived so the aspect ratio stays true. For dark backgrounds
// (admin sidebar) set `light` to invert the logo to white.
const LOGO_ASPECT = 777 / 234;

export function BrandMark({
  size = 24,
  light = false,
  className,
}: {
  size?: number;
  light?: boolean;
  className?: string;
}) {
  const height = size;
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <Image
      src="/prodlyft_logo.png"
      alt="Prodlyft"
      width={width}
      height={height}
      priority
      className={className}
      style={light ? { filter: "brightness(0) invert(1)" } : undefined}
    />
  );
}
