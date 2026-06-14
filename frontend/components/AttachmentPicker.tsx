"use client";
import { useRef, useState } from "react";
import { Icons } from "./Icons";

/** What the picker hands back to the parent form. The shape matches
 *  what the ticket POST endpoints accept on the wire. */
export interface PendingAttachment {
  filename: string;
  content_type: string;
  /** `data:image/<type>;base64,<...>` — produced by FileReader. */
  data_url: string;
  /** Object URL used for the local thumbnail preview. Revoked when
   *  the item is removed or the component unmounts. */
  preview_url: string;
  /** Decoded byte length (for the "1.2 MB" label + size validation). */
  size_bytes: number;
}

interface Props {
  value: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  /** Defaults to 4. Mirrors the server-side limit in lib/ticket-attachments.ts. */
  max?: number;
  /** Defaults to 5 MB. */
  maxBytes?: number;
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Couldn't read the file"));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(file);
  });
}

/**
 * Image attachment picker for ticket forms. Drop-target area + file
 * input + thumbnail strip with per-item remove. Surfaces validation
 * errors inline (size, content type) without ever swallowing failures.
 *
 * Hands the parent an array of PendingAttachment — the parent
 * serialises them into the POST body when it submits.
 */
export function AttachmentPicker({
  value,
  onChange,
  max = 4,
  maxBytes = 5 * 1024 * 1024,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function ingest(files: FileList | File[]) {
    setErr(null);
    const incoming = Array.from(files);
    if (incoming.length === 0) return;
    if (value.length + incoming.length > max) {
      setErr(`You can attach at most ${max} image${max === 1 ? "" : "s"} per message.`);
      return;
    }
    const next: PendingAttachment[] = [...value];
    for (const f of incoming) {
      if (!ALLOWED.has(f.type)) {
        setErr(`${f.name}: unsupported file type. Use JPG, PNG, WebP, or GIF.`);
        continue;
      }
      if (f.size > maxBytes) {
        setErr(`${f.name}: too large (${(f.size / 1024 / 1024).toFixed(2)} MB). Max ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`);
        continue;
      }
      let dataUrl: string;
      try {
        dataUrl = await readAsDataURL(f);
      } catch (e) {
        setErr((e as Error).message);
        continue;
      }
      next.push({
        filename: f.name,
        content_type: f.type,
        data_url: dataUrl,
        preview_url: URL.createObjectURL(f),
        size_bytes: f.size,
      });
    }
    onChange(next);
  }

  function remove(idx: number) {
    const target = value[idx];
    if (target?.preview_url) {
      try { URL.revokeObjectURL(target.preview_url); } catch { /* ignore */ }
    }
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) ingest(e.target.files);
          e.target.value = ""; // allow re-selecting same file
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files) ingest(e.dataTransfer.files);
        }}
        className="flex items-center justify-center gap-2 rounded-md text-[12.5px] transition-colors"
        style={{
          minHeight: 40,
          padding: "8px 12px",
          border: `1px dashed ${dragging ? "var(--ink)" : "var(--line)"}`,
          background: dragging ? "var(--surface2)" : "transparent",
          color: "var(--muted)",
        }}
        disabled={value.length >= max}
      >
        <Icons.Upload size={13} />
        {value.length === 0
          ? "Attach screenshots (JPG, PNG, WebP, GIF · max 5 MB each)"
          : value.length >= max
          ? `${value.length} / ${max} attached`
          : `Add another (${value.length} / ${max})`}
      </button>

      {err && (
        <div className="text-[11.5px] text-warn-ink bg-warn-soft px-2 py-1.5 rounded-md">
          {err}
        </div>
      )}

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {value.map((a, i) => (
            <div key={a.preview_url} className="relative group">
              <img
                src={a.preview_url}
                alt={a.filename}
                className="w-full rounded-md border border-line"
                style={{ aspectRatio: "1", objectFit: "cover" }}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${a.filename}`}
                className="absolute top-1 right-1 rounded-full grid place-items-center transition-opacity opacity-90 hover:opacity-100"
                style={{
                  width: 22,
                  height: 22,
                  background: "rgba(14,14,12,0.85)",
                  color: "#fff",
                }}
              >
                <Icons.X size={12} />
              </button>
              <div
                className="absolute bottom-1 left-1 text-[9.5px] font-mono px-1 rounded"
                style={{ background: "rgba(14,14,12,0.7)", color: "#fff" }}
              >
                {(a.size_bytes / 1024).toFixed(0)}k
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
