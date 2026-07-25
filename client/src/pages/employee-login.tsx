import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Delete, LogIn, ChevronLeft } from "lucide-react";

interface RosterEmployee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  employeeCode: string | null;
}

export default function EmployeeLogin() {
  const [, navigate] = useLocation();
  const { user, refetch } = useAuth() as any;
  const { toast } = useToast();

  const [selected, setSelected] = useState<RosterEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const { data: roster = [], isLoading } = useQuery<RosterEmployee[]>({
    queryKey: ["/api/employee/roster"],
    staleTime: 30_000,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ employeeCode, pin }: { employeeCode: string; pin: string }) => {
      const res = await apiRequest("POST", "/api/auth/employee-pin-login", { employeeCode, pin });
      return res.json();
    },
    onSuccess: async () => {
      await refetch();
      toast({ title: "Signed in — good luck today!" });
      navigate("/admin");
    },
    onError: () => {
      setError("Incorrect PIN. Try again.");
      setPin("");
    },
  });

  const handleDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4 && selected?.employeeCode) {
      loginMutation.mutate({ employeeCode: selected.employeeCode, pin: next });
    }
  };

  const handleBack = () => {
    setPin(prev => prev.slice(0, -1));
    setError("");
  };

  const handleSelectEmployee = (emp: RosterEmployee) => {
    setSelected(emp);
    setPin("");
    setError("");
  };

  // If already logged in as an employee, just go to admin
  useEffect(() => {
    const typed = user as any;
    if (typed?.isEmployee) navigate("/admin");
  }, [user]);

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Employee Sign‑In</h1>
          <p className="text-slate-400 text-sm mt-1">Select your name, then enter your 4‑digit PIN</p>
        </div>

        {/* Employee selector */}
        {!selected ? (
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-center text-slate-400 text-sm py-8">Loading staff…</p>
            ) : roster.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                <p className="text-sm">No employee accounts found.</p>
                <p className="text-xs mt-1">Ask your manager to create your account first.</p>
              </div>
            ) : (
              roster.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp)}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 text-left transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <span className="text-blue-300 font-semibold text-sm">
                      {(emp.firstName?.[0] ?? "?").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-slate-400 text-xs">{emp.employeeCode}</p>
                  </div>
                </button>
              ))
            )}

            {/* Owner / full login link */}
            <div className="pt-4 text-center">
              <button
                onClick={() => navigate("/auth")}
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                Manager / Owner login →
              </button>
            </div>
          </div>
        ) : (
          /* PIN entry */
          <div>
            {/* Back + name */}
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <span className="text-blue-300 font-semibold text-xs">
                    {(selected.firstName?.[0] ?? "?").toUpperCase()}
                  </span>
                </div>
                <p className="text-white font-medium">{selected.firstName} {selected.lastName}</p>
                <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">{selected.employeeCode}</Badge>
              </div>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-4 mb-6">
              {[0,1,2,3].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < pin.length
                      ? "bg-blue-400 border-blue-400 scale-110"
                      : "bg-transparent border-slate-500"
                  }`}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="text-center text-red-400 text-sm mb-4 animate-pulse">{error}</p>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3">
              {digits.map((d, i) => {
                if (d === "") return <div key={i} />;
                return (
                  <button
                    key={i}
                    onClick={() => d === "⌫" ? handleBack() : handleDigit(d)}
                    disabled={loginMutation.isPending}
                    className={`h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${
                      d === "⌫"
                        ? "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                        : "bg-white/10 hover:bg-white/20 text-white"
                    } border border-white/10 hover:border-white/20 disabled:opacity-50`}
                  >
                    {d === "⌫" ? <Delete className="h-5 w-5 mx-auto" /> : d}
                  </button>
                );
              })}
            </div>

            {loginMutation.isPending && (
              <p className="text-center text-slate-400 text-sm mt-4 animate-pulse">Verifying…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
