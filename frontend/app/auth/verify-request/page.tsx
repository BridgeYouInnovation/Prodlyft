import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";

export default function VerifyRequest() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[15px] tracking-tight2">
          <BrandMark /> Prodlyft
        </Link>
      </header>
      <div className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-[420px] text-center">
          <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-5" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
            <Icons.Sparkle size={22} />
          </div>
          <h1 className="text-[24px] md:text-[28px] tracking-tight2 font-[560] mb-2">Check your email</h1>
          <p className="text-[14px] text-muted leading-[1.55] mb-8">
            A sign-in link is on its way. Click the link in that email to finish signing in to Prodlyft.
          </p>
          <div className="card p-4 text-left text-[12.5px] text-muted leading-[1.6]">
            <div className="font-medium text-ink mb-1">Didn't get it?</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Check your spam or promotions folder.</li>
              <li>The link expires in 24 hours.</li>
              <li><Link href="/signin" className="underline">Request another one</Link>.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
