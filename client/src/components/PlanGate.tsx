import { useLocation } from "wouter";
import { Zap, Lock } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";

interface PlanGateProps {
  /** Label shown on the upgrade prompt (e.g. "Loyalty Program") */
  feature: string;
  children: React.ReactNode;
}

/**
 * Wraps a Pro-only UI section. On Starter the content is dimmed and an
 * "Upgrade to Pro" overlay is shown. On Pro the children render normally.
 */
export function PlanGate({ feature, children }: PlanGateProps) {
  const { isPro } = usePlan();
  const [, setLocation] = useLocation();

  if (isPro) return <>{children}</>;

  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Dimmed preview of the locked content */}
      <div className="pointer-events-none select-none opacity-30 blur-[1px]">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 border border-amber-200">
          <Lock className="w-5 h-5 text-amber-600" />
        </div>
        <div className="text-center px-4">
          <p className="font-semibold text-gray-800 text-sm">{feature}</p>
          <p className="text-xs text-gray-500 mt-0.5">Available on the Pro plan</p>
        </div>
        <button
          onClick={() => setLocation("/billing")}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}

/**
 * Inline Pro badge — attach to tab labels or section headers for Pro-only tabs/sections.
 */
export function ProBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200 leading-none">
      <Zap className="w-2.5 h-2.5" />
      PRO
    </span>
  );
}
