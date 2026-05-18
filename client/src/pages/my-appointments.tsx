import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, Dog, CheckCircle, XCircle, AlertCircle, CreditCard, DollarSign, X } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@shared/schema";
import { safeGoBack } from "@/lib/navigation";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MyAppointments() {
  const [, setLocation] = useLocation();
  const [payingAppointmentId, setPayingAppointmentId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/user/appointments"],
  });

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
    mutationFn: async (appointmentId: number) => {
      return await apiRequest("PATCH", `/api/user/appointments/${appointmentId}/cancel`, {});
    },
    onSuccess: () => {
      setCancellingId(null);
      toast({ title: "Appointment Cancelled", description: "Your appointment has been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/user/appointments"] });
    },
    onError: () => {
      setCancellingId(null);
      toast({ title: "Error", description: "Could not cancel the appointment. Please call us at (318) 322-3023.", variant: "destructive" });
    },
  });

  const getStatusIcon = (appointment: Appointment) => {
    if (appointment.status === "cancelled") return <XCircle className="w-5 h-5 text-red-500" />;
    if (appointment.isApproved) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusBadge = (appointment: Appointment) => {
    if (appointment.status === "cancelled") return <Badge className="bg-red-500">Cancelled</Badge>;
    if (appointment.status === "completed") return <Badge className="bg-gray-500">Completed</Badge>;
    if (appointment.isApproved) return <Badge className="bg-green-500">Approved</Badge>;
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

  const upcoming = (appointments || []).filter(apt => !isPast(apt) && apt.status !== "cancelled");
  const past = (appointments || []).filter(apt => isPast(apt) || apt.status === "cancelled" || apt.status === "completed");

  const AppointmentCard = ({ apt, dim = false }: { apt: any; dim?: boolean }) => {
    const canPayOnline = apt.readyForPayment && !apt.isPaid;
    const isPaidOnline = apt.isPaid && apt.paidOnline;
    const isPaidInStore = apt.isPaid && !apt.paidOnline;
    const canCancel = !dim && apt.status !== "cancelled" && apt.status !== "completed";

    return (
      <Card className={`shadow-sm transition-shadow ${dim ? "opacity-75" : "hover:shadow-md"}`}>
        <CardContent className="p-4">
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
              {apt.serviceType === "grooming" ? "Full Grooming" : apt.serviceType === "grooming-bath" ? "Bath Only" : apt.serviceType}
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
                  {canPayOnline
                    ? `$${parseFloat(apt.finalAmount).toFixed(2)}`
                    : apt.price ? `$${apt.price}` : "TBD"}
                </span>
              </p>
              {!apt.isApproved && apt.status !== "cancelled" && (
                <p className="text-xs text-yellow-600">Awaiting approval</p>
              )}
            </div>
          )}

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

          {canCancel && (
            <div className="mt-3 pt-2 border-t">
              {cancellingId === apt.id ? (
                <div className="flex gap-2">
                  <p className="text-sm text-gray-600 flex-1">Cancel this appointment?</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-xs"
                    onClick={() => cancelMutation.mutate(apt.id)}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setCancellingId(null)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-red-300 text-red-600 hover:bg-red-50 w-full"
                  onClick={() => setCancellingId(apt.id)}
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel Appointment
                </Button>
              )}
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
            <p className="text-gray-500 mt-2">Loading appointments...</p>
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
            {upcoming.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-brand-blue" />
                  Upcoming Appointments
                </h2>
                <div className="space-y-3">
                  {upcoming.map(apt => <AppointmentCard key={apt.id} apt={apt} />)}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                  Past Appointments
                </h2>
                <div className="space-y-3">
                  {past.map(apt => <AppointmentCard key={apt.id} apt={apt} dim />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
