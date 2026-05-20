/**
 * Responsive 16:9 YouTube embed, lazy-loaded.
 *
 * Uses youtube-nocookie.com so we don't drop tracking cookies on
 * unsuspecting visitors, and `loading="lazy"` so the iframe doesn't
 * cost first-paint bandwidth on long pages.
 */
interface YouTubeEmbedProps {
  /** The 11-character YouTube video id (e.g. "jVZc26Sy0vA"). */
  videoId: string;
  /** Accessible label for screen readers. */
  title: string;
  /** Optional caption shown beneath the player. */
  caption?: string;
  className?: string;
}

export function YouTubeEmbed({ videoId, title, caption, className }: YouTubeEmbedProps) {
  return (
    <figure className={className}>
      <div
        className="relative w-full overflow-hidden rounded-lg border border-line"
        style={{ aspectRatio: "16 / 9", background: "#000" }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
          frameBorder={0}
        />
      </div>
      {caption && (
        <figcaption className="text-[12px] text-muted mt-2 text-center">{caption}</figcaption>
      )}
    </figure>
  );
}
