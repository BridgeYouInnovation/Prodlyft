import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";

export default function CanceledPage() {
  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <div className="px-4 py-10 md:py-16">
        <div className="max-w-[480px] mx-auto text-center">
          <div className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-2">Payment canceled</div>
          <p className="text-[13.5px] text-muted mb-6">
            Nothing was charged. You can retry any time.
          </p>
          <Link href="/pricing" className="btn-primary btn-lg">Back to pricing</Link>
        </div>
      </div>
    </div>
  );
}
