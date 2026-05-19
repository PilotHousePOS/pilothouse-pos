import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, Dog, CheckCircle, XCircle, AlertCircle, CreditCard, DollarSign, X, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Appointment } from "@shared/schema";
import { safeGoBack } from "@/lib/navigation";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MyAppointments() {
  const [, setLocation] = useLocation();
  const [payingAppointmentId, setPayingAppointmentId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const { toast } = useToast();

  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/user/appointments"],
  });

  const { data: groomingSettings } = useQuery<any[]>({
    queryKey: ["/api/grooming-settings"],
  });

  // Generate 15-minute time slots from grooming settings (same as booking page)
  const timeSlots = useMemo(() => {
    if (!groomingSettings) return [];
    const startTime = groomingSettings.find((s: any) => s.setting === 'start_time')?.value || '09:00';
    const endTime = groomingSettings.find((s: any) => s.setting === 'end_time')?.value || '13:30';
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const slots: string[] = [];
    const cur = new Date();
    cur.setHours(startHour, startMin, 0, 0);
    const end = new Date();
    end.setHours(endHour, endMin, 0, 0);
    while (cur <= end) {
      slots.push(cur.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
      cur.setMinutes(cur.getMinutes() + 15);
    }
    return slots;
  }, [groomingSettings]);

  // Min date for reschedule picker = tomorrow (YYYY-MM-DD)
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const groomingPaid = params.get("groomingPaid");
    const sessionId = params.get("session_id");
    if (groomingPaid && sessionId) {
      const appointmentId = parseInt(groomingPaid);
      window.history.replaceState({}, "", "/my-appointments");
      apiRequest("POST", `/api/appointments/${appointmentId}/confirm-payment`, { sessionId })
        .then(() => {
          toast({ title: "Payment Successful!", description: "Your grooming has been paid. Thank you!" });
          queryClient.invalidateQueries({ queryKey: ["/api/user/appointments"] });
        })
        .catch(() => {
          toast({ title: "Payment Confirmation", description: "Payment received — we're updating your record." });
          queryClient.invalidateQueries({ queryKey: ["/api/user/appointments"] });
        });
    }
  }, []);

  const payOnlineMutation = useMutation({
    mutationFn: async (appointmentId: number) => {
      const result = await apiRequest("POST", `/api/appointments/${appointmentId}/pay-online`, {});
      return result as { checkoutUrl: string; sessionId: string };
    },
    onSuccess: (data) => {
      setPayingAppointmentId(null);
      if (data?.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: () => {
      setPayingAppointmentId(null);
      toast({ title: "Payment Error", description: "Could not start payment. Please try again.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: number) =>
      apiRequest("PATCH", `/api/user/appointments/${appointmentId}/cancel`, {}),
    onSuccess: () => {
      setCancellingId(null);
      toast({ title: "Appointment Cancelled", description: "Your appointment has been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/user/appointments"] });
    },
    onError: () => {
      setCancellingId(null);
      toast({ title: "Error", description: "Could not cancel. Please call us at (318) 322-3023.", variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, appointmentDate, appointmentTime }: { id: number; appointmentDate: string; appointmentTime: string }) =>
      apiRequest("PATCH", `/api/user/appointments/${id}/reschedule`, { appointmentDate, appointmentTime }),
    onSuccess: () => {
      setReschedulingId(null);
      setRescheduleDate("");
      setRescheduleTime("");
      toast({ title: "Appointment Rescheduled", description: "Your new date and time are pending approval." });
      queryClient.invalidateQueries({ queryKey: ["/api/user/appointments"] });
    },
    onError: async (err: any) => {
      let msg = "Could not reschedule. Please try a different date or time.";
      try {
        const body = await err?.response?.json?.();
        if (body?.message) msg = body.message;
      } catch {}
      toast({ title: "Reschedule Failed", description: msg, variant: "destructive" });
    },
  });

  const getStatusIcon = (apt: Appointment) => {
    if (apt.status === "cancelled") return <XCircle className="w-5 h-5 text-red-500" />;
    if (apt.isApproved) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusBadge = (apt: Appointment) => {
    if (apt.status === "cancelled") return <Badge className="bg-red-500">Cancelled</Badge>;
    if (apt.status === "completed") return <Badge className="bg-gray-500">Completed</Badge>;
    if (apt.isApproved) return <Badge className="bg-green-500">Approved</Badge>;
    return <Badge className="bg-yellow-500">Pending Approval</Badge>;
  };

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const isPast = (apt: Appointment) => {
    const d = new Date(apt.appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  const getPetNames = (apt: any): string => {
    if (apt.pets && apt.pets.length > 0) {
      return apt.pets.map((p: any) => p.name || p.petName).filter(Boolean).join(", ");
    }
    return apt.petName || "Pet";
  };

  // Filter Sunday from the date picker (client-side hint, server enforces too)
  const handleDateChange = (value: string) => {
    if (!value) { setRescheduleDate(""); return; }
    const [y, m, d] = value.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    if (picked.getDay() === 0) {
      toast({ title: "No Sundays", description: "Grooming is not available on Sundays.", variant: "destructive" });
      setRescheduleDate("");
      return;
    }
    setRescheduleDate(value);
    setRescheduleTime("");
  };

  const openReschedule = (id: number) => {
    setCancellingId(null);
    setReschedulingId(id);
    setRescheduleDate("");
    setRescheduleTime("");
  };

  const upcoming = (appointments || []).filter(apt => !isPast(apt) && apt.status !== "cancelled");
  const past = (appointments || []).filter(apt => isPast(apt) || apt.status === "cancelled" || apt.status === "completed");

  // Group by phone — matches admin behaviour
  const [groupIndexes, setGroupIndexes] = useState<Record<string, number>>({});
  const groupByPhone = (list: any[]) => {
    const grouped: Record<string, any[]> = {};
    list.forEach(apt => {
      const key = apt.ownerPhoneNumber || '';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(apt);
    });
    Object.values(grouped).forEach(g => g.sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()));
    return grouped;
  };
  const cycleGroup = (phone: string, grouped: Record<string, any[]>) =>
    setGroupIndexes(prev => ({ ...prev, [phone]: ((prev[phone] || 0) + 1) % grouped[phone].length }));
  const currentInGroup = (phone: string, group: any[]) => group[groupIndexes[phone] || 0] || group[0];

  const groupedUpcoming = groupByPhone(upcoming);
  const groupedPast = groupByPhone(past);

  const AppointmentCard = ({ apt, dim = false }: { apt: any; dim?: boolean }) => {
    const canPayOnline = apt.readyForPayment && !apt.isPaid;
    const isPaidOnline = apt.isPaid && apt.paidOnline;
    const isPaidInStore = apt.isPaid && !apt.paidOnline;
    const canAct = !dim && apt.status !== "cancelled" && apt.status !== "completed";
    const isRescheduling = reschedulingId === apt.id;
    const isCancelling = cancellingId === apt.id;

    return (
      <Card className={`shadow-sm transition-shadow ${dim ? "opacity-75" : "hover:shadow-md"}`}>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start space-x-3">
              {getStatusIcon(apt)}
              <div>
                <h3 className="font-semibold text-gray-900">{getPetNames(apt)}</h3>
                <p className="text-sm text-gray-500">{apt.petType}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge(apt)}
              {isPaidOnline && <Badge className="bg-green-600 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Paid Online</Badge>}
              {isPaidInStore && <Badge className="bg-green-600 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="w-4 h-4 mr-2" />
              {formatDate(apt.appointmentDate)}
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="w-4 h-4 mr-2" />
              {apt.appointmentTime}
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Dog className="w-4 h-4 mr-2" />
              {apt.serviceType === "grooming" ? "Full Grooming"
                : apt.serviceType === "grooming-bath" ? "Bath Only"
                : apt.serviceType}
            </div>
          </div>

          {apt.specialNotes && (
            <div className="mt-3 p-2 bg-gray-50 rounded">
              <p className="text-xs text-gray-500">Special Notes:</p>
              <p className="text-sm text-gray-700">{apt.specialNotes}</p>
            </div>
          )}

          {!dim && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Price: <span className="font-semibold text-green-700">
                  {canPayOnline ? `$${parseFloat(apt.finalAmount).toFixed(2)}` : apt.price ? `$${apt.price}` : "TBD"}
                </span>
              </p>
              {!apt.isApproved && apt.status !== "cancelled" && (
                <p className="text-xs text-yellow-600">Awaiting approval</p>
              )}
            </div>
          )}

          {/* Pay Online */}
          {canPayOnline && (
            <div className="mt-3 pt-2 border-t">
              <p className="text-sm text-gray-700 font-medium flex items-center gap-1 mb-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                Grooming complete — pay online now
              </p>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => { setPayingAppointmentId(apt.id); payOnlineMutation.mutate(apt.id); }}
                disabled={payingAppointmentId === apt.id && payOnlineMutation.isPending}
              >
                {payingAppointmentId === apt.id && payOnlineMutation.isPending
                  ? <><span className="animate-spin mr-2">⏳</span>Opening payment...</>
                  : <><CreditCard className="w-4 h-4 mr-2" />Pay ${parseFloat(apt.finalAmount).toFixed(2)} Online</>}
              </Button>
            </div>
          )}

          {/* Reschedule panel */}
          {canAct && isRescheduling && (
            <div className="mt-3 pt-3 border-t space-y-3">
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                <RefreshCw className="w-4 h-4 text-brand-blue" />
                Select a new date &amp; time
              </p>

              {/* Date picker */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">New Date (no Sundays)</label>
                <input
                  type="date"
                  min={minDate}
                  value={rescheduleDate}
                  onChange={e => handleDateChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              {/* Time picker — only shown once a valid date is chosen */}
              {rescheduleDate && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">New Time</label>
                  {timeSlots.length > 0 ? (
                    <Select value={rescheduleTime} onValueChange={setRescheduleTime}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a time" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-gray-400">Loading times…</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-brand-blue hover:bg-blue-700 text-white text-sm"
                  disabled={!rescheduleDate || !rescheduleTime || rescheduleMutation.isPending}
                  onClick={() => rescheduleMutation.mutate({ id: apt.id, appointmentDate: rescheduleDate, appointmentTime: rescheduleTime })}
                >
                  {rescheduleMutation.isPending ? "Rescheduling…" : "Confirm Reschedule"}
                </Button>
                <Button
                  variant="outline"
                  className="text-sm"
                  onClick={() => { setReschedulingId(null); setRescheduleDate(""); setRescheduleTime(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Cancel confirmation */}
          {canAct && isCancelling && !isRescheduling && (
            <div className="mt-3 pt-2 border-t">
              <div className="flex gap-2 items-center">
                <p className="text-sm text-gray-600 flex-1">Cancel this appointment?</p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs"
                  onClick={() => cancelMutation.mutate(apt.id)}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Cancelling…" : "Yes, Cancel"}
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setCancellingId(null)}>
                  Keep
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons row */}
          {canAct && !isRescheduling && !isCancelling && (
            <div className="mt-3 pt-2 border-t flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-brand-blue text-brand-blue hover:bg-blue-50"
                onClick={() => openReschedule(apt.id)}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Reschedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => { setReschedulingId(null); setCancellingId(apt.id); }}
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={safeGoBack}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      <div className="bg-brand-blue text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center pl-12">
          <div>
            <h1 className="text-2xl font-extrabold" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>My Appointments</h1>
            <p className="text-sm font-semibold text-white" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.4)' }}>Manage your grooming appointments</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue" />
            <p className="text-gray-500 mt-2">Loading appointments…</p>
          </div>
        ) : !appointments || appointments.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Appointments Yet</h3>
              <p className="text-gray-500 mb-4">You haven't booked any grooming appointments.</p>
              <Button onClick={() => setLocation("/booking")} className="bg-brand-blue hover:bg-blue-600" data-testid="button-book-now">
                Book Appointment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {Object.keys(groupedUpcoming).length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-brand-blue" />
                  Upcoming Appointments
                </h2>
                <div className="space-y-3">
                  {Object.entries(groupedUpcoming).map(([phone, group]) => {
                    const apt = currentInGroup(phone, group);
                    const hasMultiple = group.length > 1;
                    return (
                      <div key={`${phone}-${apt.id}`}>
                        {hasMultiple && (
                          <div className="flex justify-end mb-1">
                            <Badge
                              variant="outline"
                              className="bg-purple-500 text-white border-purple-600 text-xs cursor-pointer hover:bg-purple-600"
                              onClick={() => cycleGroup(phone, groupedUpcoming)}
                            >
                              {(groupIndexes[phone] || 0) + 1} / {group.length}
                            </Badge>
                          </div>
                        )}
                        <AppointmentCard apt={apt} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {Object.keys(groupedPast).length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                  Past Appointments
                </h2>
                <div className="space-y-3">
                  {Object.entries(groupedPast).map(([phone, group]) => {
                    const apt = currentInGroup(phone, group);
                    const hasMultiple = group.length > 1;
                    return (
                      <div key={`${phone}-${apt.id}`}>
                        {hasMultiple && (
                          <div className="flex justify-end mb-1">
                            <Badge
                              variant="outline"
                              className="bg-purple-500 text-white border-purple-600 text-xs cursor-pointer hover:bg-purple-600"
                              onClick={() => cycleGroup(phone, groupedPast)}
                            >
                              {(groupIndexes[phone] || 0) + 1} / {group.length}
                            </Badge>
                          </div>
                        )}
                        <AppointmentCard apt={apt} dim />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
