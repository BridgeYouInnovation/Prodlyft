import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";

export default function ErrorPage() {
  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <div className="px-4 py-10 md:py-16">
        <div className="max-w-[480px] mx-auto text-center">
          <div className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-2">Payment failed</div>
          <p className="text-[13.5px] text-muted mb-6">
            Something went wrong on the payment provider's side. No charge was made.
            If you were billed, email{" "}
            <a className="underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a> with your transaction reference.
          </p>
          <Link href="/pricing" className="btn-primary btn-lg">Try again</Link>
        </div>
      </div>
    </div>
  );
}
