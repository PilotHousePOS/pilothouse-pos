import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, Dog, CheckCircle, XCircle, AlertCircle, CreditCard, DollarSign } from "lucide-react";
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
  const [appointmentGroupIndexes, setAppointmentGroupIndexes] = useState<Record<string, number>>({});
  const [payingAppointmentId, setPayingAppointmentId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/user/appointments"],
  });

  // On mount, check if we're returning from a Stripe checkout (success URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const groomingPaid = params.get("groomingPaid");
    const sessionId = params.get("session_id");
    if (groomingPaid && sessionId) {
      const appointmentId = parseInt(groomingPaid);
      // Remove params from URL without reload
      window.history.replaceState({}, "", "/my-appointments");
      // Confirm the payment with the backend
      apiRequest("POST", `/api/appointments/${appointmentId}/confirm-payment`, { sessionId })
        .then(() => {
          toast({ title: "Payment Successful!", description: "Your grooming has been paid. Thank you!" });
          queryClient.invalidateQueries({ queryKey: ["/api/user/appointments"] });
        })
        .catch(() => {
          toast({ title: "Payment Confirmation", description: "Payment received — we're updating your record.", variant: "default" });
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
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: () => {
      setPayingAppointmentId(null);
      toast({ title: "Payment Error", description: "Could not start payment. Please try again.", variant: "destructive" });
    },
  });

  const getStatusIcon = (appointment: Appointment) => {
    if (appointment.status === "cancelled") {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    if (appointment.isApproved) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusBadge = (appointment: Appointment) => {
    if (appointment.status === "cancelled") {
      return <Badge className="bg-red-500">Cancelled</Badge>;
    }
    if (appointment.status === "completed") {
      return <Badge className="bg-gray-500">Completed</Badge>;
    }
    if (appointment.isApproved) {
      return <Badge className="bg-green-500">Approved</Badge>;
    }
    return <Badge className="bg-yellow-500">Pending Approval</Badge>;
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isPastAppointment = (appointment: Appointment) => {
    const appointmentDate = new Date(appointment.appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return appointmentDate < today;
  };

  const upcomingAppointments = appointments?.filter(apt => !isPastAppointment(apt) && apt.status !== "cancelled") || [];
  const pastAppointments = appointments?.filter(apt => isPastAppointment(apt) || apt.status === "cancelled" || apt.status === "completed") || [];

  const groupAppointmentsByPhone = (appointmentList: Appointment[]) => {
    const grouped: Record<string, Appointment[]> = {};
    appointmentList.forEach((appointment) => {
      const phone = appointment.ownerPhoneNumber || '';
      if (!grouped[phone]) {
        grouped[phone] = [];
      }
      grouped[phone].push(appointment);
    });
    Object.keys(grouped).forEach(phone => {
      grouped[phone].sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
    });
    return grouped;
  };

  const cycleAppointmentGroup = (phone: string, groupedAppts: Record<string, Appointment[]>) => {
    setAppointmentGroupIndexes(prev => {
      const currentIndex = prev[phone] || 0;
      const groupSize = groupedAppts[phone]?.length || 1;
      const nextIndex = (currentIndex + 1) % groupSize;
      return { ...prev, [phone]: nextIndex };
    });
  };

  const getCurrentAppointment = (phone: string, appointments: Appointment[]) => {
    const currentIndex = appointmentGroupIndexes[phone] || 0;
    return appointments[currentIndex] || appointments[0];
  };

  const groupedUpcomingAppointments = useMemo(() => groupAppointmentsByPhone(upcomingAppointments), [upcomingAppointments]);
  const groupedPastAppointments = useMemo(() => groupAppointmentsByPhone(pastAppointments), [pastAppointments]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Fixed Back Button */}
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

      {/* Header */}
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
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
            <p className="text-gray-500 mt-2">Loading appointments...</p>
          </div>
        ) : !appointments || appointments.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Appointments Yet</h3>
              <p className="text-gray-500 mb-4">You haven't booked any grooming appointments.</p>
              <Button
                onClick={() => setLocation("/booking")}
                className="bg-brand-blue hover:bg-blue-600"
                data-testid="button-book-now"
              >
                Book Appointment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Upcoming Appointments */}
            {Object.keys(groupedUpcomingAppointments).length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-brand-blue" />
                  Upcoming Appointments
                </h2>
                <div className="space-y-3">
                  {Object.entries(groupedUpcomingAppointments).map(([phone, phoneAppointments]) => {
                    const appointment = getCurrentAppointment(phone, phoneAppointments);
                    const hasMultiple = phoneAppointments.length > 1;
                    const canPayOnline = (appointment as any).readyForPayment && !appointment.isPaid;
                    const isPaidOnline = appointment.isPaid && (appointment as any).paidOnline;
                    const isPaidInStore = appointment.isPaid && !(appointment as any).paidOnline;

                    return (
                    <Card
                      key={`${phone}-${appointment.id}`}
                      className="shadow-sm hover:shadow-md transition-shadow"
                      data-testid={`card-appointment-${appointment.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start space-x-3">
                            {getStatusIcon(appointment)}
                            <div>
                              <h3 className="font-semibold text-gray-900">{appointment.petName}</h3>
                              <p className="text-sm text-gray-500">{appointment.petType}</p>
                              {hasMultiple && (
                                <Badge 
                                  variant="outline" 
                                  className="bg-purple-500 text-white border-purple-600 text-xs mt-1 cursor-pointer hover:bg-purple-600"
                                  onClick={() => cycleAppointmentGroup(phone, groupedUpcomingAppointments)}
                                >
                                  {appointmentGroupIndexes[phone] !== undefined ? appointmentGroupIndexes[phone] + 1 : 1} / {phoneAppointments.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {getStatusBadge(appointment)}
                            {isPaidOnline && (
                              <Badge className="bg-green-600 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Paid Online</Badge>
                            )}
                            {isPaidInStore && (
                              <Badge className="bg-green-600 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center text-sm text-gray-600">
                            <Calendar className="w-4 h-4 mr-2" />
                            {formatDate(appointment.appointmentDate)}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Clock className="w-4 h-4 mr-2" />
                            {appointment.appointmentTime}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Dog className="w-4 h-4 mr-2" />
                            {appointment.serviceType === "grooming" ? "Full Grooming" : appointment.serviceType}
                          </div>
                        </div>

                        {appointment.specialNotes && (
                          <div className="mt-3 p-2 bg-gray-50 rounded">
                            <p className="text-xs text-gray-500">Special Notes:</p>
                            <p className="text-sm text-gray-700">{appointment.specialNotes}</p>
                          </div>
                        )}

                        <div className="mt-3 pt-3 border-t flex items-center justify-between">
                          <p className="text-sm text-gray-500">
                            Price: <span className="font-semibold text-brand-green">
                              {canPayOnline
                                ? `$${parseFloat((appointment as any).finalAmount).toFixed(2)}`
                                : `$${appointment.price}`}
                            </span>
                          </p>
                          {!appointment.isApproved && appointment.status !== "cancelled" && (
                            <p className="text-xs text-yellow-600">Awaiting admin approval</p>
                          )}
                        </div>

                        {/* Pay Now button */}
                        {canPayOnline && (
                          <div className="mt-3 pt-2 border-t">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm text-gray-700 font-medium flex items-center gap-1">
                                <DollarSign className="w-4 h-4 text-green-600" />
                                Grooming complete — pay online now
                              </p>
                            </div>
                            <Button
                              className="w-full bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => {
                                setPayingAppointmentId(appointment.id);
                                payOnlineMutation.mutate(appointment.id);
                              }}
                              disabled={payingAppointmentId === appointment.id && payOnlineMutation.isPending}
                            >
                              {payingAppointmentId === appointment.id && payOnlineMutation.isPending ? (
                                <><span className="animate-spin mr-2">⏳</span>Opening payment...</>
                              ) : (
                                <><CreditCard className="w-4 h-4 mr-2" />Pay ${parseFloat((appointment as any).finalAmount).toFixed(2)} Online</>
                              )}
                            </Button>
                          </div>
                        )}
                        
                        {hasMultiple && (
                          <div className="mt-2 text-xs text-center text-purple-600 font-medium">
                            Click purple badge to cycle through {phoneAppointments.length} appointments
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              </div>
            )}

            {/* Past Appointments */}
            {Object.keys(groupedPastAppointments).length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                  Past Appointments
                </h2>
                <div className="space-y-3">
                  {Object.entries(groupedPastAppointments).map(([phone, phoneAppointments]) => {
                    const appointment = getCurrentAppointment(phone, phoneAppointments);
                    const hasMultiple = phoneAppointments.length > 1;
                    
                    return (
                    <Card
                      key={`${phone}-${appointment.id}`}
                      className="shadow-sm opacity-75"
                      data-testid={`card-past-appointment-${appointment.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-start space-x-3">
                            {getStatusIcon(appointment)}
                            <div>
                              <h3 className="font-semibold text-gray-700">{appointment.petName}</h3>
                              <p className="text-sm text-gray-500">{appointment.petType}</p>
                              {hasMultiple && (
                                <Badge 
                                  variant="outline" 
                                  className="bg-purple-500 text-white border-purple-600 text-xs mt-1 cursor-pointer hover:bg-purple-600"
                                  onClick={() => cycleAppointmentGroup(phone, groupedPastAppointments)}
                                >
                                  {appointmentGroupIndexes[phone] !== undefined ? appointmentGroupIndexes[phone] + 1 : 1} / {phoneAppointments.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {getStatusBadge(appointment)}
                            {appointment.isPaid && (
                              <Badge className="bg-green-600 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {(appointment as any).paidOnline ? 'Paid Online' : 'Paid'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center text-sm text-gray-600">
                            <Calendar className="w-4 h-4 mr-2" />
                            {formatDate(appointment.appointmentDate)}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Clock className="w-4 h-4 mr-2" />
                            {appointment.appointmentTime}
                          </div>
                        </div>
                        
                        {hasMultiple && (
                          <div className="mt-2 text-xs text-center text-purple-600 font-medium">
                            Click purple badge to cycle through {phoneAppointments.length} appointments
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
