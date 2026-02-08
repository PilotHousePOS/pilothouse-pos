import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OrderStatusTimelineProps {
  status: string;
}

const STEPS = [
  { key: "pending", label: "Placed" },
  { key: "in_progress", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Picked Up" },
];

export default function OrderStatusTimeline({ status }: OrderStatusTimelineProps) {
  if (status === "refunded") {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Refunded</Badge>;
  }
  if (status === "cancelled") {
    return <Badge className="bg-red-100 text-red-800 border-red-300">Cancelled</Badge>;
  }

  const statusOrder = ["pending", "in_progress", "ready", "picked_up", "completed"];
  const currentIndex = statusOrder.indexOf(status);
  const activeStepIndex = status === "completed" ? 3 : currentIndex;

  return (
    <div className="flex items-center justify-between w-full py-2">
      {STEPS.map((step, index) => {
        const isCompleted = index <= activeStepIndex;
        const isCurrent = index === activeStepIndex;
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              {isCompleted ? (
                <CheckCircle2 className={`w-6 h-6 ${isCurrent ? 'text-blue-500' : 'text-green-500'}`} />
              ) : (
                <Circle className="w-6 h-6 text-gray-300" />
              )}
              <span className={`text-[10px] mt-1 font-medium ${isCompleted ? (isCurrent ? 'text-blue-600' : 'text-green-600') : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-0.5 mx-1 ${index < activeStepIndex ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
