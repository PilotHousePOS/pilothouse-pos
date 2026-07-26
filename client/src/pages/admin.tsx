import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import InventoryAudit from "@/components/admin/InventoryAudit";
import PosScanTracker from "@/components/admin/PosScanTracker";
import PosReports from "@/components/admin/PosReports";
import BarcodeScanner from "@/components/barcode-scanner";
import { getProductImageUrl } from "@/lib/imageUrl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus,
  Minus,
  Edit,
  Trash2,
  User as UserIcon,
  Users,
  Calendar as CalendarIcon,
  ShoppingBag,
  PawPrint,
  Package,
  Upload,
  Download,
  X,
  Shield,
  ArrowLeft,
  Search,
  UserPlus,
  Mail,
  RefreshCw,
  Phone,
  Pencil,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  History,
  Database,
  FileText,
  Sparkles,
  Grid3X3,
  Loader2,
  Save,
  CheckCircle2,
  Home,
  Star,
  MessageSquare,
  Type,
  Image,
  Camera,
  BookOpen,
  Zap,
  CalendarX2,
  ClipboardPaste,
  Send,
  Clock,
  RotateCcw,
  Check,
  Settings,
  Gift,
  Tag,
  Wrench,
  CreditCard,
  ShoppingCart,
  Copy
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import AdminNotifications from "@/components/admin-notifications";
import EmailCenter from "@/components/admin/EmailCenter";
import WaitlistTab from "@/components/tabs/WaitlistTab";
import TasksTab from "@/components/tabs/TasksTab";
import AnnouncementsTab from "@/components/tabs/AnnouncementsTab";
import EstimatesTab from "@/components/tabs/EstimatesTab";
import InvoicingTab from "@/components/tabs/InvoicingTab";
import TimeClockTab from "@/components/tabs/TimeClockTab";
import IntakeFormsTab from "@/components/tabs/IntakeFormsTab";
import SMSBlastsTab from "@/components/tabs/SMSBlastsTab";
import MembershipsTab from "@/components/tabs/MembershipsTab";
import StaffTab from "@/components/tabs/StaffTab";
import HomepageTab from "@/components/tabs/HomepageTab";
import { safeGoBack } from "@/lib/navigation";
import { capitalizeWords } from "@/lib/stringUtils";
import { formatCategory } from "@/lib/formatCategory";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface DeleteConfirmation {
  isOpen: boolean;
  title: string;
  description: string;
  itemName: string;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmVariant?: 'destructive' | 'confirm';
}

function DeleteConfirmationDialog({ 
  confirmation, 
  onClose 
}: { 
  confirmation: DeleteConfirmation; 
  onClose: () => void;
}) {
  const isDestructive = confirmation.confirmVariant !== 'confirm';
  const confirmLabel = confirmation.confirmLabel ?? 'Yes, Delete Permanently';
  return (
    <AlertDialog open={confirmation.isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md" data-testid="delete-confirmation-dialog">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isDestructive ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
              <AlertTriangle className={`h-6 w-6 ${isDestructive ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`} />
            </div>
            <AlertDialogTitle className={`text-xl font-bold ${isDestructive ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {confirmation.title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base pt-2">
            {confirmation.description}
          </AlertDialogDescription>
          {confirmation.itemName && (
            <div className={`mt-3 p-3 bg-muted rounded-lg border-2 ${isDestructive ? 'border-red-200 dark:border-red-800' : 'border-blue-200 dark:border-blue-800'}`}>
              <p className="text-sm font-medium text-muted-foreground">Item to be deleted:</p>
              <p className="text-lg font-bold text-foreground mt-1">{confirmation.itemName}</p>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
          <AlertDialogCancel 
            onClick={onClose}
            className="flex-1 sm:flex-none"
            data-testid="delete-cancel-button"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              confirmation.onConfirm();
              onClose();
            }}
            className={`flex-1 sm:flex-none text-white ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            data-testid="delete-confirm-button"
          >
            {isDestructive && <Trash2 className="w-4 h-4 mr-2" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Helper function to parse date string as local date (not UTC)
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Phone Number Display Component
function PhoneNumberDisplay({ phoneNumber }: { phoneNumber: string }) {
  const digits = phoneNumber.replace(/\D/g, '');
  
  if (digits.length === 10) {
    const areaCode = digits.slice(0, 3);
    const middle = digits.slice(3, 6);
    const last = digits.slice(6, 10);
    
    return (
      <>
        {/* Inline display for larger screens */}
        <span className="hidden sm:inline">
          ({areaCode}) {middle}-{last}
        </span>
        {/* Stacked display for smaller screens */}
        <span className="sm:hidden flex flex-col text-xs leading-tight">
          <span>({areaCode})</span>
          <span>{middle}</span>
          <span>{last}</span>
        </span>
      </>
    );
  }
  
  // Fallback for non-standard phone numbers
  return <span className="break-all">{phoneNumber}</span>;
}

// Calendar component for confirmed appointments
function AppointmentCalendar({ appointments }: { appointments: any[] }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [pendingDoneId, setPendingDoneId] = useState<number | null>(null);
  const [pendingDonePrice, setPendingDonePrice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateAppointmentIsHereMutation = useMutation({
    mutationFn: async ({ id, isHere }: { id: number; isHere: boolean }) => {
      const result = await apiRequest("PATCH", `/api/appointments/${id}/is-here`, { isHere });
      return result.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: variables.isHere ? "Marked as arrived" : "Marked as not arrived" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update status", variant: "destructive" }),
  });

  const updateAppointmentGroomingCompletedMutation = useMutation({
    mutationFn: async ({ id, groomingCompleted }: { id: number; groomingCompleted: boolean }) => {
      const result = await apiRequest("PATCH", `/api/appointments/${id}/grooming-completed`, { groomingCompleted });
      return result.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: variables.groomingCompleted ? "Marked as done" : "Marked as not done" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update status", variant: "destructive" }),
  });

  const markReadyForPaymentMutation = useMutation({
    mutationFn: async ({ id, finalAmount, readyForPayment }: { id: number; finalAmount: string; readyForPayment: boolean }) => {
      return await apiRequest("PATCH", `/api/admin/appointments/${id}/ready-for-payment`, { finalAmount, readyForPayment });
    },
    onSuccess: async (_data, variables) => {
      toast({
        title: variables.readyForPayment ? "Ready for Payment" : "Payment Link Cleared",
        description: variables.readyForPayment
          ? `Customer can now pay $${parseFloat(variables.finalAmount).toFixed(2)} online`
          : "Online payment option removed",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Failed to update payment status.", variant: "destructive" });
    },
  });

  // Google Calendar integration removed - transition period complete
  const googleEvents: any[] = [];

  // Filter appointments for the selected date - include ALL statuses that count toward capacity
  // (everything except cancelled and rejected, to match the backend capacity check)
  const confirmedAppointments = appointments.filter((apt: any) => 
    apt.status !== 'cancelled' && apt.status !== 'rejected' && 
    parseLocalDate(apt.appointmentDate).toDateString() === selectedDate.toDateString()
  );
  
  // Calculate separate counts for bath vs full groom dogs (exclude cats)
  // IMPORTANT: "grooming-bath" contains "groom", so we must exclude bath from groom count
  const dogCounts = confirmedAppointments.reduce((counts: { bathDogs: number; fullGroomDogs: number }, apt: any) => {
    if (apt.pets && apt.pets.length > 0) {
      apt.pets.forEach((pet: any) => {
        // Determine petType - fallback to appointment level if pet level is missing
        const petType = (pet.petType || apt.petType || '').toLowerCase();
        
        // Only count dogs, exclude cats
        if (petType === 'dog') {
          const serviceType = (pet.serviceType || apt.serviceType || '').toLowerCase();
          
          // Use substring matching to handle variants (grooming-bath, bath, grooming-full, full groom, etc.)
          // Bath check comes first, and groom excludes bath to avoid double-counting
          if (serviceType.includes('bath')) {
            counts.bathDogs++;
          } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
            counts.fullGroomDogs++;
          }
        }
      });
    } else {
      // Legacy single-pet appointments - check if it's a dog
      const petType = (apt.petType || '').toLowerCase();
      if (petType === 'dog') {
        const serviceType = (apt.serviceType || 'grooming-bath').toLowerCase();
        
        // Bath check comes first, and groom excludes bath to avoid double-counting
        if (serviceType.includes('bath')) {
          counts.bathDogs++;
        } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
          counts.fullGroomDogs++;
        }
      }
    }
    return counts;
  }, { bathDogs: 0, fullGroomDogs: 0 });

  // Group appointments by time slot
  const timeSlots = [
    '7:00 AM', '7:15 AM', '7:30 AM', '7:45 AM',
    '8:00 AM', '8:15 AM', '8:30 AM', '8:45 AM',
    '9:00 AM', '9:15 AM', '9:30 AM', '9:45 AM',
    '10:00 AM', '10:15 AM', '10:30 AM', '10:45 AM',
    '11:00 AM', '11:15 AM', '11:30 AM', '11:45 AM',
    '12:00 PM', '12:15 PM', '12:30 PM', '12:45 PM',
    '1:00 PM', '1:15 PM', '1:30 PM', '1:45 PM',
    '2:00 PM', '2:15 PM', '2:30 PM', '2:45 PM',
    '3:00 PM', '3:15 PM', '3:30 PM', '3:45 PM',
    '4:00 PM', '4:15 PM', '4:30 PM', '4:45 PM',
    '5:00 PM'
  ];

  const normalizeTime = (timeStr: string): string => {
    // If already in 12-hour format, return as-is
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      return timeStr;
    }
    
    // Convert 24-hour format to 12-hour format
    const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const formattedMinutes = minutes ? `:${minutes.toString().padStart(2, '0')}` : ':00';
    return `${hour12}${formattedMinutes} ${period}`;
  };

  const getAppointmentsForTime = (time: string) => {
    return confirmedAppointments.filter((apt: any) => {
      const normalizedAptTime = normalizeTime(apt.appointmentTime);
      return normalizedAptTime === time;
    });
  };

  const getGoogleEventsForTime = (time: string) => {
    return googleEvents.filter((event: any) => {
      if (!event.start?.dateTime) return false;
      const eventStart = new Date(event.start.dateTime);
      const eventTimeStr = eventStart.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      return eventTimeStr === time;
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    setSelectedDate(newDate);
  };

  // Dynamically create time slots from actual appointments and events
  const allActualTimes = new Set<string>();
  
  // Add all appointment times
  confirmedAppointments.forEach((apt: any) => {
    const normalizedTime = normalizeTime(apt.appointmentTime);
    allActualTimes.add(normalizedTime);
  });
  
  // Add all Google Calendar event times
  googleEvents.forEach((event: any) => {
    if (event.start?.dateTime) {
      const eventStart = new Date(event.start.dateTime);
      const eventTimeStr = eventStart.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      allActualTimes.add(eventTimeStr);
    }
  });
  
  // Convert to array and sort chronologically
  const occupiedSlots = Array.from(allActualTimes).sort((a, b) => {
    const parseTime = (timeStr: string) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return 0;
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };
    return parseTime(a) - parseTime(b);
  });

  const totalAppointments = confirmedAppointments.length + googleEvents.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Daily Appointment Calendar
        </CardTitle>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
              ← Previous Day
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="text-lg font-semibold whitespace-nowrap">
                  {formatDate(selectedDate)}
                  <CalendarIcon className="w-4 h-4 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => changeDate(1)}>
              Next Day →
            </Button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSelectedDate(new Date())}
            className="shrink-0"
          >
            Today
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {totalAppointments === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-lg font-medium">No appointments scheduled</p>
            <p className="text-sm">This day is completely open</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-gray-600 mb-4">
              {dogCounts.fullGroomDogs} full groom, {dogCounts.bathDogs} bath ({confirmedAppointments.length} {confirmedAppointments.length === 1 ? 'appointment' : 'appointments'}) + {googleEvents.length} calendar {googleEvents.length === 1 ? 'event' : 'events'} for this day
            </div>
            
            {occupiedSlots.map((time) => {
              const appointmentsList = getAppointmentsForTime(time);
              const googleEventsList = getGoogleEventsForTime(time);
              
              return (
                <div key={time} className="flex items-start gap-4 p-3 border rounded-lg">
                  <div className="w-20 text-sm font-medium text-gray-700 pt-2">
                    {time}
                  </div>
                  <div className="flex-1 space-y-2">
                    {appointmentsList.map((appointment: any, idx: number) => {
                      // Use pets array if available, otherwise fall back to legacy single-pet fields
                      const pets = appointment.pets && appointment.pets.length > 0 
                        ? appointment.pets 
                        : [{
                            petName: appointment.petName,
                            petType: appointment.petType,
                            serviceType: appointment.serviceType,
                            specialNotes: appointment.specialNotes
                          }];
                      
                      return (
                        <div 
                          key={appointment.id || idx} 
                          className={`p-3 rounded border-l-4 ${
                            appointment.isHere 
                              ? 'bg-green-100 border-green-600 ring-2 ring-green-400' 
                              : 'bg-blue-50 border-blue-500'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-sm text-gray-600">
                                  Owner: {capitalizeWords(appointment.ownerFirstName)} {capitalizeWords(appointment.ownerLastName)}
                                </p>
                                {appointment.isHere && (
                                  <Badge variant="default" className="bg-green-600 text-white text-xs">
                                    ✓ HERE
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                Phone: {appointment.ownerPhoneNumber}
                              </p>
                              {appointment.groomerName && (
                                <p className="text-xs text-gray-600 mb-2">
                                  Groomer: {appointment.groomerName}
                                </p>
                              )}
                              
                              {/* Display all pets */}
                              <div className="space-y-2 mt-2">
                                {pets.map((pet: any, petIdx: number) => (
                                  <div 
                                    key={petIdx} 
                                    className={`p-2 rounded border ${
                                      appointment.isHere 
                                        ? 'bg-white border-green-300' 
                                        : 'bg-white border-blue-200'
                                    }`}
                                  >
                                    <h4 className="font-semibold text-gray-900">
                                      {capitalizeWords(pet.petName)} ({pet.petType})
                                    </h4>
                                    <p className="text-xs text-blue-600">
                                      Service: {formatServiceType(pet.serviceType)}
                                    </p>
                                    {parseAddOnLabels(pet.addOns).length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {parseAddOnLabels(pet.addOns).map((label) => (
                                          <span key={label} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                                            + {label}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {(pet.groomerName || appointment.groomerName) && (
                                      <p className="text-xs text-purple-600 mt-1">
                                        Groomer: {pet.groomerName || appointment.groomerName}
                                      </p>
                                    )}
                                    {pet.specialNotes && (
                                      <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
                                        Notes: {pet.specialNotes}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            {/* Right side - Badge, Here/Done toggles, Contact Notes */}
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <Badge variant="default" className="bg-green-600">
                                Grooming
                              </Badge>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5 px-2 py-1 border rounded bg-white">
                                  <Checkbox
                                    id={`cal-is-here-${appointment.id}`}
                                    checked={appointment.isHere || false}
                                    onCheckedChange={(checked) => {
                                      updateAppointmentIsHereMutation.mutate({ 
                                        id: appointment.id, 
                                        isHere: checked as boolean 
                                      });
                                    }}
                                  />
                                  <label 
                                    htmlFor={`cal-is-here-${appointment.id}`}
                                    className="text-xs font-medium cursor-pointer"
                                  >
                                    Here
                                  </label>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={`h-7 text-xs px-2 ${(appointment.readyForPayment || appointment.groomingCompleted) ? 'border-orange-300 text-orange-600 hover:bg-orange-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}
                                  disabled={markReadyForPaymentMutation.isPending || updateAppointmentGroomingCompletedMutation.isPending}
                                  onClick={() => {
                                    if (appointment.readyForPayment || appointment.groomingCompleted) {
                                      // Clear: unmark both done and ready-for-payment
                                      updateAppointmentGroomingCompletedMutation.mutate({ id: appointment.id, groomingCompleted: false });
                                      if (appointment.readyForPayment && appointment.price) {
                                        markReadyForPaymentMutation.mutate({ id: appointment.id, finalAmount: appointment.price, readyForPayment: false });
                                      }
                                    } else {
                                      setPendingDoneId(appointment.id);
                                      setPendingDonePrice(appointment.price || null);
                                    }
                                  }}
                                >
                                  {(appointment.readyForPayment || appointment.groomingCompleted) ? 'Clear' : 'Mark Ready'}
                                </Button>
                              </div>
                              {appointment.contactNotes && (
                                <div className="w-32 sm:w-40 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 border border-amber-200 dark:border-amber-800">
                                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">Notes</p>
                                  <p className="text-xs text-amber-700 dark:text-amber-400 break-words line-clamp-4">
                                    {appointment.contactNotes}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {googleEventsList.map((event: any, idx: number) => (
                      <div key={event.id || idx} className="bg-purple-50 p-3 rounded border-l-4 border-purple-500">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">
                              {event.summary || 'Untitled Event'}
                            </h4>
                            {event.description && (
                              <p className="text-sm text-gray-600 mt-1">
                                {event.description}
                              </p>
                            )}
                            {event.attendees && event.attendees.length > 0 && (
                              <p className="text-xs text-purple-600 mt-1">
                                Attendees: {event.attendees.slice(0, 2).map((a: any) => a.displayName || a.email).join(', ')}
                                {event.attendees.length > 2 && ` +${event.attendees.length - 2} more`}
                              </p>
                            )}
                            {event.linkedContacts && event.linkedContacts.length > 0 && (
                              <div className="mt-2 p-2 bg-white rounded border border-purple-200">
                                <p className="text-xs font-semibold text-purple-700 mb-1">Pet Info:</p>
                                {event.linkedContacts.map((contact: any, contactIdx: number) => (
                                  <div key={contactIdx} className="text-xs text-gray-700 ml-2">
                                    <span className="font-medium">{contact.name}:</span>
                                    {contact.animalType && (
                                      <span className="ml-2">
                                        🐾 <span className="capitalize">{contact.animalType.replace('_', ' ')}</span>
                                        {contact.breed && contact.animalType === 'dog' && (
                                          <span> - {contact.breed}</span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <Badge variant="default" className="bg-purple-600">
                            Calendar
                          </Badge>
                        </div>
                        {event.htmlLink && (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-600 hover:underline mt-2 inline-block"
                          >
                            View in Google Calendar
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AlertDialog open={pendingDoneId !== null} onOpenChange={(open) => { if (!open) { setPendingDoneId(null); setPendingDonePrice(null); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Has the customer been called?</AlertDialogTitle>
              <AlertDialogDescription>
                Before marking this appointment as done, please confirm you have called the customer to verify their information is accurate.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setPendingDoneId(null); setPendingDonePrice(null); }}>No</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingDoneId !== null) {
                    updateAppointmentGroomingCompletedMutation.mutate({ id: pendingDoneId, groomingCompleted: true });
                    if (pendingDonePrice) {
                      markReadyForPaymentMutation.mutate({ id: pendingDoneId, finalAmount: pendingDonePrice, readyForPayment: true });
                    }
                    setPendingDoneId(null);
                    setPendingDonePrice(null);
                  }
                }}
              >
                Yes, Mark Ready
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// Contacts Manager Component with Search and Event Creation
// Helper component to display appointment history for a contact
function ContactAppointmentHistory({ contactId, onViewFullHistory }: { contactId: number; onViewFullHistory?: () => void }) {
  // Fetch active appointments
  const { data: appointments = [], isLoading: isLoadingAppointments } = useQuery<any[]>({
    queryKey: ["/api/contacts", contactId, "appointments"],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contactId}/appointments`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch contact appointments');
      return response.json();
    },
    enabled: !!contactId,
  });

  // Also fetch archived history
  const { data: history = [], isLoading: isLoadingHistory } = useQuery<any[]>({
    queryKey: ["/api/contacts", contactId, "history"],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contactId}/history`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch contact history');
      return response.json();
    },
    enabled: !!contactId,
  });

  const isLoading = isLoadingAppointments || isLoadingHistory;

  // Combine active appointments and archived history, filter for completed and confirmed
  const allAppointments = [...appointments, ...history];
  // Remove duplicates by id
  const uniqueAppointments = allAppointments.filter((apt, index, self) => 
    index === self.findIndex(a => a.id === apt.id)
  );
  const completedAppointments = uniqueAppointments.filter(apt => 
    apt.status === 'confirmed' || apt.status === 'completed'
  );

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading appointment history...</div>;
  }

  if (completedAppointments.length === 0) {
    return <div className="text-sm text-gray-500">No grooming history found</div>;
  }

  // Helper function to format service type
  const formatService = (serviceType: string) => {
    if (!serviceType) return 'Grooming';
    if (serviceType.includes('bath')) return 'Bath';
    if (serviceType.includes('full') || serviceType.includes('grooming')) return 'Full Grooming';
    return serviceType;
  };

  return (
    <div 
      className={`space-y-2 ${onViewFullHistory ? 'cursor-pointer hover:bg-gray-50 rounded -m-1 p-1' : ''}`}
      onClick={(e) => {
        if (onViewFullHistory) {
          e.stopPropagation();
          onViewFullHistory();
        }
      }}
      data-testid="contact-history-preview"
    >
      <p className="text-sm font-medium text-gray-700">
        Recent Grooming History ({completedAppointments.length})
        {onViewFullHistory && <span className="text-blue-600 ml-1 text-xs">View All</span>}
      </p>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {completedAppointments.slice(0, 3).map((apt: any) => (
          <div key={apt.id} className="bg-gray-50 rounded p-2 text-xs" data-testid={`appointment-history-${apt.id}`}>
            <div>
              <div className="flex justify-between items-start">
                <p className="font-medium">{formatService(apt.serviceType || apt.service)}</p>
                {apt.price && (
                  <span className="text-green-700 font-semibold ml-2 whitespace-nowrap">${apt.price}</span>
                )}
              </div>
              {apt.addOnLabels && apt.addOnLabels.length > 0 && (
                <p className="text-purple-700 font-medium">+ {apt.addOnLabels.join(', ')}</p>
              )}
              {apt.pets && apt.pets.length > 0 ? (
                <div className="space-y-0.5">
                  {apt.pets.map((p: any, pi: number) => (
                    <p key={pi} className="text-gray-600">
                      {p.petName} ({p.petType}){apt.pets.length > 1 ? ` — ${p.serviceType || 'Grooming'}` : ''}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
              )}
              <p className="text-gray-500">{parseLocalDate(apt.appointmentDate).toLocaleDateString()}</p>
              {apt.groomerName && (
                <p className="text-blue-700 font-medium">Groomer: {apt.groomerName}</p>
              )}
              {apt.specialNotes && (
                <p className="text-gray-600 mt-1 italic break-words">{apt.specialNotes}</p>
              )}
            </div>
          </div>
        ))}
        {completedAppointments.length > 3 && (
          <p className="text-xs text-blue-600 text-center">+{completedAppointments.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

// Full History Dialog Component
function ContactFullHistoryDialog({ contactId, contactName, isOpen, onClose, isSuperiorManager }: { 
  contactId: number; 
  contactName: string;
  isOpen: boolean; 
  onClose: () => void;
  isSuperiorManager?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingHistory, setEditingHistory] = useState<any>(null);
  const [editForm, setEditForm] = useState<{ appointmentDate: string; appointmentTime: string; petName: string; petType: string; breed: string; serviceType: string; groomerName: string; status: string; notes: string }>({
    appointmentDate: '', appointmentTime: '', petName: '', petType: '', breed: '', serviceType: '', groomerName: '', status: '', notes: '',
  });

  // Fetch current appointments
  const { data: currentAppointments = [], isLoading: isLoadingCurrent, error: currentError } = useQuery<any[]>({
    queryKey: ["/api/contacts", contactId, "appointments"],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contactId}/appointments`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch current appointments');
      return response.json();
    },
    enabled: isOpen && !!contactId,
  });

  // Fetch historical appointments
  const { data: historicalAppointments = [], isLoading: isLoadingHistory, error: historyError } = useQuery<any[]>({
    queryKey: ["/api/contacts", contactId, "history"],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contactId}/history`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch appointment history');
      return response.json();
    },
    enabled: isOpen && !!contactId,
  });

  const updateHistoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/contacts/history/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "history"] });
      setEditingHistory(null);
      toast({ title: "Updated", description: "History record updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update history record", variant: "destructive" });
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/contacts/history/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "history"] });
      toast({ title: "Deleted", description: "History record removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete history record", variant: "destructive" });
    },
  });

  // Show error toast when errors occur (using useEffect to avoid repeated renders)
  React.useEffect(() => {
    if (currentError || historyError) {
      toast({
        title: "Error Loading Data",
        description: "Failed to fetch appointment data. Please try again.",
        variant: "destructive",
      });
    }
  }, [currentError, historyError, toast]);

  const isLoading = isLoadingCurrent || isLoadingHistory;
  
  // Filter current appointments for confirmed/completed
  const confirmedAppointments = currentAppointments.filter(apt => 
    apt.status === 'confirmed' || apt.status === 'completed'
  );

  // Helper function to format service type
  const formatService = (serviceType: string) => {
    if (!serviceType) return 'Grooming';
    if (serviceType.toLowerCase().includes('bath')) return 'Bath';
    if (serviceType.toLowerCase().includes('full') || serviceType.toLowerCase().includes('grooming')) return 'Full Grooming';
    return serviceType;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Full Grooming History - {contactName}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">Loading history...</div>
          </div>
        )}

        {!isLoading && (
          <div className="space-y-6">
            {/* Current Appointments Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                Current Appointments
                <Badge variant="default" className="bg-green-600">Active</Badge>
              </h3>
              {currentError ? (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  Failed to load current appointments. Please try again.
                </div>
              ) : confirmedAppointments.length === 0 ? (
                <p className="text-sm text-gray-500">No current appointments</p>
              ) : (
                <div className="space-y-2">
                  {confirmedAppointments.map((apt: any) => (
                    <div key={`current-${apt.id}`} className="bg-gray-50 rounded p-3 text-sm" data-testid={`current-appointment-${apt.id}`}>
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="font-semibold">{formatService(apt.serviceType || apt.service)}</p>
                          {apt.addOnLabels && apt.addOnLabels.length > 0 && (
                            <p className="text-purple-700 text-xs font-medium">+ {apt.addOnLabels.join(', ')}</p>
                          )}
                          {apt.price && (
                            <p className="text-green-700 font-semibold text-xs">${apt.price}</p>
                          )}
                          {apt.pets && apt.pets.length > 0 ? (
                            <div className="space-y-0.5">
                              {apt.pets.map((p: any, pi: number) => (
                                <p key={pi} className="text-gray-600">
                                  {p.petName} ({p.petType}){apt.pets.length > 1 ? ` — ${p.serviceType || 'Grooming'}` : ''}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
                          )}
                          <p className="text-gray-500 text-xs">
                            {parseLocalDate(apt.appointmentDate).toLocaleDateString()} at {apt.appointmentTime}
                          </p>
                          {apt.groomerName && (
                            <p className="text-gray-600 text-xs">Groomer: {apt.groomerName}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">{apt.status}</Badge>
                      </div>
                      {apt.specialNotes && (
                        <p className="text-gray-600 mt-2 italic text-xs">{apt.specialNotes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historical Appointments Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                Past Appointments (Archived)
                <Badge variant="secondary" className="bg-gray-400">Archived</Badge>
                {isSuperiorManager && (
                  <Badge className="bg-yellow-500 text-black text-xs">Superior Manager Edit Mode</Badge>
                )}
              </h3>
              {historyError ? (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  Failed to load appointment history. Please try again.
                </div>
              ) : historicalAppointments.length === 0 ? (
                <p className="text-sm text-gray-500">No archived appointments</p>
              ) : (
                <div className="space-y-2">
                  {historicalAppointments.map((apt: any) => (
                    <div key={`history-${apt.id}`} className="bg-gray-100 rounded p-3 text-sm opacity-80" data-testid={`history-item-${apt.id}`}>
                      {editingHistory?.id === apt.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-medium text-gray-600">Date</label>
                              <Input className="h-7 text-xs" value={editForm.appointmentDate} onChange={e => setEditForm(f => ({ ...f, appointmentDate: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Time</label>
                              <Input className="h-7 text-xs" value={editForm.appointmentTime} onChange={e => setEditForm(f => ({ ...f, appointmentTime: e.target.value }))} placeholder="e.g. 9:00 AM" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Pet Name</label>
                              <Input className="h-7 text-xs" value={editForm.petName} onChange={e => setEditForm(f => ({ ...f, petName: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Pet Type</label>
                              <Input className="h-7 text-xs" value={editForm.petType} onChange={e => setEditForm(f => ({ ...f, petType: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Service</label>
                              <Input className="h-7 text-xs" value={editForm.serviceType} onChange={e => setEditForm(f => ({ ...f, serviceType: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Groomer</label>
                              <Input className="h-7 text-xs" value={editForm.groomerName} onChange={e => setEditForm(f => ({ ...f, groomerName: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Status</label>
                              <Input className="h-7 text-xs" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Breed</label>
                              <Input className="h-7 text-xs" value={editForm.breed} onChange={e => setEditForm(f => ({ ...f, breed: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Notes</label>
                            <textarea className="w-full text-xs border rounded p-1 h-16 resize-none" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => updateHistoryMutation.mutate({ id: apt.id, data: editForm })} disabled={updateHistoryMutation.isPending}>
                              Save
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingHistory(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <p className="font-semibold text-gray-700">{formatService(apt.serviceType)}</p>
                              <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
                              <p className="text-gray-500 text-xs">
                                {parseLocalDate(apt.appointmentDate).toLocaleDateString()} at {apt.appointmentTime}
                              </p>
                              {apt.groomerName && (
                                <p className="text-gray-600 text-xs">Groomer: {apt.groomerName}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="outline" className="text-xs bg-gray-200">{apt.status}</Badge>
                              {isSuperiorManager && (
                                <div className="flex gap-1 mt-1">
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-yellow-400 text-yellow-700 hover:bg-yellow-50" onClick={() => {
                                    setEditingHistory(apt);
                                    setEditForm({
                                      appointmentDate: apt.appointmentDate || '',
                                      appointmentTime: apt.appointmentTime || '',
                                      petName: apt.petName || '',
                                      petType: apt.petType || '',
                                      breed: apt.breed || '',
                                      serviceType: apt.serviceType || '',
                                      groomerName: apt.groomerName || '',
                                      status: apt.status || '',
                                      notes: apt.notes || '',
                                    });
                                  }}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-red-400 text-red-600 hover:bg-red-50" onClick={() => {
                                    if (window.confirm('Delete this history record? This cannot be undone.')) {
                                      deleteHistoryMutation.mutate(apt.id);
                                    }
                                  }} disabled={deleteHistoryMutation.isPending}>
                                    Delete
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          {apt.notes && (
                            <p className="text-gray-600 mt-2 italic text-xs">{apt.notes}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactsManager() {
  const { user: authUser } = useAuth();
  const currentUserIsSuperiorManager = !!(authUser as any)?.isSuperiorManager;
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<{ id: number; name: string } | null>(null);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    petNames: [] as string[],
    notes: '',
    animalType: 'dog',
    breed: '',
  });
  const [petNamesInput, setPetNamesInput] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedContactId, setExpandedContactId] = useState<string | number | null>(null);
  const [historyDialogContact, setHistoryDialogContact] = useState<{ id: number; name: string } | null>(null);

  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const CONTACTS_PER_PAGE = 4;

  // Fetch ALL contacts from database (includes both manual and google_calendar synced contacts)
  const { data: allDatabaseContacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ["/api/contacts"],
    queryFn: async () => {
      const response = await fetch('/api/contacts', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
  });

  // Manual contact mutations
  const createContactMutation = useMutation({
    mutationFn: async (contactData: any) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
        },
        body: JSON.stringify(contactData),
      });
      const data = await res.json();
      if (!res.ok) {
        const err: any = new Error(data.message || "Failed to add contact");
        err.duplicate = data.duplicate ?? false;
        throw err;
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Contact Added",
        description: "Contact has been added successfully.",
      });
      setIsAddContactOpen(false);
      setContactFormData({ name: '', email: '', phoneNumber: '', petNames: [], notes: '', animalType: 'dog', breed: '' });
      setPetNamesInput('');
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (error: any) => {
      toast({
        title: error.duplicate ? "Duplicate Phone Number" : "Error",
        description: error.message || "Failed to add contact.",
        variant: "destructive",
      });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/contacts/${id}`, data);
    },
    onSuccess: async () => {
      toast({
        title: "Contact Updated",
        description: "Contact has been updated successfully.",
      });
      setEditingContact(null);
      setContactFormData({ name: '', email: '', phoneNumber: '', petNames: [], notes: '', animalType: 'dog', breed: '' });
      setPetNamesInput('');
      await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      await queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && 
        (query.queryKey.some(k => k === "appointments") || query.queryKey.some(k => k === "history"))
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update contact.",
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Contact Deleted",
        description: "Contact has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete contact.",
        variant: "destructive",
      });
    },
  });

  const syncContactsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/contacts/backfill-from-appointments");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      const { created = 0, updated = 0, skipped = 0 } = data || {};
      const total = created + updated;
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} new contact${created !== 1 ? 's' : ''} created`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (skipped > 0) parts.push(`${skipped} already up to date`);
      toast({
        title: total > 0 ? `Sync complete — ${total} contact${total !== 1 ? 's' : ''} affected` : "Sync complete — nothing to change",
        description: parts.length > 0 ? parts.join(', ') : "All contacts were already up to date.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error?.message || "An unexpected error occurred while syncing contacts.",
        variant: "destructive",
      });
    },
  });

  // Google Calendar sync removed - transition period complete

  // Map database contacts - all database contacts are editable (both manual and google_calendar sourced)
  const allContacts = allDatabaseContacts.map((c: any) => ({
    ...c,
    displayName: c.name,
    isManual: c.source === 'manual',
    isDatabaseContact: true, // All contacts from database are editable
  }));

  const filteredContacts = searchQuery.trim() === '' 
    ? [...allContacts].sort((a, b) => {
        const nameA = (a.displayName || a.name || '').toLowerCase();
        const nameB = (b.displayName || b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      })
    : [...allContacts]
        .filter(contact => {
          const query = searchQuery.toLowerCase();
          const name = (contact.displayName || contact.name || '').toLowerCase();
          const email = (contact.email || '').toLowerCase();
          const phone = (contact.phoneNumber || '').replace(/\D/g, '');
          const searchDigits = searchQuery.replace(/\D/g, '');
          
          const nameMatch = name.includes(query);
          const emailMatch = email.startsWith(query);
          const phoneMatch = searchDigits.length > 0 && phone.startsWith(searchDigits);
          
          // Search through pet names
          const petNames = contact.petNames || [];
          const petNameMatch = petNames.some((petName: string) => 
            petName.toLowerCase().includes(query)
          );
          
          return nameMatch || emailMatch || phoneMatch || petNameMatch;
        })
        .sort((a, b) => {
          const nameA = (a.displayName || a.name || '').toLowerCase();
          const nameB = (b.displayName || b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

  // Reset to page 0 when search changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery]);

  // Pagination logic
  const totalPages = Math.ceil(filteredContacts.length / CONTACTS_PER_PAGE);
  const startIndex = currentPage * CONTACTS_PER_PAGE;
  const endIndex = startIndex + CONTACTS_PER_PAGE;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);
  
  // Clamp page when filtered contacts list shrinks
  useEffect(() => {
    if (filteredContacts.length === 0) return;
    const totalPages = Math.ceil(filteredContacts.length / CONTACTS_PER_PAGE);
    if (totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [filteredContacts.length, currentPage]);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;
    
    if (distance > minSwipeDistance && currentPage < totalPages - 1) {
      // Swipe left - next page
      setCurrentPage(prev => prev + 1);
    }
    
    if (distance < -minSwipeDistance && currentPage > 0) {
      // Swipe right - previous page
      setCurrentPage(prev => prev - 1);
    }
    
    setTouchStart(0);
    setTouchEnd(0);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleAddContact = () => {
    const trimmedName = contactFormData.name.trim();
    const trimmedPhone = contactFormData.phoneNumber.trim();
    const trimmedEmail = contactFormData.email.trim();
    
    if (!trimmedName) {
      toast({
        title: "Validation Error",
        description: "Name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedPhone) {
      toast({
        title: "Validation Error",
        description: "Phone number is required.",
        variant: "destructive",
      });
      return;
    }
    // Email is optional - no validation needed
    createContactMutation.mutate({ 
      ...contactFormData, 
      name: trimmedName,
      phoneNumber: trimmedPhone,
      email: trimmedEmail 
    });
  };

  const handleEditContact = (contact: any) => {
    setEditingContact(contact);
    setContactFormData({
      name: contact.name || '',
      email: contact.email || '',
      phoneNumber: contact.phoneNumber || '',
      petNames: contact.petNames || [],
      notes: contact.notes || '',
      animalType: contact.animalType || '',
      breed: contact.breed || '',
    });
    setPetNamesInput((contact.petNames || []).join(', '));
  };

  const handleUpdateContact = () => {
    const trimmedName = contactFormData.name.trim();
    const trimmedPhone = contactFormData.phoneNumber.trim();
    const trimmedEmail = contactFormData.email.trim();
    
    if (!trimmedName) {
      toast({
        title: "Validation Error",
        description: "Name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedPhone) {
      toast({
        title: "Validation Error",
        description: "Phone number is required.",
        variant: "destructive",
      });
      return;
    }
    // Email is optional - no validation needed
    updateContactMutation.mutate({
      id: editingContact.id,
      data: { 
        ...contactFormData, 
        name: trimmedName,
        phoneNumber: trimmedPhone,
        email: trimmedEmail 
      },
    });
  };

  const handleDeleteContact = (id: number, name: string) => {
    setContactToDelete({ id, name });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Users className="w-5 h-5" />
              <span>Contact Management</span>
              <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Shared Across All Admins</Badge>
            </CardTitle>
            <CardDescription className="mt-2">
              All admin accounts can view and manage the same workspace contacts
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => syncContactsMutation.mutate()}
              disabled={syncContactsMutation.isPending}
              title="Create contacts from appointments that have been marked as completed"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncContactsMutation.isPending ? 'animate-spin' : ''}`} />
              {syncContactsMutation.isPending ? 'Syncing...' : 'Sync from Appointments'}
            </Button>
            <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-add-contact" className="w-full sm:w-auto" size="sm">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Contact</DialogTitle>
                  <DialogDescription>Add a new contact to your database.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="contact-name">Name *</Label>
                    <Input
                      id="contact-name"
                      data-testid="input-contact-name"
                      placeholder="John Doe"
                      value={contactFormData.name}
                      onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-phone">Phone Number *</Label>
                    <Input
                      id="contact-phone"
                      data-testid="input-contact-phone"
                      type="tel"
                      placeholder="555-123-4567 (comma separated)"
                      value={contactFormData.phoneNumber}
                      onChange={(e) => setContactFormData({ ...contactFormData, phoneNumber: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-pet-names">Pet Names</Label>
                    <Input
                      id="contact-pet-names"
                      data-testid="input-contact-pet-names"
                      type="text"
                      placeholder="Buddy, Max, Luna (comma separated)"
                      value={petNamesInput}
                      onChange={(e) => {
                        setPetNamesInput(e.target.value);
                      }}
                      onBlur={(e) => {
                        const names = e.target.value.split(',').map(n => n.trim()).filter(Boolean);
                        setContactFormData({ ...contactFormData, petNames: names });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      id="contact-email"
                      data-testid="input-contact-email"
                      type="email"
                      placeholder="john@example.com (optional)"
                      value={contactFormData.email}
                      onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-animal-type">Animal Type</Label>
                    <Select
                      value={contactFormData.animalType}
                      onValueChange={(value) => setContactFormData({ ...contactFormData, animalType: value, breed: value !== 'dog' ? '' : contactFormData.breed })}
                    >
                      <SelectTrigger id="contact-animal-type" data-testid="select-animal-type">
                        <SelectValue placeholder="Select animal type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dog">Dog</SelectItem>
                        <SelectItem value="cat">Cat</SelectItem>
                        <SelectItem value="bird">Bird</SelectItem>
                        <SelectItem value="reptile">Reptile</SelectItem>
                        <SelectItem value="small_mammal">Small Mammal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {contactFormData.animalType === 'dog' && (
                    <div>
                      <Label htmlFor="contact-breed">Dog Breed</Label>
                      <Input
                        id="contact-breed"
                        data-testid="input-dog-breed"
                        placeholder="e.g., Chihuahua, Poodle, Mixed"
                        value={contactFormData.breed}
                        onChange={(e) => setContactFormData({ ...contactFormData, breed: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="contact-notes">Notes</Label>
                    <Textarea
                      id="contact-notes"
                      data-testid="input-contact-notes"
                      placeholder="Optional notes about this contact"
                      value={contactFormData.notes}
                      onChange={(e) => setContactFormData({ ...contactFormData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <Button 
                    onClick={handleAddContact} 
                    className="w-full"
                    disabled={createContactMutation.isPending}
                    data-testid="button-submit-contact"
                  >
                    {createContactMutation.isPending ? 'Adding...' : 'Add Contact'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Contact</DialogTitle>
                  <DialogDescription>Update contact information.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-contact-name">Name *</Label>
                    <Input
                      id="edit-contact-name"
                      data-testid="input-edit-contact-name"
                      placeholder="John Doe"
                      value={contactFormData.name}
                      onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-contact-phone">Phone Number *</Label>
                    <Input
                      id="edit-contact-phone"
                      data-testid="input-edit-contact-phone"
                      type="tel"
                      placeholder="555-123-4567 (comma separated)"
                      value={contactFormData.phoneNumber}
                      onChange={(e) => setContactFormData({ ...contactFormData, phoneNumber: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-contact-pet-names">Pet Names</Label>
                    <Input
                      id="edit-contact-pet-names"
                      data-testid="input-edit-contact-pet-names"
                      type="text"
                      placeholder="Buddy, Max, Luna (comma separated)"
                      value={petNamesInput}
                      onChange={(e) => {
                        setPetNamesInput(e.target.value);
                      }}
                      onBlur={(e) => {
                        const names = e.target.value.split(',').map(n => n.trim()).filter(Boolean);
                        setContactFormData({ ...contactFormData, petNames: names });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-contact-email">Email</Label>
                    <Input
                      id="edit-contact-email"
                      data-testid="input-edit-contact-email"
                      type="email"
                      placeholder="john@example.com (optional)"
                      value={contactFormData.email}
                      onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-contact-animal-type">Animal Type</Label>
                    <Select
                      value={contactFormData.animalType}
                      onValueChange={(value) => setContactFormData({ ...contactFormData, animalType: value, breed: value !== 'dog' ? '' : contactFormData.breed })}
                    >
                      <SelectTrigger id="edit-contact-animal-type" data-testid="select-edit-animal-type">
                        <SelectValue placeholder="Select animal type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dog">Dog</SelectItem>
                        <SelectItem value="cat">Cat</SelectItem>
                        <SelectItem value="bird">Bird</SelectItem>
                        <SelectItem value="reptile">Reptile</SelectItem>
                        <SelectItem value="small_mammal">Small Mammal</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {contactFormData.animalType === 'dog' && (
                    <div>
                      <Label htmlFor="edit-contact-breed">Dog Breed</Label>
                      <Input
                        id="edit-contact-breed"
                        data-testid="input-edit-dog-breed"
                        placeholder="e.g., Chihuahua, Poodle, Mixed"
                        value={contactFormData.breed}
                        onChange={(e) => setContactFormData({ ...contactFormData, breed: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="edit-contact-notes">Notes</Label>
                    <Textarea
                      id="edit-contact-notes"
                      data-testid="input-edit-contact-notes"
                      placeholder="Optional notes about this contact"
                      value={contactFormData.notes}
                      onChange={(e) => setContactFormData({ ...contactFormData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <Button 
                    onClick={handleUpdateContact} 
                    className="w-full"
                    disabled={updateContactMutation.isPending}
                    data-testid="button-update-contact"
                  >
                    {updateContactMutation.isPending ? 'Updating...' : 'Update Contact'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
        </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search contacts by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
              data-testid="input-search-contacts"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                data-testid="button-clear-search-contacts"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {filteredContacts.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {searchQuery ? 'No contacts found matching your search' : 'No contacts found'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {loadingContacts ? 'Loading...' : 'Click "Add Contact" to create a new contact'}
            </p>
          </div>
        ) : (
          <>
            {/* Contact grid with swipe support */}
            <div 
              key={`contacts-${searchQuery}-${currentPage}`}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
                {paginatedContacts.map((contact: any, index: number) => {
              const isExpanded = expandedContactId === (contact.id || contact.resourceName || contact.email);
              // Create a unique key combining multiple fields to avoid duplicates
              const uniqueKey = contact.id 
                ? `db-${contact.id}` 
                : contact.resourceName 
                ? `gcal-${contact.resourceName}` 
                : `email-${contact.email}-${index}`;
              
              return (
                <div 
                  key={uniqueKey} 
                  className={`border rounded-lg p-4 transition-all cursor-pointer hover:bg-gray-50 min-w-0 ${isExpanded ? 'ring-2 ring-blue-400 md:col-span-2 xl:col-span-3' : ''}`}
                  onClick={() => {
                    // Toggle expand/collapse for contacts
                    setExpandedContactId(isExpanded ? null : (contact.id || contact.resourceName || contact.email));
                  }}
                  data-testid={`contact-card-${index}`}
                >
                  <div className="flex gap-3 min-w-0">
                    {/* Left side - Contact Info */}
                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                      {/* Name */}
                      <p className="font-semibold text-base break-words">
                        {contact.displayName || contact.name}
                      </p>
                      
                      {/* Phone Number */}
                      {contact.phoneNumber && (
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-base flex-shrink-0">📱</span>
                          <PhoneNumberDisplay phoneNumber={contact.phoneNumber} />
                        </div>
                      )}
                      
                      {/* Pet Names */}
                      {contact.petNames && contact.petNames.length > 0 && (
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-base flex-shrink-0">🐕</span>
                          <span className="break-words">
                            {contact.petNames.join(', ')}
                          </span>
                        </div>
                      )}
                      
                      {/* Animal Type/Breed */}
                      {contact.animalType && (
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="text-base flex-shrink-0">🐾</span>
                          <span className="capitalize break-words">
                            {contact.animalType.replace('_', ' ')}{contact.breed && contact.animalType === 'dog' ? ` - ${contact.breed}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Contact Notes — always visible when present */}
                      {contact.notes && (
                        <div className="flex items-start gap-2 mt-1">
                          <span className="text-base flex-shrink-0">📝</span>
                          <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-900 break-words flex-1">
                            {contact.notes}
                          </div>
                        </div>
                      )}
                    </div>
                    
                  </div>
                  
                  <div className="flex flex-col gap-2 min-w-0 mt-2">
                    
                    {/* Appointment History - visible when expanded */}
                    {contact.isDatabaseContact && isExpanded && contact.phoneNumber && (
                      <div className="pt-2 mt-1 border-t border-gray-200">
                        <ContactAppointmentHistory 
                          contactId={contact.id} 
                          onViewFullHistory={() => setHistoryDialogContact({ id: contact.id, name: contact.displayName || contact.name })}
                        />
                      </div>
                    )}
                    
                    {/* Action buttons - only visible when expanded */}
                    {contact.isDatabaseContact && isExpanded && (
                      <div className="flex flex-wrap gap-1 pt-2 mt-1 border-t border-gray-200">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditContact(contact);
                          }}
                          data-testid={`button-edit-contact-${index}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          <span className="text-xs">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryDialogContact({ id: contact.id, name: contact.displayName || contact.name });
                          }}
                          data-testid={`button-view-history-${index}`}
                        >
                          <History className="w-4 h-4 mr-1" />
                          <span className="text-xs">History</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteContact(contact.id, contact.displayName || contact.name || 'this contact');
                          }}
                          data-testid={`button-delete-contact-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    
                    {/* Selection indicator for Google Calendar contacts */}
                    {!contact.isDatabaseContact && isSelected && (
                      <Badge variant="default" className="bg-blue-600 text-xs self-start mt-1">
                        Selected
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (() => {
            const pageIndicators = getPageIndicators(currentPage, totalPages);
            return (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 0}
                  className="text-blue-600 hover:text-blue-800"
                  data-testid="button-previous-page"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    {pageIndicators.map((i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          i === currentPage ? 'bg-blue-600 w-6' : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                        aria-label={`Go to page ${i + 1}`}
                        data-testid={`page-indicator-${i}`}
                      />
                    ))}
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages - 1}
                  className="text-blue-600 hover:text-blue-800"
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            );
          })()}
        </>
        )}
        
        {/* Full History Dialog */}
        {historyDialogContact && (
          <ContactFullHistoryDialog
            contactId={historyDialogContact.id}
            contactName={historyDialogContact.name ?? ''}
            isOpen={Boolean(historyDialogContact)}
            onClose={() => setHistoryDialogContact(null)}
            isSuperiorManager={currentUserIsSuperiorManager}
          />
        )}

        {/* Delete Contact Confirmation */}
        <AlertDialog open={!!contactToDelete} onOpenChange={(open) => { if (!open) setContactToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contact</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{contactToDelete?.name}</strong>? This will permanently remove them and all their history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (contactToDelete) {
                    deleteContactMutation.mutate(contactToDelete.id);
                    setContactToDelete(null);
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// Order Details Card Component with Items
function OrderDetailsCard({ order, onStatusUpdate, onDelete, isHighlighted }: { order: any; onStatusUpdate: (status: string) => void; onDelete?: (orderId: number) => void; isHighlighted?: boolean }) {
  const [showItems, setShowItems] = useState(false);
  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["/api/orders", order.id],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${order.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch order details');
      return response.json();
    },
    enabled: showItems,
  });

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete Order #${order.id}? This action cannot be undone.`)) {
      onDelete?.(order.id);
    }
  };

  return (
    <div className={`border rounded-lg ${
      isHighlighted 
        ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
        : 'border bg-white'
    }`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex-1">
          <h3 className="font-semibold">Order #{order.id}</h3>
          <div className="flex items-center mt-1 text-sm text-gray-600">
            <CalendarIcon className="w-4 h-4 mr-1" />
            {new Date(order.orderDate || order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          <p className="text-sm text-gray-600 mt-1">Total: ${order.totalAmount}</p>
          <Button
            variant="link"
            size="sm"
            className="px-0 h-auto mt-1 text-brand-blue"
            onClick={() => setShowItems(!showItems)}
          >
            {showItems ? 'Hide' : 'View'} Items
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={order.status}
            onValueChange={onStatusUpdate}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              data-testid={`button-delete-order-${order.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      {showItems && (
        <div className="border-t p-4 bg-gray-50">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading items...</p>
          ) : orderDetails?.items && orderDetails.items.length > 0 ? (
            <div className="space-y-2">
              {orderDetails.customerName && (
                <div className="mb-3 pb-2 border-b">
                  <p className="text-sm font-semibold text-gray-700">
                    Customer: <span className="text-brand-blue">{orderDetails.customerName}</span>
                  </p>
                </div>
              )}
              <h4 className="font-semibold text-sm mb-2">Order Items:</h4>
              {orderDetails.items.map((item: any, index: number) => (
                <div key={item.id || index} className="flex items-center justify-between p-2 bg-white rounded">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {item.itemName || (item.supplyId ? `Supply #${item.supplyId}` : `Pet #${item.petId}`)}
                    </p>
                    <p className="text-xs text-gray-500">Quantity: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold">${item.price}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No items found</p>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to calculate which page indicators to display (max 5)
function getPageIndicators(currentPage: number, totalPages: number): number[] {
  const MAX_INDICATORS = 5;
  
  if (totalPages <= MAX_INDICATORS) {
    // Show all pages if total is 5 or less
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  
  // Calculate the range to show
  let startPage = Math.max(0, currentPage - Math.floor(MAX_INDICATORS / 2));
  let endPage = startPage + MAX_INDICATORS;
  
  // Adjust if we're near the end
  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(0, endPage - MAX_INDICATORS);
  }
  
  return Array.from({ length: endPage - startPage }, (_, i) => startPage + i);
}

// Helper function to format service type display
function formatServiceType(serviceType: string): string {
  if (!serviceType) return '';
  
  // Handle various formats
  const normalized = serviceType.toLowerCase();
  
  if (normalized.includes('bath') && !normalized.includes('full')) {
    return 'Bath';
  } else if (normalized.includes('full') || normalized.includes('grooming')) {
    return 'Full Grooming';
  }
  
  // Default: return as-is for any unknown formats
  return serviceType;
}

// Add-on label lookup (kept in sync with booking.tsx ADD_ONS and server ADD_ON_LABELS)
const ADD_ON_LABELS_CLIENT: Record<string, string> = {
  'nail-grind': 'Nail Grind',
  'teeth-brushing': 'Brush Teeth',
  'furminator': 'Furminator (size dep.)',
  'scent-package': 'Scent Package',
};

/** Parse a pet's comma-separated addOns string into display labels */
function parseAddOnLabels(addOns: string | null | undefined): string[] {
  if (!addOns) return [];
  return addOns.split(',').filter(Boolean).map((id) => ADD_ON_LABELS_CLIENT[id.trim()] || id.trim());
}

/** Collect unique add-on labels across all pets in an appointment */
function getAppointmentAddOnLabels(appointment: any): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pets: any[] = appointment.pets && appointment.pets.length > 0
    ? appointment.pets
    : (appointment.addOns ? [{ addOns: appointment.addOns }] : []);
  for (const pet of pets) {
    for (const label of parseAddOnLabels(pet.addOns)) {
      if (!seen.has(label)) { seen.add(label); out.push(label); }
    }
  }
  return out;
}

// Helper function to get combined service type label for multi-pet appointments
function getCombinedServiceLabel(appointment: any): string {
  // If no pets array or only one pet, use standard formatting
  if (!appointment.pets || appointment.pets.length <= 1) {
    return formatServiceType(appointment.serviceType || appointment.service);
  }
  
  // Get unique service types from all pets
  const serviceTypes = new Set(
    appointment.pets.map((pet: any) => {
      const normalized = (pet.serviceType || '').toLowerCase();
      if (normalized.includes('bath') && !normalized.includes('full')) {
        return 'bath';
      } else if (normalized.includes('full') || normalized.includes('grooming')) {
        return 'full';
      }
      return normalized;
    })
  );
  
  // If all pets have the same service type, return it
  if (serviceTypes.size === 1) {
    const serviceType = Array.from(serviceTypes)[0];
    return serviceType === 'bath' ? 'Bath' : 'Full Grooming';
  }
  
  // Multiple different service types - combine them
  const hasBath = serviceTypes.has('bath');
  const hasFull = serviceTypes.has('full');
  
  if (hasFull && hasBath) {
    return 'Full Grooming/Bath';
  }
  
  // Fallback to standard formatting if we can't determine
  return formatServiceType(appointment.serviceType || appointment.service);
}

// Helper function to normalize service type to canonical values
function normalizeServiceType(serviceType: string | undefined | null): string {
  if (!serviceType) return 'grooming-full'; // Default to full grooming
  
  const normalized = serviceType.toLowerCase().trim().replace(/\s+/g, '-');
  
  // First, return if already canonical
  if (normalized === 'grooming-bath') return 'grooming-bath';
  if (normalized === 'grooming-full') return 'grooming-full';
  
  // Explicit mapping table for known legacy values
  const legacyMapping: Record<string, string> = {
    'bath': 'grooming-bath',
    'bath-only': 'grooming-bath',
    'grooming-bath': 'grooming-bath',
    'full-groom': 'grooming-full',
    'full-grooming': 'grooming-full',
    'full_groom': 'grooming-full',
    'grooming-full': 'grooming-full',
    'grooming': 'grooming-full',
    'groom': 'grooming-full',
  };
  
  // Check explicit mapping
  if (legacyMapping[normalized]) {
    return legacyMapping[normalized];
  }
  
  // Heuristic fallback only if no exact match
  if (normalized.includes('bath')) {
    return 'grooming-bath';
  }
  
  // Default to full grooming for any unknown values
  return 'grooming-full';
}


// Product Image Upload Zone - Supports drag & drop, paste, and file browse
function ScheduleManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<string[]>(['A', 'B']);
  const [scheduleData, setScheduleData] = useState<Record<string, any[]>>({ A: [], B: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [addEmpOpen, setAddEmpOpen] = useState<string | null>(null);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [payrollData, setPayrollData] = useState<any>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, string>>({});
  // sectionNames maps section key → display label (editable, persisted in enabledFeatures)
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({ A: 'Group A', B: 'Group B' });
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);

  const { data: tenantInfo } = useQuery<{ enabledFeatures?: any }>({ queryKey: ['/api/tenants/current'] });
  const { data: employeeList = [] } = useQuery<any[]>({ queryKey: ['/api/admin/employees'] });
  const { data: existingOverrides = [] } = useQuery<any[]>({ queryKey: ['/api/admin/schedule-overrides'] });

  // Sync section names from saved tenant settings when they load
  useEffect(() => {
    const saved = (tenantInfo?.enabledFeatures as any)?.scheduleGroupNames;
    if (saved && typeof saved === 'object') setSectionNames(prev => ({ ...prev, ...saved }));
  }, [tenantInfo]);

  const payPeriodStartDay: number = (tenantInfo?.enabledFeatures as any)?.payPeriodStartDay ?? 3;
  const ALL_DAYS_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS = Array.from({ length: 7 }, (_, i) => ALL_DAYS_ORDER[(payPeriodStartDay + i) % 7]);

  const getDatesForSection = (section: string) => {
    const now = new Date();
    const currentDay = now.getDay();
    const daysToStart = (currentDay - payPeriodStartDay + 7) % 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToStart);
    weekStart.setHours(0, 0, 0, 0);
    const sectionIndex = sections.indexOf(section);
    const sectionStart = new Date(weekStart);
    sectionStart.setDate(weekStart.getDate() + sectionIndex * 7);
    return DAYS.map((_, i) => {
      const d = new Date(sectionStart);
      d.setDate(sectionStart.getDate() + i);
      return d;
    });
  };

  const toIso = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  };

  const scheduleQuery = useQuery({ queryKey: ['/api/admin/schedule'] });

  useEffect(() => {
    if (!scheduleQuery.data) return;
    const entries = scheduleQuery.data as any[];
    const existingSections = Array.from(new Set(entries.map((e: any) => e.section))).filter(Boolean).sort() as string[];
    if (existingSections.length > 0) setSections(existingSections);
    const usedSections = existingSections.length > 0 ? existingSections : sections;
    const organized: Record<string, any[]> = {};
    usedSections.forEach(s => { organized[s] = []; });
    usedSections.forEach(section => {
      const sectionEntries = entries.filter((e: any) => e.section === section);
      const empNames = Array.from(new Set(sectionEntries.map((e: any) => e.employeeName))) as string[];
      organized[section] = empNames.map((empName, idx) => {
        const empEntries = sectionEntries.filter((e: any) => e.employeeName === empName);
        const schedule: Record<string, string> = {};
        DAYS.forEach(day => {
          const entry = empEntries.find((e: any) => e.dayOfWeek === day);
          schedule[day] = entry?.timeSlot || 'OFF';
        });
        return { employeeName: empName, displayOrder: idx, ...schedule };
      });
    });
    setScheduleData(organized);
  }, [scheduleQuery.data]);

  const getEffectiveSlot = (empName: string, day: string, dateIso: string, templateValue: string) => {
    const pKey = `${empName}:${dateIso}`;
    if (pendingOverrides[pKey] !== undefined) return { value: pendingOverrides[pKey], isOverride: true };
    const saved = (existingOverrides as any[]).find(o => o.employeeName === empName && o.specificDate === dateIso);
    if (saved) return { value: saved.timeSlot, isOverride: true };
    return { value: templateValue, isOverride: false };
  };

  const handleCellChange = (empName: string, dateIso: string, value: string) => {
    setPendingOverrides(prev => ({ ...prev, [`${empName}:${dateIso}`]: value }));
  };

  const handleEmployeeNameChange = (section: string, idx: number, newName: string) => {
    setScheduleData(prev => ({ ...prev, [section]: prev[section].map((e, i) => i === idx ? { ...e, employeeName: newName } : e) }));
  };

  const addEmployeeFromPicker = (section: string, emp: any) => {
    const defaultDays: string[] = emp.defaultWorkDays ?? [];
    const daySlots: Record<string, string> = emp.defaultDaySlots ?? {};
    const fallbackSlot: string = emp.defaultTimeSlot ?? '9-5';
    const newEmp: any = { employeeName: `${emp.firstName} ${emp.lastName}`, displayOrder: (scheduleData[section]||[]).length };
    DAYS.forEach(day => { newEmp[day] = defaultDays.includes(day) ? (daySlots[day] || fallbackSlot) : 'OFF'; });
    setScheduleData(prev => ({ ...prev, [section]: [...(prev[section]||[]), newEmp] }));
    setAddEmpOpen(null);
  };

  const addEmployeeManual = (section: string) => {
    const newEmp: any = { employeeName: 'New Employee', displayOrder: (scheduleData[section]||[]).length };
    DAYS.forEach(day => { newEmp[day] = 'OFF'; });
    setScheduleData(prev => ({ ...prev, [section]: [...(prev[section]||[]), newEmp] }));
    setAddEmpOpen(null);
  };

  const removeEmployee = (section: string, idx: number) => {
    setScheduleData(prev => ({ ...prev, [section]: prev[section].filter((_, i) => i !== idx) }));
  };

  const addSection = () => {
    const letter = String.fromCharCode(65 + sections.length);
    setSections(prev => [...prev, letter]);
    setScheduleData(prev => ({ ...prev, [letter]: [] }));
    setSectionNames(prev => ({ ...prev, [letter]: `Group ${letter}` }));
  };

  const removeSection = (s: string) => {
    if (sections.length <= 1) { toast({ title: 'Cannot remove last section', variant: 'destructive' }); return; }
    setSections(prev => prev.filter(x => x !== s));
    setScheduleData(prev => { const nd = { ...prev }; delete nd[s]; return nd; });
    setSectionNames(prev => { const nd = { ...prev }; delete nd[s]; return nd; });
  };

  const renameSectionKey = (key: string, newName: string) => {
    const trimmed = newName.trim() || `Group ${key}`;
    setSectionNames(prev => ({ ...prev, [key]: trimmed }));
    setEditingSectionKey(null);
  };

  const saveSchedule = async () => {
    setIsSaving(true);
    try {
      const entries: any[] = [];
      sections.forEach(section => {
        (scheduleData[section]||[]).forEach((emp, idx) => {
          DAYS.forEach(day => { entries.push({ section, employeeName: emp.employeeName, dayOfWeek: day, timeSlot: emp[day]||'OFF', displayOrder: idx }); });
        });
      });
      await apiRequest('POST', '/api/admin/schedule/batch', { entries });
      await Promise.all(Object.entries(pendingOverrides).map(([key, timeSlot]) => {
        const [empName, dateIso] = key.split(':');
        return apiRequest('POST', '/api/admin/schedule-overrides', { employeeName: empName, specificDate: dateIso, timeSlot });
      }));
      // Persist section display names alongside schedule
      const currentFeatures = (tenantInfo?.enabledFeatures as any) ?? {};
      await apiRequest('PUT', '/api/admin/settings/features', { ...currentFeatures, scheduleGroupNames: sectionNames });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/schedule'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/schedule-overrides'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/tenants/current'] });
      setPendingOverrides({});
      toast({ title: 'Schedule saved' });
    } catch { toast({ title: 'Failed to save schedule', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const loadPayroll = async () => {
    setPayrollOpen(true);
    setPayrollLoading(true);
    try {
      const now = new Date();
      const daysToStart = (now.getDay() - payPeriodStartDay + 7) % 7;
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - daysToStart);
      const startIso = toIso(weekStart);
      const data = await (await apiRequest('GET', `/api/admin/payroll/report?startDate=${startIso}`)).json();
      setPayrollData(data);
    } catch { toast({ title: 'Failed to load payroll report', variant: 'destructive' }); }
    finally { setPayrollLoading(false); }
  };

  const exportCsv = () => {
    if (!payrollData) return;
    const { weekDates, rows } = payrollData;
    const hdrs = ['Employee', ...weekDates.map((d: any) => `${d.dayName} ${d.iso}`), 'Total Hours'];
    const csvRows = rows.map((r: any) => [r.employeeName, ...weekDates.map((d: any) => r.days[d.iso]?.timeSlot ?? ''), `${r.totalHours.toFixed(1)}${r.hasUnknown?'+':''}`]);
    const csv = [hdrs, ...csvRows].map(r => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `payroll-${payrollData.startDate}.csv`; a.click();
  };

  const payPeriodLabel = `${DAYS[0].slice(0,3)} – ${DAYS[6].slice(0,3)}`;
  const hasOverrides = (existingOverrides as any[]).length > 0 || Object.keys(pendingOverrides).length > 0;

  if (scheduleQuery.isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" />Employee Schedule</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={loadPayroll} data-testid="button-payroll-report">
                <FileText className="w-4 h-4 mr-2" />Payroll Report
              </Button>
              <Button onClick={saveSchedule} disabled={isSaving} className="bg-green-600 hover:bg-green-700" data-testid="button-save-schedule">
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Schedule</>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex items-center gap-2 pb-2 border-b flex-wrap">
            <span className="text-sm text-gray-600">Manage Sections:</span>
            <Button size="sm" variant="outline" onClick={addSection} data-testid="button-add-section"><Plus className="w-3 h-3 mr-1" />Add Section</Button>
            <span className="text-xs text-gray-500">(Pay period: {payPeriodLabel})</span>
            {hasOverrides && <span className="text-xs text-amber-600 ml-auto">⚠ Amber cells = date-specific overrides (revert to weekly template after their date)</span>}
          </div>

          {sections.map(section => {
            const dates = getDatesForSection(section);
            return (
              <div key={section} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {editingSectionKey === section ? (
                      <input
                        autoFocus
                        defaultValue={sectionNames[section] ?? `Group ${section}`}
                        onBlur={e => renameSectionKey(section, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingSectionKey(null); }}
                        className="text-lg font-bold bg-green-50 border border-green-400 px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500 min-w-[120px]"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingSectionKey(section)}
                        title="Click to rename"
                        className="text-lg font-bold text-gray-900 bg-green-200 hover:bg-green-300 px-3 py-1 rounded flex items-center gap-1.5 transition-colors"
                      >
                        {sectionNames[section] ?? `Group ${section}`}
                        <Pencil className="w-3 h-3 opacity-50" />
                      </button>
                    )}
                    {sections.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeSection(section)} className="text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`button-remove-section-${section}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setAddEmpOpen(section)} data-testid={`button-add-employee-${section}`}>
                    <Plus className="w-3 h-3 mr-1" />Add Employee
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-green-100">
                        <th className="border border-gray-300 px-2 py-2 text-left text-sm font-semibold min-w-[120px]">Employee</th>
                        {DAYS.map((day, i) => (
                          <th key={day} className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold min-w-[100px]">
                            {day.slice(0,3)} {dates[i].getMonth()+1}/{dates[i].getDate()}
                          </th>
                        ))}
                        <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold w-[80px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scheduleData[section]||[]).map((emp, empIdx) => (
                        <tr key={empIdx} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-2 py-1">
                            <input type="text" value={emp.employeeName} onChange={e => handleEmployeeNameChange(section, empIdx, e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                              data-testid={`input-employee-name-${section}-${empIdx}`} />
                          </td>
                          {DAYS.map((day, dayIdx) => {
                            const dateIso = toIso(dates[dayIdx]);
                            const { value, isOverride } = getEffectiveSlot(emp.employeeName, day, dateIso, emp[day]||'OFF');
                            return (
                              <td key={day} className="border border-gray-300 px-1 py-1">
                                <input type="text" value={value}
                                  onChange={e => handleCellChange(emp.employeeName, dateIso, e.target.value)}
                                  title={isOverride ? 'Date-specific override — reverts to weekly template after this date' : 'Weekly template'}
                                  className={`w-full px-2 py-1 text-sm text-center border rounded focus:outline-none focus:ring-2 focus:ring-green-500 ${isOverride ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
                                  placeholder="OFF" data-testid={`input-schedule-${section}-${empIdx}-${day}`} />
                              </td>
                            );
                          })}
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            <Button size="sm" variant="destructive" onClick={() => removeEmployee(section, empIdx)} data-testid={`button-remove-employee-${section}-${empIdx}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {(scheduleData[section]||[]).length === 0 && (
                        <tr><td colSpan={DAYS.length+2} className="border border-gray-300 px-4 py-8 text-center text-gray-500">
                          No employees in this section. Click "Add Employee" to get started.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Add Employee Dialog */}
      <Dialog open={!!addEmpOpen} onOpenChange={v => !v && setAddEmpOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Employee to Schedule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {(employeeList as any[]).length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">Pick a staff account to auto-fill their default schedule:</p>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {(employeeList as any[]).map((emp: any) => (
                    <button key={emp.id} className="w-full text-left px-3 py-2 rounded border hover:bg-muted transition-colors"
                      onClick={() => addEmpOpen && addEmployeeFromPicker(addEmpOpen, emp)}>
                      <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        {emp.defaultWorkDays?.length ? emp.defaultWorkDays.map((d: string) => `${d.slice(0,3)} ${(emp.defaultDaySlots?.[d] || emp.defaultTimeSlot || '?')}`).join(' · ') : 'No default schedule set'}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div></div>
              </>
            )}
            <Button variant="secondary" className="w-full" onClick={() => addEmpOpen && addEmployeeManual(addEmpOpen)}>
              Enter name manually
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payroll Report Dialog */}
      <Dialog open={payrollOpen} onOpenChange={setPayrollOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Payroll Report — Current Pay Period ({payPeriodLabel})</DialogTitle>
            <DialogDescription>Hours per employee for this pay period. Amber = date-specific override.</DialogDescription>
          </DialogHeader>
          {payrollLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : payrollData ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-sm">
                  <thead>
                    <tr className="bg-green-100">
                      <th className="border border-gray-300 px-2 py-2 text-left">Employee</th>
                      {payrollData.weekDates.map((d: any) => (
                        <th key={d.iso} className="border border-gray-300 px-2 py-2 text-center min-w-[80px]">
                          {d.dayName.slice(0,3)}<br/><span className="font-normal text-xs">{d.iso.slice(5)}</span>
                        </th>
                      ))}
                      <th className="border border-gray-300 px-2 py-2 text-center font-bold bg-green-50">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollData.rows.map((row: any) => (
                      <tr key={row.employeeName} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2 py-1 font-medium">{row.employeeName}</td>
                        {payrollData.weekDates.map((d: any) => {
                          const cell = row.days[d.iso];
                          return (
                            <td key={d.iso} className={`border border-gray-300 px-2 py-1 text-center ${cell?.isOverride ? 'bg-amber-50' : ''}`}>
                              <div className="text-xs font-medium">{cell?.timeSlot || 'OFF'}</div>
                              {cell?.hours != null && cell.hours > 0 && <div className="text-xs text-muted-foreground">{cell.hours}h</div>}
                            </td>
                          );
                        })}
                        <td className="border border-gray-300 px-2 py-1 text-center font-bold bg-green-50">
                          {row.totalHours.toFixed(1)}{row.hasUnknown?'+':''}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <Button onClick={exportCsv} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Export CSV</Button>
              </div>
            </div>
          ) : <p className="text-center py-8 text-muted-foreground">No schedule data for this period.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroomingSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Calculate dates for current week
  const getWeekDates = () => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate days to subtract to get to Monday of current week
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const currentWeekMonday = new Date(now);
    currentWeekMonday.setDate(now.getDate() - daysToMonday);
    currentWeekMonday.setHours(0, 0, 0, 0);
    
    // Generate dates for all days of the week
    return DAYS.map((_, index) => {
      const date = new Date(currentWeekMonday);
      date.setDate(currentWeekMonday.getDate() + index);
      return date;
    });
  };
  
  const dates = getWeekDates();
  
  // Fetch grooming schedule entries
  const scheduleQuery = useQuery({
    queryKey: ['/api/admin/grooming-schedule'],
  });
  
  // Organize schedule data by groomer
  useEffect(() => {
    if (scheduleQuery.data) {
      const entries = scheduleQuery.data as any[];
      const groomers = Array.from(new Set(entries.map((e: any) => e.groomerName)));
      
      const organized = groomers.map((groomerName, idx) => {
        const groomerEntries = entries.filter((e: any) => e.groomerName === groomerName);
        const schedule: Record<string, string> = {};
        
        DAYS.forEach(day => {
          const dayEntry = groomerEntries.find((e: any) => e.dayOfWeek === day);
          schedule[day] = dayEntry?.timeSlot || 'OFF';
        });
        
        return {
          groomerName: groomerName,
          displayOrder: idx,
          ...schedule
        };
      });
      
      setScheduleData(organized);
    }
  }, [scheduleQuery.data]);
  
  const handleCellChange = (groomerIndex: number, day: string, value: string) => {
    setScheduleData(prev => 
      prev.map((groomer, idx) => 
        idx === groomerIndex ? { ...groomer, [day]: value } : groomer
      )
    );
  };
  
  const handleGroomerNameChange = (groomerIndex: number, newName: string) => {
    setScheduleData(prev =>
      prev.map((groomer, idx) => 
        idx === groomerIndex ? { ...groomer, groomerName: newName } : groomer
      )
    );
  };
  
  const addGroomer = () => {
    const newGroomer: any = {
      groomerName: 'New Groomer',
      displayOrder: scheduleData.length,
    };
    
    DAYS.forEach(day => {
      newGroomer[day] = 'OFF';
    });
    
    setScheduleData(prev => [...prev, newGroomer]);
  };
  
  const removeGroomer = (groomerIndex: number) => {
    setScheduleData(prev => prev.filter((_, idx) => idx !== groomerIndex));
  };
  
  const saveSchedule = async () => {
    setIsSaving(true);
    try {
      const entries: any[] = [];
      
      scheduleData.forEach((groomer, idx) => {
        DAYS.forEach(day => {
          entries.push({
            section: 'A',
            groomerName: groomer.groomerName,
            dayOfWeek: day,
            timeSlot: groomer[day] || 'OFF',
            displayOrder: idx
          });
        });
      });
      
      await apiRequest('POST', '/api/admin/grooming-schedule/batch', { entries });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/grooming-schedule'] });
      toast({ title: 'Grooming schedule saved successfully' });
    } catch (error) {
      console.error('Failed to save grooming schedule:', error);
      toast({ title: 'Failed to save grooming schedule', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (scheduleQuery.isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }
  
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Grooming Schedule
          </CardTitle>
          <Button 
            onClick={saveSchedule}
            disabled={isSaving}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
            data-testid="button-save-grooming-schedule"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Grooming Schedule
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <Button
            size="sm"
            onClick={addGroomer}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-add-groomer"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Groomer
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 min-w-[800px]">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left font-semibold">Groomer</th>
                {DAYS.map((day, idx) => (
                  <th key={day} className="border border-gray-300 dark:border-gray-700 px-2 py-2 text-center font-semibold">
                    <div>{day.slice(0, 3)}</div>
                    <div className="text-xs font-normal text-gray-600 dark:text-gray-400">
                      {dates[idx].getMonth() + 1}/{dates[idx].getDate()}
                    </div>
                  </th>
                ))}
                <th className="border border-gray-300 dark:border-gray-700 px-2 py-2 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scheduleData.map((groomer, groomerIdx) => (
                <tr key={groomerIdx}>
                  <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                    <input
                      type="text"
                      value={groomer.groomerName}
                      onChange={(e) => handleGroomerNameChange(groomerIdx, e.target.value)}
                      className="w-full px-2 py-1 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
                      data-testid={`input-groomer-name-${groomerIdx}`}
                    />
                  </td>
                  {DAYS.map(day => (
                    <td key={day} className="border border-gray-300 dark:border-gray-700 px-2 py-1">
                      <input
                        type="text"
                        value={groomer[day]}
                        onChange={(e) => handleCellChange(groomerIdx, day, e.target.value)}
                        className="w-full px-2 py-1 border-none bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
                        placeholder="OFF"
                        data-testid={`input-time-${groomerIdx}-${day}`}
                      />
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-700 px-2 py-1 text-center">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeGroomer(groomerIdx)}
                      data-testid={`button-remove-groomer-${groomerIdx}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {scheduleData.length === 0 && (
                <tr>
                  <td colSpan={DAYS.length + 2} className="border border-gray-300 px-4 py-8 text-center text-gray-500">
                    No groomers added. Click "Add Groomer" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BoardingManagement({ isAddOpen, setIsAddOpen }: { isAddOpen: boolean; setIsAddOpen: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingRecord, setEditingRecord] = useState<any>(null);
  
  const boardingQuery = useQuery({
    queryKey: ['/api/admin/boarding'],
  });
  
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log('Creating boarding record with data:', data);
      return await apiRequest('POST', '/api/admin/boarding', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/boarding'] });
      setIsAddOpen(false);
      toast({ title: 'Boarding record created successfully' });
    },
    onError: (error: any) => {
      console.error('Failed to create boarding record:', error);
      toast({ title: 'Failed to create boarding record', variant: 'destructive' });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PUT', `/api/admin/boarding/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/boarding'] });
      setEditingRecord(null);
      toast({ title: 'Boarding record updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update boarding record', variant: 'destructive' });
    },
  });
  
  const checkInMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('PATCH', `/api/admin/boarding/${id}/check-in`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/boarding'] });
      toast({ title: 'Checked in successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to check in', variant: 'destructive' });
    },
  });
  
  const checkOutMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('PATCH', `/api/admin/boarding/${id}/check-out`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/boarding'] });
      toast({ title: 'Checked out successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to check out', variant: 'destructive' });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/boarding/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/boarding'] });
      toast({ title: 'Boarding record deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete boarding record', variant: 'destructive' });
    },
  });
  
  const calculateDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, days);
  };
  
  const calculateTotal = (record: any) => {
    if (record.totalPriceOverride) {
      return parseFloat(record.totalPriceOverride) || 0;
    }
    
    let startDate, endDate;
    
    if (record.actualDropOffDate && record.actualPickUpDate) {
      startDate = record.actualDropOffDate;
      endDate = record.actualPickUpDate;
    } else {
      startDate = record.estimatedDropOffDate;
      endDate = record.estimatedPickUpDate;
    }
    
    if (startDate && endDate) {
      const days = calculateDays(startDate, endDate);
      return days * parseFloat(record.dailyRate || 0);
    }
    return 0;
  };
  
  return (
    <div className="space-y-4">
      {boardingQuery.isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">Loading boarding records...</p>
        </div>
      ) : !boardingQuery.data || boardingQuery.data.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No boarding records found</p>
          <p className="text-sm mt-1">Click "New Boarding" to add a record</p>
        </div>
      ) : (
        <div className="space-y-4">
          {boardingQuery.data.map((record: any) => (
            <Card key={record.id} className="border shadow-sm">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{record.animalName}</h3>
                      <p className="text-sm text-gray-600">{record.animalType}</p>
                    </div>
                    <Badge variant={record.status === 'completed' ? 'secondary' : record.actualDropOffDate ? 'default' : 'outline'}>
                      {record.status === 'completed' ? 'Completed' : record.actualDropOffDate ? 'In Boarding' : 'Scheduled'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Customer: {record.customerName}</p>
                      <p className="text-gray-600">Phone: {record.customerPhone}</p>
                      {record.customerEmail && (
                        <p className="text-gray-600">Email: {record.customerEmail}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-600">Estimated Drop-off: {record.estimatedDropOffDate}</p>
                      <p className="text-gray-600">Estimated Pick-up: {record.estimatedPickUpDate}</p>
                      {record.actualDropOffDate && (
                        <p className="text-green-600 font-medium">Actual Drop-off: {record.actualDropOffDate}</p>
                      )}
                      {record.actualPickUpDate && (
                        <p className="text-green-600 font-medium">Actual Pick-up: {record.actualPickUpDate}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Daily Rate: ${parseFloat(record.dailyRate || 0).toFixed(2)}</p>
                      {record.totalPriceOverride ? (
                        <p className="text-lg font-semibold text-amber-600">
                          Charge Total: ${parseFloat(record.totalPriceOverride).toFixed(2)}
                          <span className="text-xs font-normal ml-1">(override)</span>
                        </p>
                      ) : record.status === 'completed' && record.actualDropOffDate && record.actualPickUpDate ? (
                        <p className="text-lg font-semibold text-green-600">
                          Final Total: ${calculateTotal(record).toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-lg font-semibold text-blue-600">
                          Estimated Total: ${calculateTotal(record).toFixed(2)}
                          {!record.estimatedDropOffDate || !record.estimatedPickUpDate ? ' (incomplete dates)' : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!record.actualDropOffDate && record.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkInMutation.mutate(record.id)}
                          disabled={checkInMutation.isPending}
                          data-testid={`button-check-in-${record.id}`}
                        >
                          Check In
                        </Button>
                      )}
                      {record.actualDropOffDate && !record.actualPickUpDate && (
                        <Button
                          size="sm"
                          onClick={() => checkOutMutation.mutate(record.id)}
                          disabled={checkOutMutation.isPending}
                          data-testid={`button-check-out-${record.id}`}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Check Out
                        </Button>
                      )}
                      {record.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingRecord(record)}
                          data-testid={`button-edit-${record.id}`}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this boarding record?')) {
                            deleteMutation.mutate(record.id);
                          }
                        }}
                        data-testid={`button-delete-${record.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {record.notes && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500">Special Instructions:</p>
                      <p className="text-sm">{record.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Boarding Record</DialogTitle>
          </DialogHeader>
          <BoardingForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setIsAddOpen(false)}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingRecord} onOpenChange={() => setEditingRecord(null)}>
        <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Boarding Record</DialogTitle>
          </DialogHeader>
          <BoardingForm
            initialData={editingRecord}
            onSubmit={(data) => updateMutation.mutate({ id: editingRecord.id, data })}
            onCancel={() => setEditingRecord(null)}
            isPending={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BoardingForm({ initialData, onSubmit, onCancel, isPending }: any) {
  const [formData, setFormData] = useState({
    customerName: initialData?.customerName || '',
    customerPhone: initialData?.customerPhone || '',
    customerEmail: initialData?.customerEmail || '',
    animalName: initialData?.animalName || '',
    animalType: initialData?.animalType || '',
    estimatedDropOffDate: initialData?.estimatedDropOffDate || new Date().toISOString().split('T')[0],
    estimatedPickUpDate: initialData?.estimatedPickUpDate || new Date(Date.now() + 86400000).toISOString().split('T')[0],
    dailyRate: initialData?.dailyRate || '25.00',
    totalPriceOverride: initialData?.totalPriceOverride || '',
    notes: initialData?.notes || '',
  });
  const [useOverride, setUseOverride] = useState(!!initialData?.totalPriceOverride);
  
  const estimatedDays = useMemo(() => {
    if (formData.estimatedDropOffDate && formData.estimatedPickUpDate) {
      const start = new Date(formData.estimatedDropOffDate);
      const end = new Date(formData.estimatedPickUpDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, days);
    }
    return 1;
  }, [formData.estimatedDropOffDate, formData.estimatedPickUpDate]);
  
  const estimatedTotal = useMemo(() => {
    return estimatedDays * parseFloat(formData.dailyRate || 0);
  }, [estimatedDays, formData.dailyRate]);

  const finalTotal = useMemo(() => {
    if (useOverride && formData.totalPriceOverride) {
      return parseFloat(formData.totalPriceOverride) || 0;
    }
    return estimatedTotal;
  }, [useOverride, formData.totalPriceOverride, estimatedTotal]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      totalPriceOverride: useOverride && formData.totalPriceOverride ? formData.totalPriceOverride : null,
    };
    console.log('BoardingForm submit with data:', submitData);
    onSubmit(submitData);
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Customer Name</Label>
        <Input
          required
          value={formData.customerName}
          onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
          placeholder="John Doe"
          data-testid="input-customer-name"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Customer Phone</Label>
          <Input
            required
            value={formData.customerPhone}
            onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
            placeholder="(555) 123-4567"
            data-testid="input-customer-phone"
          />
        </div>
        <div className="space-y-2">
          <Label>Customer Email</Label>
          <Input
            type="email"
            value={formData.customerEmail}
            onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
            placeholder="john@example.com"
            data-testid="input-customer-email"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Animal Name</Label>
          <Input
            required
            value={formData.animalName}
            onChange={(e) => setFormData({ ...formData, animalName: e.target.value })}
            placeholder="Max"
            data-testid="input-animal-name"
          />
        </div>
        <div className="space-y-2">
          <Label>Animal Type</Label>
          <Input
            required
            value={formData.animalType}
            onChange={(e) => setFormData({ ...formData, animalType: e.target.value })}
            placeholder="Dog, Cat, etc."
            data-testid="input-animal-type"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Estimated Drop-off</Label>
          <Input
            type="date"
            required
            value={formData.estimatedDropOffDate}
            onChange={(e) => setFormData({ ...formData, estimatedDropOffDate: e.target.value })}
            data-testid="input-estimated-drop-off"
          />
        </div>
        <div className="space-y-2">
          <Label>Estimated Pick-up</Label>
          <Input
            type="date"
            required
            value={formData.estimatedPickUpDate}
            onChange={(e) => setFormData({ ...formData, estimatedPickUpDate: e.target.value })}
            data-testid="input-estimated-pick-up"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label>Daily Rate ($)</Label>
        <Input
          type="number"
          step="0.01"
          required
          value={formData.dailyRate}
          onChange={(e) => setFormData({ ...formData, dailyRate: e.target.value })}
          placeholder="25.00"
          data-testid="input-daily-rate"
        />
      </div>
      
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md space-y-2">
        <p className="text-sm">
          <span className="font-medium">Estimated Days:</span> {estimatedDays} day{estimatedDays !== 1 ? 's' : ''}
        </p>
        <p className="text-sm">
          <span className="font-medium">Projected Total:</span> ${estimatedTotal.toFixed(2)}
          <span className="text-xs text-gray-500 ml-1">({estimatedDays} × ${parseFloat(formData.dailyRate || '0').toFixed(2)})</span>
        </p>
        
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="use-override"
            checked={useOverride}
            onChange={(e) => setUseOverride(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="use-override" className="text-sm font-medium cursor-pointer">
            Override Total Price
          </label>
        </div>
        
        {useOverride && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.totalPriceOverride}
              onChange={(e) => setFormData({ ...formData, totalPriceOverride: e.target.value })}
              placeholder="80.00"
              className="w-32 h-8 text-sm"
              data-testid="input-price-override"
            />
          </div>
        )}
        
        <p className="text-sm font-bold mt-1 pt-1 border-t border-blue-200 dark:border-blue-700">
          <span>Charge Total:</span> ${finalTotal.toFixed(2)}
          {useOverride && formData.totalPriceOverride && (
            <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-2">(override)</span>
          )}
        </p>
      </div>
      
      <div className="space-y-2">
        <Label>Special Instructions (Optional)</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Feeding schedule, medications, behavioral notes..."
          rows={3}
          data-testid="input-special-instructions"
        />
      </div>
      
      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-brand-blue hover:bg-blue-600"
          data-testid="button-submit-boarding"
        >
          {isPending ? 'Saving...' : (initialData ? 'Update' : 'Create')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
          data-testid="button-cancel-boarding"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Edit Appointment Dialog Component - Multi-Pet Support
function EditAppointmentDialog({
  appointmentId,
  initialOwnerFirstName,
  initialOwnerLastName,
  initialOwnerPhone,
  initialDate,
  initialTime,
  onClose,
  onOpenScanner,
  scannerOpen,
  groomers,
  isBookingDateAvailable,
  bookingAvailableTimeSlots
}: {
  appointmentId: number;
  initialOwnerFirstName: string;
  initialOwnerLastName: string;
  initialOwnerPhone: string;
  initialDate: Date | undefined;
  initialTime: string;
  onClose: () => void;
  onOpenScanner: (cb: (upc: string) => void) => void;
  scannerOpen: boolean;
  groomers: any[];
  isBookingDateAvailable: (date: Date) => boolean;
  bookingAvailableTimeSlots: string[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for appointment-level fields
  const [ownerFirstName, setOwnerFirstName] = useState(initialOwnerFirstName);
  const [ownerLastName, setOwnerLastName] = useState(initialOwnerLastName);
  const [ownerPhone, setOwnerPhone] = useState(initialOwnerPhone);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  
  // State for pets array
  const [pets, setPets] = useState<any[]>([]);
  const [pricingMode, setPricingMode] = useState<'individual' | 'override'>('individual');
  const [totalPriceOverride, setTotalPriceOverride] = useState('');
  const [priceWasEdited, setPriceWasEdited] = useState(false);
  
  // State for capacity error dialog
  const [showCapacityDialog, setShowCapacityDialog] = useState(false);
  
  // Track which appointment we've initialized for (prevents overwriting edits on refetch)
  const initializedAppointmentId = useRef<number | null>(null);

  // Items Sold state
  const [itemSearch, setItemSearch] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState<any[]>([]);
  const [itemSearching, setItemSearching] = useState(false);
  const [pendingApptItem, setPendingApptItem] = useState<{ supply: any; priceOverride: string } | null>(null);

  // On mount, clear the stale cache for this appointment so we always load the
  // latest saved data (notes, prices, etc.) — not a cached copy from a previous open.
  useEffect(() => {
    queryClient.removeQueries({ queryKey: ['/api/appointments', appointmentId] });
  }, []);

  // Wrap onClose to reset the initialization guard
  const handleClose = () => {
    initializedAppointmentId.current = null;
    onClose();
  };
  
  const { data: editServicePrices } = useQuery<{ fullGrooming: string; bathOnly: string }>({
    queryKey: ["/api/service-prices"],
  });

  const { data: editGroomingSettings = [] } = useQuery({ queryKey: ["/api/admin/grooming-settings"] });
  const _egs = (editGroomingSettings as any[]);
  const editTrackedLabel = _egs.find((s: any) => s.setting === 'tracked_items_label')?.value || 'Pets';
  const editTrackedSingular = editTrackedLabel.replace(/s$/i, '');
  
  // Fetch appointment and appointment_pets data
  const { data: appointmentData, isLoading: isLoadingAppointment } = useQuery({
    queryKey: ['/api/appointments', appointmentId],
    queryFn: async () => {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to fetch appointment');
      return response.json();
    },
    enabled: !!appointmentId,
    // Disable background refetching to prevent overwriting user edits
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true, // Always fetch when dialog opens
  });
  
  // Initialize state when appointment data loads (only once per appointmentId)
  useEffect(() => {
    // Skip if no data or already initialized for this appointment
    if (!appointmentData || initializedAppointmentId.current === appointmentId) return;
    
    // Update date and time from fetched appointment data (using local date parser to avoid timezone issues)
    if (appointmentData.appointmentDate) {
      setDate(parseLocalDate(appointmentData.appointmentDate));
    }
    if (appointmentData.appointmentTime) {
      setTime(appointmentData.appointmentTime);
    }
    
    // Update owner information from fetched data
    setOwnerFirstName(appointmentData.ownerFirstName || '');
    setOwnerLastName(appointmentData.ownerLastName || '');
    setOwnerPhone(appointmentData.ownerPhoneNumber || '');
    
    // If appointment has pets array, use it; otherwise create from single pet
    if (appointmentData.pets && appointmentData.pets.length > 0) {
      setPets(appointmentData.pets.map((pet: any) => ({
        id: pet.id,
        name: pet.petName,
        type: pet.petType,
        serviceType: pet.serviceType,
        notes: pet.specialNotes || '',
        groomerId: pet.groomerId || null,
        price: pet.price ? parseFloat(pet.price).toString() : '0',
      })));
    } else {
      // Fallback to single pet from appointment table
      setPets([{
        id: null,
        name: appointmentData.petName || '',
        type: appointmentData.petType || 'Dog',
        serviceType: appointmentData.serviceType || 'grooming-full',
        notes: appointmentData.specialNotes || '',
        groomerId: appointmentData.groomerId || null,
        price: appointmentData.price ? parseFloat(appointmentData.price).toString() : '0',
      }]);
    }
    
    // Set pricing mode based on appointment data
    setPricingMode(appointmentData.pricingMode || 'individual');
    // Only update override price if explicitly set (preserve any previous value if switching modes)
    if (appointmentData.pricingMode === 'override' && appointmentData.price) {
      setTotalPriceOverride(parseFloat(appointmentData.price).toString());
    }
    
    // Reset price-edited flag — data just loaded, user hasn't touched price yet
    setPriceWasEdited(false);
    
    // Mark this appointment as initialized
    initializedAppointmentId.current = appointmentId;
  }, [appointmentData, appointmentId]);
  
  // Calculate total price in individual mode
  const calculatedTotal = pets.reduce((sum, pet) => sum + (parseFloat(pet.price) || 0), 0);

  // Items Sold query + mutations (self-contained inside this dialog)
  const { data: editApptItems = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments", appointmentId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/${appointmentId}/items`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!appointmentId,
  });

  const addEditItemMutation = useMutation({
    mutationFn: async (item: { supplyId?: number | null; name: string; sku?: string | null; brand?: string | null; category?: string | null; price: string; quantity: number }) => {
      return apiRequest("POST", `/api/appointments/${appointmentId}/items`, item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setItemSearch('');
      setItemSearchResults([]);
    },
    onError: () => toast({ title: "Error", description: "Failed to add item.", variant: "destructive" }),
  });

  const removeEditItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return apiRequest("DELETE", `/api/appointments/${appointmentId}/items/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove item.", variant: "destructive" }),
  });

  const updateEditItemPriceMutation = useMutation({
    mutationFn: async ({ itemId, price }: { itemId: number; price: string }) => {
      return apiRequest("PATCH", `/api/appointments/${appointmentId}/items/${itemId}`, { price });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", appointmentId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setEditingItemId(null);
      setEditingItemPrice('');
    },
    onError: () => toast({ title: "Error", description: "Failed to update price.", variant: "destructive" }),
  });

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemPrice, setEditingItemPrice] = useState('');
  
  // Update pet field
  const updatePet = (index: number, field: string, value: any) => {
    const updated = [...pets];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'serviceType' && pricingMode === 'individual') {
      updated[index].price = '0';
      setPriceWasEdited(true); // Service type change = intentional price change
    }
    
    if (field === 'price') {
      setPriceWasEdited(true); // Direct price edit
    }
    
    setPets(updated);
  };
  
  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates: any = {
        ownerFirstName,
        ownerLastName,
        ownerPhoneNumber: ownerPhone,
        pricingMode,
        pets: pets.map(pet => ({
          petName: pet.name,
          petType: pet.type,
          serviceType: pet.serviceType,
          specialNotes: pet.notes ? btoa(unescape(encodeURIComponent(pet.notes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : '',
          groomerId: pet.groomerId || null,
          price: pet.price,
        })),
      };
      
      // Only send price if the user actually changed it — prevents auto-populated
      // price from overwriting a custom price just because a note was added/edited
      if (priceWasEdited) {
        if (pricingMode === 'override') {
          updates.price = totalPriceOverride;
        } else {
          updates.price = calculatedTotal.toString();
        }
      }
      
      // Format date if changed
      if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        updates.appointmentDate = `${year}-${month}-${day}`;
      }
      
      if (time) {
        updates.appointmentTime = time;
      }
      
      await apiRequest("PATCH", `/api/admin/appointments/${appointmentId}/details`, updates);
    },
    onSuccess: () => {
      handleClose();
      toast({
        title: "Appointment Updated",
        description: "Appointment details have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error: any) => {
      // Extract error message from apiRequest error format: "400: {json}"
      let errorText = '';
      if (error?.message) {
        const parts = error.message.split(': ', 2);
        if (parts.length === 2) {
          try {
            const jsonData = JSON.parse(parts[1]);
            errorText = jsonData.message || '';
          } catch {
            errorText = parts[1];
          }
        } else {
          errorText = error.message;
        }
      }
      
      // Check if this is a capacity error
      if (errorText.includes('capacity is fully booked') || errorText.includes('capacity would be exceeded')) {
        setShowCapacityDialog(true);
        return;
      }
      
      toast({
        title: "Error",
        description: errorText || "Failed to update appointment. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  if (isLoadingAppointment) {
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading appointment details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Dialog open={!scannerOpen} onOpenChange={handleClose}>
      <DialogContent forceMount className={`max-w-3xl max-h-[90vh] overflow-y-auto${scannerOpen ? ' hidden' : ''}`}>
        <DialogHeader>
          <DialogTitle>Edit Appointment</DialogTitle>
          <DialogDescription>Update appointment information for all pets</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Owner Information Section */}
          <div className="space-y-4 pb-4 border-b">
            <h3 className="font-semibold text-sm">Owner Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="owner-first-name">First Name</Label>
                <Input
                  id="owner-first-name"
                  value={ownerFirstName}
                  onChange={(e) => setOwnerFirstName(e.target.value)}
                  placeholder="John"
                  data-testid="input-edit-owner-first-name"
                />
              </div>
              <div>
                <Label htmlFor="owner-last-name">Last Name</Label>
                <Input
                  id="owner-last-name"
                  value={ownerLastName}
                  onChange={(e) => setOwnerLastName(e.target.value)}
                  placeholder="Doe"
                  data-testid="input-edit-owner-last-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="owner-phone">Phone Number</Label>
              <Input
                id="owner-phone"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="(555) 123-4567"
                data-testid="input-edit-owner-phone"
              />
            </div>
          </div>
          
          {/* Date & Time Section */}
          <div className="space-y-4 pb-4 border-b">
            <h3 className="font-semibold text-sm">Appointment Date & Time</h3>
            <div>
              <Label>Date</Label>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(d) => !isBookingDateAvailable(d)}
                className="rounded-md border"
                data-testid="calendar-edit-date"
              />
            </div>
            <div>
              <Label>Time</Label>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 border rounded">
                {bookingAvailableTimeSlots.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={time === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTime(t)}
                    data-testid={`edit-time-slot-${t.replace(/[:\s]/g, '-')}`}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Pets Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editTrackedLabel} ({pets.length})</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => {
                  setPets([...pets, {
                    id: null,
                    name: '',
                    type: 'Dog',
                    serviceType: 'grooming-full',
                    notes: '',
                    groomerId: null,
                    price: '0',
                  }]);
                }}
                data-testid="button-add-pet"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add {editTrackedSingular}
              </Button>
            </div>
            
            {/* Pet Cards - Stacked */}
            {pets.map((pet, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{editTrackedSingular} {index + 1}</span>
                  {pets.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                      onClick={() => setPets(pets.filter((_, i) => i !== index))}
                      data-testid={`button-remove-pet-${index}`}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`pet-name-${index}`}>Name</Label>
                    <Input
                      id={`pet-name-${index}`}
                      value={pet.name}
                      onChange={(e) => updatePet(index, 'name', e.target.value)}
                      placeholder="Buddy"
                      data-testid={`input-edit-pet-name-${index}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`pet-type-${index}`}>Type</Label>
                    <Input
                      id={`pet-type-${index}`}
                      value={pet.type}
                      onChange={(e) => updatePet(index, 'type', e.target.value)}
                      placeholder="Dog"
                      data-testid={`input-edit-pet-type-${index}`}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`pet-service-${index}`}>Service</Label>
                    <Select
                      value={pet.serviceType}
                      onValueChange={(value) => updatePet(index, 'serviceType', value)}
                    >
                      <SelectTrigger id={`pet-service-${index}`} data-testid={`select-edit-service-${index}`}>
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grooming-full">Full Grooming ${editServicePrices?.fullGrooming || '35'} (Prices will vary)</SelectItem>
                        <SelectItem value="grooming-bath">Bath Only ${editServicePrices?.bathOnly || '20'} (Prices will vary)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`pet-groomer-${index}`}>Groomer</Label>
                    <Select
                      value={pet.groomerId !== null ? pet.groomerId.toString() : 'none'}
                      onValueChange={(value) => updatePet(index, 'groomerId', value === 'none' ? null : parseInt(value))}
                    >
                      <SelectTrigger id={`pet-groomer-${index}`} data-testid={`select-edit-groomer-${index}`}>
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No groomer assigned</SelectItem>
                        {Array.isArray(groomers) && groomers
                          .filter((g: any) => g.isActive)
                          .map((groomer: any) => (
                            <SelectItem key={groomer.id} value={groomer.id.toString()}>
                              {groomer.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor={`pet-notes-${index}`}>Special Notes</Label>
                  <Textarea
                    id={`pet-notes-${index}`}
                    value={pet.notes}
                    onChange={(e) => updatePet(index, 'notes', e.target.value)}
                    placeholder="Special instructions..."
                    rows={2}
                    data-testid={`input-edit-notes-${index}`}
                  />
                </div>
                
                {pricingMode === 'individual' && (
                  <div>
                    <Label htmlFor={`pet-price-${index}`}>Price ($)</Label>
                    <Input
                      id={`pet-price-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={pet.price}
                      onChange={(e) => updatePet(index, 'price', e.target.value)}
                      placeholder="35.00"
                      data-testid={`input-edit-price-${index}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Pricing Section */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold text-sm">Pricing</h3>
            
            {/* Pricing Mode Toggle */}
            <div>
              <Label>Pricing Mode</Label>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="pricing-individual"
                    checked={pricingMode === 'individual'}
                    onChange={() => setPricingMode('individual')}
                    data-testid="radio-pricing-individual"
                  />
                  <Label htmlFor="pricing-individual" className="cursor-pointer font-normal">
                    Individual Pet Prices
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="pricing-override"
                    checked={pricingMode === 'override'}
                    onChange={() => setPricingMode('override')}
                    data-testid="radio-pricing-override"
                  />
                  <Label htmlFor="pricing-override" className="cursor-pointer font-normal">
                    Single Total Override
                  </Label>
                </div>
              </div>
            </div>
            
            {/* Total Price Display/Input */}
            {pricingMode === 'individual' ? (
              <div className="bg-blue-50 p-3 rounded">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Calculated Total:</span>
                  <span className="text-lg font-bold text-blue-700" data-testid="text-calculated-total">
                    ${calculatedTotal.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">Sum of individual pet prices</p>
              </div>
            ) : (
              <div>
                <Label htmlFor="total-override">Total Price Override ($)</Label>
                <Input
                  id="total-override"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalPriceOverride}
                  onChange={(e) => { setTotalPriceOverride(e.target.value); setPriceWasEdited(true); }}
                  placeholder="0.00"
                  data-testid="input-total-override"
                  className="max-w-xs"
                />
                <p className="text-xs text-gray-600 mt-1">This overrides individual pet prices</p>
              </div>
            )}
          </div>
        </div>

        {/* Items Sold During Appointment */}
        <div className="space-y-3 pt-4 border-t">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Items Sold
          </h3>

          {/* Search bar + scanner button */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search product by name or UPC..."
                value={itemSearch}
                onChange={async (e) => {
                  const val = e.target.value;
                  setItemSearch(val);
                  if (val.length < 2) { setItemSearchResults([]); return; }
                  setItemSearching(true);
                  try {
                    const res = await fetch(`/api/supplies?search=${encodeURIComponent(val)}&limit=8`, { credentials: 'include' });
                    const data = await res.json();
                    setItemSearchResults(Array.isArray(data) ? data : (data.supplies || []));
                  } catch { setItemSearchResults([]); }
                  setItemSearching(false);
                }}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {itemSearching && <span className="absolute right-2 top-2 text-xs text-gray-400">...</span>}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenScanner(async (upc: string) => {
                try {
                  const res = await fetch(`/api/supplies/by-upc/${upc}`, { credentials: 'include' });
                  if (!res.ok) {
                    toast({ title: "Not Found", description: `No product found for UPC ${upc}`, variant: "destructive" });
                    return;
                  }
                  const s = await res.json();
                  setPendingApptItem({ supply: { ...s, sku: s.sku || upc }, priceOverride: String(s.price || '0') });
                } catch {
                  toast({ title: "Error", description: "Failed to look up barcode.", variant: "destructive" });
                }
              })}
              title="Scan barcode"
              className="px-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9V6a2 2 0 0 1 2-2h2"/><path d="M15 4h2a2 2 0 0 1 2 2v3"/><path d="M9 20H6a2 2 0 0 1-2-2v-3"/><path d="M21 15v2a2 2 0 0 1-2 2h-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/><line x1="19" y1="8" x2="19" y2="16"/></svg>
            </Button>
          </div>

          {/* Search results dropdown */}
          {itemSearchResults.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
              {itemSearchResults.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.brand || ''}{s.brand && s.sku ? ' · ' : ''}{s.sku || ''} — ${parseFloat(s.price || '0').toFixed(2)}</p>
                  </div>
                  <Button
                    size="sm"
                    className="ml-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3"
                    onClick={() => {
                      setPendingApptItem({ supply: s, priceOverride: String(s.price || '0') });
                      setItemSearch('');
                      setItemSearchResults([]);
                    }}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Price override card — appears after scanner/search selection, before committing */}
          {pendingApptItem && (
            <div className="border-2 border-orange-400 rounded-lg p-3 bg-orange-50 dark:bg-orange-950 space-y-2">
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">Confirm Item &amp; Price</p>
              <p className="text-sm font-medium truncate">{pendingApptItem.supply.name}</p>
              <p className="text-xs text-gray-500">
                Catalog price: ${parseFloat(pendingApptItem.supply.price || '0').toFixed(2)}
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">Charge price:</label>
                <div className="flex items-center border border-gray-300 rounded px-2 bg-white dark:bg-gray-800">
                  <span className="text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pendingApptItem.priceOverride}
                    onChange={(e) => setPendingApptItem({ ...pendingApptItem, priceOverride: e.target.value })}
                    className="w-20 text-sm px-1 py-1 bg-transparent focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const s = pendingApptItem.supply;
                        addEditItemMutation.mutate({
                          supplyId: s.id,
                          name: s.name,
                          sku: s.sku || null,
                          brand: s.brand || null,
                          category: s.category || null,
                          price: pendingApptItem.priceOverride || '0',
                          quantity: 1,
                        });
                        setPendingApptItem(null);
                      } else if (e.key === 'Escape') {
                        setPendingApptItem(null);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-4"
                  disabled={addEditItemMutation.isPending}
                  onClick={() => {
                    const s = pendingApptItem.supply;
                    addEditItemMutation.mutate({
                      supplyId: s.id,
                      name: s.name,
                      sku: s.sku || null,
                      brand: s.brand || null,
                      category: s.category || null,
                      price: pendingApptItem.priceOverride || '0',
                      quantity: 1,
                    });
                    setPendingApptItem(null);
                  }}
                >
                  Add at ${parseFloat(pendingApptItem.priceOverride || '0').toFixed(2)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setPendingApptItem(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Added items list */}
          {editApptItems.length > 0 ? (
            <div className="space-y-1">
              {editApptItems.map((item: any) => (
                <div key={item.id} className="bg-blue-50 rounded px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate flex-1 min-w-0">{item.name}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 h-auto shrink-0"
                      disabled={removeEditItemMutation.isPending}
                      onClick={() => removeEditItemMutation.mutate(item.id)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  {editingItemId === item.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">Qty {item.quantity} ×</span>
                      <div className="flex items-center border border-orange-400 rounded px-2 bg-white">
                        <span className="text-xs text-gray-500">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingItemPrice}
                          onChange={(e) => setEditingItemPrice(e.target.value)}
                          className="w-16 text-sm px-1 py-0.5 bg-transparent focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateEditItemPriceMutation.mutate({ itemId: item.id, price: editingItemPrice });
                            if (e.key === 'Escape') { setEditingItemId(null); setEditingItemPrice(''); }
                          }}
                        />
                      </div>
                      <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-6 px-2" disabled={updateEditItemPriceMutation.isPending} onClick={() => updateEditItemPriceMutation.mutate({ itemId: item.id, price: editingItemPrice })}>Save</Button>
                      <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => { setEditingItemId(null); setEditingItemPrice(''); }}>×</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-xs text-gray-500 flex-1">
                        {item.brand || ''}{item.brand && item.sku ? ' · ' : ''}{item.sku || ''}
                        {' '}× {item.quantity} = ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </p>
                      <button
                        className="text-xs text-orange-500 hover:text-orange-700 underline shrink-0"
                        onClick={() => { setEditingItemId(item.id); setEditingItemPrice(String(parseFloat(item.price).toFixed(2))); }}
                      >
                        Edit price
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-between items-center pt-1 border-t border-blue-200 mt-1">
                <span className="text-xs font-semibold text-gray-600">Items Total</span>
                <span className="text-sm font-bold text-blue-700">
                  ${editApptItems.reduce((sum: number, it: any) => sum + parseFloat(it.price) * it.quantity, 0).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No items added yet.</p>
          )}

        </div>
        
        {/* Action Buttons */}
        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel-edit"
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-brand-blue hover:bg-blue-700"
            data-testid="button-save-edit"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Capacity Error Dialog - Centered Popup */}
      <Dialog open={showCapacityDialog} onOpenChange={setShowCapacityDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Fully Booked</DialogTitle>
            <DialogDescription className="text-center pt-2">
              We are fully booked for that day. Please select a different date.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center">
            <Button onClick={() => setShowCapacityDialog(false)} data-testid="button-capacity-ok">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// EmailCenter component moved to client/src/components/admin/EmailCenter.tsx

// Settings Panel Component - ExaTouch POS Tax Format
function SettingsPanel() {
  const { toast } = useToast();
  const [cityTax, setCityTax] = useState<number>(0);
  const [countyTax, setCountyTax] = useState<number>(0);
  const [stateTax, setStateTax] = useState<number>(5.0);
  const [federalTax, setFederalTax] = useState<number>(5.99);
  const [showOnReceipt, setShowOnReceipt] = useState<boolean>(true);
  const [defaultForItems, setDefaultForItems] = useState<boolean>(true);
  const [defaultForServices, setDefaultForServices] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alternateReplyEmail, setAlternateReplyEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const { data: taxData, isLoading } = useQuery({
    queryKey: ['/api/settings/tax-rate'],
  });

  const { data: replyEmailData } = useQuery({
    queryKey: ['/api/settings/alternate-reply-email'],
  });

  useEffect(() => {
    if (replyEmailData) {
      setAlternateReplyEmail((replyEmailData as any).email || '');
    }
  }, [replyEmailData]);

  useEffect(() => {
    if (taxData) {
      const data = taxData as any;
      if (typeof data.cityTax === 'number') setCityTax(data.cityTax);
      if (typeof data.countyTax === 'number') setCountyTax(data.countyTax);
      if (typeof data.stateTax === 'number') setStateTax(data.stateTax);
      if (typeof data.federalTax === 'number') setFederalTax(data.federalTax);
      if (typeof data.showOnReceipt === 'boolean') setShowOnReceipt(data.showOnReceipt);
      if (typeof data.defaultForItems === 'boolean') setDefaultForItems(data.defaultForItems);
      if (typeof data.defaultForServices === 'boolean') setDefaultForServices(data.defaultForServices);
    }
  }, [taxData]);

  const totalTaxRate = cityTax + countyTax + stateTax + federalTax;

  const handleSaveTaxRate = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/settings/tax-rate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          cityTax, 
          countyTax, 
          stateTax, 
          federalTax,
          showOnReceipt,
          defaultForItems,
          defaultForServices
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save tax rate');
      }
      
      toast({
        title: "Settings saved",
        description: `Total tax rate set to ${totalTaxRate.toFixed(4)}%`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save tax rate",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Store Settings
        </CardTitle>
        <CardDescription>Configure store-wide settings (ExaTouch POS format)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Group A - Sales Tax</h3>
            <div className="text-right">
              <span className="text-sm text-gray-500">Total: </span>
              <span className="font-bold text-lg">{totalTaxRate.toFixed(4)}%</span>
            </div>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="city-tax" className="text-right w-24">City Tax</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="city-tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={cityTax}
                    onChange={(e) => setCityTax(parseFloat(e.target.value) || 0)}
                    className="w-28 text-right"
                    disabled={isLoading}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="county-tax" className="text-right w-24">County Tax</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="county-tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={countyTax}
                    onChange={(e) => setCountyTax(parseFloat(e.target.value) || 0)}
                    className="w-28 text-right"
                    disabled={isLoading}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="state-tax" className="text-right w-24">State Tax</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="state-tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={stateTax}
                    onChange={(e) => setStateTax(parseFloat(e.target.value) || 0)}
                    className="w-28 text-right"
                    disabled={isLoading}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="federal-tax" className="text-right w-24">Federal Tax</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="federal-tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={federalTax}
                    onChange={(e) => setFederalTax(parseFloat(e.target.value) || 0)}
                    className="w-28 text-right"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-2">
              <div className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  id="show-on-receipt" 
                  checked={showOnReceipt}
                  onChange={(e) => setShowOnReceipt(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label htmlFor="show-on-receipt" className="text-sm cursor-pointer">Show On Receipt</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  id="default-for-items" 
                  checked={defaultForItems}
                  onChange={(e) => setDefaultForItems(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label htmlFor="default-for-items" className="text-sm cursor-pointer">Default For Items</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  id="default-for-services" 
                  checked={defaultForServices}
                  onChange={(e) => setDefaultForServices(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label htmlFor="default-for-services" className="text-sm cursor-pointer">Default For Services</Label>
              </div>
            </div>
          </div>
          
          <p className="text-sm text-gray-500">
            Tax rates match ExaTouch POS format. Total rate ({totalTaxRate.toFixed(4)}%) is applied to all orders at checkout.
          </p>
          
          <Button 
            onClick={handleSaveTaxRate} 
            disabled={isSaving || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? 'Saving...' : 'Save Tax Settings'}
          </Button>
        </div>

        <div className="border-t pt-6 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Alternate Reply-To Email
          </h3>
          <p className="text-sm text-gray-500">
            When customers, groomers, or admins reply to any email from PilotHouse, the reply will go to both the main sending email and this alternate address. Useful as a fallback if your primary email has delivery issues.
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="alternate-reply-email" className="text-sm mb-1 block">Fallback Email Address</Label>
              <Input
                id="alternate-reply-email"
                type="email"
                placeholder="backup@example.com"
                value={alternateReplyEmail}
                onChange={(e) => setAlternateReplyEmail(e.target.value)}
              />
            </div>
            <Button
              onClick={async () => {
                setIsSavingEmail(true);
                try {
                  const response = await fetch('/api/admin/settings/alternate-reply-email', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: alternateReplyEmail }),
                  });
                  if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to save');
                  }
                  toast({
                    title: "Saved",
                    description: alternateReplyEmail 
                      ? `Replies will also go to ${alternateReplyEmail}` 
                      : "Alternate reply-to email cleared",
                  });
                } catch (error: any) {
                  toast({
                    title: "Error",
                    description: error.message || "Failed to save alternate email",
                    variant: "destructive",
                  });
                } finally {
                  setIsSavingEmail(false);
                }
              }}
              disabled={isSavingEmail}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSavingEmail ? 'Saving...' : 'Save'}
            </Button>
          </div>
          {alternateReplyEmail && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <span>Replies will go to both your main email and {alternateReplyEmail}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Store Code Card — shows the owner their unique auto-generated store code to share with employees
function StoreCodeCard() {
  const { data: tenantInfo } = useQuery<{ slug?: string; name?: string }>({
    queryKey: ['/api/tenants/current'],
  });
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const slug = tenantInfo?.slug ?? '';

  const copy = () => {
    if (!slug) return;
    navigator.clipboard.writeText(slug).then(() => {
      setCopied(true);
      toast({ title: 'Store code copied!' });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <Shield className="w-5 h-5" />
          Your Store Code
        </CardTitle>
        <p className="text-sm text-blue-700">
          Share this with employees so they can set up the <strong>Staff Sign-In</strong> tab on a new device. This is <em>different</em> from an employee's personal E01/E02 code — employees need <strong>both</strong>: this store code once (to find the store), then their own E-code + PIN each time they sign in.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-white border border-blue-200 rounded-lg px-4 py-3">
            <p className="text-xs text-blue-500 font-medium mb-0.5">Store code</p>
            <p className="font-mono text-lg font-bold text-blue-900 tracking-wide">{slug || '—'}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
            onClick={copy}
            disabled={!slug}
          >
            {copied ? <Check className="w-4 h-4 mr-1.5 text-green-600" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-blue-500 mt-3">
          Employees enter this <strong>once</strong> on a fresh device. After that the device remembers it — they only need their personal E-code + PIN to sign in each time.
        </p>
      </CardContent>
    </Card>
  );
}

// Store Hours Panel Component
function StoreHoursPanel() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const DAY_LABELS: Record<string, string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  };

  const [hours, setHours] = useState<Record<string, { open: boolean; openTime: string; closeTime: string }>>({
    monday: { open: true, openTime: '07:00', closeTime: '18:00' },
    tuesday: { open: true, openTime: '07:00', closeTime: '18:00' },
    wednesday: { open: true, openTime: '07:00', closeTime: '18:00' },
    thursday: { open: true, openTime: '07:00', closeTime: '18:00' },
    friday: { open: true, openTime: '07:00', closeTime: '18:00' },
    saturday: { open: true, openTime: '07:00', closeTime: '18:00' },
    sunday: { open: true, openTime: '13:00', closeTime: '18:00' },
  });

  const { data: storeHoursData, isLoading } = useQuery({
    queryKey: ['/api/settings/store-hours'],
  });

  useEffect(() => {
    if (storeHoursData) {
      const data = storeHoursData as Record<string, any>;
      const newHours: Record<string, { open: boolean; openTime: string; closeTime: string }> = {};
      for (const day of DAYS) {
        if (data[day]) {
          newHours[day] = {
            open: data[day].open ?? true,
            openTime: data[day].openTime || '07:00',
            closeTime: data[day].closeTime || '18:00',
          };
        } else {
          newHours[day] = hours[day];
        }
      }
      setHours(newHours);
    }
  }, [storeHoursData]);

  const formatTime12h = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/settings/store-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hours }),
      });
      if (!response.ok) throw new Error('Failed to save');
      toast({ title: "Store hours saved", description: "Your updated hours are now visible to customers." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save store hours", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateDay = (day: string, field: string, value: any) => {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      timeOptions.push(val);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Store Hours
        </CardTitle>
        <CardDescription>Set your store's operating hours displayed to customers. These are separate from grooming appointment settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : (
          <>
            <div className="space-y-3">
              {DAYS.map(day => (
                <div key={day} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="w-24 font-medium text-sm">{DAY_LABELS[day]}</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hours[day].open}
                      onChange={(e) => updateDay(day, 'open', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-500 w-10">{hours[day].open ? 'Open' : 'Closed'}</span>
                  </div>
                  {hours[day].open ? (
                    <div className="flex items-center gap-2 flex-1">
                      <select
                        value={hours[day].openTime}
                        onChange={(e) => updateDay(day, 'openTime', e.target.value)}
                        className="text-sm border rounded px-2 py-1.5 bg-white dark:bg-gray-700 dark:border-gray-600"
                      >
                        {timeOptions.map(t => (
                          <option key={t} value={t}>{formatTime12h(t)}</option>
                        ))}
                      </select>
                      <span className="text-gray-400 text-sm">to</span>
                      <select
                        value={hours[day].closeTime}
                        onChange={(e) => updateDay(day, 'closeTime', e.target.value)}
                        className="text-sm border rounded px-2 py-1.5 bg-white dark:bg-gray-700 dark:border-gray-600"
                      >
                        {timeOptions.map(t => (
                          <option key={t} value={t}>{formatTime12h(t)}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-sm text-red-500 italic">Closed</span>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Preview: {(() => {
                  const groups: { days: string[]; time: string }[] = [];
                  for (const day of DAYS) {
                    const h = hours[day];
                    const timeStr = h.open ? `${formatTime12h(h.openTime)} - ${formatTime12h(h.closeTime)}` : 'Closed';
                    const lastGroup = groups[groups.length - 1];
                    if (lastGroup && lastGroup.time === timeStr) {
                      lastGroup.days.push(DAY_LABELS[day].slice(0, 3));
                    } else {
                      groups.push({ days: [DAY_LABELS[day].slice(0, 3)], time: timeStr });
                    }
                  }
                  return groups.map(g => {
                    const dayRange = g.days.length > 2
                      ? `${g.days[0]}-${g.days[g.days.length - 1]}`
                      : g.days.join(', ');
                    return `${dayRange}: ${g.time}`;
                  }).join(' · ');
                })()}
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? 'Saving...' : 'Save Store Hours'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Tracked Items Settings Panel Component
function TrackedItemsSettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/grooming-settings"],
  });

  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState("Pets");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const s = settings as any[];
    const e = s.find((x: any) => x.setting === "tracked_items_enabled")?.value;
    const l = s.find((x: any) => x.setting === "tracked_items_label")?.value;
    if (e !== undefined) setEnabled(e === "true");
    if (l) setLabel(l);
  }, [settings]);

  const save = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        fetch("/api/admin/grooming-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ setting: "tracked_items_enabled", value: String(enabled) }),
        }),
        fetch("/api/admin/grooming-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ setting: "tracked_items_label", value: label.trim() || "Pets" }),
        }),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/grooming-settings"] });
      toast({ title: "Saved", description: "Tracked items settings updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Alternate Supply Tracking
        </CardTitle>
        <CardDescription>
          Enable an optional section to track items not listed in Supplies — such as pets, vehicles, or equipment.
          When active, a count card appears on the dashboard and the section shows in the store inventory view.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium text-sm">Enable Tracked Items</p>
            <p className="text-xs text-gray-500 mt-0.5">Show this section in the inventory and dashboard</p>
          </div>
          <button
            onClick={() => setEnabled(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? "bg-brand-blue" : "bg-gray-300 dark:bg-gray-600"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {enabled && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Item Type Name</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue dark:bg-gray-800 dark:border-gray-600"
              placeholder="e.g. Pets, Vehicles, Equipment, Bikes"
              value={label}
              onChange={e => setLabel(e.target.value)}
              maxLength={40}
            />
            <p className="text-xs text-gray-500">
              This label is used everywhere — dashboard card, section header, and button text.
            </p>
          </div>
        )}

        <Button onClick={save} disabled={isSaving} className="w-full sm:w-auto">
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Loyalty Settings Panel Component
const FEATURE_DEFS = [
  { id: 'appointments',   permKey: 'canToggleAppointments',   label: 'Service Booking & Appointments', desc: 'Customers can book appointments online; staff schedules and service slots are managed here.',  proOnly: false },
  { id: 'boarding',       permKey: 'canToggleBoarding',       label: 'Boarding & Check-In',            desc: 'Track overnight boarders, check-in/check-out, and occupancy records.',                        proOnly: false },
  { id: 'hiring',         permKey: 'canToggleHiring',         label: 'Job Application Portal',         desc: 'Accept and manage staff applications directly through your store page.',                     proOnly: false },
  { id: 'onlineStore',    permKey: 'canToggleOnlineStore',    label: 'Online Storefront',              desc: 'Customers can browse products, add to cart, and place orders online.',                       proOnly: true  },
  { id: 'loyalty',        permKey: 'canToggleLoyalty',        label: 'Loyalty & Rewards Program',      desc: 'Points system, purchase tracking, and customer rewards.',                                   proOnly: true  },
  { id: 'emailMarketing', permKey: 'canToggleEmailMarketing', label: 'Email Marketing',                desc: 'Send campaigns, automated reminders, and promotional emails to customers.',                  proOnly: true  },
  { id: 'pets',           permKey: 'canTogglePets',           label: 'Pet Profiles',                   desc: 'Customers can add pets to their profile. Best for groomers, vet clinics, and pet stores.',  proOnly: true  },
];

function FeaturesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: authUser } = useQuery<any>({ queryKey: ['/api/auth/user'] });
  const { data: tenantInfo, isLoading } = useQuery<{ enabledFeatures?: Record<string, any>; subscriptionTier?: string }>({
    queryKey: ['/api/tenants/current'],
  });
  const { data: myPerms } = useQuery<Record<string, boolean>>({
    queryKey: ['/api/employee/my-permissions'],
    enabled: !!authUser?.isEmployee,
    staleTime: 60_000,
  });

  // Superior managers (owners) see and can toggle everything.
  // Regular admins only see rows they've been explicitly granted permission for.
  const isOwner = !!authUser?.isSuperiorManager;
  const isPro = tenantInfo?.subscriptionTier === 'pro' || tenantInfo?.subscriptionTier === 'enterprise';
  const canToggle = (permKey: string) => isOwner || !!myPerms?.[permKey];

  // Owners see all rows (including Pro-locked ones so they know what's available).
  // Regular admins only see rows they've been granted permission for, and never see Pro-locked rows they can't use.
  const visibleFeatures = FEATURE_DEFS.filter(f => {
    if (!canToggle(f.permKey)) return false;
    // Non-owners never see Pro-only rows (no point — they can't toggle them anyway)
    if (f.proOnly && !isOwner) return false;
    return true;
  });

  const features: Record<string, any> = tenantInfo?.enabledFeatures ?? {};
  const isOn = (id: string) => features[id] !== false;

  const saveMutation = useMutation({
    mutationFn: async (update: Record<string, boolean>) =>
      apiRequest('PATCH', '/api/tenants/features', update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants/current'] });
      toast({ title: 'Features updated' });
    },
    onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
  });

  const toggle = (id: string) => {
    if (!isPro) return; // shouldn't be reachable for proOnly features, but guard anyway
    saveMutation.mutate({ [id]: !isOn(id) });
  };

  if (!isLoading && visibleFeatures.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Features
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Turn store features on or off. Changes take effect immediately.
          {!isOwner && <span className="block mt-0.5 text-xs text-amber-600">You can only toggle features the owner has granted you access to.</span>}
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          visibleFeatures.map(({ id, label, desc, proOnly }) => {
            const locked = proOnly && !isPro;
            return (
              <div key={id} className={`flex items-start justify-between gap-4 py-3 border-b last:border-0 ${locked ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    {proOnly && (
                      <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200 leading-none">
                        <Zap className="w-2.5 h-2.5" />PRO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  {locked && (
                    <p className="text-xs text-amber-600 mt-1 font-medium">
                      Upgrade to Pro to enable this feature.
                    </p>
                  )}
                </div>
                <Switch
                  checked={locked ? false : isOn(id)}
                  onCheckedChange={() => !locked && toggle(id)}
                  disabled={saveMutation.isPending || locked}
                  className="mt-0.5 flex-shrink-0"
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PayPeriodCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: tenantInfo } = useQuery<{ enabledFeatures?: any }>({ queryKey: ['/api/tenants/current'] });
  const payPeriodStartDay: number = (tenantInfo?.enabledFeatures as any)?.payPeriodStartDay ?? 3;
  const DAY_OPTIONS = [
    { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
  ];

  const mutation = useMutation({
    mutationFn: async (startDay: number) => {
      const current = (tenantInfo?.enabledFeatures as any) ?? {};
      return apiRequest('PUT', '/api/admin/settings/features', { ...current, payPeriodStartDay: startDay });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenants/current'] });
      toast({ title: 'Pay period start day updated' });
    },
    onError: (e: any) => toast({ title: 'Failed to save', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Pay Period Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium">Pay period starts on</p>
            <p className="text-xs text-muted-foreground">The employee schedule week begins on this day (e.g. Wednesday–Tuesday)</p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {DAY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => mutation.mutate(opt.value)}
                disabled={mutation.isPending}
                className={`px-3 py-1.5 text-sm rounded border transition-colors ${payPeriodStartDay === opt.value ? 'bg-green-600 text-white border-green-600' : 'bg-background border-input hover:bg-muted'}`}
              >
                {opt.label.slice(0,3)}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoyaltySettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [spendingThreshold, setSpendingThreshold] = useState<string>("250");
  const [rewardAmount, setRewardAmount] = useState<string>("20");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);

  const { data: loyaltySettings, isLoading } = useQuery<{
    spendingThreshold: string;
    rewardAmount: string;
    isActive: boolean;
  }>({
    queryKey: ['/api/loyalty-settings'],
  });

  useEffect(() => {
    if (loyaltySettings) {
      setSpendingThreshold(loyaltySettings.spendingThreshold);
      setRewardAmount(loyaltySettings.rewardAmount);
      setIsActive(loyaltySettings.isActive);
    }
  }, [loyaltySettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/loyalty-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ spendingThreshold, rewardAmount, isActive }),
      });
      
      if (!response.ok) throw new Error('Failed to save loyalty settings');
      
      queryClient.invalidateQueries({ queryKey: ['/api/loyalty-settings'] });
      toast({
        title: "Settings saved",
        description: `Loyalty: Spend $${spendingThreshold} → Get $${rewardAmount} credit`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save loyalty settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-500" />
          Loyalty Program Settings
        </CardTitle>
        <CardDescription>Configure customer loyalty rewards program</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            <span className="font-medium">Loyalty Program Active</span>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={isLoading}
          />
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="spending-threshold">Spending Threshold ($)</Label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-500">$</span>
              <Input
                id="spending-threshold"
                type="number"
                min="1"
                step="1"
                value={spendingThreshold}
                onChange={(e) => setSpendingThreshold(e.target.value)}
                className="w-32"
                disabled={isLoading}
              />
            </div>
            <p className="text-sm text-gray-500">Amount customers need to spend to earn a reward</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reward-amount">Reward Amount ($)</Label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-500">$</span>
              <Input
                id="reward-amount"
                type="number"
                min="1"
                step="1"
                value={rewardAmount}
                onChange={(e) => setRewardAmount(e.target.value)}
                className="w-32"
                disabled={isLoading}
              />
            </div>
            <p className="text-sm text-gray-500">Credit amount customers receive when they reach the threshold</p>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm">
            <strong>Current Program:</strong> Customers earn <span className="text-amber-600 font-bold">${rewardAmount}</span> credit 
            for every <span className="text-green-600 font-bold">${spendingThreshold}</span> spent in the app.
          </p>
        </div>
        
        <Button 
          onClick={handleSave} 
          disabled={isSaving || isLoading}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isSaving ? 'Saving...' : 'Save Loyalty Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}

// Legal Pages Panel Component
function LegalPagesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const pendingContent = useRef('');

  const LEGAL_PAGES = [
    { slug: 'privacy-policy', label: 'Privacy Policy' },
    { slug: 'terms-of-service', label: 'Terms of Service' },
  ];

  const { data: pages = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/legal-pages'],
  });

  const loadPage = async (slug: string) => {
    try {
      setShowHtml(false);
      const res = await fetch(`/api/legal/${slug}`, { credentials: 'include' });
      const pageConfig = LEGAL_PAGES.find(p => p.slug === slug);
      if (res.ok) {
        const data = await res.json();
        setEditTitle(data.title);
        setEditContent(data.content);
        pendingContent.current = data.content;
      } else {
        setEditTitle(pageConfig?.label || slug);
        setEditContent('');
        pendingContent.current = '';
      }
      setEditingSlug(slug);
    } catch (error) {
      console.error('Error loading page:', error);
    }
  };

  const savePage = async () => {
    if (!editingSlug) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/legal/${editingSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      if (!res.ok) throw new Error('Failed to save');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/legal-pages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/legal', editingSlug] });
      toast({ title: 'Saved', description: `${editTitle} has been updated.` });
      setEditingSlug(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save page.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const getPageData = (slug: string) => pages.find((p: any) => p.slug === slug);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showHtml, setShowHtml] = useState(false);
  const editContentRef = useRef(editContent);
  editContentRef.current = editContent;

  const getIframeDoc = useCallback(() => {
    return iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document || null;
  }, []);

  const syncFromIframe = useCallback(() => {
    const doc = getIframeDoc();
    if (doc?.body) {
      setEditContent(doc.body.innerHTML);
    }
  }, [getIframeDoc]);

  const handleIframeLoad = useCallback(() => {
    const doc = getIframeDoc();
    if (!doc) return;
    doc.designMode = 'on';
    doc.body.innerHTML = editContentRef.current;
    doc.body.addEventListener('input', syncFromIframe);
    doc.body.addEventListener('keyup', syncFromIframe);
  }, [getIframeDoc, syncFromIframe]);

  const execCmd = useCallback((command: string, value?: string) => {
    const doc = getIframeDoc();
    if (doc) {
      doc.execCommand(command, false, value);
      syncFromIframe();
    }
  }, [getIframeDoc, syncFromIframe]);

  const insertLink = useCallback(() => {
    const url = prompt('Enter the URL:');
    if (url) {
      execCmd('createLink', url);
    }
  }, [execCmd]);

  if (editingSlug) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingSlug(null)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <CardTitle className="text-base">Edit {editTitle}</CardTitle>
              <CardDescription>Edit your page content directly below</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="page-title">Page Title</Label>
            <Input
              id="page-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Page title"
            />
          </div>
          <div>
            <Label className="mb-2 block">Content</Label>
            <div className="border rounded-lg overflow-hidden">
              <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-100 dark:bg-gray-800 border-b">
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 font-bold" onClick={() => execCmd('bold')} title="Bold">
                  B
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 italic" onClick={() => execCmd('italic')} title="Italic">
                  I
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 underline" onClick={() => execCmd('underline')} title="Underline">
                  U
                </Button>
                <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => execCmd('formatBlock', 'h2')} title="Heading">
                  H2
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => execCmd('formatBlock', 'h3')} title="Subheading">
                  H3
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => execCmd('formatBlock', 'p')} title="Paragraph">
                  P
                </Button>
                <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => execCmd('insertUnorderedList')} title="Bullet List">
                  • List
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => execCmd('insertOrderedList')} title="Numbered List">
                  1. List
                </Button>
                <span className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={insertLink} title="Insert Link">
                  Link
                </Button>
                <div className="ml-auto">
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => setShowHtml(!showHtml)}>
                    {showHtml ? 'Visual' : 'HTML'}
                  </Button>
                </div>
              </div>
              {showHtml ? (
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[400px] font-mono text-xs border-0 rounded-none focus-visible:ring-0"
                  placeholder="HTML content..."
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  onLoad={handleIframeLoad}
                  srcDoc={`<!DOCTYPE html><html><head><style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; padding: 16px; margin: 0; color: #333; }
                    h2 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
                    h3 { font-size: 1.1em; font-weight: 600; margin: 1em 0 0.5em; }
                    p { margin: 0.5em 0; }
                    ul, ol { padding-left: 1.5em; }
                    a { color: #2563eb; }
                  </style></head><body></body></html>`}
                  className="w-full border-0 bg-white"
                  style={{ minHeight: '400px' }}
                  title="Page editor"
                />
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditingSlug(null)}>Cancel</Button>
            <Button onClick={savePage} disabled={isSaving} className="bg-brand-blue hover:bg-blue-700">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="w-5 h-5" />
          Legal Pages
        </CardTitle>
        <CardDescription>Edit your Privacy Policy and Terms of Service</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {LEGAL_PAGES.map(({ slug, label }) => {
          const pageData = getPageData(slug);
          return (
            <div key={slug} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium text-sm">{label}</p>
                {pageData ? (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(pageData.updatedAt).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">Using default content — click Edit to customize</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/${slug}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4 mr-1" /> View
                  </a>
                </Button>
                <Button size="sm" onClick={() => loadPage(slug)} className="bg-brand-blue hover:bg-blue-700">
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ApplicationsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: applications = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/job-applications'],
  });

  const { data: hiringData } = useQuery<{ open: boolean }>({
    queryKey: ['/api/settings/hiring-open'],
  });
  const hiringOpen = hiringData?.open ?? true;

  const toggleHiringMutation = useMutation({
    mutationFn: async (open: boolean) => {
      const res = await apiRequest("POST", "/api/admin/settings/hiring-open", { open });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/hiring-open'] });
      toast({ title: data.open ? "Applications are now OPEN" : "Applications are now CLOSED" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update hiring status", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/job-applications/${id}`, { status, adminNotes: notes });
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/job-applications'] });
      setSelectedApp(updated);
      toast({ title: "Application updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update application", variant: "destructive" }),
  });

  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
    reviewed: "bg-blue-100 text-blue-800 border-blue-300",
    interview: "bg-purple-100 text-purple-800 border-purple-300",
    hired: "bg-green-100 text-green-800 border-green-300",
    rejected: "bg-red-100 text-red-800 border-red-300",
  };

  const filtered = statusFilter === "all" ? applications : applications.filter((a: any) => a.status === statusFilter);

  const formatDate = (ts: string) => ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  if (selectedApp) {
    const app = selectedApp;
    const empHistory: any[] = app.employmentHistory || [];
    const refs: any[] = app.references || [];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelectedApp(null)}>
            ← Back to Applications
          </Button>
          <h2 className="text-lg font-bold">{app.firstName} {app.lastName}</h2>
          <Badge className={`border ${STATUS_COLORS[app.status] || 'bg-gray-100'}`}>{app.status}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Personal */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Personal Information</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><span className="font-medium">Name:</span> {app.firstName} {app.middleName} {app.lastName}</p>
              <p><span className="font-medium">Address:</span> {app.address}, {app.city}, {app.state} {app.zip}</p>
              <p><span className="font-medium">Phone:</span> {app.phone}</p>
              {app.email && <p><span className="font-medium">Email:</span> {app.email}</p>}
              <p><span className="font-medium">18+:</span> {app.isOver18 ? "Yes" : "No"}</p>
              <p><span className="font-medium">Veteran:</span> {app.isVeteran ? "Yes" : "No"}</p>
              <p><span className="font-medium">Eligible to work in US:</span> {app.eligibleToWork ? "Yes" : "No"}</p>
              {app.convictedOfFelony && (
                <p><span className="font-medium text-red-600">Felony:</span> {app.felonyDetails || "Yes (no details)"}</p>
              )}
            </CardContent>
          </Card>

          {/* Position */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Position Desired</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><span className="font-medium">Position:</span> {app.positionApplied}</p>
              <p><span className="font-medium">Date Available:</span> {app.dateAvailable}</p>
              <p><span className="font-medium">Desired Pay:</span> {app.desiredPay || "—"}</p>
              <p><span className="font-medium">Employment Type:</span> {app.employmentType}</p>
              {app.workedHereBefore && <p><span className="font-medium">Previous Employee:</span> {app.workedHereBeforeDetails || "Yes"}</p>}
              {(app.availabilityDays || []).length > 0 && (
                <p><span className="font-medium">Available:</span> {app.availabilityDays.join(', ')}</p>
              )}
              {app.availabilityNotes && <p><span className="font-medium">Hours:</span> {app.availabilityNotes}</p>}
            </CardContent>
          </Card>

          {/* Education */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Education</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {app.highSchoolName ? (
                <div>
                  <p className="font-medium text-xs text-gray-500 uppercase">High School</p>
                  <p>{app.highSchoolName}{app.highSchoolCity ? `, ${app.highSchoolCity}` : ''}</p>
                  {app.highSchoolDegree && <p>{app.highSchoolDegree} {app.highSchoolGraduated ? "(Graduated)" : ""}</p>}
                </div>
              ) : <p className="text-gray-400">No high school listed</p>}
              {app.collegeName && (
                <div>
                  <p className="font-medium text-xs text-gray-500 uppercase mt-2">College / Vocational</p>
                  <p>{app.collegeName}{app.collegeCity ? `, ${app.collegeCity}` : ''}</p>
                  {app.collegeDegree && <p>{app.collegeDegree} {app.collegeGraduated ? "(Graduated)" : ""}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Notes & Status */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Admin Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                <Select defaultValue={app.status} onValueChange={(val) => {
                  updateStatusMutation.mutate({ id: app.id, status: val, notes: adminNotes || app.adminNotes || "" });
                }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="interview">Interview Scheduled</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Admin Notes</label>
                <Textarea
                  className="text-sm"
                  rows={4}
                  defaultValue={app.adminNotes || ""}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Internal notes..."
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={updateStatusMutation.isPending}
                onClick={() => updateStatusMutation.mutate({ id: app.id, status: app.status, notes: adminNotes })}
              >
                Save Notes
              </Button>
              <p className="text-xs text-gray-400">Submitted: {formatDate(app.submittedAt)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Employment History */}
        {empHistory.some(e => e.employer) && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Employment History</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {empHistory.filter(e => e.employer).map((e: any, i: number) => (
                <div key={i} className="text-sm border-b last:border-0 pb-3 last:pb-0">
                  <p className="font-semibold">{e.employer} — {e.position}</p>
                  <p className="text-gray-600">{e.address} | {e.phone}</p>
                  <p className="text-gray-600">Supervisor: {e.supervisor}</p>
                  <p className="text-gray-600">{e.startDate} – {e.endDate} | Start: {e.startingSalary} → End: {e.endingSalary}</p>
                  <p><span className="font-medium">Reason for Leaving:</span> {e.reasonForLeaving}</p>
                  <p className="text-xs text-gray-500">May contact: {e.mayWeContact ? "Yes" : "No"}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* References */}
        {refs.some(r => r.name) && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">References</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {refs.filter(r => r.name).map((r: any, i: number) => (
                  <div key={i} className="text-sm border rounded p-2">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-gray-600">{r.relationship}</p>
                    <p className="text-gray-600">{r.phone}</p>
                    <p className="text-gray-500 text-xs">{r.address}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Info */}
        {app.additionalInfo && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Additional Information</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{app.additionalInfo}</p></CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Job Applications ({applications.length})
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-gray-600">Applications</span>
              <button
                onClick={() => toggleHiringMutation.mutate(!hiringOpen)}
                disabled={toggleHiringMutation.isPending}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${hiringOpen ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${hiringOpen ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
              <span className={`text-xs font-bold ${hiringOpen ? 'text-green-600' : 'text-gray-400'}`}>
                {hiringOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="interview">Interview</SelectItem>
                <SelectItem value="hired">Hired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Toggle the switch to open or close applications. When closed, the "Now Hiring" banner is hidden and the apply page shows a message.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading applications...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{statusFilter === "all" ? "No applications submitted yet" : `No ${statusFilter} applications`}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((app: any) => (
              <div
                key={app.id}
                className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer flex items-start justify-between gap-3"
                onClick={() => { setSelectedApp(app); setAdminNotes(app.adminNotes || ""); }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{app.firstName} {app.lastName}</p>
                    <Badge className={`text-xs border ${STATUS_COLORS[app.status] || 'bg-gray-100'}`}>
                      {app.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{app.positionApplied} · {app.employmentType}</p>
                  <p className="text-xs text-gray-500">{app.phone}{app.email ? ` · ${app.email}` : ''}</p>
                  <p className="text-xs text-gray-400">Submitted {formatDate(app.submittedAt)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackPanel() {
  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/feedback'],
  });

  const avgRating = entries.length
    ? (entries.reduce((sum: number, e: any) => sum + e.rating, 0) / entries.length).toFixed(1)
    : null;

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: entries.filter((e: any) => e.rating === star).length,
  }));

  const categoryLabel: Record<string, string> = {
    general: 'General',
    app: 'App Experience',
    products: 'Products',
    grooming: 'Grooming',
    ordering: 'Ordering',
    staff: 'Staff',
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Customer Feedback
            {entries.length > 0 && (
              <Badge variant="secondary">{entries.length} response{entries.length !== 1 ? 's' : ''}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading feedback...</p>
          ) : entries.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No feedback yet</p>
              <p className="text-sm mt-1">Feedback submitted by customers will appear here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary row */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-amber-500">{avgRating}</p>
                  <div className="flex justify-center gap-0.5 my-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${s <= Math.round(parseFloat(avgRating!)) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">Average rating</p>
                </div>
                <div className="flex-[2] space-y-1.5">
                  {ratingCounts.map(({ star, count }) => (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-right text-gray-500">{star}</span>
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 bg-amber-400 rounded-full transition-all"
                          style={{ width: entries.length ? `${(count / entries.length) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="w-6 text-xs text-gray-500">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Individual entries */}
              <div className="space-y-3">
                {entries.map((entry: any) => (
                  <div key={entry.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${s <= entry.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.category && (
                          <Badge variant="secondary" className="text-xs">
                            {categoryLabel[entry.category] ?? entry.category}
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    {entry.message && (
                      <p className="text-sm text-gray-700 leading-relaxed">{entry.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Astro Loyalty Manager Component
function AstroLoyaltyManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<any>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const { data: astroCustomers = [], isLoading } = useQuery({
    queryKey: ['/api/admin/astro/customers'],
    enabled: true
  });

  const { data: astroOffers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/astro/offers'],
    enabled: !!connectionResult?.success
  });

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const response = await fetch('/api/admin/astro/test-connection', {
        credentials: 'include'
      });
      const result = await response.json();
      setConnectionResult(result);
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/astro/offers'] });
        toast({ title: "Connected!", description: "Astro Loyalty API is working" });
      } else {
        toast({ title: "Connection failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      setConnectionResult({ success: false, message: "Network error" });
      toast({ title: "Connection test failed", description: "Failed to test Astro connection", variant: "destructive" });
    } finally {
      setIsTestingConnection(false);
    }
  };

  useEffect(() => {
    const autoTest = async () => {
      try {
        const response = await fetch('/api/admin/astro/test-connection', { credentials: 'include' });
        const result = await response.json();
        setConnectionResult(result);
      } catch {}
    };
    autoTest();
  }, []);

  const [isFixingRewards, setIsFixingRewards] = useState(false);

  const fixUnredeemedRewards = async () => {
    setIsFixingRewards(true);
    toast({ title: "Processing...", description: "Scanning orders and contacting Astro API. This may take a minute..." });
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('/api/admin/astro/fix-unredeemed-rewards', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const result = await response.json();
      if (result.fixedRewards?.length > 0) {
        const redeemed = result.fixedRewards.filter((r: any) => 
          r.status === 'redeemed_now' || r.status === 'redeemed_directly').length;
        const alreadyDone = result.fixedRewards.filter((r: any) => 
          r.status === 'already_redeemed_or_not_found' || r.status === 'already_redeemed').length;
        const failed = result.fixedRewards.filter((r: any) => 
          r.status === 'redemption_failed' || r.status === 'direct_redemption_failed').length;
        let desc = `${redeemed} reward(s) redeemed, ${alreadyDone} already handled`;
        if (failed > 0) desc += `, ${failed} failed`;
        toast({ 
          title: redeemed > 0 ? "Rewards Fixed" : failed > 0 ? "Fix Had Issues" : "Rewards Already Handled", 
          description: desc,
          variant: failed > 0 ? "destructive" : "default"
        });
      } else {
        toast({ title: "No Fix Needed", description: "No unredeemed rewards found on completed orders" });
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        toast({ title: "Still Processing", description: "The fix is still running on the server. Check logs for results.", variant: "default" });
      } else {
        toast({ title: "Fix Failed", description: "Could not fix unredeemed rewards", variant: "destructive" });
      }
    } finally {
      setIsFixingRewards(false);
    }
  };

  const [isRecalculating, setIsRecalculating] = useState(false);

  const recalculateLoyalty = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch('/api/admin/recalculate-loyalty', {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();
      if (result.results?.length > 0) {
        const changed = result.results.filter((r: any) => r.changed);
        if (changed.length > 0) {
          const details = changed.map((r: any) => `${r.name}: $${r.oldTotalSpent} → $${r.newTotalSpent}`).join(', ');
          toast({ title: "Loyalty Recalculated", description: `Updated ${changed.length} user(s): ${details}` });
        } else {
          toast({ title: "All Correct", description: "All loyalty totals are already accurate" });
        }
      } else {
        toast({ title: "No Data", description: "No completed orders found to recalculate" });
      }
    } catch (error) {
      toast({ title: "Recalculation Failed", description: "Could not recalculate loyalty totals", variant: "destructive" });
    } finally {
      setIsRecalculating(false);
    }
  };

  const isConnected = connectionResult?.success === true;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Astro Loyalty Integration
            {isConnected && (
              <Badge className="bg-green-600 ml-2">Connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isConnected
              ? "Astro Loyalty is active and syncing customer purchases and rewards"
              : "Manage customer loyalty program integration with Astro"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-green-800 dark:text-green-300 mb-1">Integration Active</p>
                  <p className="text-green-700 dark:text-green-400">{connectionResult.message}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Not Connected</p>
                  <div className="space-y-2 text-amber-700 dark:text-amber-400">
                    <p>Required environment variables:</p>
                    <ul className="list-disc list-inside ml-2 space-y-0.5">
                      <li><code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded text-xs">ASTRO_USERNAME</code></li>
                      <li><code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded text-xs">ASTRO_PASSWORD</code></li>
                      <li><code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded text-xs">ASTRO_CLIENT_ID</code></li>
                    </ul>
                    {connectionResult && !connectionResult.success && (
                      <p className="text-red-600 dark:text-red-400 mt-2">{connectionResult.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={testConnection}
              disabled={isTestingConnection}
              variant={isConnected ? "outline" : "default"}
              className={isConnected ? "" : "bg-brand-blue hover:bg-blue-600"}
              data-testid="button-test-astro-connection"
            >
              {isTestingConnection ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" />{isConnected ? 'Re-test Connection' : 'Test Connection'}</>
              )}
            </Button>
            {isConnected && (
              <Button
                onClick={fixUnredeemedRewards}
                disabled={isFixingRewards}
                variant="outline"
                className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap"
              >
                {isFixingRewards ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fixing...</>
                ) : (
                  <><Wrench className="w-4 h-4 mr-2" />Fix Unredeemed Rewards</>
                )}
              </Button>
            )}
            <Button
              onClick={recalculateLoyalty}
              disabled={isRecalculating}
              variant="outline"
              className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 whitespace-nowrap"
            >
              {isRecalculating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Recalculating...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" />Recalculate Loyalty</>
              )}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3">How It Works</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isConnected ? 'text-green-600' : 'text-gray-400'}`} />
                <span>Customers link their account from their Profile page</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isConnected ? 'text-green-600' : 'text-gray-400'}`} />
                <span>Purchases automatically sync to Astro using product UPC codes</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isConnected ? 'text-green-600' : 'text-gray-400'}`} />
                <span>Frequent buyer programs track progress toward free items</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isConnected ? 'text-green-600' : 'text-gray-400'}`} />
                <span>Customers view and redeem rewards from their Profile</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {isConnected && astroOffers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Active Programs & Offers ({astroOffers.length})
            </CardTitle>
            <CardDescription>
              Current manufacturer programs your store is enrolled in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {astroOffers.map((offer: any) => (
                <div key={offer.programId} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{offer.title}</p>
                      <p className="text-xs text-gray-500">{offer.manufacturer}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {offer.inStoreOnly ? 'In-Store Only' : 'Online & In-Store'}
                    </Badge>
                  </div>
                  {offer.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{offer.description}</p>
                  )}
                  {(offer.startDate || offer.endDate) && (
                    <div className="flex gap-4 text-xs text-gray-500 mt-2">
                      {offer.startDate && !isNaN(new Date(offer.startDate).getTime()) && (
                        <span>Starts: {new Date(offer.startDate).toLocaleDateString()}</span>
                      )}
                      {offer.endDate && !isNaN(new Date(offer.endDate).getTime()) && (
                        <span>Ends: {new Date(offer.endDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Linked Customers ({astroCustomers.length})
          </CardTitle>
          <CardDescription>
            Customers who have linked their accounts to Astro Loyalty
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : astroCustomers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No customers have linked their accounts yet</p>
              <p className="text-sm mt-1">Customers can link their accounts from their profile page</p>
            </div>
          ) : (
            <div className="space-y-4">
              {astroCustomers.map((customer: any) => (
                <div 
                  key={customer.id}
                  className="border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => setExpandedCustomer(expandedCustomer === customer.astroCustomerId ? null : customer.astroCustomerId)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{customer.userName}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{customer.email}</p>
                    </div>
                    <Badge 
                      variant={customer.syncStatus === 'synced' ? 'default' : 'secondary'}
                      className={customer.syncStatus === 'synced' ? 'bg-green-600' : ''}
                    >
                      {customer.syncStatus}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Last Synced</p>
                      <p className="font-semibold">
                        {customer.lastSyncedAt 
                          ? new Date(customer.lastSyncedAt).toLocaleDateString()
                          : 'Never'
                        }
                      </p>
                    </div>
                  </div>

                  {customer.phoneNumber && (
                    <div className="text-sm">
                      <p className="text-gray-600 dark:text-gray-400">Phone</p>
                      <p className="font-semibold">{customer.phoneNumber}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function InvoiceScanDialog({ open, onClose, onEditSupply }: {
  open: boolean;
  onClose: () => void;
  onEditSupply: (supply: any) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [matched, setMatched] = useState<any[]>([]);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [invoiceAddUpc, setInvoiceAddUpc] = useState<string | null>(null);
  const [editedIds, setEditedIds] = useState<Set<number>>(new Set());

  const invoiceCreateSupplyMutation = useMutation({
    mutationFn: async (supplyData: any) => {
      const response = await apiRequest("POST", "/api/supplies", supplyData);
      return response.json();
    },
    onSuccess: (createdSupply) => {
      toast({ title: "Supply Added", description: "Product added to your system." });
      setUnmatched(prev => prev.filter(u => u.upc !== invoiceAddUpc));
      setInvoiceAddUpc(null);
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
      if (createdSupply?.id) setTimeout(() => onEditSupply(createdSupply), 300);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add supply.", variant: "destructive" });
    },
  });

  function reset() {
    setScanning(false);
    setLoadingId(null);
    setMatched([]);
    setUnmatched([]);
    setPreviewUrl(null);
    setEditedIds(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    if (!file) return;
    setMatched([]);
    setUnmatched([]);
    setScanning(true);

    try {
      let base64: string;

      if (file.type === 'application/pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const PAGE_SCALE = 2.5;
        const pageCanvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: PAGE_SCALE });
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = viewport.width;
          pageCanvas.height = viewport.height;
          await page.render({ canvasContext: pageCanvas.getContext('2d')!, viewport }).promise;
          pageCanvases.push(pageCanvas);
        }
        const totalWidth = Math.max(...pageCanvases.map(c => c.width));
        const totalHeight = pageCanvases.reduce((sum, c) => sum + c.height, 0);
        const stitched = document.createElement('canvas');
        stitched.width = totalWidth;
        stitched.height = totalHeight;
        const ctx = stitched.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalWidth, totalHeight);
        let y = 0;
        for (const pc of pageCanvases) { ctx.drawImage(pc, 0, y); y += pc.height; }
        const MAX = 4096;
        let w = stitched.width, h = stitched.height;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
          const scaled = document.createElement('canvas');
          scaled.width = w; scaled.height = h;
          scaled.getContext('2d')!.drawImage(stitched, 0, 0, w, h);
          base64 = scaled.toDataURL('image/jpeg', 0.92).split(',')[1];
        } else {
          base64 = stitched.toDataURL('image/jpeg', 0.92).split(',')[1];
        }
        setPreviewUrl('data:image/jpeg;base64,' + base64);
      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const img = new window.Image();
          const objectUrl = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const MAX = 2048;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
              if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
              else { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.88).split(',')[1]);
          };
          img.onerror = reject;
          img.src = objectUrl;
        });
        setPreviewUrl(URL.createObjectURL(file));
      }

      const res = await apiRequest('POST', '/api/admin/invoice-scan', { imageBase64: base64, mimeType: 'image/jpeg' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Scan failed');

      setMatched(data.matched || []);
      setUnmatched(data.unmatched || []);

      if ((data.matched || []).length === 0) {
        toast({ title: "No matches found", description: "No UPC codes in this invoice matched products in your inventory.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message || "Could not read invoice", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }

  async function handleEdit(supplyId: number) {
    setLoadingId(supplyId);
    try {
      const res = await fetch(`/api/supplies/${supplyId}`);
      const supply = await res.json();
      if (!res.ok) throw new Error(supply.message || 'Could not load product');
      setEditedIds(prev => new Set(prev).add(supplyId));
      onEditSupply(supply);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  }

  // Badge config per match type
  function getMatchBadge(m: any) {
    if (m.corrected) return { label: 'UPC Corrected', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' };
    if (m.matchedBy === 'possible') return { label: 'Possible Match', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
    if (m.matchedBy === 'description') return { label: 'Description Match', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' };
    return { label: 'UPC Match', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Invoice Scanner
          </DialogTitle>
          <DialogDescription>
            Upload a photo of your invoice. It finds the matching products — click Edit on each one to update stock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-5 text-center cursor-pointer hover:border-brand-blue transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {previewUrl ? (
              <img src={previewUrl} alt="Invoice" className="max-h-32 mx-auto rounded object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Upload className="w-9 h-9" />
                <p className="font-medium">Click or drag an invoice photo or PDF here</p>
                <p className="text-xs">Supports photos and PDF files</p>
              </div>
            )}
          </div>

          {scanning && (
            <div className="flex flex-col items-center justify-center gap-2 py-5 text-gray-500">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Reading invoice UPC codes...</span>
              </div>
              <span className="text-xs text-gray-400">Scanning twice for full coverage — may take 30–60 seconds</span>
            </div>
          )}

          {/* Matched products */}
          {!scanning && matched.length > 0 && (
            <div className="space-y-3">
              <p className="font-semibold text-sm">
                {matched.length} product{matched.length !== 1 ? 's' : ''} found
                {unmatched.length > 0 && <span className="text-gray-400 font-normal ml-2">· {unmatched.length} need manual entry</span>}
              </p>

              <div className="rounded-md border divide-y divide-gray-100 dark:divide-gray-700">
                {matched.map((m) => {
                  const badge = getMatchBadge(m);
                  const isEdited = editedIds.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`px-3 py-3 transition-colors ${isEdited ? 'bg-green-50/60 dark:bg-green-900/10' : m.matchedBy === 'possible' ? 'bg-amber-50/50 dark:bg-amber-900/10' : m.matchedBy === 'description' ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}
                    >
                      {/* Badge + Edit button */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                          {isEdited && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-700 dark:text-green-400">
                              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="6" fill="currentColor" opacity="0.15"/><path d="M3.5 6.5l1.8 1.8 3.2-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Edited
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-6 text-xs px-2 ${isEdited ? 'border-green-400 text-green-700 dark:border-green-600 dark:text-green-400' : ''}`}
                          disabled={loadingId === m.id}
                          onClick={() => handleEdit(m.id)}
                        >
                          {loadingId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit className="w-3 h-3 mr-1" />}
                          {isEdited ? 'Edit Again' : 'Edit'}
                        </Button>
                      </div>

                      {/* Invoice text → matched product */}
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Invoice says</p>
                          <p className="text-sm font-medium leading-tight text-gray-700 dark:text-gray-200">{m.description || '—'}</p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5">qty: {m.invoiceQty} · current stock: {m.currentStock}</p>
                          <p className="text-[10px] font-mono text-gray-500 mt-0.5 select-all cursor-text">{m.upc}{m.scannedUpc ? ` (read: ${m.scannedUpc})` : ''}</p>
                        </div>
                        <div className="flex items-center justify-center pt-4 text-gray-300">→</div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Opens in system</p>
                          <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">{m.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{m.brand || ''}</p>
                        </div>
                      </div>
                      {m.matchedBy === 'possible' && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5">
                          ⚠ {m.ambiguousCount} products matched — verify this is correct before editing
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Needs manual entry */}
              {unmatched.length > 0 && (
                <div className="rounded-md border-2 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-600 dark:text-orange-400 text-base">⚠</span>
                    <p className="font-semibold text-sm text-orange-800 dark:text-orange-300">
                      {unmatched.length} item{unmatched.length !== 1 ? 's' : ''} need manual entry
                    </p>
                  </div>
                  <p className="text-xs text-orange-700 dark:text-orange-400">
                    These were on the invoice but couldn't be matched to any product in your system — handle them manually.
                  </p>
                  <div className="rounded-md border border-orange-200 dark:border-orange-700 divide-y divide-orange-100 dark:divide-orange-800 bg-white dark:bg-gray-900">
                    {unmatched.map((u, i) => (
                      <div key={i} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{u.description || 'Unknown item'}</p>
                            {u.validCheckDigit ? (
                              <p className="text-[10px] font-mono text-gray-400 mt-0.5">UPC: {u.upc}</p>
                            ) : (
                              <p className="text-[10px] font-mono text-red-500 mt-0.5">⚠ UPC could not be read reliably — enter manually</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">qty: {u.qty}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                              onClick={() => setInvoiceAddUpc(u.validCheckDigit ? u.upc : '')}
                            >
                              <Plus className="w-3 h-3 mr-0.5" />
                              Add to System
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1">
                          {u.validCheckDigit
                            ? "UPC not in your system — may be a new product you haven't added yet"
                            : 'UPC was unreadable — add this product manually and enter the correct UPC'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Supply dialog triggered from unmatched items */}
              <Dialog open={invoiceAddUpc !== null} onOpenChange={(o) => { if (!o) setInvoiceAddUpc(null); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Supply</DialogTitle>
                    <DialogDescription>{invoiceAddUpc ? 'UPC has been pre-filled from the invoice.' : 'UPC could not be read — enter the correct UPC manually.'}</DialogDescription>
                  </DialogHeader>
                  {invoiceAddUpc !== null && (
                    <AddSupplyForm
                      key={invoiceAddUpc || 'no-upc'}
                      initialUpc={invoiceAddUpc || ''}
                      onSubmit={(data) => invoiceCreateSupplyMutation.mutate(data)}
                    />
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>Close</Button>
          {previewUrl && !scanning && (
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Scan Another
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Super-admin helper: a single row for a user with no tenant, with an assign dropdown
function NoTenantUserRow({ user, tenants, onAssigned }: { user: any; tenants: any[]; onAssigned: () => void }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

  const handleAssign = async () => {
    if (!selectedTenantId) return;
    setIsPending(true);
    try {
      await apiRequest("PATCH", `/api/super-admin/users/${user.id}/tenant`, { tenantId: Number(selectedTenantId) });
      toast({ title: "Tenant assigned", description: `${user.firstName} ${user.lastName} is now linked to the selected store.` });
      onAssigned();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to assign tenant", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-white rounded-lg border border-amber-200">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{user.firstName} {user.lastName}</p>
        <p className="text-xs text-gray-500 truncate">{user.email}</p>
        <p className="text-xs text-gray-400">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Select store…" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t: any) => (
              <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                {t.name} (#{t.id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!selectedTenantId || isPending}
          onClick={handleAssign}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Assign"}
        </Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const typedUser = user as User;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Employee permissions — loaded when the logged-in user is an employee account
  const { data: employeePerms } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/employee/my-permissions"],
    enabled: !!typedUser?.isEmployee,
    staleTime: 60_000,
  });
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [isAddSupplyOpen, setIsAddSupplyOpen] = useState(false);
  const [isInvoiceScanOpen, setIsInvoiceScanOpen] = useState(false);
  const [priceAdjOpen, setPriceAdjOpen] = useState(false);
  const [priceAdjTarget, setPriceAdjTarget] = useState('all');
  const [priceAdjCategory, setPriceAdjCategory] = useState('');
  const [priceAdjDirection, setPriceAdjDirection] = useState('increase');
  const [priceAdjPercent, setPriceAdjPercent] = useState('');
  const [priceAdjRounding, setPriceAdjRounding] = useState('x9');
  const [priceAdjResult, setPriceAdjResult] = useState<{updatedCount: number; direction: string; percentage: number; target: string; rounding: string} | null>(null);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [newCatKey, setNewCatKey] = useState('');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [editingPet, setEditingPet] = useState<any>(null);
  const [petToDelete, setPetToDelete] = useState<any>(null);
  const [editingSupply, setEditingSupply] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [apptItemSearch, setApptItemSearch] = useState('');
  const [apptItemSearchResults, setApptItemSearchResults] = useState<any[]>([]);
  const [apptItemSearching, setApptItemSearching] = useState(false);
  const [showApptItemScanner, setShowApptItemScanner] = useState(false);
  const [apptItemQty, setApptItemQty] = useState<{[supplyId: number]: number}>({});
  const [isAddBoardingOpen, setIsAddBoardingOpen] = useState(false);
  const [showApprovedAppointments, setShowApprovedAppointments] = useState(false);
  const [showDeniedAppointments, setShowDeniedAppointments] = useState(false);
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState<any>(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedRefundItems, setSelectedRefundItems] = useState<{[key: number]: { quantity: number; amount: string }}>({}); 
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [includeConvenienceFee, setIncludeConvenienceFee] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editOrderModalOpen, setEditOrderModalOpen] = useState(false);
  const [editOrderItems, setEditOrderItems] = useState<any[]>([]);
  const [discountOrderId, setDiscountOrderId] = useState<number | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [editOrderSearchQuery, setEditOrderSearchQuery] = useState('');
  const [editOrderSearchResults, setEditOrderSearchResults] = useState<any[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [filterByHere, setFilterByHere] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [isCategorizing, setIsCategorizing] = useState(false);
  
  // Multi-pet editing state
  const [editPets, setEditPets] = useState<any[]>([]);
  const [editPricingMode, setEditPricingMode] = useState<'individual' | 'override'>('individual');
  const [editTotalPriceOverride, setEditTotalPriceOverride] = useState('');
  const [editApptScannerCb, setEditApptScannerCb] = useState<((upc: string) => void) | null>(null);

  // Legacy single-pet editing state (kept for backward compatibility)
  const [editNotes, setEditNotes] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editOwnerFirstName, setEditOwnerFirstName] = useState('');
  const [editOwnerLastName, setEditOwnerLastName] = useState('');
  const [editOwnerPhone, setEditOwnerPhone] = useState('');
  const [editPetName, setEditPetName] = useState('');
  const [editPetType, setEditPetType] = useState('');
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editTime, setEditTime] = useState('');
  const [editGroomerId, setEditGroomerId] = useState<number | null>(null);
  const [editServiceType, setEditServiceType] = useState('');
  
  // Pagination for approved appointments
  const [approvedAppointmentsPage, setApprovedAppointmentsPage] = useState(0);
  const [approvedTouchStart, setApprovedTouchStart] = useState(0);
  const [approvedTouchEnd, setApprovedTouchEnd] = useState(0);
  
  // Pagination for denied appointments
  const [deniedAppointmentsPage, setDeniedAppointmentsPage] = useState(0);
  const [deniedTouchStart, setDeniedTouchStart] = useState(0);
  const [deniedTouchEnd, setDeniedTouchEnd] = useState(0);
  
  // Orders section collapsible states
  const [showInProgressOrders, setShowInProgressOrders] = useState(false);
  const [showReadyOrders, setShowReadyOrders] = useState(false);
  const [showCompletedOrders, setShowCompletedOrders] = useState(false);
  const [showGroomingPayments, setShowGroomingPayments] = useState(false);
  const [showCancelledOrders, setShowCancelledOrders] = useState(false);
  
  // Search state for orders and appointments
  const [search, setSearch] = useState('');
  
  // Pagination and search for supplies
  const [supplySearchQuery, setSupplySearchQuery] = useState('');
  const [supplyCategoryFilter, setSupplyCategoryFilter] = useState('');
  const [suppliesPage, setSuppliesPage] = useState(0);
  const [showAdminScanner, setShowAdminScanner] = useState(false);
  const [scannerAddUpc, setScannerAddUpc] = useState<string | null>(null);
  const SUPPLIES_PER_PAGE = 20;
  
  // Pagination for in progress orders (confirmed)
  const [inProgressOrdersPage, setInProgressOrdersPage] = useState(0);
  const [inProgressOrdersTouchStart, setInProgressOrdersTouchStart] = useState(0);
  const [inProgressOrdersTouchEnd, setInProgressOrdersTouchEnd] = useState(0);
  
  // Pagination for ready orders (shipped)
  const [readyOrdersPage, setReadyOrdersPage] = useState(0);
  const [readyOrdersTouchStart, setReadyOrdersTouchStart] = useState(0);
  const [readyOrdersTouchEnd, setReadyOrdersTouchEnd] = useState(0);
  
  // Pagination for completed orders (delivered)
  const [completedOrdersPage, setCompletedOrdersPage] = useState(0);
  const [completedOrdersTouchStart, setCompletedOrdersTouchStart] = useState(0);
  const [completedOrdersTouchEnd, setCompletedOrdersTouchEnd] = useState(0);
  
  // Pagination for cancelled orders
  const [cancelledOrdersPage, setCancelledOrdersPage] = useState(0);
  const [cancelledOrdersTouchStart, setCancelledOrdersTouchStart] = useState(0);
  const [cancelledOrdersTouchEnd, setCancelledOrdersTouchEnd] = useState(0);
  
  const APPOINTMENTS_PER_PAGE = 4;
  const ORDERS_PER_PAGE = 4;
  
  // Book Appointment Modal State
  const [isBookAppointmentOpen, setIsBookAppointmentOpen] = useState(false);
  const [showAdminCapacityDialog, setShowAdminCapacityDialog] = useState(false);
  const [bookingErrorMessage, setBookingErrorMessage] = useState<string | null>(null);
  const [bookingContactSearch, setBookingContactSearch] = useState('');
  const [showBookingContactDropdown, setShowBookingContactDropdown] = useState(false);

  // Weekly Limit Form State (temporary values for editing)
  const [editingWeeklyLimit, setEditingWeeklyLimit] = useState<{dayOfWeek: number; bathLimit: number; groomLimit: number} | null>(null);
  
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    description: '',
    itemName: '',
    onConfirm: () => {}
  });
  
  const showDeleteConfirmation = (title: string, description: string, itemName: string, onConfirm: () => void, confirmLabel?: string, confirmVariant?: 'destructive' | 'confirm') => {
    setDeleteConfirmation({
      isOpen: true,
      title,
      description,
      itemName,
      onConfirm,
      confirmLabel,
      confirmVariant,
    });
  };
  
  const closeDeleteConfirmation = () => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }));
  };
  
  // "Has customer been called?" confirmation before marking Done
  const [pendingDoneId, setPendingDoneId] = useState<number | null>(null);


  // SMS Confirmation Dialog State
  const [smsConfirmDialog, setSmsConfirmDialog] = useState<{
    isOpen: boolean;
    appointmentId: number | null;
    customerName: string;
    customerPhone: string;
    message: string;
  }>({
    isOpen: false,
    appointmentId: null,
    customerName: '',
    customerPhone: '',
    message: "Your Fur Baby is ready for pick-up, unless you've already spoken to a groomer, please give us a call to let us know you're on your way. The PilotHouse 318-323-6090."
  });
  
  const defaultSmsMessage = "Your Fur Baby is ready for pick-up, unless you've already spoken to a groomer, please give us a call to let us know you're on your way. The PilotHouse 318-323-6090.";
  
  const openSmsConfirmDialog = (appointmentId: number, customerName: string, customerPhone: string) => {
    setSmsConfirmDialog({
      isOpen: true,
      appointmentId,
      customerName,
      customerPhone: customerPhone || '',
      message: defaultSmsMessage
    });
  };
  
  const closeSmsConfirmDialog = () => {
    setSmsConfirmDialog(prev => ({ ...prev, isOpen: false, appointmentId: null }));
  };
  
  const confirmSmsAndMarkDone = async () => {
    if (!smsConfirmDialog.appointmentId) return;
    
    // Update grooming completed status with custom message
    try {
      await apiRequest("PATCH", `/api/appointments/${smsConfirmDialog.appointmentId}/grooming-completed`, { 
        groomingCompleted: true,
        customMessage: smsConfirmDialog.message
      });
      
      toast({
        title: "Grooming Completed",
        description: smsConfirmDialog.customerPhone 
          ? "Marked as done - SMS notification sent" 
          : "Marked as done - No phone number on file",
      });
      
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    } catch (error) {
      console.error('Error updating grooming status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update grooming status. Please try again.",
        variant: "destructive",
      });
    }
    
    closeSmsConfirmDialog();
  };
  
  const [specialDateForm, setSpecialDateForm] = useState<{
    id?: number;
    date: string;
    name: string;
    allowedTimes: string[];
  }>({
    date: '',
    name: '',
    allowedTimes: [],
  });
  const [newAllowedTime, setNewAllowedTime] = useState('');
  const [bookingSelectedDate, setBookingSelectedDate] = useState<Date | undefined>(new Date());
  const [bookingSelectedTime, setBookingSelectedTime] = useState('');
  const [bookingPets, setBookingPets] = useState([{
    name: '',
    type: 'Dog',
    serviceType: '',
    notes: '',
    groomerId: '',
  }]);
  const [bookingOwnerInfo, setBookingOwnerInfo] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });
  const [bookingPrice, setBookingPrice] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringType, setRecurringType] = useState<'monthly' | 'custom'>('monthly');
  const [customRecurringDates, setCustomRecurringDates] = useState<Date[]>([]);
  
  // Pagination state for appointments
  const [appointmentsPage, setAppointmentsPage] = useState(0);
  const [appointmentsTouchStart, setAppointmentsTouchStart] = useState(0);
  const [appointmentsTouchEnd, setAppointmentsTouchEnd] = useState(0);
  

  // Search and pagination state for pets
  const [petSearchQuery, setPetSearchQuery] = useState('');
  const [petsPage, setPetsPage] = useState(1);
  const PETS_PER_PAGE = 20;

  // Track current index for each phone number group (for cycling through appointments)
  const [appointmentGroupIndexes, setAppointmentGroupIndexes] = useState<Record<string, number>>({});
  
  const ITEMS_PER_PAGE = 4;

  // Always call all hooks at the top level
  const { data: petsData } = useQuery({
    queryKey: ["/api/admin/pets", { 
      page: petsPage, 
      limit: PETS_PER_PAGE,
      search: petSearchQuery 
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(petsPage),
        limit: String(PETS_PER_PAGE),
        ...(petSearchQuery ? { search: petSearchQuery } : {}),
      });
      const res = await fetch(`/api/admin/pets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch pets");
      return res.json();
    },
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const pets = (petsData as any)?.pets || [];
  const petsTotalPages = (petsData as any)?.pagination?.totalPages || 0;
  const petsTotal = (petsData as any)?.pagination?.total || 0;

  const { data: suppliesData } = useQuery<any>({
    queryKey: ["/api/supplies", { 
      page: suppliesPage, 
      limit: SUPPLIES_PER_PAGE,
      search: supplySearchQuery,
      category: supplyCategoryFilter,
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(suppliesPage),
        limit: String(SUPPLIES_PER_PAGE),
        ...(supplySearchQuery ? { search: supplySearchQuery } : {}),
        ...(supplyCategoryFilter ? { category: supplyCategoryFilter } : {}),
      });
      const res = await fetch(`/api/supplies?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch supplies");
      return res.json();
    },
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });
  
  const supplies = suppliesData?.items || [];
  const suppliesTotalPages = suppliesData?.totalPages || 0;
  const suppliesTotal = suppliesData?.total || 0;

  const { data: userCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/users/count"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
    refetchInterval: 60000,
  });
  const totalAccounts = userCountData?.count ?? 0;

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });
  
  const { data: pendingOrders = [], refetch: refetchPendingOrders } = useQuery<any[]>({
    queryKey: ["/api/admin/pending-orders"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: allOrdersWithItems = [], refetch: refetchAllOrders } = useQuery<any[]>({
    queryKey: ["/api/admin/orders-with-items"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: groomingPayments = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/grooming-payments"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: refunds = [], refetch: refetchRefunds } = useQuery<any[]>({
    queryKey: ["/api/admin/refunds"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Hoisted early so renderTabLabel useCallback can reference it without TDZ error
  const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const nonPaymentCount = (appointments as any[]).filter((a: any) =>
    (a.status === 'confirmed' || a.status === 'completed') &&
    !a.isPaid &&
    !a.paidOnline &&
    a.checkedIn === true &&
    a.appointmentDate <= todayDateStr
  ).length;

  const { data: unapprovedAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/appointments/unapproved"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: groomers = [] } = useQuery<any[]>({
    queryKey: ["/api/groomers"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: servicePrices } = useQuery<{ fullGrooming: string; bathOnly: string }>({
    queryKey: ["/api/service-prices"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUnverifiedOnly, setShowUnverifiedOnly] = useState(false);
  const filteredUsers = (users as any[]).filter((u: any) => {
    if (showUnverifiedOnly && u.emailVerified !== false) return false;
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phoneNumber?.toLowerCase().includes(q)
    );
  });

  const { data: adminSpecials = [], refetch: refetchSpecials } = useQuery<any[]>({
    queryKey: ["/api/admin/specials"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const [isAddSpecialOpen, setIsAddSpecialOpen] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState<any | null>(null);
  const [specialForm, setSpecialForm] = useState({
    title: '', description: '', imageUrl: '', imageUrls: [] as string[], badgeText: '', badgeColor: 'red',
    linkType: 'none', externalUrl: '', isActive: true, sortOrder: 0,
  });

  const openAddSpecial = () => {
    setSpecialForm({ title: '', description: '', imageUrl: '', imageUrls: [], badgeText: '', badgeColor: 'red', linkType: 'none', externalUrl: '', isActive: true, sortOrder: 0 });
    setEditingSpecial(null);
    setIsAddSpecialOpen(true);
  };

  const openEditSpecial = (s: any) => {
    setSpecialForm({
      title: s.title || '', description: s.description || '', imageUrl: s.imageUrl || '',
      imageUrls: s.imageUrls || [],
      badgeText: s.badgeText || '', badgeColor: s.badgeColor || 'red',
      linkType: s.linkType || 'none', externalUrl: s.externalUrl || '',
      isActive: s.isActive !== false, sortOrder: s.sortOrder ?? 0,
    });
    setEditingSpecial(s);
    setIsAddSpecialOpen(true);
  };

  const { data: groomingSettings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/grooming-settings"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  // Tracked items feature flags (derived from grooming settings)
  const trackedItemsEnabled = (groomingSettings as any[]).find((s: any) => s.setting === "tracked_items_enabled")?.value === "true";
  const trackedItemsLabel    = (groomingSettings as any[]).find((s: any) => s.setting === "tracked_items_label")?.value || "Pets";
  const trackedItemsSingular = trackedItemsLabel.replace(/s$/i, "");

  // Fetch available slots for calendar display (next 60 days)
  const { data: availableSlots = {} } = useQuery({
    queryKey: ["/api/appointments/available-slots"],
    queryFn: async () => {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 60);
      
      const startStr = today.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      const response = await fetch(`/api/appointments/available-slots?startDate=${startStr}&endDate=${endStr}`, {
        credentials: 'include'
      });
      if (!response.ok) return {};
      return response.json();
    },
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
    staleTime: 30000,
  });

  const { data: weeklyLimits = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/weekly-limits"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  // Super-admin: users with no tenant assigned
  const { data: noTenantUsers = [], refetch: refetchNoTenantUsers } = useQuery<any[]>({
    queryKey: ["/api/super-admin/users", { noTenant: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/users?noTenant=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(isAuthenticated && (typedUser as any)?.isSuperAdmin),
    staleTime: 30000,
  });

  // Super-admin: all tenants (for assignment dropdown + store ID lookup)
  const { data: allTenants = [] } = useQuery<any[]>({
    queryKey: ["/api/super-admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/tenants", { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.tenants ?? []);
    },
    enabled: Boolean(isAuthenticated && (typedUser as any)?.isSuperAdmin),
    staleTime: 60000,
  });

  // Super-admin: local search filter for the tenant lookup card
  const [tenantLookupSearch, setTenantLookupSearch] = useState("");
  const [copiedTenantId, setCopiedTenantId] = useState<number | null>(null);

  // Super-admin: audit log filters and pagination
  const [auditLogTenantFilter, setAuditLogTenantFilter] = useState("");
  const [auditLogActorFilter, setAuditLogActorFilter] = useState("");
  const [auditLogPage, setAuditLogPage] = useState(0);
  const AUDIT_LOG_PAGE_SIZE = 25;

  const auditLogQueryParams = new URLSearchParams();
  if (auditLogTenantFilter.trim()) auditLogQueryParams.set("targetTenantId", auditLogTenantFilter.trim());
  if (auditLogActorFilter.trim()) auditLogQueryParams.set("actorUserId", auditLogActorFilter.trim());
  auditLogQueryParams.set("limit", String(AUDIT_LOG_PAGE_SIZE));
  auditLogQueryParams.set("offset", String(auditLogPage * AUDIT_LOG_PAGE_SIZE));

  const { data: auditLogData, isLoading: auditLogLoading, refetch: refetchAuditLog } = useQuery<{ entries: any[]; total: number }>({
    queryKey: ["/api/super-admin/audit-log", auditLogTenantFilter, auditLogActorFilter, auditLogPage],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/audit-log?${auditLogQueryParams.toString()}`, { credentials: "include" });
      if (!res.ok) return { entries: [], total: 0 };
      return res.json();
    },
    enabled: Boolean(isAuthenticated && (typedUser as any)?.isSuperAdmin),
    staleTime: 30000,
  });

  // Super-admin: force Stripe credential cache refresh
  const refreshStripeCredentialsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/super-admin/stripe/refresh-credentials");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Stripe keys refreshed",
        description: data.message || "Credential cache cleared. New keys will be used on the next request.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to refresh Stripe keys",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Super-admin: send trial reminder for any tenant
  const sendTrialReminderMutation = useMutation({
    mutationFn: async (tenantId: number) => {
      const res = await apiRequest("POST", "/api/billing/send-trial-warning", { tenantId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Trial reminder sent",
        description: `Email sent to ${data.sentTo ?? "the tenant owner"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send reminder",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const { data: specialDates = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/special-dates"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });


  // Tenant feature flags — controls which tabs/sections are visible
  const { data: tenantInfo } = useQuery<{ enabledFeatures?: Record<string, boolean> }>({
    queryKey: ["/api/tenants/current"],
    enabled: !!isAuthenticated,
  });
  const tenantFeatures = tenantInfo?.enabledFeatures ?? {};
  // A feature is shown unless explicitly set to false (empty object = all enabled)
  const featureEnabled = (key: string) => tenantFeatures[key] !== false;
  // Custom tab/section label overrides set by the owner
  const tabLabels = ((tenantFeatures as any).tabLabels ?? {}) as Record<string, string>;
  const tl = (key: string, def: string) => tabLabels[key] || def;

  // ── Draggable tab ordering ─────────────────────────────────────────────────
  // Base tabs always visible; optional tabs must be explicitly added by the admin
  const BASE_TAB_ORDER = [
    'calendar', 'contacts', 'schedule', 'inventory', 'inv-audit',
    'pos-tracker', 'pos-reports', 'grooming', 'users',
    'database', 'astro', 'orders', 'charge-accounts', 'specials',
    'applications', 'feedback', 'staff', 'settings', 'homepage',
  ];

  // Two-level navigation: group definitions (order matters for display)
  const TAB_GROUPS: { id: string; label: string; tabs: string[] }[] = [
    { id: 'operations', label: 'Operations',          tabs: ['calendar', 'contacts', 'schedule', 'appointments', 'waitlist', 'boarding', 'time-clock'] },
    { id: 'sales',      label: 'Sales',               tabs: ['pos-tracker', 'pos-reports', 'orders', 'charge-accounts', 'non-payment', 'estimates', 'invoicing'] },
    { id: 'inventory',  label: 'Inventory & Services', tabs: ['inventory', 'inv-audit', 'grooming', 'specials', 'memberships'] },
    { id: 'staff',      label: 'Staff',               tabs: ['staff', 'tasks', 'intake-forms'] },
    { id: 'outreach',   label: 'Outreach',            tabs: ['email-center', 'sms-blasts', 'announcements', 'feedback'] },
    { id: 'admin',      label: 'Admin',               tabs: ['users', 'database', 'astro', 'applications', 'settings', 'homepage'] },
  ];

  const OPTIONAL_TABS: { id: string; label: string }[] = [
    { id: 'appointments',  label: 'Appointments'  },
    { id: 'non-payment',   label: 'Non-Payment'   },
    { id: 'email-center',  label: 'Email Center'  },
    { id: 'boarding',      label: 'Boarding'       },
    { id: 'waitlist',      label: 'Waitlist'       },
    { id: 'tasks',         label: 'Tasks'          },
    { id: 'announcements', label: 'Announcements'  },
    { id: 'estimates',     label: 'Estimates'      },
    { id: 'invoicing',     label: 'Invoicing'      },
    { id: 'time-clock',    label: 'Time Clock'     },
    { id: 'intake-forms',  label: 'Intake Forms'   },
    { id: 'sms-blasts',    label: 'SMS Blasts'     },
    { id: 'memberships',   label: 'Memberships'    },
  ];
  const OPTIONAL_TAB_IDS = OPTIONAL_TABS.map(t => t.id);

  const [enabledOptionalTabs, setEnabledOptionalTabs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('admin-optional-tabs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [showTabPicker, setShowTabPicker] = useState(false);

  const toggleOptionalTab = useCallback((id: string) => {
    setEnabledOptionalTabs(prev => {
      const next = prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id];
      try { localStorage.setItem('admin-optional-tabs', JSON.stringify(next)); } catch {}
      // Also keep tabOrder in sync: add when enabling, remove when disabling
      setTabOrder(order => {
        let updated = order.filter(t => !OPTIONAL_TAB_IDS.includes(t)); // strip all optional
        const nowEnabled = next; // which optional tabs are now on
        const optionalInOrder = nowEnabled.filter(t => order.includes(t));
        const optionalNew = nowEnabled.filter(t => !order.includes(t));
        // Rebuild: base tabs (in their saved order) + already-ordered optional + newly added
        updated = [...order.filter(t => !OPTIONAL_TAB_IDS.includes(t) || nowEnabled.includes(t)), ...optionalNew];
        // If disabling, just strip it
        if (!next.includes(id)) updated = updated.filter(t => t !== id);
        try { localStorage.setItem('admin-tab-order', JSON.stringify(updated)); } catch {}
        return updated;
      });
      return next;
    });
  }, []);

  const DEFAULT_TAB_ORDER = BASE_TAB_ORDER; // kept for compat with drag-save code
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('admin-tab-order');
      const savedOpt = localStorage.getItem('admin-optional-tabs');
      const optEnabled: string[] = savedOpt ? JSON.parse(savedOpt) : [];
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        // Ensure all base tabs are present; add any missing ones
        const extras = BASE_TAB_ORDER.filter(v => !parsed.includes(v));
        // Strip optional tabs that are no longer enabled
        const filtered = parsed.filter(v => !OPTIONAL_TAB_IDS.includes(v) || optEnabled.includes(v));
        return [...filtered, ...extras];
      }
    } catch {}
    return BASE_TAB_ORDER;
  });
  const [dragSrcValue, setDragSrcValue] = useState<string | null>(null);

  // Controlled active tab — drives both the group row and the inner tab row
  const [activeTab, setActiveTab] = useState<string>(() => {
    // Restore from session storage so refreshing keeps you on the same tab
    try { return sessionStorage.getItem('admin-active-tab') || 'calendar'; } catch { return 'calendar'; }
  });
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    try { sessionStorage.setItem('admin-active-tab', value); } catch {}
  }, []);

  // Employees must never land on a tab they can't see (e.g. sessionStorage from an admin session).
  // Intentionally does NOT reference isTabVisible (which is declared later) to avoid TDZ crashes;
  // instead mirrors the same permission map inline using raw employeePerms.
  useEffect(() => {
    if (!typedUser?.isEmployee || typedUser?.isAdmin) return;
    if (employeePerms === undefined) return; // wait until permissions are loaded
    const ep = employeePerms as Record<string, boolean>;
    const empTabAllowed: Record<string, boolean> = {
      schedule: true,  grooming: !!ep.canManageGrooming, appointments: !!ep.canManageAppointments,
      contacts: !!ep.canManageCustomers, orders: !!ep.canManageOrders, inventory: !!ep.canManageInventory,
      'pos-tracker': !!ep.canViewReports, 'pos-reports': !!ep.canViewReports,
      specials: !!ep.canManageSpecials, 'email-center': !!ep.canManageEmail,
      boarding: !!ep.canManageBoarding, 'charge-accounts': !!ep.canManageChargeAccounts,
      staff: !!ep.canManageStaff, settings: !!ep.canAccessSettings,
      tasks: true, announcements: true, 'time-clock': true,
      waitlist: !!ep.canManageWaitlist, estimates: !!ep.canManageEstimates,
      invoicing: !!ep.canManageInvoicing, 'sms-blasts': !!ep.canManageSmsBlasts,
      memberships: !!ep.canManageMemberships, homepage: !!ep.canEditHomepage,
    };
    if (!empTabAllowed[activeTab]) {
      setActiveTab('schedule');
      try { sessionStorage.setItem('admin-active-tab', 'schedule'); } catch {}
    }
  }, [typedUser?.isEmployee, typedUser?.isAdmin, activeTab, employeePerms]);

  // Derived: which group contains the active tab
  const activeGroupId = useMemo(
    () => TAB_GROUPS.find(g => g.tabs.includes(activeTab))?.id ?? 'operations',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab],
  );

  // Extracted tab-visibility logic (used by both group row and inner row)
  const isTabVisible = useCallback((v: string): boolean => {
    if (OPTIONAL_TAB_IDS.includes(v) && !enabledOptionalTabs.includes(v)) return false;
    const isEmp = !!typedUser?.isEmployee && !typedUser?.isAdmin;
    const ep = employeePerms ?? {};
    return ({
      'appointments':    isEmp ? !!ep.canManageAppointments : true,
      'non-payment':     isEmp ? false : true,
      'calendar':        true,
      'contacts':        isEmp ? !!ep.canManageCustomers : true,
      'boarding':        isEmp ? !!ep.canManageBoarding && featureEnabled('boarding') : !!(typedUser?.isAdmin && featureEnabled('boarding')),
      'schedule':        isEmp ? true : !!typedUser?.isAdmin,
      'inventory':       isEmp ? !!ep.canManageInventory : true,
      'inv-audit':       isEmp ? false : !!typedUser?.isAdmin,
      'pos-tracker':     isEmp ? !!ep.canViewReports : !!typedUser?.isAdmin,
      'pos-reports':     isEmp ? !!ep.canViewReports : !!typedUser?.isAdmin,
      'grooming':        isEmp ? !!ep.canManageGrooming : !!typedUser?.isAdmin,
      'users':           isEmp ? false : !!typedUser?.isAdmin,
      'database':        isEmp ? false : !!typedUser?.isAdmin,
      'astro':           isEmp ? false : !!typedUser?.isAdmin,
      'email-center':    isEmp ? !!ep.canManageEmail && featureEnabled('emailMarketing') : !!(typedUser?.isAdmin && featureEnabled('emailMarketing')),
      'orders':          isEmp ? !!ep.canManageOrders : true,
      'charge-accounts': isEmp ? !!ep.canManageChargeAccounts : !!typedUser?.isAdmin,
      'specials':        isEmp ? !!ep.canManageSpecials : !!typedUser?.isAdmin,
      'applications':    isEmp ? false : !!typedUser?.isAdmin,
      'feedback':        isEmp ? false : !!typedUser?.isAdmin,
      'settings':        isEmp ? !!ep.canAccessSettings : !!typedUser?.isAdmin,
      'staff':           isEmp ? !!ep.canManageStaff : !!typedUser?.isAdmin,
      'waitlist':        isEmp ? !!ep.canManageWaitlist : !!typedUser?.isAdmin,
      'tasks':           true,
      'announcements':   true,
      'estimates':       isEmp ? !!ep.canManageEstimates : !!typedUser?.isAdmin,
      'invoicing':       isEmp ? !!ep.canManageInvoicing : !!typedUser?.isAdmin,
      'time-clock':      true,
      'intake-forms':    isEmp ? false : !!typedUser?.isAdmin,
      'sms-blasts':      isEmp ? !!ep.canManageSmsBlasts : !!typedUser?.isAdmin,
      'memberships':     isEmp ? !!ep.canManageMemberships : !!typedUser?.isAdmin,
      'homepage':        isEmp ? !!ep.canEditHomepage && featureEnabled('onlineStore') : !!(typedUser?.isAdmin && featureEnabled('onlineStore')),
    } as Record<string, boolean>)[v] ?? false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedUser, employeePerms, enabledOptionalTabs, featureEnabled]);

  const handleTabDragStart = useCallback((value: string) => (e: React.DragEvent) => {
    setDragSrcValue(value);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleTabDragOver = useCallback((value: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setTabOrder(prev => {
      if (!dragSrcValue || dragSrcValue === value) return prev;
      const next = [...prev];
      const from = next.indexOf(dragSrcValue);
      const to = next.indexOf(value);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, dragSrcValue);
      return next;
    });
  }, [dragSrcValue]);

  const handleTabDragEnd = useCallback(() => {
    setTabOrder(prev => {
      try { localStorage.setItem('admin-tab-order', JSON.stringify(prev)); } catch {}
      return prev;
    });
    setDragSrcValue(null);
  }, []);

  const renderTabLabel = useCallback((value: string): React.ReactNode => {
    switch (value) {
      case 'appointments': return 'Appointments';
      case 'non-payment': return (
        <>
          Non-Payment
          {nonPaymentCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {nonPaymentCount > 9 ? '9+' : nonPaymentCount}
            </span>
          )}
        </>
      );
      case 'calendar': return 'Calendar';
      case 'contacts': return 'Contacts';
      case 'boarding': return 'Boarding';
      case 'schedule': return 'Schedule';
      case 'inventory': return 'Inventory';
      case 'inv-audit': return 'Audit Scanner';
      case 'pos-tracker': return 'POS Tracker';
      case 'pos-reports': return 'Sales Reports';
      case 'grooming': return (
        <><span className="hidden lg:inline">Service Settings</span><span className="lg:hidden">Services</span></>
      );
      case 'groomers': return tl('groomers', 'Staff');
      case 'users': return 'Users';
      case 'database': return 'Database';
      case 'astro': return 'Loyalty';
      case 'email-center': return (
        <><span className="hidden lg:inline">Email Center</span><span className="lg:hidden">Email</span></>
      );
      case 'orders': return (
        <><span className="hidden lg:inline">Orders & Refunds</span><span className="lg:hidden">Orders</span></>
      );
      case 'charge-accounts': return (
        <><span className="hidden lg:inline">Charge Account Reports</span><span className="lg:hidden">Charge Accts</span></>
      );
      case 'specials': return 'Specials';
      case 'applications': return 'Applications';
      case 'feedback': return 'Feedback';
      case 'settings': return 'Settings';
      case 'homepage': return 'Homepage';
      case 'waitlist': return 'Waitlist';
      case 'tasks': return 'Tasks';
      case 'announcements': return 'Announcements';
      case 'estimates': return 'Estimates';
      case 'invoicing': return 'Invoicing';
      case 'time-clock': return 'Time Clock';
      case 'intake-forms': return 'Intake Forms';
      case 'sms-blasts': return 'SMS Blasts';
      case 'memberships': return 'Memberships';
      case 'staff': return tl('staff', 'Staff Accounts');
      default: return value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonPaymentCount]);

  const bookingSelectedDateStr = bookingSelectedDate 
    ? `${bookingSelectedDate.getFullYear()}-${String(bookingSelectedDate.getMonth() + 1).padStart(2, '0')}-${String(bookingSelectedDate.getDate()).padStart(2, '0')}`
    : '';
  const { data: availableGroomersForBooking = [] } = useQuery<any[]>({
    queryKey: ["/api/groomers/available-for-date", bookingSelectedDateStr],
    queryFn: async () => {
      if (!bookingSelectedDateStr) return [];
      const response = await fetch(`/api/groomers/available-for-date/${bookingSelectedDateStr}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!bookingSelectedDateStr,
  });

  // Fetch contacts for booking search
  const { data: allBookingContacts = [] } = useQuery({
    queryKey: ["/api/contacts"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
    retry: false,
  });

  // Filter contacts for booking modal
  const filteredBookingContacts = useMemo(() => {
    if (!bookingContactSearch.trim()) return [];
    
    const query = bookingContactSearch.toLowerCase();
    const searchDigits = bookingContactSearch.replace(/\D/g, '');
    
    return (allBookingContacts as any[]).filter(contact => {
      const name = (contact.name || '').toLowerCase();
      const phone = (contact.phoneNumber || '').replace(/\D/g, '');
      const petNames = (contact.petNames || []).map((p: string) => p.toLowerCase());
      
      const nameMatch = name.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      const petMatch = petNames.some((p: string) => p.includes(query));
      
      return nameMatch || phoneMatch || petMatch;
    }).sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aParts = aName.split(/\s+/);
      const bParts = bName.split(/\s+/);
      const aLastMatch = aParts[aParts.length - 1]?.startsWith(query) ? 0 : 1;
      const bLastMatch = bParts[bParts.length - 1]?.startsWith(query) ? 0 : 1;
      if (aLastMatch !== bLastMatch) return aLastMatch - bLastMatch;
      return aName.localeCompare(bName);
    }).slice(0, 50);
  }, [bookingContactSearch, allBookingContacts]);

  // Filter orders by customer name or phone number
  // Helper function to check if appointment/order matches search
  const matchesSearch = (item: any, type: 'appointment' | 'order') => {
    if (!search.trim()) return false;
    
    const query = search.toLowerCase();
    const searchDigits = search.replace(/\D/g, '');
    
    if (type === 'appointment') {
      const fullName = `${item.ownerFirstName || ''} ${item.ownerLastName || ''}`.toLowerCase();
      const phone = (item.ownerPhoneNumber || '').replace(/\D/g, '');
      const petName = (item.petName || '').toLowerCase();
      
      const nameMatch = fullName.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      const petMatch = petName.includes(query);
      
      return nameMatch || phoneMatch || petMatch;
    } else {
      // For orders, find the customer
      const customer = (users as any[]).find(u => u.id === item.userId);
      if (!customer) return false;
      
      const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
      const phone = (customer.phoneNumber || '').replace(/\D/g, '');
      
      const nameMatch = fullName.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      
      return nameMatch || phoneMatch;
    }
  };

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders as any[];
    
    const query = search.toLowerCase();
    const searchDigits = search.replace(/\D/g, '');
    
    return (orders as any[]).filter(order => {
      // Find the user for this order
      const customer = (users as any[]).find(u => u.id === order.userId);
      if (!customer) return false;
      
      const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
      const phone = (customer.phoneNumber || '').replace(/\D/g, '');
      
      const nameMatch = fullName.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      
      return nameMatch || phoneMatch;
    });
  }, [search, orders, users]);

  const filteredAppointments = useMemo(() => {
    if (!search.trim()) return appointments as any[];
    
    const query = search.toLowerCase();
    const searchDigits = search.replace(/\D/g, '');
    
    return (appointments as any[]).filter(appointment => {
      const fullName = `${appointment.ownerFirstName || ''} ${appointment.ownerLastName || ''}`.toLowerCase();
      const phone = (appointment.ownerPhoneNumber || '').replace(/\D/g, '');
      
      const nameMatch = fullName.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      
      // Search across all pets in the appointment
      const pets = appointment.pets && appointment.pets.length > 0 
        ? appointment.pets 
        : [{ petName: appointment.petName }];
      
      const petMatch = pets.some((pet: any) => 
        (pet.petName || '').toLowerCase().includes(query)
      );
      
      return nameMatch || phoneMatch || petMatch;
    });
  }, [search, appointments]);

  // Handle booking contact selection
  const handleBookingSelectContact = (contact: any) => {
    let firstName = '';
    let lastName = '';
    let fallbackPetName = '';
    
    // Database contacts store name as "FirstName LastName" format
    // Only use Google Calendar parsing for non-database Google Calendar contacts
    if (contact.source === 'google_calendar' && !contact.isDatabaseContact) {
      // Parse the contact name which may contain: LastName PetName PhoneNumber Groomer
      // The name field might have the full summary or just the last name (depending on when it was synced)
      const nameWords = (contact.name || '').trim().split(/\s+/);
      
      // Find phone number position in the name
      let phoneIndex = -1;
      for (let i = 0; i < nameWords.length; i++) {
        // Check if word looks like a phone number (10+ digits)
        const cleanedWord = nameWords[i].replace(/[\(\)\-\s]/g, '');
        if (/^\d+$/.test(cleanedWord) && cleanedWord.length >= 10) {
          phoneIndex = i;
          break;
        }
      }
      
      if (phoneIndex > 0) {
        // Old format: name contains full summary "Diaz Oreo 3183344619"
        // Extract: LastName = first word, PetName = words between first and phone
        lastName = nameWords[0];
        
        if (phoneIndex > 1) {
          // Pet name is between last name and phone number
          const petNameWords = nameWords.slice(1, phoneIndex);
          fallbackPetName = petNameWords.join(' ');
        }
      } else {
        // New format: name is just the last name
        lastName = contact.name || '';
        
        // Try to get pet name from event summary if available
        if (contact.eventSummary) {
          const summaryWords = contact.eventSummary.trim().split(/\s+/);
          let summaryPhoneIndex = -1;
          
          for (let i = 0; i < summaryWords.length; i++) {
            const cleanedWord = summaryWords[i].replace(/[\(\)\-\s]/g, '');
            if (/^\d+$/.test(cleanedWord) && cleanedWord.length >= 10) {
              summaryPhoneIndex = i;
              break;
            }
          }
          
          if (summaryPhoneIndex > 1) {
            const petNameWords = summaryWords.slice(1, summaryPhoneIndex);
            fallbackPetName = petNameWords.join(' ');
          }
        }
      }
    } else {
      // Regular contact - name is stored as "FirstName LastName" format
      const nameParts = (contact.name || '').trim().split(/\s+/);
      if (nameParts.length >= 2) {
        // Has both first and last name
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1) {
        // Only one name - put it in last name to match expected behavior
        lastName = nameParts[0];
      }
    }
    
    setBookingOwnerInfo({
      firstName,
      lastName,
      phoneNumber: contact.phoneNumber || '',
    });
    
    // Check if contact has petNames array (new format)
    if (contact.petNames && Array.isArray(contact.petNames) && contact.petNames.length > 0) {
      // Populate multiple pets from petNames array
      const newPets = contact.petNames.map((petName: string) => ({
        name: petName,
        type: 'Dog',
        serviceType: '',
        notes: '',
        groomerId: '',
      }));
      setBookingPets(newPets);
      
      toast({
        title: "Contact Selected",
        description: `Information populated for ${lastName} - ${contact.petNames.join(', ')}`,
      });
    } else if (fallbackPetName) {
      // Fallback to old format (extract from name)
      setBookingPets([{
        name: fallbackPetName,
        type: 'Dog',
        serviceType: '',
        notes: '',
        groomerId: '',
      }]);
      
      toast({
        title: "Contact Selected",
        description: `Information populated for ${lastName} - Pet: ${fallbackPetName}`,
      });
    } else {
      toast({
        title: "Contact Selected",
        description: `Information populated for ${lastName || contact.name}`,
      });
    }
    
    setBookingContactSearch(contact.name || '');
    setShowBookingContactDropdown(false);
  };

  // Generate available time slots for booking
  const bookingAvailableTimeSlots = useMemo(() => {
    const settings = groomingSettings as any[];
    const startTime = settings.find(s => s.setting === 'start_time')?.value || '09:00';
    const endTime = settings.find(s => s.setting === 'end_time')?.value || '13:30';
    
    const slots = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    let currentTime = new Date();
    currentTime.setHours(startHour, startMin, 0, 0);
    
    const endDateTime = new Date();
    endDateTime.setHours(endHour, endMin, 0, 0);
    
    while (currentTime < endDateTime) {
      const timeString = currentTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
      slots.push(timeString);
      currentTime.setMinutes(currentTime.getMinutes() + 15);
    }
    
    return slots;
  }, [groomingSettings]);

  // Check if a date is available for booking
  const isBookingDateAvailable = (date: Date) => {
    if (date.getDay() === 0) return false; // No Sundays
    
    const settings = groomingSettings as any[];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayEnabledSetting = settings.find(s => s.setting === `${dayName}_enabled`);
    const isDayEnabled = dayEnabledSetting ? dayEnabledSetting.value === 'true' : true;
    
    if (!isDayEnabled) return false;
    
    const blockedDates = settings.find(s => s.setting === 'blocked_dates')?.value || '';
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const blockedList = blockedDates.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    
    if (blockedList.includes(dateString)) return false;
    
    // Admins and groomers have no booking restrictions (can book any future date, same-day, etc.)
    const isAdminOrGroomer = typedUser?.isAdmin || typedUser?.isGroomer;
    
    if (!isAdminOrGroomer) {
      // Non-admin users have advance booking limit
      const advanceBookingDays = parseInt(settings.find(s => s.setting === 'advance_booking_days')?.value || '30');
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + advanceBookingDays);
      
      if (date > maxDate) return false;
      
      // Non-admin users have minimum notice requirement
      const minimumNoticeHours = parseInt(settings.find(s => s.setting === 'minimum_notice_hours')?.value || '24');
      const minDate = new Date();
      minDate.setHours(minDate.getHours() + minimumNoticeHours);
      
      if (date < minDate) return false;
    }
    
    return true;
  };

  // Create Pet Mutation
  const createPetMutation = useMutation({
    mutationFn: async (petData: any) => {
      await apiRequest("POST", "/api/pets", petData);
    },
    onSuccess: () => {
      toast({
        title: "Pet Added",
        description: "Pet has been added successfully.",
      });
      setIsAddPetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add pet.",
        variant: "destructive",
      });
    },
  });

  // Edit Pet Mutation
  const editPetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/pets/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Pet Updated",
        description: "Pet has been updated successfully.",
      });
      setEditingPet(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update pet.",
        variant: "destructive",
      });
    },
  });

  // Delete Pet Mutation
  const deletePetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pets/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Pet Deleted",
        description: "Pet has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete pet.",
        variant: "destructive",
      });
    },
  });

  const saveSpecialMutation = useMutation({
    mutationFn: async () => {
      if (editingSpecial) {
        const res = await apiRequest("PUT", `/api/admin/specials/${editingSpecial.id}`, specialForm);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/admin/specials", specialForm);
        return res.json();
      }
    },
    onSuccess: () => {
      setIsAddSpecialOpen(false);
      setEditingSpecial(null);
      toast({ title: editingSpecial ? "Special Updated" : "Special Created", description: "Changes saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/specials"] });
    },
    onError: () => { toast({ title: "Error", description: "Failed to save special.", variant: "destructive" }); },
  });

  const deleteSpecialMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/admin/specials/${id}`); },
    onSuccess: () => {
      toast({ title: "Special Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/specials"] });
    },
    onError: () => { toast({ title: "Error", description: "Failed to delete special.", variant: "destructive" }); },
  });

  const toggleSpecialActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/specials/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/specials"] });
    },
    onError: () => { toast({ title: "Error", description: "Failed to toggle special.", variant: "destructive" }); },
  });

  const togglePetAvailabilityMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: number; isAvailable: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/pets/${id}/availability`, { isAvailable });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({
        title: vars.isAvailable ? "Pet Enabled" : "Pet Hidden",
        description: vars.isAvailable
          ? "This pet is now visible to customers."
          : "This pet is now hidden from customers.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update pet availability.", variant: "destructive" });
    },
  });

  // Create Supply Mutation
  const createSupplyMutation = useMutation({
    mutationFn: async (supplyData: any) => {
      const response = await apiRequest("POST", "/api/supplies", supplyData);
      return response.json();
    },
    onSuccess: (createdSupply) => {
      toast({
        title: "Supply Added",
        description: "Supply created! You can now add images.",
      });
      setIsAddSupplyOpen(false);
      setScannerAddUpc(null);
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
      // Auto-open edit dialog so user can add images
      if (createdSupply && createdSupply.id) {
        setTimeout(() => setEditingSupply(createdSupply), 300);
      }
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add supply.",
        variant: "destructive",
      });
    },
  });

  // Edit Supply Mutation
  const editSupplyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/supplies/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Supply Updated",
        description: "Supply has been updated successfully.",
      });
      setEditingSupply(null);
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update supply.",
        variant: "destructive",
      });
    },
  });

  // Delete Supply Mutation
  const deleteSupplyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/supplies/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Supply Deleted",
        description: "Supply has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      // Show specific error message if available
      const errorMessage = error?.message || "Failed to delete supply.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Update Order Status Mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PUT", `/api/orders/${id}`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Order Updated",
        description: "Order status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update order.",
        variant: "destructive",
      });
    },
  });

  // Delete Order Mutation
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/orders/${orderId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
      toast({
        title: "Order Deleted",
        description: "Order has been permanently removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete order",
        variant: "destructive",
      });
    },
  });

  // Update Appointment Status Mutation
  const approveAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PUT", `/api/admin/appointments/${id}/approve`, {});
    },
    onSuccess: () => {
      toast({
        title: "Appointment Approved",
        description: "The grooming appointment has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PUT", `/api/admin/appointments/${id}/reject`, {});
    },
    onSuccess: () => {
      toast({
        title: "Appointment Rejected",
        description: "The customer has been notified via email about the rejection.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAppointmentDetailsMutation = useMutation({
    mutationFn: async ({ 
      id, 
      ownerFirstName, 
      ownerLastName, 
      ownerPhoneNumber, 
      petName, 
      petType, 
      specialNotes, 
      price,
      appointmentDate,
      appointmentTime,
      groomerId,
      serviceType
    }: { 
      id: number; 
      ownerFirstName?: string;
      ownerLastName?: string;
      ownerPhoneNumber?: string;
      petName?: string;
      petType?: string;
      specialNotes?: string; 
      price?: string;
      appointmentDate?: Date;
      appointmentTime?: string;
      groomerId?: number | null;
      serviceType?: string;
    }) => {
      // Build request body with all provided fields
      const updates: any = {};
      if (ownerFirstName !== undefined && ownerFirstName !== '') updates.ownerFirstName = ownerFirstName;
      if (ownerLastName !== undefined && ownerLastName !== '') updates.ownerLastName = ownerLastName;
      if (ownerPhoneNumber !== undefined && ownerPhoneNumber !== '') updates.ownerPhoneNumber = ownerPhoneNumber;
      if (petName !== undefined && petName !== '') updates.petName = petName;
      if (petType !== undefined && petType !== '') updates.petType = petType;
      if (specialNotes !== undefined && specialNotes !== '') updates.specialNotes = specialNotes;
      if (price !== undefined && price !== '') updates.price = price;
      if (groomerId !== undefined) updates.groomerId = groomerId;
      if (serviceType !== undefined && serviceType !== '') updates.serviceType = serviceType;
      
      // Format date to YYYY-MM-DD without timezone conversion
      if (appointmentDate !== undefined) {
        const year = appointmentDate.getFullYear();
        const month = String(appointmentDate.getMonth() + 1).padStart(2, '0');
        const day = String(appointmentDate.getDate()).padStart(2, '0');
        updates.appointmentDate = `${year}-${month}-${day}`;
      }
      
      if (appointmentTime !== undefined && appointmentTime !== '') updates.appointmentTime = appointmentTime;
      
      await apiRequest("PATCH", `/api/admin/appointments/${id}/details`, updates);
    },
    onSuccess: () => {
      setEditingAppointment(null);
      setEditNotes('');
      setEditPrice('');
      setEditOwnerFirstName('');
      setEditOwnerLastName('');
      setEditOwnerPhone('');
      setEditPetName('');
      setEditPetType('');
      setEditDate(undefined);
      setEditTime('');
      setEditGroomerId(null);
      toast({
        title: "Appointment Updated",
        description: "Appointment details have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
    },
    onError: (error: any) => {
      // Extract error message from apiRequest error format: "400: {json}"
      let errorText = '';
      if (error?.message) {
        const parts = error.message.split(': ', 2);
        if (parts.length === 2) {
          try {
            const jsonData = JSON.parse(parts[1]);
            errorText = jsonData.message || '';
          } catch {
            errorText = parts[1];
          }
        } else {
          errorText = error.message;
        }
      }
      
      // Check if this is a capacity error - show centered dialog
      if (errorText.includes('capacity is fully booked') || errorText.includes('capacity would be exceeded')) {
        setShowAdminCapacityDialog(true);
        return;
      }
      
      toast({
        title: "Error",
        description: errorText || "Failed to update appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PUT", `/api/appointments/${id}`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Appointment Updated",
        description: "Appointment status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
    },
  });

  const updateAppointmentIsHereMutation = useMutation({
    mutationFn: async ({ id, isHere }: { id: number; isHere: boolean }) => {
      const result = await apiRequest("PATCH", `/api/appointments/${id}/is-here`, { isHere });
      return result;
    },
    onSuccess: async (_, variables) => {
      toast({
        title: "Arrival Status Updated",
        description: variables.isHere ? "Customer marked as arrived" : "Customer marked as not arrived",
      });
      // Force immediate refetch of appointments data
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      console.error('Error updating isHere status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update arrival status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAppointmentIsPaidMutation = useMutation({
    mutationFn: async ({ id, isPaid }: { id: number; isPaid: boolean }) => {
      const result = await apiRequest("PATCH", `/api/appointments/${id}/is-paid`, { isPaid });
      return result;
    },
    onSuccess: async (_, variables) => {
      toast({
        title: "Payment Status Updated",
        description: variables.isPaid ? "Customer marked as paid" : "Customer marked as not paid",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      console.error('Error updating isPaid status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update payment status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markReadyForPaymentMutation = useMutation({
    mutationFn: async ({ id, finalAmount, readyForPayment }: { id: number; finalAmount: string; readyForPayment: boolean }) => {
      return await apiRequest("PATCH", `/api/admin/appointments/${id}/ready-for-payment`, { finalAmount, readyForPayment });
    },
    onSuccess: async (_, variables) => {
      toast({
        title: variables.readyForPayment ? "Ready for Payment" : "Payment Link Cleared",
        description: variables.readyForPayment
          ? `Customer can now pay $${parseFloat(variables.finalAmount).toFixed(2)} online`
          : "Online payment option removed",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Failed to update payment status.", variant: "destructive" });
    },
  });

  const updateAppointmentGroomingCompletedMutation = useMutation({
    mutationFn: async ({ id, groomingCompleted }: { id: number; groomingCompleted: boolean }) => {
      const result = await apiRequest("PATCH", `/api/appointments/${id}/grooming-completed`, { groomingCompleted });
      return result;
    },
    onSuccess: async (_, variables) => {
      toast({
        title: "Grooming Status Updated",
        description: variables.groomingCompleted ? "Grooming marked as completed - SMS sent if configured" : "Grooming marked as not completed",
      });
      // Force immediate refetch of appointments data
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      console.error('Error updating groomingCompleted status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update grooming status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: apptItems = [], refetch: refetchApptItems } = useQuery<any[]>({
    queryKey: ["/api/appointments", selectedAppointment?.id, "items"],
    queryFn: async () => {
      if (!selectedAppointment?.id) return [];
      const res = await fetch(`/api/appointments/${selectedAppointment.id}/items`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedAppointment?.id,
  });

  const addApptItemMutation = useMutation({
    mutationFn: async (item: { supplyId?: number | null; name: string; sku?: string | null; brand?: string | null; category?: string | null; price: string; quantity: number }) => {
      return apiRequest("POST", `/api/appointments/${selectedAppointment.id}/items`, item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", selectedAppointment?.id, "items"] });
      setApptItemSearch('');
      setApptItemSearchResults([]);
    },
    onError: () => toast({ title: "Error", description: "Failed to add item.", variant: "destructive" }),
  });

  const removeApptItemMutation = useMutation({
    mutationFn: async ({ apptId, itemId }: { apptId: number; itemId: number }) => {
      return apiRequest("DELETE", `/api/appointments/${apptId}/items/${itemId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", selectedAppointment?.id, "items"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove item.", variant: "destructive" }),
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/appointments/${id}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Appointment Deleted",
        description: "The appointment has been permanently deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Google Calendar sync appointments removed - transition period complete

  const cleanupPastAppointmentsMutation = useMutation({
    mutationFn: async (statuses?: string[]) => {
      return await apiRequest("POST", "/api/admin/appointments/cleanup-past", { statuses });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Cleanup Complete",
        description: data.message || "Past appointments have been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
    },
    onError: (error) => {
      toast({
        title: "Cleanup Failed",
        description: "Failed to cleanup past appointments.",
        variant: "destructive",
      });
    },
  });

  const approveOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      return await apiRequest("POST", `/api/admin/orders/${orderId}/approve`, {});
    },
    onSuccess: () => {
      toast({
        title: "Order Approved",
        description: "Customer has been notified via email.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve order.",
        variant: "destructive",
      });
    },
  });

  const applyDiscountMutation = useMutation({
    mutationFn: async ({ orderId, amount, reason }: { orderId: number; amount: string; reason: string }) => {
      return await apiRequest("POST", `/api/admin/orders/${orderId}/discount`, {
        discountAmount: amount,
        discountReason: reason,
      });
    },
    onSuccess: () => {
      toast({
        title: "Discount Applied",
        description: "The discount has been applied to the order total.",
      });
      setDiscountModalOpen(false);
      setDiscountOrderId(null);
      setDiscountAmount('');
      setDiscountReason('');
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to apply discount.",
        variant: "destructive",
      });
    },
  });
  
  const orderReadyMutation = useMutation({
    mutationFn: async (orderId: number) => {
      return await apiRequest("POST", `/api/admin/orders/${orderId}/ready`, {});
    },
    onSuccess: () => {
      toast({
        title: "Order Ready",
        description: "Customer has been notified their order is ready for pickup.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark order as ready.",
        variant: "destructive",
      });
    },
  });
  
  const orderPickedUpMutation = useMutation({
    mutationFn: async (orderId: number) => {
      return await apiRequest("POST", `/api/admin/orders/${orderId}/picked-up`, {});
    },
    onSuccess: () => {
      toast({
        title: "Order Complete",
        description: "Customer has been sent a thank you email.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark order as picked up.",
        variant: "destructive",
      });
    },
  });

  const updateOrderItemsMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: number; items: any[] }) => {
      return await apiRequest("PUT", `/api/admin/orders/${orderId}/items`, { items });
    },
    onSuccess: () => {
      toast({
        title: "Order Updated",
        description: "Order items have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setEditOrderModalOpen(false);
      setEditingOrder(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update order items.",
        variant: "destructive",
      });
    },
  });

  const createRefundMutation = useMutation({
    mutationFn: async (refundData: any) => {
      const res = await apiRequest("POST", "/api/admin/refunds", refundData);
      return await res.json();
    },
    onSuccess: (data: any) => {
      let message = data.paymentRefunded 
        ? `$${data.totalRefunded} has been refunded to the customer's card.`
        : data.stripeRefundError
          ? `Refund recorded but card refund failed: ${data.stripeRefundError}`
          : "Refund has been recorded. No card payment was found to refund.";
      
      if (data.astroReversalResult) {
        const ar = data.astroReversalResult;
        if (ar.voided > 0 || ar.pointsDeducted) {
          message += ` Astro: ${ar.voided} purchase(s) reversed${ar.pointsDeducted ? ', points deducted' : ''}.`;
        }
      }
      
      toast({
        title: data.paymentRefunded ? "Refund Processed" : "Refund Recorded",
        description: message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/refunds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process refund.",
        variant: "destructive",
      });
    },
  });

  const resetAllHereMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/appointments/reset-all-here", {});
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Reset Complete",
        description: data.message || "All 'Here' statuses have been reset.",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      toast({
        title: "Reset Failed",
        description: "Failed to reset 'Here' statuses.",
        variant: "destructive",
      });
    },
  });

  const resetAllPaidMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/appointments/reset-all-paid", {});
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Reset Complete",
        description: data.message || "Today's 'Paid' statuses have been reset.",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      toast({
        title: "Reset Failed",
        description: "Failed to reset 'Paid' statuses.",
        variant: "destructive",
      });
    },
  });

  // deleteCalendarEventMutation removed - Google Calendar integration removed

  const { data: supplyCategories = [] } = useQuery<{category: string; count: number}[]>({
    queryKey: ["/api/admin/supplies/categories"],
  });

  const { data: categoryDefs = [] } = useQuery<{id: number; key: string; label: string}[]>({
    queryKey: ["/api/admin/categories"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (payload: { key: string; label: string }) => {
      const res = await apiRequest("POST", "/api/admin/categories", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setNewCatKey('');
      setNewCatLabel('');
      toast({ title: "Category Created", description: "The new category is now available in product forms." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("DELETE", `/api/admin/categories/${key}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      toast({ title: "Category Deleted" });
    },
    onError: (e: any) => toast({ title: "Cannot Delete", description: e.message, variant: "destructive" }),
  });

  const priceAdjustmentMutation = useMutation({
    mutationFn: async (payload: { target: string; category?: string; percentage: string; direction: string; rounding: string }) => {
      const res = await apiRequest("POST", "/api/admin/price-adjustment", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      setPriceAdjResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
      toast({ title: "Prices Updated", description: `${data.updatedCount} items updated.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Price adjustment failed.", variant: "destructive" });
    },
  });

  const dismissAllNonPaymentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/appointments/dismiss-all-nonpayment", {});
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Cleared",
        description: data.message || "All Non-Payment appointments marked as paid.",
      });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not dismiss appointments.", variant: "destructive" });
    },
  });

  const chargeTipMutation = useMutation({
    mutationFn: async ({ id, tipAmount }: { id: number; tipAmount: string }) => {
      return await apiRequest("POST", `/api/appointments/${id}/tip`, { tipAmount });
    },
    onSuccess: async (data: any, variables) => {
      toast({
        title: "Tip Charged",
        description: `$${parseFloat(variables.tipAmount).toFixed(2)} tip charged to saved card.`,
      });
      setTipAmounts(prev => { const n = { ...prev }; delete n[variables.id]; return n; });
      setTipOpen(prev => { const n = { ...prev }; delete n[variables.id]; return n; });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error: any) => {
      toast({
        title: "Tip Failed",
        description: error?.message || "Could not charge tip. Customer may not have a saved card.",
        variant: "destructive",
      });
    },
  });

  const [tipAmounts, setTipAmounts] = useState<Record<number, string>>({});
  const [tipOpen, setTipOpen] = useState<Record<number, boolean>>({});

  // Clamp approved appointments pagination when list shrinks
  useEffect(() => {
    if (!appointments) return;
    
    const approvedAppointments = (appointments as any[]).filter(
      (a: any) => a.status === 'confirmed'
    );
    const totalPages = Math.ceil(approvedAppointments.length / APPOINTMENTS_PER_PAGE);
    
    if (totalPages > 0 && approvedAppointmentsPage >= totalPages) {
      setApprovedAppointmentsPage(Math.max(0, totalPages - 1));
    }
  }, [appointments, approvedAppointmentsPage]);

  // Clamp denied appointments pagination when list shrinks
  useEffect(() => {
    if (!appointments) return;
    
    const deniedAppointments = (appointments as any[]).filter(
      (a: any) => a.status === 'rejected' || a.status === 'cancelled'
    );
    const totalPages = Math.ceil(deniedAppointments.length / APPOINTMENTS_PER_PAGE);
    
    if (totalPages > 0 && deniedAppointmentsPage >= totalPages) {
      setDeniedAppointmentsPage(Math.max(0, totalPages - 1));
    }
  }, [appointments, deniedAppointmentsPage]);

  // Clamp in progress orders pagination when list shrinks
  useEffect(() => {
    if (!orders) return;
    
    const inProgressOrders = (orders as any[]).filter((o: any) => o.status === 'confirmed');
    const totalPages = Math.ceil(inProgressOrders.length / ORDERS_PER_PAGE);
    
    if (totalPages > 0 && inProgressOrdersPage >= totalPages) {
      setInProgressOrdersPage(Math.max(0, totalPages - 1));
    }
  }, [orders, inProgressOrdersPage]);
  
  // Clamp ready orders pagination when list shrinks
  useEffect(() => {
    if (!orders) return;
    
    const readyOrders = (orders as any[]).filter((o: any) => o.status === 'shipped');
    const totalPages = Math.ceil(readyOrders.length / ORDERS_PER_PAGE);
    
    if (totalPages > 0 && readyOrdersPage >= totalPages) {
      setReadyOrdersPage(Math.max(0, totalPages - 1));
    }
  }, [orders, readyOrdersPage]);
  
  // Clamp completed orders pagination when list shrinks
  useEffect(() => {
    if (!orders) return;
    
    const completedOrders = (orders as any[]).filter((o: any) => o.status === 'delivered');
    const totalPages = Math.ceil(completedOrders.length / ORDERS_PER_PAGE);
    
    if (totalPages > 0 && completedOrdersPage >= totalPages) {
      setCompletedOrdersPage(Math.max(0, totalPages - 1));
    }
  }, [orders, completedOrdersPage]);
  
  // Clamp cancelled orders pagination when list shrinks
  useEffect(() => {
    if (!orders) return;
    
    const cancelledOrders = (orders as any[]).filter((o: any) => o.status === 'cancelled');
    const totalPages = Math.ceil(cancelledOrders.length / ORDERS_PER_PAGE);
    
    if (totalPages > 0 && cancelledOrdersPage >= totalPages) {
      setCancelledOrdersPage(Math.max(0, totalPages - 1));
    }
  }, [orders, cancelledOrdersPage]);

  // Auto-expand collapsible sections when searching
  useEffect(() => {
    if (search.trim()) {
      setShowApprovedAppointments(true);
      setShowDeniedAppointments(true);
      setShowInProgressOrders(true);
      setShowReadyOrders(true);
      setShowCompletedOrders(true);
      setShowCancelledOrders(true);
    }
  }, [search]);

  // Create Appointment from Admin Booking Modal
  const createAppointmentMutation = useMutation({
    mutationFn: async (appointmentData: any) => {
      const response = await apiRequest("POST", "/api/appointments", appointmentData);
      return response.json();
    },
    onSuccess: (data: any) => {
      let description = "The appointment has been created successfully.";
      if (data?.remainingSlots) {
        const total = data.remainingSlots.totalAvailable;
        if (total > 0) {
          description = `Appointment created! ${total} slot${total !== 1 ? 's' : ''} remaining for this date.`;
        } else {
          description = "Appointment created! This date is now fully booked.";
        }
      }
      toast({
        title: "Appointment Created",
        description,
      });
      setIsBookAppointmentOpen(false);
      // Reset form
      setBookingContactSearch('');
      setBookingSelectedDate(new Date());
      setBookingSelectedTime('');
      setBookingPets([{ name: '', type: 'Dog', serviceType: '', notes: '', groomerId: '' }]);
      setBookingOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      setIsRecurring(false);
      setRecurringType('monthly');
      setCustomRecurringDates([]);
      // Refresh appointments
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/available-slots"] });
    },
    onError: (error: any) => {
      // Extract error message from apiRequest error format: "400: {json}"
      let errorText = '';
      if (error?.message) {
        const parts = error.message.split(': ', 2);
        if (parts.length === 2) {
          try {
            const jsonData = JSON.parse(parts[1]);
            errorText = jsonData.message || '';
          } catch {
            errorText = parts[1];
          }
        } else {
          errorText = error.message;
        }
      }
      
      // Show all booking errors in a dismissible dialog so the message is visible
      setBookingErrorMessage(errorText || 'Failed to create appointment. Please try again.');
    },
  });

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all pets have required fields
    const invalidPet = bookingPets.find(pet => !pet.name || !pet.type || !pet.serviceType);
    
    if (!bookingSelectedDate || !bookingSelectedTime || invalidPet || !bookingOwnerInfo.lastName || !bookingOwnerInfo.phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields for all pets and owner information.",
        variant: "destructive",
      });
      return;
    }

    const fullPrice = servicePrices?.fullGrooming || '35';
    const bathPrice = servicePrices?.bathOnly || '20';
    const getBasePrice = (priceStr: string) => {
      const base = priceStr.includes('-') ? priceStr.split('-')[0] : priceStr;
      return parseFloat(base) || 0;
    };

    const totalPrice = bookingPets.reduce((sum, pet) => {
      const price = pet.serviceType === 'grooming-full' ? getBasePrice(fullPrice) : getBasePrice(bathPrice);
      return sum + price;
    }, 0);

    // Build list of dates to create appointments for
    const appointmentDates: string[] = [];
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // Always include the primary selected date
    appointmentDates.push(formatDate(bookingSelectedDate));
    
    if (isRecurring) {
      if (recurringType === 'monthly') {
        // Generate dates for the next 6 months on the same day
        for (let i = 1; i <= 6; i++) {
          const futureDate = new Date(bookingSelectedDate);
          futureDate.setMonth(futureDate.getMonth() + i);
          // Handle edge case where day doesn't exist in future month (e.g., Jan 31 -> Feb 28)
          if (futureDate.getDate() !== bookingSelectedDate.getDate()) {
            // Set to last day of previous month
            futureDate.setDate(0);
          }
          appointmentDates.push(formatDate(futureDate));
        }
      } else if (recurringType === 'custom' && customRecurringDates.length > 0) {
        // Add custom selected dates
        customRecurringDates.forEach(date => {
          appointmentDates.push(formatDate(date));
        });
      }
    }

    const baseAppointmentData = {
      appointmentTime: bookingSelectedTime,
      ownerFirstName: bookingOwnerInfo.firstName,
      ownerLastName: bookingOwnerInfo.lastName,
      ownerPhoneNumber: bookingOwnerInfo.phoneNumber,
      price: totalPrice.toString(),
      isRecurring: isRecurring,
      recurringType: isRecurring ? recurringType : undefined,
      pets: bookingPets.map(pet => ({
        petName: pet.name,
        petType: pet.type,
        serviceType: pet.serviceType,
        specialNotes: pet.notes,
        groomerId: pet.groomerId ? parseInt(pet.groomerId) : null,
      })),
    };

    // Create appointments for all dates
    if (appointmentDates.length === 1) {
      // Single appointment
      createAppointmentMutation.mutate({
        ...baseAppointmentData,
        appointmentDate: appointmentDates[0],
      });
    } else {
      // Multiple appointments - create them sequentially
      let successCount = 0;
      let failedDates: string[] = [];
      let capacityFailedDates: string[] = [];
      
      for (const date of appointmentDates) {
        try {
          await apiRequest("POST", "/api/appointments", {
            ...baseAppointmentData,
            appointmentDate: date,
          });
          successCount++;
        } catch (err: any) {
          console.error(`Failed to create appointment for ${date}:`, err);
          
          // Check for capacity error
          let errorText = '';
          if (err?.message) {
            const parts = err.message.split(': ', 2);
            if (parts.length === 2) {
              try {
                const jsonData = JSON.parse(parts[1]);
                errorText = jsonData.message || '';
              } catch {
                errorText = parts[1];
              }
            } else {
              errorText = err.message;
            }
          }
          
          if (errorText.includes('capacity is fully booked') || errorText.includes('capacity would be exceeded')) {
            capacityFailedDates.push(date);
          } else {
            failedDates.push(date);
          }
        }
      }
      
      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments-all"] });
      
      // Show results
      const totalFailed = failedDates.length + capacityFailedDates.length;
      if (totalFailed === 0) {
        toast({
          title: "Recurring Appointments Created",
          description: `Successfully created ${successCount} appointments.`,
        });
      } else if (capacityFailedDates.length > 0 && successCount === 0) {
        // All failures are capacity-related - show capacity dialog
        setShowAdminCapacityDialog(true);
        return;
      } else {
        let failureMsg = `Created ${successCount} appointments.`;
        if (capacityFailedDates.length > 0) {
          failureMsg += ` ${capacityFailedDates.length} date(s) fully booked.`;
        }
        if (failedDates.length > 0) {
          failureMsg += ` ${failedDates.length} failed.`;
        }
        toast({
          title: "Partial Success",
          description: failureMsg,
          variant: "destructive",
        });
      }
      
      // Reset form
      setBookingContactSearch('');
      setBookingSelectedDate(new Date());
      setBookingSelectedTime('');
      setBookingPets([{ name: '', type: 'Dog', serviceType: '', notes: '', groomerId: '' }]);
      setBookingOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      setIsRecurring(false);
      setRecurringType('monthly');
      setCustomRecurringDates([]);
      setIsBookAppointmentOpen(false);
      return;
    }
  };

  // Admin User Management Mutation
  const updateAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/admin`, { isAdmin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User admin status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to update admin status",
        variant: "destructive",
      });
    },
  });

  // Groomer Role User Management Mutation
  const updateUserGroomerRoleMutation = useMutation({
    mutationFn: async ({ userId, isGroomer }: { userId: string; isGroomer: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/groomer`, { isGroomer });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User groomer status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to update groomer status",
        variant: "destructive",
      });
    },
  });

  // Charge Account User Management Mutation
  const updateChargeAccountMutation = useMutation({
    mutationFn: async ({ userId, isChargeAccount }: { userId: string; isChargeAccount: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/charge-account`, { isChargeAccount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "Charge account status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update charge account status",
        variant: "destructive",
      });
    },
  });

  // Manually Verify Email Mutation
  const verifyEmailMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/verify-email`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Account Verified", description: "User email has been manually verified." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to verify user email", variant: "destructive" });
    },
  });

  // Superior Manager Mutation
  const updateSuperiorManagerMutation = useMutation({
    mutationFn: async ({ userId, isSuperiorManager }: { userId: string; isSuperiorManager: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/superior-manager`, { isSuperiorManager });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "Superior Manager status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update superior manager status", variant: "destructive" });
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User account deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to delete user account",
        variant: "destructive",
      });
    },
  });

  // Grooming Settings Mutation
  const updateGroomingSettingMutation = useMutation({
    mutationFn: async ({ setting, value }: { setting: string; value: string }) => {
      const response = await apiRequest("PUT", "/api/admin/grooming-settings", { setting, value });
      return response;
    },
    onMutate: async ({ setting, value }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/grooming-settings"] });
      
      // Snapshot the previous value
      const previousSettings = queryClient.getQueryData(["/api/admin/grooming-settings"]);
      
      // Optimistically update to the new value
      queryClient.setQueryData(["/api/admin/grooming-settings"], (old: any) => {
        if (!old) return [{ setting, value }];
        
        const existingIndex = old.findIndex((s: any) => s.setting === setting);
        if (existingIndex >= 0) {
          // Update existing setting
          const newSettings = [...old];
          newSettings[existingIndex] = { ...newSettings[existingIndex], value };
          return newSettings;
        } else {
          // Add new setting
          return [...old, { setting, value }];
        }
      });
      
      return { previousSettings };
    },
    onError: (err, variables, context) => {
      // If mutation fails, use the context returned from onMutate to roll back
      if (context?.previousSettings) {
        queryClient.setQueryData(["/api/admin/grooming-settings"], context.previousSettings);
      }
      toast({
        title: "Error",
        description: "Failed to update grooming settings",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Grooming settings have been updated successfully",
      });
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["/api/admin/grooming-settings"] });
    },
  });

  // Weekly Limits Mutation
  const upsertWeeklyLimitMutation = useMutation({
    mutationFn: async (data: { dayOfWeek: number; maxBathAppointments: number; maxGroomAppointments: number }) => {
      return await apiRequest("POST", "/api/admin/weekly-limits", data);
    },
    onSuccess: () => {
      toast({
        title: "Weekly Limit Updated",
        description: "Weekly appointment limit has been set successfully",
      });
      setEditingWeeklyLimit(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/weekly-limits"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update weekly limit",
        variant: "destructive",
      });
    },
  });

  // Special Date Mutations
  const createSpecialDateMutation = useMutation({
    mutationFn: async (data: { date: string; name: string; allowedTimes: string[] }) => {
      return await apiRequest("POST", "/api/admin/special-dates", data);
    },
    onSuccess: () => {
      toast({
        title: "Special Date Created",
        description: "Special date has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/special-dates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create special date",
        variant: "destructive",
      });
    },
  });

  const updateSpecialDateMutation = useMutation({
    mutationFn: async (data: { id: number; date: string; name: string; allowedTimes: string[] }) => {
      return await apiRequest("PUT", `/api/admin/special-dates/${data.id}`, {
        date: data.date,
        name: data.name,
        allowedTimes: data.allowedTimes,
      });
    },
    onSuccess: () => {
      toast({
        title: "Special Date Updated",
        description: "Special date has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/special-dates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update special date",
        variant: "destructive",
      });
    },
  });

  const deleteSpecialDateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/special-dates/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Special Date Deleted",
        description: "Special date has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/special-dates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete special date",
        variant: "destructive",
      });
    },
  });

  const { data: chargeAccountReports = [], isLoading: chargeReportsLoading, refetch: refetchChargeReports } = useQuery<any[]>({
    queryKey: ["/api/admin/charge-account-reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/charge-account-reports");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!typedUser?.isAdmin,
  });

  const [chargeDiscounts, setChargeDiscounts] = React.useState<Record<string, number>>({});

  const emailChargeReportMutation = useMutation({
    mutationFn: async ({ userId, discountPercent }: { userId: string; discountPercent: number }) => {
      const res = await apiRequest("POST", `/api/admin/charge-account-reports/${userId}/email`, { discountPercent });
      return res.json();
    },
    onSuccess: (data: any) => {
      const msg = data?.discountPercent > 0
        ? `${data.message} — Amount due after ${data.discountPercent}% discount: $${data.finalTotal}`
        : data?.message || "Email sent successfully.";
      toast({ title: "Statement Sent", description: msg });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send the statement email.", variant: "destructive" });
    },
  });

  const pendingAppointments = (appointments as any[]).filter((a: any) => a.status === 'scheduled').length;
  // Count orders that are NOT picked up (pending_approval, approved, ready_for_pickup are all "pending" from admin perspective)
  const pendingOrdersCount = (allOrdersWithItems as any[]).filter((o: any) => 
    o.approvalStatus !== 'picked_up' && o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'refunded'
  ).length;
  
  // Calculate customers here - filter appointments with isHere = true from today onwards
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const appointmentsHere = (appointments as any[]).filter((a: any) => {
    if (a.status !== 'confirmed' && a.status !== 'completed') return false;
    if (!a.isHere) return false;
    
    // Only count appointments from today onwards (same logic as approved appointments display)
    const appointmentDate = parseLocalDate(a.appointmentDate);
    appointmentDate.setHours(0, 0, 0, 0);
    
    return appointmentDate >= today;
  });
  
  console.log('Customers Here calculation:', {
    totalAppointments: appointments.length,
    confirmedOrCompleted: (appointments as any[]).filter((a: any) => 
      a.status === 'confirmed' || a.status === 'completed'
    ).length,
    customersHere: appointmentsHere.length,
    appointmentsHere: appointmentsHere.map((a: any) => ({
      id: a.id,
      status: a.status,
      isHere: a.isHere,
      date: a.appointmentDate,
      customer: a.ownerLastName
    }))
  });
  const customersHere = appointmentsHere.length;

  // Calculate customers paid TODAY - only count today's appointments with isPaid = true
  const appointmentsPaid = (appointments as any[]).filter((a: any) => 
    (a.status === 'confirmed' || a.status === 'completed') &&
    a.isPaid === true &&
    a.appointmentDate === todayDateStr
  );
  const customersPaid = appointmentsPaid.length;

  // Non-payment appointments: past/today confirmed or completed, checked in but not paid
  // checkedIn is a permanent flag (never resets nightly) — no-shows (checkedIn=false) are excluded
  const nonPaymentAppointments = (appointments as any[]).filter((a: any) =>
    (a.status === 'confirmed' || a.status === 'completed') &&
    !a.isPaid &&
    !a.paidOnline &&
    a.checkedIn === true &&
    a.appointmentDate <= todayDateStr
  ).sort((a: any, b: any) => b.appointmentDate.localeCompare(a.appointmentDate));

  // Appointments pagination handlers
  const handleAppointmentsTouchStart = (e: React.TouchEvent) => {
    setAppointmentsTouchStart(e.targetTouches[0].clientX);
  };

  const handleAppointmentsTouchMove = (e: React.TouchEvent) => {
    setAppointmentsTouchEnd(e.targetTouches[0].clientX);
  };

  const handleAppointmentsTouchEnd = () => {
    if (!appointmentsTouchStart || !appointmentsTouchEnd) return;
    
    const distance = appointmentsTouchStart - appointmentsTouchEnd;
    const minSwipeDistance = 50;
    const totalAppointmentPages = Math.ceil((appointments as any[]).length / ITEMS_PER_PAGE);
    
    if (distance > minSwipeDistance && appointmentsPage < totalAppointmentPages - 1) {
      setAppointmentsPage(prev => prev + 1);
    }
    
    if (distance < -minSwipeDistance && appointmentsPage > 0) {
      setAppointmentsPage(prev => prev - 1);
    }
    
    setAppointmentsTouchStart(0);
    setAppointmentsTouchEnd(0);
  };

  // Calculate paginated data
  const totalAppointmentPages = Math.ceil((appointments as any[]).length / ITEMS_PER_PAGE);
  const paginatedAppointments = (appointments as any[]).slice(
    appointmentsPage * ITEMS_PER_PAGE,
    (appointmentsPage + 1) * ITEMS_PER_PAGE
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!typedUser?.isAdmin && !typedUser?.isGroomer && !typedUser?.isEmployee) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Administrator, Groomer, or Employee account required</p>
        </div>
      </div>
    );
  }

  // Helper functions for appointment grouping and cycling
  const groupAppointmentsByPhone = (appointmentList: any[]) => {
    const grouped: Record<string, any[]> = {};
    appointmentList.forEach((appointment) => {
      const phone = appointment.ownerPhoneNumber || '';
      if (!grouped[phone]) {
        grouped[phone] = [];
      }
      grouped[phone].push(appointment);
    });
    // Sort each group by date
    Object.keys(grouped).forEach(phone => {
      grouped[phone].sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
    });
    return grouped;
  };

  // Sort grouped appointments by earliest appointment date (with time as tie-breaker)
  const sortGroupedAppointmentsByEarliest = (entries: [string, any[]][]) => {
    return entries.sort(([, a], [, b]) => {
      // Skip empty groups
      if (!a.length || !b.length) return 0;
      
      // Get earliest appointments from each group
      const earliestA = a[0];
      const earliestB = b[0];
      
      // Parse dates safely
      const dateA = new Date(earliestA.appointmentDate).getTime();
      const dateB = new Date(earliestB.appointmentDate).getTime();
      
      // Handle invalid dates
      if (isNaN(dateA) || isNaN(dateB)) return 0;
      
      // Compare by date first
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // If same date, use time as tie-breaker
      const timeA = earliestA.appointmentTime || '';
      const timeB = earliestB.appointmentTime || '';
      return timeA.localeCompare(timeB);
    });
  };

  const cycleAppointmentGroup = (phone: string, groupedAppts: Record<string, any[]>) => {
    setAppointmentGroupIndexes(prev => {
      const currentIndex = prev[phone] || 0;
      const groupSize = groupedAppts[phone]?.length || 1;
      const nextIndex = (currentIndex + 1) % groupSize;
      return { ...prev, [phone]: nextIndex };
    });
  };

  const getCurrentAppointment = (phone: string, appointments: any[]) => {
    const currentIndex = appointmentGroupIndexes[phone] || 0;
    return appointments[currentIndex] || appointments[0];
  };

  // Group unapproved appointments by phone number
  const groupedUnapprovedAppointments = useMemo(() => {
    return groupAppointmentsByPhone(unapprovedAppointments);
  }, [unapprovedAppointments]);

  // Group pending appointments by phone number
  const groupedPendingAppointments = useMemo(() => {
    const pendingAppts = ((search.trim() ? filteredAppointments : appointments) as any[])
      .filter((a: any) => a.status === 'scheduled');
    return groupAppointmentsByPhone(pendingAppts);
  }, [appointments, filteredAppointments, search]);

  // Group approved appointments by phone number (only show today and future dates, unless searching)
  const groupedApprovedAppointments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const approvedAppts = ((search.trim() ? filteredAppointments : appointments) as any[])
      .filter((a: any) => {
        // Only show confirmed appointments (completed should be removed from this list)
        if (a.status !== 'confirmed') return false;
        
        // When filtering by "Here", only show appointments marked as here
        // EXCEPTION: Always show paid appointments regardless of "Here" filter
        if (filterByHere && !a.isHere && !a.isPaid) return false;
        
        // When searching, show all matching appointments regardless of date
        if (search.trim()) return true;
        
        // Otherwise, only show appointments from today onwards
        const appointmentDate = parseLocalDate(a.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        return appointmentDate >= today;
      });
    return groupAppointmentsByPhone(approvedAppts);
  }, [appointments, filteredAppointments, search, filterByHere]);

  // Group denied appointments by phone number (only show today and future dates, unless searching)
  const groupedDeniedAppointments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const deniedAppts = ((search.trim() ? filteredAppointments : appointments) as any[])
      .filter((a: any) => {
        if (a.status !== 'rejected' && a.status !== 'cancelled') return false;
        
        // When searching, show all matching appointments regardless of date
        if (search.trim()) return true;
        
        // Otherwise, only show appointments from today onwards
        const appointmentDate = parseLocalDate(a.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        return appointmentDate >= today;
      });
    return groupAppointmentsByPhone(deniedAppts);
  }, [appointments, filteredAppointments, search]);

  return (
    <div className="pb-20">
      {/* Fixed Back Button */}
      <div className="fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => typedUser?.isEmployee ? window.location.href = '/' : safeGoBack()}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Header */}
      <div className="px-6 pt-16 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{typedUser?.isEmployee ? "Dashboard" : "Admin Dashboard"}</h1>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                // First sync order statuses to fix any inconsistencies
                try {
                  await apiRequest('POST', '/api/admin/orders/sync-statuses');
                } catch (err) {
                  // Ignore errors - sync is best effort
                }
                queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
                queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/orders-with-items"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/refunds"] });
                queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
                queryClient.invalidateQueries({ queryKey: ["/api/groomers"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/groomers"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/grooming-settings"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/daily-limits"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar/events"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar/events/date"] });
                queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
                toast({
                  title: "Refreshed",
                  description: "All data has been refreshed from the server.",
                });
              }}
              data-testid="button-refresh-all"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/', '_blank')}
              title="Preview your store's public homepage"
            >
              <Home className="w-4 h-4 mr-2" />
              View Site
            </Button>
            <AdminNotifications />
            {typedUser?.isAdmin ? (
              <Badge variant="secondary" className="bg-brand-blue text-white">
                Administrator
              </Badge>
            ) : typedUser?.isGroomer ? (
              <Badge variant="secondary" className="bg-purple-600 text-white">
                Groomer
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-6">{/* Content continues */}

      {/* Stats Cards */}
      <div className="overflow-x-auto -mx-6 px-6 mb-6 pb-1">
      <div className="grid grid-flow-col auto-cols-[minmax(80px,1fr)] gap-2">
        {typedUser?.isAdmin && (
          <Card className="border-purple-200 dark:border-purple-800">
            <CardContent className="p-3 text-center flex flex-col items-center justify-center">
              <UserPlus className="w-6 h-6 mb-1 text-purple-600" />
              <div className="text-xl font-bold leading-tight">{totalAccounts}</div>
              <div className="text-xs text-gray-500 leading-tight">Accounts</div>
            </CardContent>
          </Card>
        )}
        {trackedItemsEnabled && (
          <Card>
            <CardContent className="p-3 text-center flex flex-col items-center justify-center">
              <Package className="w-6 h-6 mb-1 text-brand-blue" />
              <div className="text-xl font-bold leading-tight">{petsTotal}</div>
              <div className="text-xs text-gray-500 leading-tight">Total {trackedItemsLabel}</div>
            </CardContent>
          </Card>
        )}
        {suppliesTotal > 0 && (
          <Card>
            <CardContent className="p-3 text-center flex flex-col items-center justify-center">
              <Package className="w-6 h-6 mb-1 text-brand-orange" />
              <div className="text-xl font-bold leading-tight">{suppliesTotal}</div>
              <div className="text-xs text-gray-500 leading-tight">Total Supplies</div>
            </CardContent>
          </Card>
        )}
        {pendingOrdersCount > 0 && (
          <Card>
            <CardContent className="p-3 text-center flex flex-col items-center justify-center">
              <ShoppingBag className="w-6 h-6 mb-1 text-brand-red" />
              <div className="text-xl font-bold leading-tight">{pendingOrdersCount}</div>
              <div className="text-xs text-gray-500 leading-tight">Pending Orders</div>
            </CardContent>
          </Card>
        )}
        {pendingAppointments > 0 && (
          <Card>
            <CardContent className="p-3 text-center flex flex-col items-center justify-center">
              <CalendarIcon className="w-6 h-6 mb-1 text-green-600" />
              <div className="text-xl font-bold leading-tight">{pendingAppointments}</div>
              <div className="text-xs text-gray-500 leading-tight">Pending Appts</div>
            </CardContent>
          </Card>
        )}
        {customersHere > 0 && (
          <Card className={`border-blue-400 ${filterByHere ? 'ring-2 ring-blue-600' : ''}`}>
            <CardContent className="p-3 text-center flex flex-col items-center justify-center relative">
              <div
                className="cursor-pointer flex flex-col items-center justify-center w-full"
                onClick={() => {
                  setFilterByHere(!filterByHere);
                  if (!filterByHere) setShowApprovedAppointments(true);
                }}
                data-testid="card-customers-here"
              >
                <Users className="w-6 h-6 mb-1 text-blue-600" />
                <div className="text-xl font-bold leading-tight text-blue-700" data-testid="dashboard-customers-here">{customersHere}</div>
                <div className="text-xs text-blue-600 font-medium leading-tight mb-1">Here Now</div>
              </div>
              {typedUser?.isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    showDeleteConfirmation(
                      'Reset All "Here" Statuses',
                      'This will reset ALL "Here" statuses across all appointments. This action cannot be undone.',
                      `${customersHere} appointment(s)`,
                      () => resetAllHereMutation.mutate()
                    );
                  }}
                  disabled={resetAllHereMutation.isPending}
                  className="text-xs h-6 px-2"
                  data-testid="button-reset-all-here"
                >
                  {resetAllHereMutation.isPending ? 'Resetting...' : 'Reset All'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {nonPaymentCount > 0 && (
          <Card className="border-red-300">
            <CardContent className="p-3 text-center flex flex-col items-center justify-center relative">
              <AlertTriangle className="w-6 h-6 mb-1 text-red-600" />
              <div className="text-xl font-bold leading-tight text-red-600" data-testid="dashboard-non-payment">{nonPaymentCount}</div>
              <div className="text-xs text-gray-500 leading-tight">Non-Payment</div>
            </CardContent>
          </Card>
        )}
        {customersPaid > 0 && (
          <Card>
            <CardContent className="p-3 text-center flex flex-col items-center justify-center relative">
              <DollarSign className="w-6 h-6 mb-1 text-green-600" />
              <div className="text-xl font-bold leading-tight" data-testid="dashboard-customers-paid">{customersPaid}</div>
              <div className="text-xs text-gray-500 leading-tight mb-1">Paid Today</div>
              {typedUser?.isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    showDeleteConfirmation(
                      'Reset All "Paid" Statuses',
                      'This will reset ALL "Paid" statuses across all appointments. This action cannot be undone.',
                      `${customersPaid} appointment(s)`,
                      () => resetAllPaidMutation.mutate()
                    );
                  }}
                  disabled={resetAllPaidMutation.isPending}
                  className="text-xs h-6 px-2"
                  data-testid="button-reset-all-paid"
                >
                  {resetAllPaidMutation.isPending ? 'Resetting...' : 'Reset All'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* ── Level 1: Group row ── */}
        <div className="border-b border-gray-200 dark:border-gray-700 -mx-6 px-6">
          <div className="flex items-center">
            {TAB_GROUPS.map(group => {
              // Hide group if no tabs are visible for this user
              const visibleTabs = tabOrder.filter(t => group.tabs.includes(t) && isTabVisible(t));
              if (visibleTabs.length === 0) return null;
              const isActive = group.id === activeGroupId;
              return (
                <button
                  key={group.id}
                  onClick={() => {
                    // If clicking a group that isn't active, jump to its first visible tab
                    const first = visibleTabs.find(t => t !== activeTab) ?? visibleTabs[0];
                    if (!isActive && first) handleTabChange(first);
                  }}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
                    isActive
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Level 2: Inner tab row for active group ── */}
        <div className="overflow-x-auto pb-1 -mx-6 px-6 mt-1">
          <div className="flex items-center gap-1 min-w-max">
            <TabsList className="inline-flex gap-1 h-auto p-1">
              {tabOrder
                .filter(v => {
                  const grp = TAB_GROUPS.find(g => g.id === activeGroupId);
                  if (!grp?.tabs.includes(v)) return false;
                  return isTabVisible(v);
                })
                .map(value => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    draggable
                    onDragStart={handleTabDragStart(value)}
                    onDragOver={handleTabDragOver(value)}
                    onDragEnd={handleTabDragEnd}
                    className={`flex-none text-xs py-3 px-3 whitespace-nowrap cursor-grab active:cursor-grabbing select-none relative transition-opacity ${dragSrcValue === value ? 'opacity-40' : ''}`}
                  >
                    {renderTabLabel(value)}
                  </TabsTrigger>
                ))
              }
            </TabsList>

            {/* "+" button — admin only — opens optional-tab picker grouped by section */}
            {typedUser?.isAdmin && (
              <div className="relative flex-none ml-1">
                <button
                  onClick={() => setShowTabPicker(p => !p)}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:text-gray-300 text-base font-bold transition-colors border border-gray-200 dark:border-gray-600"
                  title="Add / remove optional tabs"
                  aria-label="Manage optional tabs"
                >
                  +
                </button>
                {showTabPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowTabPicker(false)} />
                    <div className="absolute right-0 top-9 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 w-56 max-h-[70vh] overflow-y-auto">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Optional Tabs</p>
                      <div className="space-y-3">
                        {TAB_GROUPS.map(group => {
                          const groupOptional = OPTIONAL_TABS.filter(t => group.tabs.includes(t.id));
                          if (groupOptional.length === 0) return null;
                          return (
                            <div key={group.id}>
                              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-2">{group.label}</p>
                              {groupOptional.map(({ id, label }) => {
                                const active = enabledOptionalTabs.includes(id);
                                const allowed = id === 'boarding' ? featureEnabled('boarding') : true;
                                if (!allowed) return null;
                                return (
                                  <button
                                    key={id}
                                    onClick={() => toggleOptionalTab(id)}
                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                                  >
                                    <span>{label}</span>
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${active ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-500'}`}>
                                      {active ? '✓' : ''}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <TabsContent value="inventory" className="space-y-6">
          {/* Export Inventory Buttons */}
          {typedUser?.isAdmin && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsInvoiceScanOpen(true)}
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = '/api/export/inventory';
                }}
                data-testid="button-export-inventory"
              >
                <Download className="w-4 h-4 mr-2" />
                Export to Excel
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  window.location.href = '/api/export/exatouch';
                }}
                data-testid="button-export-exatouch"
              >
                <Download className="w-4 h-4 mr-2" />
                Download for POS
              </Button>
            </div>
          )}
          <InvoiceScanDialog
            open={isInvoiceScanOpen}
            onClose={() => setIsInvoiceScanOpen(false)}
            onEditSupply={(supply) => setEditingSupply(supply)}
          />

          {/* Price Adjustment Tool */}
          {typedUser?.isAdmin && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => { setPriceAdjOpen(o => !o); setPriceAdjResult(null); }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-700" />
                    <CardTitle className="text-sm text-amber-800">Price Adjustment</CardTitle>
                  </div>
                  {priceAdjOpen ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
                </div>
                <CardDescription className="text-amber-700 text-xs">Raise or lower prices by category or across all inventory</CardDescription>
              </CardHeader>

              {priceAdjOpen && (
                <CardContent className="space-y-4 pt-0">
                  {priceAdjResult && (
                    <div className="bg-green-100 border border-green-300 rounded p-3 text-sm text-green-800">
                      ✅ Done — {priceAdjResult.updatedCount} items {priceAdjResult.direction}d by {priceAdjResult.percentage}% on <strong>{priceAdjResult.target}</strong>
                      {priceAdjResult.rounding === 'x9' ? ', rounded to X.X9' : ', standard rounding'}.
                      <button className="ml-2 underline text-xs" onClick={() => setPriceAdjResult(null)}>Dismiss</button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Apply To</Label>
                      <Select value={priceAdjTarget} onValueChange={(v) => { setPriceAdjTarget(v); setPriceAdjCategory(''); }}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Inventory (Supplies + Pets)</SelectItem>
                          <SelectItem value="pets">All Pets</SelectItem>
                          <SelectItem value="category">Specific Category</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Direction</Label>
                      <Select value={priceAdjDirection} onValueChange={setPriceAdjDirection}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="increase">Increase ▲</SelectItem>
                          <SelectItem value="decrease">Decrease ▼</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {priceAdjTarget === 'category' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Category</Label>
                      <Select value={priceAdjCategory} onValueChange={setPriceAdjCategory}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select a category..." />
                        </SelectTrigger>
                        <SelectContent>
                          {supplyCategories.filter((c: any) => c.category && c.category.trim() !== '').map((c: any) => (
                            <SelectItem key={c.category} value={c.category}>
                              {c.category} — {c.count} items
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Percentage (%)</Label>
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        placeholder="e.g. 9"
                        value={priceAdjPercent}
                        onChange={e => setPriceAdjPercent(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Rounding</Label>
                      <Select value={priceAdjRounding} onValueChange={setPriceAdjRounding}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="x9">Round up to X.X9 (e.g. $8.99)</SelectItem>
                          <SelectItem value="standard">Standard (e.g. $8.84)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={
                      priceAdjustmentMutation.isPending ||
                      !priceAdjPercent ||
                      parseFloat(priceAdjPercent) <= 0 ||
                      (priceAdjTarget === 'category' && !priceAdjCategory)
                    }
                    onClick={() => {
                      const label = priceAdjTarget === 'all'
                        ? 'all supplies and pets'
                        : priceAdjTarget === 'pets'
                        ? 'all pets'
                        : `the "${priceAdjCategory}" category`;
                      showDeleteConfirmation(
                        `${priceAdjDirection === 'increase' ? 'Raise' : 'Lower'} Prices`,
                        `This will ${priceAdjDirection} prices on ${label} by ${priceAdjPercent}%. This cannot be undone automatically.`,
                        label,
                        () => priceAdjustmentMutation.mutate({
                          target: priceAdjTarget,
                          category: priceAdjTarget === 'category' ? priceAdjCategory : undefined,
                          percentage: priceAdjPercent,
                          direction: priceAdjDirection,
                          rounding: priceAdjRounding,
                        })
                      );
                    }}
                  >
                    {priceAdjustmentMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Updating prices...</>
                    ) : (
                      <><DollarSign className="w-3.5 h-3.5 mr-2" />Apply Price Adjustment</>
                    )}
                  </Button>
                  <p className="text-xs text-amber-700 text-center">⚠️ This updates the live database. Use the Export buttons above to back up prices first.</p>
                </CardContent>
              )}
            </Card>
          )}

          {/* Category Manager */}
          {typedUser?.isAdmin && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => setCatMgrOpen(o => !o)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <CardTitle className="text-sm text-blue-800 dark:text-blue-300">Category Manager</CardTitle>
                  </div>
                  {catMgrOpen ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
                </div>
                <CardDescription className="text-blue-700 dark:text-blue-400 text-xs">Create and manage supply categories used in product forms</CardDescription>
              </CardHeader>
              {catMgrOpen && (
                <CardContent className="space-y-4 pt-0">
                  {/* Add new category */}
                  <div className="bg-white dark:bg-gray-900 rounded-lg border border-blue-200 dark:border-blue-800 p-3 space-y-3">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">Add New Category</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Key (no spaces)</label>
                        <input
                          type="text"
                          className="w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-gray-800 dark:border-gray-700"
                          placeholder="e.g. fishFood"
                          value={newCatKey}
                          onChange={e => setNewCatKey(e.target.value.replace(/\s/g, ''))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Display Name</label>
                        <input
                          type="text"
                          className="w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-gray-800 dark:border-gray-700"
                          placeholder="e.g. Fish Food"
                          value={newCatLabel}
                          onChange={e => setNewCatLabel(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!newCatKey.trim() || !newCatLabel.trim() || createCategoryMutation.isPending}
                      onClick={() => createCategoryMutation.mutate({ key: newCatKey.trim(), label: newCatLabel.trim() })}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      {createCategoryMutation.isPending ? "Adding…" : "Add Category"}
                    </Button>
                  </div>

                  {/* Existing categories list */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">{categoryDefs.length} Categories</p>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {categoryDefs.map(cat => (
                        <div key={cat.key} className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5">
                          <div>
                            <span className="text-sm font-medium">{cat.label}</span>
                            <span className="text-xs text-gray-400 ml-2 font-mono">{cat.key}</span>
                          </div>
                          <button
                            className="text-red-500 hover:text-red-700 p-1 rounded"
                            title="Delete category"
                            disabled={deleteCategoryMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Delete category "${cat.label}"? This will fail if any products use it.`)) {
                                deleteCategoryMutation.mutate(cat.key);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Tracked Items Section (optional feature — enable in Settings → Alternate Supply Tracking) */}
          {trackedItemsEnabled && <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {trackedItemsLabel} ({petsTotal}{petSearchQuery.trim() ? ` found` : ` total`})
                </CardTitle>
                {/* Mobile: Custom Modal, Desktop: Dialog */}
                {typedUser?.isAdmin && (
                  <div className="sm:hidden">
                    <Button 
                      size="sm" 
                      className="bg-brand-blue hover:bg-blue-600"
                      onClick={() => setIsAddPetOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add {trackedItemsLabel.replace(/s$/i, "")}
                    </Button>
                  </div>
                )}
                {typedUser?.isAdmin && (
                  <div className="hidden sm:block">
                    <Dialog open={isAddPetOpen} onOpenChange={setIsAddPetOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-brand-blue hover:bg-blue-600">
                          <Plus className="w-4 h-4 mr-2" />
                          Add {trackedItemsLabel.replace(/s$/i, "")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add {trackedItemsLabel.replace(/s$/i, "")}</DialogTitle>
                          <DialogDescription>Add a new {trackedItemsLabel.replace(/s$/i, "").toLowerCase()} to your inventory.</DialogDescription>
                        </DialogHeader>
                        <AddPetForm onSubmit={(data) => createPetMutation.mutate(data)} />
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Mobile Full-Screen Modal */}
                {typedUser?.isAdmin && isAddPetOpen && (
                  <div className="sm:hidden fixed inset-0 z-50 bg-white">
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
                        <h2 className="text-lg font-semibold">Add New Pet</h2>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setIsAddPetOpen(false)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        <AddPetForm onSubmit={(data) => createPetMutation.mutate(data)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search pets by name, species, or breed..."
                    value={petSearchQuery}
                    onChange={(e) => {
                      setPetSearchQuery(e.target.value);
                      setPetsPage(1);
                    }}
                    className="w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    data-testid="input-search-pets-admin"
                  />
                  {petSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPetSearchQuery('');
                        setPetsPage(1);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      data-testid="button-clear-search-pets"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {(pets as any[]).map((pet: any) => (
                  <div key={pet.id} className={`p-3 border rounded-lg transition-opacity ${pet.isAvailable ? '' : 'opacity-60 border-dashed border-gray-400'}`}>
                    <div className="flex gap-3">
                      {/* Pet Thumbnail */}
                      <div className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                        {(pet.imageUrl || pet.imageUrls?.[0]) ? (
                          <img 
                            src={pet.imageUrl || pet.imageUrls[0]} 
                            alt={pet.name}
                            className={`w-full h-full object-cover ${pet.isAvailable ? '' : 'grayscale'}`}
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                            data-testid={`img-pet-thumbnail-${pet.id}`}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center ${(pet.imageUrl || pet.imageUrls?.[0]) ? 'hidden' : ''}`}>
                          <PawPrint className="w-5 h-5 text-gray-400" />
                        </div>
                        {!pet.isAvailable && (
                          <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center">
                            <EyeOff className="w-4 h-4 text-white/80" />
                          </div>
                        )}
                      </div>
                      {/* Name gets full remaining width */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm leading-snug" title={pet.name}>{pet.name}</h3>
                        <p className="text-xs text-gray-600 mt-0.5">{pet.species} • {pet.breed} • ${pet.price}</p>
                        {pet.quantity != null && (
                          <span className="text-xs text-gray-500">Qty: {pet.quantity}</span>
                        )}
                      </div>
                    </div>
                    {/* Actions on separate row */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        {typedUser?.isAdmin ? (
                          <button
                            onClick={() => togglePetAvailabilityMutation.mutate({ id: pet.id, isAvailable: !pet.isAvailable })}
                            disabled={togglePetAvailabilityMutation.isPending}
                            title={pet.isAvailable ? "Click to hide from customers" : "Click to show to customers"}
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${pet.isAvailable ? 'bg-green-100 text-green-700 border-green-400 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600' : 'bg-orange-100 text-orange-700 border-orange-400 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-600'}`}
                          >
                            {pet.isAvailable ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {pet.isAvailable ? "Available" : "Unavailable"}
                          </button>
                        ) : (
                          <Badge variant={pet.isAvailable ? "default" : "secondary"} className="text-xs">
                            {pet.isAvailable ? "Available" : "Unavailable"}
                          </Badge>
                        )}
                        {pet.quantity != null && (
                          <span className="text-xs text-gray-500">Qty: {pet.quantity}</span>
                        )}
                      </div>
                      {typedUser?.isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingPet(pet)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPetToDelete(pet)}
                            disabled={deletePetMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {petsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPetsPage(prev => Math.max(1, prev - 1))}
                    disabled={petsPage === 1}
                    data-testid="button-pets-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <div className="text-sm text-gray-600">
                    Page {petsPage} of {petsTotalPages}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPetsPage(prev => Math.min(petsTotalPages, prev + 1))}
                    disabled={petsPage === petsTotalPages}
                    data-testid="button-pets-next-page"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>}

          {/* Supplies Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Supplies ({suppliesTotal}{supplySearchQuery.trim() ? ` found` : ` total`})
                </CardTitle>
                {typedUser?.isAdmin && (
                  <Dialog open={isAddSupplyOpen} onOpenChange={setIsAddSupplyOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-brand-orange hover:bg-orange-600">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Supply
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add New Supply</DialogTitle>
                        <DialogDescription>Add a new supply item to your inventory.</DialogDescription>
                      </DialogHeader>
                      <AddSupplyForm onSubmit={(data) => createSupplyMutation.mutate(data)} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Search bar + category filter */}
              <div className="mb-4 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search supplies by name, brand, or category..."
                    value={supplySearchQuery}
                    onChange={(e) => {
                      setSupplySearchQuery(e.target.value);
                      setSuppliesPage(0);
                    }}
                    className="w-full pl-10 pr-16 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    data-testid="input-supply-search"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {supplySearchQuery && (
                      <button
                        onClick={() => { setSupplySearchQuery(''); setSuppliesPage(0); }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1"
                        data-testid="button-clear-supply-search"
                      >
                        ×
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAdminScanner(true)}
                      className="text-gray-400 hover:text-brand-orange p-1"
                      title="Scan barcode"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <path d="M3 5v2M3 19v-2M21 5v2M21 19v-2M3 5h2M3 19h2M21 5h-2M21 19h-2"/>
                        <rect x="7" y="7" width="3" height="10" rx="0.5"/>
                        <rect x="14" y="7" width="3" height="10" rx="0.5"/>
                        <rect x="11" y="7" width="1" height="10" rx="0.5"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <select
                  value={supplyCategoryFilter}
                  onChange={(e) => {
                    setSupplyCategoryFilter(e.target.value);
                    setSuppliesPage(0);
                  }}
                  className="sm:w-56 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                  data-testid="select-supply-category-filter"
                >
                  <option value="">All Categories</option>
                  {categoryDefs.map((cat) => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>
              {showAdminScanner && (
                <BarcodeScanner
                  onClose={() => setShowAdminScanner(false)}
                  onDetected={async (upc: string) => {
                    setShowAdminScanner(false);
                    try {
                      const res = await fetch(`/api/supplies/by-upc/${upc}`, { credentials: 'include' });
                      if (res.ok) {
                        // Product found — populate search to highlight it
                        setSupplySearchQuery(upc);
                        setSuppliesPage(0);
                        toast({ title: "Product Found", description: `UPC ${upc} matched a product in your inventory.` });
                      } else {
                        // Not found — prompt to add it with UPC pre-filled
                        setScannerAddUpc(upc);
                      }
                    } catch {
                      setScannerAddUpc(upc);
                    }
                  }}
                />
              )}

              {/* "Not in database" prompt from barcode scan */}
              <Dialog open={scannerAddUpc !== null} onOpenChange={(o) => { if (!o) setScannerAddUpc(null); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Product Not Found — Add It?</DialogTitle>
                    <DialogDescription>
                      UPC <span className="font-mono font-bold">{scannerAddUpc}</span> is not in your inventory yet. Fill in the details below to add it — the UPC has been pre-filled in the SKU field.
                    </DialogDescription>
                  </DialogHeader>
                  {scannerAddUpc !== null && (
                    <AddSupplyForm
                      key={scannerAddUpc}
                      initialUpc={scannerAddUpc}
                      onSubmit={(data) => createSupplyMutation.mutate(data)}
                    />
                  )}
                </DialogContent>
              </Dialog>
              <div className="space-y-3">
                {(supplies as any[]).map((supply: any) => (
                  <div key={supply.id} className="p-3 border rounded-lg">
                    <div className="flex gap-3">
                      {/* Supply Thumbnail - use imageUrl or first imageUrls entry */}
                      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                        {(supply.imageUrl || supply.imageUrls?.[0]) ? (
                          <img 
                            src={getProductImageUrl(supply.imageUrl || supply.imageUrls?.[0])} 
                            alt={supply.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                            data-testid={`img-supply-thumbnail-${supply.id}`}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center ${(supply.imageUrl || supply.imageUrls?.[0]) ? 'hidden' : ''}`}>
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                      {/* Name gets full remaining width */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm leading-snug" title={supply.name}>{supply.name}</h3>
                        <p className="text-xs text-gray-600 mt-0.5">{supply.brand} • ${supply.price} • Stock: {supply.stockQuantity}{supply.sku ? ` • SKU: ${supply.sku}` : ''}{supply.upc ? ` • UPC: ${supply.upc}` : ''}</p>
                      </div>
                    </div>
                    {/* Actions on separate row */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <Badge variant={supply.stockQuantity > 0 ? "default" : "destructive"} className="text-xs">
                        {supply.stockQuantity > 0 ? "In Stock" : "Out of Stock"}
                      </Badge>
                      {typedUser?.isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingSupply(supply)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              showDeleteConfirmation(
                                'Delete Supply',
                                'Are you sure you want to delete this supply item? This action cannot be undone.',
                                supply.name,
                                () => deleteSupplyMutation.mutate(supply.id)
                              );
                            }}
                            disabled={deleteSupplyMutation.isPending}
                            data-testid={`button-delete-supply-${supply.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination Controls */}
              {suppliesTotalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Page {suppliesPage + 1} of {suppliesTotalPages} • Showing {supplies.length} of {suppliesTotal} items
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSuppliesPage(prev => Math.max(0, prev - 1))}
                      disabled={suppliesPage === 0}
                      data-testid="button-supplies-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSuppliesPage(prev => Math.min(suppliesTotalPages - 1, prev + 1))}
                      disabled={suppliesPage >= suppliesTotalPages - 1}
                      data-testid="button-supplies-next-page"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          {/* Orders Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Orders & Refunds</h2>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search orders by customer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-10 border-gray-300 rounded-xl"
              data-testid="input-search-orders"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                data-testid="button-clear-search-orders"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* All Orders Section with Refund Management */}
          {typedUser?.isAdmin && (
            <div className="space-y-4">
              {/* Pending Orders Section */}
              <Button
                variant="outline"
                className="w-full justify-between border-2 border-orange-300 bg-orange-50 hover:bg-orange-100"
                onClick={() => setShowPendingOrders(!showPendingOrders)}
              >
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  Pending Orders ({allOrdersWithItems.filter((o: any) => 
                    o.approvalStatus !== 'picked_up' && o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'refunded'
                  ).length})
                </span>
                {showPendingOrders ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </Button>
              
              {showPendingOrders && (() => {
                const pendingOrdersList = allOrdersWithItems.filter((order: any) => {
                  const isPending = order.approvalStatus !== 'picked_up' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'refunded';
                  if (search) {
                    const searchLower = search.toLowerCase();
                    return ((order.customerName || '').toLowerCase().includes(searchLower) ||
                           (order.customerEmail || '').toLowerCase().includes(searchLower)) && isPending;
                  }
                  return isPending;
                });
                
                return pendingOrdersList.length > 0 ? (
                  <Card className="border-orange-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base text-orange-700">
                        <Clock className="w-5 h-5" />
                        Orders Awaiting Action
                      </CardTitle>
                      <p className="text-sm text-gray-600">
                        Approve orders, mark as ready, or mark as picked up.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {pendingOrdersList.map((order: any) => (
                          <Card key={order.id} className="border overflow-hidden">
                            <CardContent className="p-3">
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <Badge variant="secondary" className={
                                    order.approvalStatus === 'ready_for_pickup' ? 'bg-green-600 text-white' :
                                    order.approvalStatus === 'approved' ? 'bg-blue-600 text-white' :
                                    'bg-orange-500 text-white'
                                  }>
                                    {order.approvalStatus === 'ready_for_pickup' ? 'Ready for Pickup' :
                                     order.approvalStatus === 'approved' ? 'Approved' :
                                     'Pending Approval'}
                                  </Badge>
                                  {order.paymentStatus && (
                                    <Badge variant="outline" className={
                                      order.paymentStatus === 'paid' ? 'border-green-600 text-green-600 bg-green-50' :
                                      order.paymentStatus === 'pending' ? 'border-yellow-600 text-yellow-600 bg-yellow-50' :
                                      order.paymentStatus === 'failed' ? 'border-red-600 text-red-600 bg-red-50' :
                                      order.paymentStatus === 'expired' ? 'border-gray-500 text-gray-500 bg-gray-50' :
                                      order.paymentStatus === 'manual_required' ? 'border-orange-600 text-orange-600 bg-orange-50' :
                                      'border-gray-400 text-gray-400'
                                    }>
                                      {order.paymentStatus === 'paid' ? '$ Paid' :
                                       order.paymentStatus === 'pending' ? '$ Awaiting Payment' :
                                       order.paymentStatus === 'failed' ? '$ Payment Failed' :
                                       order.paymentStatus === 'expired' ? '$ Link Expired' :
                                       order.paymentStatus === 'manual_required' ? '$ Manual Payment' :
                                       '$ Unpaid'}
                                    </Badge>
                                  )}
                                  <span className="text-sm text-gray-500">Order #{order.id}</span>
                                  <span className="text-xs text-gray-400">
                                    {new Date(order.orderDate).toLocaleDateString()}
                                  </span>
                                </div>
                                
                                <p className="font-semibold">{order.customerName || 'Unknown Customer'}</p>
                                {order.customerEmail && (
                                  <a href={`mailto:${order.customerEmail}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {order.customerEmail}
                                  </a>
                                )}
                                {order.customerPhone && (
                                  <a href={`tel:${order.customerPhone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {order.customerPhone}
                                  </a>
                                )}
                                
                                <div className="mt-2 space-y-1">
                                  <p className="text-sm font-medium">Items ({order.items?.length || 0}):</p>
                                  {(order.items || []).map((item: any, idx: number) => (
                                    <p key={idx} className="text-sm text-gray-700 break-words">
                                      • {item.itemName || item.productName || 'Item'} x{item.quantity} - ${item.price}
                                    </p>
                                  ))}
                                </div>
                                
                                {order.customerNotes && (
                                  <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-300 dark:border-yellow-700">
                                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-0.5">Customer Notes:</p>
                                    <p className="text-sm text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap break-words">{order.customerNotes}</p>
                                  </div>
                                )}

                                {parseFloat(order.discountAmount || "0") > 0 && (
                                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-green-700 dark:text-green-400">Discount Applied</span>
                                      <span className="text-sm font-bold text-green-700 dark:text-green-400">-${parseFloat(order.discountAmount).toFixed(2)}</span>
                                    </div>
                                    {order.discountReason && (
                                      <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                                        {order.discountReason.startsWith('Astro Loyalty Reward:') 
                                          ? (() => {
                                              try {
                                                const jsonStr = order.discountReason.replace('Astro Loyalty Reward: ', '');
                                                const info = JSON.parse(jsonStr);
                                                const rewardCount = info.appliedRewards?.length || 1;
                                                return `Astro Loyalty - ${rewardCount} free bag reward${rewardCount > 1 ? 's' : ''} redeemed`;
                                              } catch { return 'Astro Loyalty Reward Applied'; }
                                            })()
                                          : order.discountReason}
                                      </p>
                                    )}
                                  </div>
                                )}
                                
                                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                  <p className="font-bold text-lg">${parseFloat(order.totalAmount || 0).toFixed(2)}</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {order.approvalStatus === 'pending_approval' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                          onClick={() => {
                                            setEditingOrder(order);
                                            const existingItems = (order.items || []).map((item: any) => ({
                                              id: item.id,
                                              supplyId: item.supplyId,
                                              itemName: item.itemName || item.productName,
                                              productName: item.productName || item.itemName,
                                              price: item.price,
                                              quantity: item.quantity
                                            }));
                                            setEditOrderItems(existingItems);
                                            setEditOrderModalOpen(true);
                                          }}
                                        >
                                          <Pencil className="w-3 h-3 mr-1" />
                                          Edit
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-green-500 text-green-600 hover:bg-green-50"
                                          onClick={() => {
                                            setDiscountOrderId(order.id);
                                            setDiscountAmount(order.discountAmount && parseFloat(order.discountAmount) > 0 ? order.discountAmount : '');
                                            setDiscountReason(order.discountReason || '');
                                            setDiscountModalOpen(true);
                                          }}
                                        >
                                          <Tag className="w-3 h-3 mr-1" />
                                          {parseFloat(order.discountAmount || "0") > 0 ? 'Edit Discount' : 'Discount'}
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="bg-blue-600 hover:bg-blue-700"
                                          onClick={() => approveOrderMutation.mutate(order.id)}
                                          disabled={approveOrderMutation.isPending}
                                        >
                                          {approveOrderMutation.isPending ? "Approving..." : "Approve"}
                                        </Button>
                                      </>
                                    )}
                                    {order.approvalStatus === 'approved' && (
                                      <>
                                        {(order.paymentStatus === 'paid' || order.paymentStatus === 'manual_required' || parseFloat(order.totalAmount || '0') <= 0) ? (
                                          <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700"
                                            onClick={() => orderReadyMutation.mutate(order.id)}
                                          >
                                            {parseFloat(order.totalAmount || '0') <= 0 ? 'Mark Ready (No Payment)' : (order.paymentStatus === 'manual_required' ? 'Mark Ready (Manual Pay)' : 'Mark Ready')}
                                          </Button>
                                        ) : (
                                          <>
                                            <span className="text-xs text-yellow-600 italic">Waiting for payment...</span>
                                            {(order.paymentStatus === 'payment_failed' || order.paymentStatus === 'failed') && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-red-500 text-red-600 hover:bg-red-50"
                                                onClick={async () => {
                                                  try {
                                                    const res = await fetch(`/api/admin/orders/${order.id}/retry-payment`, {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      credentials: 'include',
                                                    });
                                                    const data = await res.json();
                                                    if (data.success) {
                                                      toast({ title: "Payment Charged", description: `$${parseFloat(order.totalAmount).toFixed(2)} charged successfully` });
                                                      queryClient.invalidateQueries({ queryKey: ['/api/admin/pending-orders'] });
                                                    } else {
                                                      toast({ title: "Payment Failed", description: data.message, variant: "destructive" });
                                                    }
                                                  } catch (err: any) {
                                                    toast({ title: "Error", description: err.message, variant: "destructive" });
                                                  }
                                                }}
                                              >
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Retry Payment
                                              </Button>
                                            )}
                                          </>
                                        )}
                                        {order.stripePaymentUrl && order.paymentStatus !== 'paid' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-blue-500 text-blue-600"
                                            onClick={() => {
                                              window.open(order.stripePaymentUrl, '_blank');
                                            }}
                                          >
                                            View Payment Link
                                          </Button>
                                        )}
                                      </>
                                    )}
                                    {order.approvalStatus === 'ready_for_pickup' && (
                                      <Button
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700"
                                        onClick={() => orderPickedUpMutation.mutate(order.id)}
                                      >
                                        Mark Picked Up
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-400 text-red-600 hover:bg-red-50"
                                      onClick={() => showDeleteConfirmation(
                                        'Delete Order',
                                        `Are you sure you'd like to delete Order #${order.id} for ${order.customerName || 'this customer'}? This will permanently remove it from all order history and cannot be undone.`,
                                        `Order #${order.id} — $${parseFloat(order.totalAmount || 0).toFixed(2)}`,
                                        () => deleteOrderMutation.mutate(order.id),
                                        'Delete Order',
                                        'destructive'
                                      )}
                                      disabled={deleteOrderMutation.isPending}
                                    >
                                      <Trash2 className="w-3 h-3 mr-1" />
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-orange-200">
                    <CardContent className="p-4 text-center text-gray-500">
                      No pending orders
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Completed Orders Section */}
              <Button
                variant="outline"
                className="w-full justify-between border-2 border-gray-200 bg-gray-50 hover:bg-gray-100"
                onClick={() => setShowCompletedOrders(!showCompletedOrders)}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  Completed Orders ({allOrdersWithItems.filter((o: any) => o.approvalStatus === 'picked_up' || o.status === 'completed').length})
                </span>
                {showCompletedOrders ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </Button>
              
              {showCompletedOrders && (() => {
                const completedOrdersList = allOrdersWithItems.filter((order: any) => {
                  if (search) {
                    const searchLower = search.toLowerCase();
                    return ((order.customerName || '').toLowerCase().includes(searchLower) ||
                           (order.customerEmail || '').toLowerCase().includes(searchLower)) &&
                           (order.approvalStatus === 'picked_up' || order.status === 'completed');
                  }
                  return order.approvalStatus === 'picked_up' || order.status === 'completed';
                });
                const ordersPerPage = 5;
                const totalOrderPages = Math.ceil(completedOrdersList.length / ordersPerPage);
                const currentOrderPage = Math.min(completedOrdersPage, Math.max(0, totalOrderPages - 1));
                const paginatedOrders = completedOrdersList.slice(currentOrderPage * ordersPerPage, (currentOrderPage + 1) * ordersPerPage);
                
                return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShoppingBag className="w-5 h-5" />
                      Order History & Refunds
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Refunds are recorded here. When electronic payments are connected, refunds will process automatically.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {paginatedOrders.map((order: any) => (
                          <Card key={order.id} className="border overflow-hidden">
                            <CardContent className="p-3 overflow-hidden">
                              <div className="flex flex-col gap-3 overflow-hidden">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <Badge variant={order.approvalStatus === 'picked_up' ? 'default' : 'secondary'} className="bg-green-600">
                                      {order.approvalStatus === 'picked_up' ? 'Completed' : order.approvalStatus || order.status}
                                    </Badge>
                                    <span className="text-sm text-gray-500">Order #{order.id}</span>
                                    <span className="text-xs text-gray-400">
                                      {new Date(order.orderDate).toLocaleDateString()}
                                    </span>
                                  </div>
                                  
                                  <p className="font-semibold">{order.customerName || 'Unknown Customer'}</p>
                                  {order.customerEmail && (
                                    <a href={`mailto:${order.customerEmail}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      {order.customerEmail}
                                    </a>
                                  )}
                                  {order.customerPhone && (
                                    <a href={`tel:${order.customerPhone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                      <Phone className="w-3 h-3" />
                                      {order.customerPhone}
                                    </a>
                                  )}
                                  
                                  <div className="mt-2 space-y-1 min-w-0">
                                    <p className="text-sm font-medium">Items ({order.items?.length || 0}):</p>
                                    {(order.items || []).slice(0, 3).map((item: any, idx: number) => (
                                      <p key={idx} className="text-sm text-gray-700 break-words">
                                        • {item.itemName || item.productName || 'Item'} x{item.quantity} - ${item.price}
                                        {item.refundedQuantity > 0 && (
                                          <span className="text-red-600 ml-2">
                                            (Refunded: {item.refundedQuantity})
                                          </span>
                                        )}
                                      </p>
                                    ))}
                                    {(order.items?.length || 0) > 3 && (
                                      <p className="text-xs text-gray-500">+{order.items.length - 3} more items</p>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                                    <p className="text-lg font-bold text-green-700">
                                      Total: ${order.totalAmount}
                                    </p>
                                    {order.taxAmount && parseFloat(order.taxAmount) > 0 && (
                                      <p className="text-xs text-gray-500">
                                        (Tax: ${order.taxAmount})
                                      </p>
                                    )}
                                    {order.convenienceFee && parseFloat(order.convenienceFee) > 0 && (
                                      <p className="text-xs text-gray-500">
                                        (Fee: ${order.convenienceFee})
                                      </p>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedOrderForRefund(order);
                                      setSelectedRefundItems({});
                                      setRefundReason('');
                                      setRefundNotes('');
                                      setIncludeConvenienceFee(false);
                                      setRefundModalOpen(true);
                                    }}
                                    className="border-red-300 text-red-700 hover:bg-red-50"
                                  >
                                    <RotateCcw className="w-4 h-4 mr-1" />
                                    Refund
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/admin/orders/${order.id}/sync-astro`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          credentials: 'include',
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                          toast({ title: "Astro Synced", description: `Order #${order.id} synced to Astro Loyalty` });
                                        } else {
                                          toast({ title: "Sync Failed", description: data.message, variant: "destructive" });
                                        }
                                      } catch (err: any) {
                                        toast({ title: "Error", description: err.message, variant: "destructive" });
                                      }
                                    }}
                                    className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                  >
                                    <RefreshCw className="w-4 h-4 mr-1" />
                                    Sync Astro
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      if (confirm(`Delete Order #${order.id} from admin view?\n\nThis will remove it from your completed orders list, but the customer will still see it in their order history.`)) {
                                        try {
                                          await apiRequest('POST', `/api/admin/orders/${order.id}/hide`);
                                          queryClient.invalidateQueries({ queryKey: ['/api/admin/orders-with-items'] });
                                          toast({
                                            title: "Order Removed",
                                            description: `Order #${order.id} has been removed from admin view.`,
                                          });
                                        } catch (err) {
                                          console.error('Failed to hide order:', err);
                                          toast({
                                            title: "Error",
                                            description: "Failed to remove order. Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      }
                                    }}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      
                      {completedOrdersList.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No completed orders yet</p>
                        </div>
                      )}
                      
                      {totalOrderPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-3 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCompletedOrdersPage(prev => Math.max(0, prev - 1))}
                            disabled={currentOrderPage === 0}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-gray-600">
                            Page {currentOrderPage + 1} of {totalOrderPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCompletedOrdersPage(prev => Math.min(totalOrderPages - 1, prev + 1))}
                            disabled={currentOrderPage >= totalOrderPages - 1}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
              })()}

              {/* Online Grooming Payments Section */}
              <Button
                variant="outline"
                className="w-full justify-between border-2 border-purple-300 bg-purple-50 hover:bg-purple-100"
                onClick={() => setShowGroomingPayments(!showGroomingPayments)}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                  Online Grooming Payments ({(groomingPayments as any[]).filter((a: any) => {
                    if (!search) return true;
                    const q = search.toLowerCase();
                    return `${a.ownerFirstName} ${a.ownerLastName}`.toLowerCase().includes(q) ||
                      (a.customerEmail || '').toLowerCase().includes(q) ||
                      (a.ownerPhoneNumber || '').includes(q);
                  }).length})
                </span>
                {showGroomingPayments ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </Button>

              {showGroomingPayments && (() => {
                const filteredGP = (groomingPayments as any[]).filter((a: any) => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  return `${a.ownerFirstName} ${a.ownerLastName}`.toLowerCase().includes(q) ||
                    (a.customerEmail || '').toLowerCase().includes(q) ||
                    (a.ownerPhoneNumber || '').includes(q);
                });
                return (
                  <Card className="border-purple-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base text-purple-700">
                        <CreditCard className="w-5 h-5" />
                        Online Grooming Payments
                      </CardTitle>
                      <p className="text-sm text-gray-600">
                        Grooming appointments paid online via Stripe. These are permanent charges and are never reset.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {filteredGP.length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No online grooming payments yet</p>
                          </div>
                        )}
                        {filteredGP.map((appt: any) => (
                          <Card key={appt.id} className="border border-purple-100 overflow-hidden">
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Badge className="bg-purple-600 text-white">Paid Online</Badge>
                                    <span className="text-sm text-gray-500">Appt #{appt.id}</span>
                                    <span className="text-xs text-gray-400">
                                      {(() => {
                                        const d = appt.appointmentDate;
                                        return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
                                          ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                          : new Date(d).toLocaleDateString();
                                      })()}
                                    </span>
                                  </div>
                                  <p className="font-semibold">{appt.ownerFirstName} {appt.ownerLastName}</p>
                                  {appt.customerEmail && (
                                    <a href={`mailto:${appt.customerEmail}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      {appt.customerEmail}
                                    </a>
                                  )}
                                  {appt.ownerPhoneNumber && (
                                    <a href={`tel:${appt.ownerPhoneNumber}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                      <Phone className="w-3 h-3" />
                                      {appt.ownerPhoneNumber}
                                    </a>
                                  )}
                                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                                    <p>🐾 {appt.petName || 'Pet'} ({appt.petType || 'unknown'})</p>
                                    <p>✂️ {appt.serviceType === 'grooming-full' ? 'Full Grooming' : appt.serviceType === 'grooming-bath' ? 'Bath Only' : appt.serviceType}</p>
                                    <p>🕐 {appt.appointmentTime}</p>
                                    {appt.groomerName && <p>💼 Groomer: {appt.groomerName}</p>}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-lg font-bold text-green-700">${appt.finalAmount || '0.00'}</p>
                                  {appt.groomingStripeSessionId && (
                                    <p className="text-xs text-gray-400 mt-1 font-mono">
                                      {appt.groomingStripeSessionId.slice(0, 16)}…
                                    </p>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
          
          {/* Edit Order Modal */}
          <Dialog open={editOrderModalOpen} onOpenChange={setEditOrderModalOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Order #{editingOrder?.id}</DialogTitle>
              </DialogHeader>
              
              {editingOrder && (
                <div className="space-y-4">
                  {/* Customer Contact Info */}
                  <div className="bg-gray-50 border rounded-lg p-3">
                    <p className="font-semibold text-lg">{editingOrder.customerName || 'Customer'}</p>
                    {editingOrder.customerEmail && (
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <a href={`mailto:${editingOrder.customerEmail}`} className="text-blue-600 hover:underline">
                          {editingOrder.customerEmail}
                        </a>
                      </p>
                    )}
                    {editingOrder.customerPhone && (
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        <a href={`tel:${editingOrder.customerPhone}`} className="text-blue-600 hover:underline">
                          {editingOrder.customerPhone}
                        </a>
                      </p>
                    )}
                  </div>

                  {/* Current Items */}
                  <div>
                    <p className="font-medium mb-2">Order Items:</p>
                    {editOrderItems.filter(it => it.quantity > 0).length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No items in order</p>
                    ) : (
                      <div className="space-y-2">
                        {editOrderItems.filter(it => it.quantity > 0).map((item: any, idx: number) => {
                          const actualIdx = editOrderItems.findIndex(it => it === item);
                          return (
                            <div key={item.id || idx} className="flex items-center justify-between gap-3 p-3 border rounded bg-white">
                              <div className="flex-1">
                                <p className="font-medium text-sm">{item.itemName || item.productName || 'Item'}</p>
                                <p className="text-xs text-gray-500">${item.price} each</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditOrderItems(prev => prev.map((it, i) => 
                                      i === actualIdx ? { ...it, quantity: Math.max(0, it.quantity - 1) } : it
                                    ));
                                  }}
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                                <span className="w-8 text-center font-medium">{item.quantity}</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditOrderItems(prev => prev.map((it, i) => 
                                      i === actualIdx ? { ...it, quantity: it.quantity + 1 } : it
                                    ));
                                  }}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setEditOrderItems(prev => prev.filter((_, i) => i !== actualIdx));
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add Items from Inventory */}
                  <div className="border-t pt-3">
                    <p className="font-medium mb-2">Add Items from Inventory:</p>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Search products..."
                        value={editOrderSearchQuery}
                        onChange={async (e) => {
                          const query = e.target.value;
                          setEditOrderSearchQuery(query);
                          if (query.length >= 2) {
                            setIsSearchingProducts(true);
                            try {
                              const res = await fetch(`/api/supplies?search=${encodeURIComponent(query)}&limit=5`);
                              const data = await res.json();
                              setEditOrderSearchResults(data.items || []);
                            } catch (err) {
                              console.error('Search error:', err);
                            } finally {
                              setIsSearchingProducts(false);
                            }
                          } else {
                            setEditOrderSearchResults([]);
                          }
                        }}
                        className="pl-10"
                      />
                    </div>
                    
                    {isSearchingProducts && (
                      <p className="text-sm text-gray-500 mt-2">Searching...</p>
                    )}
                    
                    {editOrderSearchResults.length > 0 && (
                      <div className="mt-2 border rounded max-h-48 overflow-y-auto">
                        {editOrderSearchResults.map((product: any) => (
                          <div 
                            key={product.id} 
                            className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer"
                            onClick={() => {
                              // Check if item already exists in order
                              const existingIdx = editOrderItems.findIndex(it => it.supplyId === product.id);
                              if (existingIdx >= 0) {
                                // Increase quantity
                                setEditOrderItems(prev => prev.map((it, i) => 
                                  i === existingIdx ? { ...it, quantity: it.quantity + 1 } : it
                                ));
                              } else {
                                // Add new item
                                setEditOrderItems(prev => [...prev, {
                                  supplyId: product.id,
                                  itemName: product.name,
                                  productName: product.name,
                                  price: product.price,
                                  quantity: 1,
                                  category: product.category || 'uncategorized'
                                }]);
                              }
                              setEditOrderSearchQuery('');
                              setEditOrderSearchResults([]);
                            }}
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium">{product.name}</p>
                              <p className="text-xs text-gray-500">${product.price}</p>
                            </div>
                            <Button size="sm" variant="ghost">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t pt-3">
                    <div className="flex justify-between font-semibold">
                      <span>New Subtotal:</span>
                      <span>
                        ${editOrderItems.filter(it => it.quantity > 0).reduce((sum: number, item: any) => 
                          sum + (parseFloat(item.price) * item.quantity), 0
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setEditOrderModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        updateOrderItemsMutation.mutate({
                          orderId: editingOrder.id,
                          items: editOrderItems.filter(it => it.quantity > 0)
                        });
                      }}
                      disabled={updateOrderItemsMutation.isPending}
                    >
                      {updateOrderItemsMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Discount Modal */}
          <Dialog open={discountModalOpen} onOpenChange={(open) => {
            setDiscountModalOpen(open);
            if (!open) {
              setDiscountOrderId(null);
              setDiscountAmount('');
              setDiscountReason('');
            }
          }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Apply Discount to Order #{discountOrderId}</DialogTitle>
                <DialogDescription>
                  Enter the discount amount and reason. The total will be recalculated before any payment is charged.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="discount-amount">Discount Amount ($)</Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="discount-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="discount-reason">Reason</Label>
                  <Textarea
                    id="discount-reason"
                    placeholder="e.g. 20% employee discount, loyalty customer, price match..."
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDiscountModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  disabled={!discountAmount || !discountReason.trim() || applyDiscountMutation.isPending}
                  onClick={() => {
                    if (discountOrderId) {
                      applyDiscountMutation.mutate({
                        orderId: discountOrderId,
                        amount: discountAmount,
                        reason: discountReason,
                      });
                    }
                  }}
                >
                  {applyDiscountMutation.isPending ? 'Applying...' : 'Apply Discount'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Refund Modal */}
          <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Refund - Order #{selectedOrderForRefund?.id}</DialogTitle>
              </DialogHeader>
              
              {selectedOrderForRefund && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> If this order was paid by card, the refund will be automatically returned to the customer's card.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Select Items to Refund</Label>
                    {(() => {
                      const orderSubtotal = parseFloat(selectedOrderForRefund.subtotal || "0");
                      const orderDiscount = parseFloat(selectedOrderForRefund.discountAmount || "0");
                      const orderLoyaltyCredits = parseFloat(selectedOrderForRefund.loyaltyCreditsApplied || "0");
                      const totalDiscount = orderDiscount + orderLoyaltyCredits;
                      const discountRatio = orderSubtotal > 0 ? totalDiscount / orderSubtotal : 0;
                      
                      return (selectedOrderForRefund.items || []).map((item: any) => {
                        const maxRefundable = item.quantity - (item.refundedQuantity || 0);
                        const isSelected = selectedRefundItems[item.id];
                        const originalPrice = parseFloat(item.price);
                        const effectivePrice = Math.max(0, originalPrice * (1 - discountRatio));
                        const hasDiscount = totalDiscount > 0;
                        
                        return (
                          <div key={item.id} className="flex items-center gap-3 p-2 border rounded">
                            <Checkbox
                              checked={!!isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedRefundItems(prev => ({
                                    ...prev,
                                    [item.id]: { 
                                      quantity: maxRefundable, 
                                      amount: (effectivePrice * maxRefundable).toFixed(2)
                                    }
                                  }));
                                } else {
                                  setSelectedRefundItems(prev => {
                                    const newItems = { ...prev };
                                    delete newItems[item.id];
                                    return newItems;
                                  });
                                }
                              }}
                              disabled={maxRefundable <= 0}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.itemName || item.productName || 'Item'}</p>
                              <p className="text-xs text-gray-500">
                                {hasDiscount ? (
                                  <>
                                    <span className="line-through">${originalPrice.toFixed(2)}</span>
                                    <span className="text-green-600 font-medium ml-1">${effectivePrice.toFixed(2)}</span>
                                    <span> x {item.quantity}</span>
                                    <span className="text-green-600 ml-1">(after discount)</span>
                                  </>
                                ) : (
                                  <>${originalPrice.toFixed(2)} x {item.quantity}</>
                                )}
                                {item.refundedQuantity > 0 && (
                                  <span className="text-red-600 ml-1">({item.refundedQuantity} already refunded)</span>
                                )}
                              </p>
                            </div>
                            {isSelected && maxRefundable > 1 && (
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">Qty:</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={maxRefundable}
                                  value={isSelected.quantity}
                                  onChange={(e) => {
                                    const qty = Math.min(Math.max(1, parseInt(e.target.value) || 1), maxRefundable);
                                    setSelectedRefundItems(prev => ({
                                      ...prev,
                                      [item.id]: { 
                                        quantity: qty, 
                                        amount: (effectivePrice * qty).toFixed(2)
                                      }
                                    }));
                                  }}
                                  className="w-16 h-8"
                                />
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Reason for Refund</Label>
                    <Select value={refundReason} onValueChange={setRefundReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer_request">Customer Request</SelectItem>
                        <SelectItem value="defective">Defective Product</SelectItem>
                        <SelectItem value="wrong_item">Wrong Item</SelectItem>
                        <SelectItem value="not_as_described">Not As Described</SelectItem>
                        <SelectItem value="duplicate_charge">Duplicate Charge</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      value={refundNotes}
                      onChange={(e) => setRefundNotes(e.target.value)}
                      placeholder="Additional notes about this refund..."
                      className="h-20"
                    />
                  </div>
                  
                  {selectedOrderForRefund.convenienceFee && parseFloat(selectedOrderForRefund.convenienceFee) > 0 && (
                    <div className="flex items-center gap-3 p-3 border rounded-lg bg-amber-50 border-amber-200">
                      <Checkbox
                        id="includeConvenienceFee"
                        checked={includeConvenienceFee}
                        onCheckedChange={(checked) => setIncludeConvenienceFee(!!checked)}
                      />
                      <label htmlFor="includeConvenienceFee" className="text-sm cursor-pointer">
                        <span className="font-medium">Include convenience fee in refund</span>
                        <span className="text-amber-700 ml-1">(${parseFloat(selectedOrderForRefund.convenienceFee).toFixed(2)})</span>
                      </label>
                    </div>
                  )}

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="font-medium">Refund Summary</p>
                    {(() => {
                      const refundSubtotal = Object.values(selectedRefundItems).reduce((sum, item) => sum + parseFloat(item.amount), 0);
                      const orderSubtotal = parseFloat(selectedOrderForRefund.subtotal || "0");
                      const orderDiscount = parseFloat(selectedOrderForRefund.discountAmount || "0");
                      const orderLoyaltyCredits = parseFloat(selectedOrderForRefund.loyaltyCreditsApplied || "0");
                      const totalDiscount = orderDiscount + orderLoyaltyCredits;
                      const orderTax = parseFloat(selectedOrderForRefund.taxAmount || "0");
                      const orderTotal = parseFloat(selectedOrderForRefund.totalAmount || "0");
                      const orderConvFee = parseFloat(selectedOrderForRefund.convenienceFee || "0");
                      const orderAmountWithoutFees = orderTotal - orderConvFee;
                      const originalSubtotalForSelected = Object.keys(selectedRefundItems).reduce((sum, itemId) => {
                        const orderItem = (selectedOrderForRefund.items || []).find((i: any) => i.id === parseInt(itemId));
                        if (orderItem) {
                          return sum + parseFloat(orderItem.price) * selectedRefundItems[parseInt(itemId)].quantity;
                        }
                        return sum;
                      }, 0);
                      const itemShareOfOrder = orderSubtotal > 0 ? originalSubtotalForSelected / orderSubtotal : 0;
                      const proportionalRefund = orderAmountWithoutFees * itemShareOfOrder;
                      const convFee = includeConvenienceFee ? orderConvFee : 0;
                      const totalRefund = Math.round((proportionalRefund + convFee) * 100) / 100;
                      const maxRefundable = orderTotal;
                      return (
                        <>
                          <p className="text-sm text-gray-600">Subtotal (after discounts): ${refundSubtotal.toFixed(2)}</p>
                          {orderTax > 0 && (
                            <p className="text-sm text-gray-600">Tax: ${(orderTax * itemShareOfOrder).toFixed(2)}</p>
                          )}
                          {convFee > 0 && (
                            <p className="text-sm text-gray-600">Convenience Fee: ${convFee.toFixed(2)}</p>
                          )}
                          {totalDiscount > 0 && (
                            <p className="text-xs text-green-600">Discount applied to order: -${totalDiscount.toFixed(2)}</p>
                          )}
                          <p className="text-2xl font-bold text-red-600">
                            Total Refund: ${totalRefund.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-400">
                            (Order total paid: ${orderTotal.toFixed(2)})
                          </p>
                          {selectedOrderForRefund.paymentStatus === 'paid' && (
                            <p className="text-xs text-green-700 font-medium mt-1">
                              This will be refunded to the customer's card
                            </p>
                          )}
                        </>
                      );
                    })()}
                    <p className="text-xs text-gray-500">
                      {Object.keys(selectedRefundItems).length} item(s) selected
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setRefundModalOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const itemIds = Object.keys(selectedRefundItems);
                        
                        if (itemIds.length === 0) {
                          toast({ title: "Error", description: "Please select at least one item to refund", variant: "destructive" });
                          return;
                        }
                        
                        const orderSubtotalVal = parseFloat(selectedOrderForRefund.subtotal || "0");
                        const orderTaxVal = parseFloat(selectedOrderForRefund.taxAmount || "0");
                        const orderTotalVal = parseFloat(selectedOrderForRefund.totalAmount || "0");
                        const orderConvFeeVal = parseFloat(selectedOrderForRefund.convenienceFee || "0");
                        const orderAmountWithoutFeesVal = orderTotalVal - orderConvFeeVal;
                        
                        const refundItemsData = itemIds.map(itemId => {
                          const refundItem = selectedRefundItems[parseInt(itemId)];
                          const itemSubtotal = parseFloat(refundItem.amount);
                          const orderItem = (selectedOrderForRefund.items || []).find((i: any) => i.id === parseInt(itemId));
                          const originalItemPrice = orderItem ? parseFloat(orderItem.price) * refundItem.quantity : 0;
                          const itemShare = orderSubtotalVal > 0 ? originalItemPrice / orderSubtotalVal : 0;
                          const proportionalItemRefund = orderAmountWithoutFeesVal * itemShare;
                          const itemTax = Math.round((orderTaxVal * itemShare) * 100) / 100;
                          const itemTotal = Math.round(proportionalItemRefund * 100) / 100;
                          
                          return {
                            orderItemId: parseInt(itemId),
                            quantity: refundItem.quantity,
                            subtotal: itemSubtotal.toFixed(2),
                            tax: itemTax.toFixed(2),
                            total: itemTotal.toFixed(2),
                          };
                        });
                        
                        createRefundMutation.mutate({
                          orderId: selectedOrderForRefund.id,
                          items: refundItemsData,
                          reason: refundReason || 'Customer request',
                          notes: refundNotes,
                          refundType: includeConvenienceFee ? 'full' : 'partial',
                          includeConvenienceFee: includeConvenienceFee,
                        });
                        
                        setRefundModalOpen(false);
                      }}
                      disabled={Object.keys(selectedRefundItems).length === 0 || createRefundMutation.isPending}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {createRefundMutation.isPending ? 'Processing...' : 'Process Refund'}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Appointments Tab - Separate from Orders */}
        <TabsContent value="appointments" className="space-y-6">
          {/* Appointments Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Appointments</h2>
            <Button 
              onClick={() => setIsBookAppointmentOpen(true)}
              className="bg-brand-blue hover:bg-blue-700 text-white"
              data-testid="button-book-appointment-admin"
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              Book Appointment
            </Button>
          </div>

          {/* Appointment Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search appointments by customer name, phone, or pet name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-10 border-gray-300 rounded-xl"
              data-testid="input-search-appointments"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                data-testid="button-clear-search-appointments"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Approved Appointments - Collapsible Button */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <Button
                variant="outline"
                className="flex-1 justify-between border-2 border-green-200 bg-green-50 hover:bg-green-100 text-green-700"
                onClick={() => setShowApprovedAppointments(!showApprovedAppointments)}
                data-testid="button-toggle-approved"
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Approved Appointments ({Object.values(groupedApprovedAppointments).flat().length})
                </span>
                {showApprovedAppointments ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </Button>
              {typedUser?.isAdmin && (
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    showDeleteConfirmation(
                      'Clear Past Approved Appointments',
                      'This will permanently delete all approved appointments with dates in the past. This action cannot be undone.',
                      'All past approved appointments',
                      () => cleanupPastAppointmentsMutation.mutate(['confirmed', 'completed'])
                    );
                  }}
                  disabled={cleanupPastAppointmentsMutation.isPending}
                  data-testid="button-cleanup-past-approved"
                  className="bg-red-50 border-red-200 hover:bg-red-100 text-red-700 sm:w-auto"
                >
                  <Trash2 className={`w-4 h-4 mr-2`} />
                  {cleanupPastAppointmentsMutation.isPending ? 'Cleaning...' : 'Clear Past'}
                </Button>
              )}
            </div>

            {showApprovedAppointments && (() => {
              const phoneGroups = sortGroupedAppointmentsByEarliest(Object.entries(groupedApprovedAppointments));
              const totalPages = Math.ceil(phoneGroups.length / APPOINTMENTS_PER_PAGE);
              const startIdx = approvedAppointmentsPage * APPOINTMENTS_PER_PAGE;
              const paginatedPhoneGroups = phoneGroups.slice(startIdx, startIdx + APPOINTMENTS_PER_PAGE);

              const handleApprovedTouchStart = (e: React.TouchEvent) => {
                setApprovedTouchStart(e.targetTouches[0].clientX);
              };

              const handleApprovedTouchMove = (e: React.TouchEvent) => {
                setApprovedTouchEnd(e.targetTouches[0].clientX);
              };

              const handleApprovedTouchEnd = () => {
                if (!approvedTouchStart || !approvedTouchEnd) return;
                const distance = approvedTouchStart - approvedTouchEnd;
                const minSwipeDistance = 50;
                
                if (distance > minSwipeDistance && approvedAppointmentsPage < totalPages - 1) {
                  setApprovedAppointmentsPage(prev => prev + 1);
                }
                if (distance < -minSwipeDistance && approvedAppointmentsPage > 0) {
                  setApprovedAppointmentsPage(prev => prev - 1);
                }
                
                setApprovedTouchStart(0);
                setApprovedTouchEnd(0);
              };

              return (
                <Card className="border-2 border-green-200 bg-green-50/30">
                  <CardContent className="pt-3 pb-3">
                    <div 
                      className="space-y-2"
                      onTouchStart={handleApprovedTouchStart}
                      onTouchMove={handleApprovedTouchMove}
                      onTouchEnd={handleApprovedTouchEnd}
                    >
                      {paginatedPhoneGroups.map(([phone, phoneAppointments]) => {
                        const currentAppointment = getCurrentAppointment(phone, phoneAppointments);
                        const isHighlighted = matchesSearch(currentAppointment, 'appointment');
                        const hasMultiple = phoneAppointments.length > 1;
                        
                        return (
                        <div 
                          key={`${phone}-${currentAppointment.id}`}
                          className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between p-3 border rounded-lg gap-2 ${
                            isHighlighted 
                              ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                              : 'border bg-white'
                          }`}
                        >
                          <div 
                            className="flex-1 p-1.5 rounded min-w-0 cursor-pointer hover:bg-gray-50"
                            onClick={() => setSelectedAppointment(currentAppointment)}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <h3 className="font-semibold text-sm">{getCombinedServiceLabel(currentAppointment)}</h3>
                              {currentAppointment.source === 'google_calendar' && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs px-1.5 py-0">
                                  <CalendarIcon className="w-3 h-3 mr-0.5" />
                                  Synced
                                </Badge>
                              )}
                              {currentAppointment.source !== 'google_calendar' && (
                                currentAppointment.bookedByAdmin ? (
                                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 text-xs px-1.5 py-0">
                                    Booked by Staff
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 text-xs px-1.5 py-0">
                                    Booked by Customer
                                  </Badge>
                                )
                              )}
                              {hasMultiple && (
                                <Badge 
                                  variant="outline" 
                                  className="bg-purple-500 text-white border-purple-600 text-xs cursor-pointer hover:bg-purple-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cycleAppointmentGroup(phone, groupedApprovedAppointments);
                                  }}
                                >
                                  {appointmentGroupIndexes[phone] !== undefined ? appointmentGroupIndexes[phone] + 1 : 1} / {phoneAppointments.length}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 space-y-0.5">
                              <p className="break-words">
                                Pet: {currentAppointment.pets && currentAppointment.pets.length > 0 
                                  ? currentAppointment.pets.map((p: any) => capitalizeWords(p.petName)).join(', ')
                                  : currentAppointment.petName
                                } ({currentAppointment.petType || (currentAppointment.pets && currentAppointment.pets[0]?.petType) || 'dog'})
                              </p>
                              {getAppointmentAddOnLabels(currentAppointment).length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {getAppointmentAddOnLabels(currentAppointment).map((label) => (
                                    <span key={label} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                                      + {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p>Owner: {currentAppointment.ownerFirstName} {currentAppointment.ownerLastName}</p>
                              <p>Phone: {currentAppointment.ownerPhoneNumber}</p>
                              <p className="text-gray-500">{parseLocalDate(currentAppointment.appointmentDate).toLocaleDateString()} at {currentAppointment.appointmentTime}</p>
                            </div>
                            {/* Show contact notes (from contact record) */}
                            {currentAppointment.contactNotes && (
                              <div className="text-xs mt-1.5 p-1.5 bg-amber-50 rounded border border-amber-200" data-testid={`contact-notes-${currentAppointment.id}`}>
                                <span className="font-medium text-amber-800">Contact Notes:</span>{' '}
                                <span className="text-amber-700">{currentAppointment.contactNotes}</span>
                              </div>
                            )}
                            {/* Show all notes - appointment level and per-pet */}
                            {(currentAppointment.specialNotes || (currentAppointment.pets && currentAppointment.pets.some((p: any) => p.specialNotes))) && (
                              <div className="text-xs text-gray-700 mt-1.5 break-words whitespace-pre-wrap" data-testid={`appointment-notes-${currentAppointment.id}`}>
                                <span className="font-medium">Notes:</span>{' '}
                                {currentAppointment.pets && currentAppointment.pets.length > 1 ? (
                                  // Multi-pet: show each pet's notes with pet name
                                  currentAppointment.pets
                                    .filter((p: any) => p.specialNotes)
                                    .map((p: any, idx: number) => (
                                      <div key={idx} className="ml-2 mt-1">
                                        <span className="font-medium text-purple-700">{capitalizeWords(p.petName)}:</span> {p.specialNotes}
                                      </div>
                                    ))
                                ) : (
                                  // Single pet or appointment-level notes
                                  currentAppointment.specialNotes || (currentAppointment.pets?.[0]?.specialNotes)
                                )}
                              </div>
                            )}
                            {currentAppointment.price && (() => {
                              const isConfirmed = currentAppointment.priceConfirmed;
                              const serviceType = (currentAppointment.serviceType || (currentAppointment.pets?.[0]?.serviceType) || '').toLowerCase();
                              const hasFullGrooming = serviceType.includes('full') || serviceType.includes('groom') && !serviceType.includes('bath');
                              const hasPetsWithFullGrooming = currentAppointment.pets?.some((p: any) => {
                                const st = (p.serviceType || '').toLowerCase();
                                return st.includes('full') || (st.includes('groom') && !st.includes('bath'));
                              });
                              const isFullGrooming = hasFullGrooming || hasPetsWithFullGrooming;
                              
                              if (!isConfirmed) {
                                const rangeSetting = isFullGrooming 
                                  ? groomingSettings.find((s: any) => s.setting === 'full_grooming_price')?.value 
                                  : groomingSettings.find((s: any) => s.setting === 'bath_only_price')?.value;
                                const rangeDisplay = rangeSetting || (isFullGrooming ? '40-80' : '20-35');
                                return (
                                  <p className="text-xs text-amber-600 font-bold mt-1 bg-amber-50 px-2 py-1 rounded border border-amber-300" data-testid={`appointment-price-${currentAppointment.id}`}>
                                    ⚠ Price: ${rangeDisplay} (needs update)
                                  </p>
                                );
                              }
                              return (
                                <p className="text-xs text-green-700 font-medium mt-1" data-testid={`appointment-price-${currentAppointment.id}`}>
                                  Price: ${currentAppointment.price}
                                </p>
                              );
                            })()}
                            {currentAppointment.itemsTotal && (
                              <p className="text-xs text-blue-700 font-medium">+ Items: ${currentAppointment.itemsTotal}</p>
                            )}
                            {(() => {
                              const groomerIdToShow = currentAppointment.groomerId || 
                                (currentAppointment.pets && currentAppointment.pets[0]?.groomerId);
                              const groomerNameFromPets = currentAppointment.pets && currentAppointment.pets[0]?.groomerName;
                              if (!groomerIdToShow && !groomerNameFromPets) return null;
                              const groomerName = groomerNameFromPets || groomers.find((g: any) => 
                                g.id === groomerIdToShow || g.id === parseInt(groomerIdToShow as any)
                              )?.name || 'Unknown';
                              return (
                                <p className="text-xs text-blue-700 font-medium mt-1" data-testid={`appointment-groomer-${currentAppointment.id}`}>
                                  Groomer: {groomerName}
                                </p>
                              );
                            })()}
                            <p className="text-xs text-purple-600 mt-0.5 font-medium">{hasMultiple ? 'Click purple badge to cycle through dates' : 'Click to view details'}</p>
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            <div className="flex flex-col sm:flex-row gap-1.5 items-stretch sm:items-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 border-blue-300 hover:bg-blue-50 h-8 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAppointment(currentAppointment);
                                  setEditOwnerFirstName(currentAppointment.ownerFirstName || '');
                                  setEditOwnerLastName(currentAppointment.ownerLastName || '');
                                  setEditOwnerPhone(currentAppointment.ownerPhoneNumber || '');
                                  setEditPetName(currentAppointment.petName || '');
                                  setEditPetType(currentAppointment.petType || '');
                                  setEditNotes(currentAppointment.specialNotes || '');
                                  setEditPrice(currentAppointment.price || '');
                                  setEditDate(currentAppointment.appointmentDate ? new Date(currentAppointment.appointmentDate) : undefined);
                                  setEditTime(currentAppointment.appointmentTime || '');
                                  setEditGroomerId(currentAppointment.groomerId || null);
                                  setEditServiceType(normalizeServiceType(currentAppointment.serviceType || currentAppointment.service));
                                }}
                                data-testid={`edit-appointment-${currentAppointment.id}`}
                              >
                                <Edit className="w-3.5 h-3.5 mr-1" />
                                Edit
                              </Button>
                              <Select
                                key={`appointment-${currentAppointment.id}-${currentAppointment.status}`}
                                value={currentAppointment.status}
                                onValueChange={(status) => updateAppointmentMutation.mutate({ id: currentAppointment.id, status })}
                              >
                                <SelectTrigger className="w-28 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="scheduled">Pending</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 border rounded bg-white">
                              <Checkbox
                                id={`is-here-${currentAppointment.id}`}
                                checked={currentAppointment.isHere || false}
                                onCheckedChange={(checked) => {
                                  updateAppointmentIsHereMutation.mutate({ 
                                    id: currentAppointment.id, 
                                    isHere: checked as boolean 
                                  });
                                }}
                                data-testid={`checkbox-is-here-${currentAppointment.id}`}
                              />
                              <label 
                                htmlFor={`is-here-${currentAppointment.id}`}
                                className="text-xs font-medium cursor-pointer"
                              >
                                Here
                              </label>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 border rounded bg-white">
                              <Checkbox
                                id={`is-paid-${currentAppointment.id}`}
                                checked={currentAppointment.isPaid || false}
                                onCheckedChange={(checked) => {
                                  updateAppointmentIsPaidMutation.mutate({ 
                                    id: currentAppointment.id, 
                                    isPaid: checked as boolean 
                                  });
                                }}
                                data-testid={`checkbox-is-paid-${currentAppointment.id}`}
                              />
                              <label 
                                htmlFor={`is-paid-${currentAppointment.id}`}
                                className="text-xs font-medium cursor-pointer"
                              >
                                Paid
                              </label>
                            </div>
                          </div>
                          {/* Mark Ready footer — marks grooming done + notifies customer for online payment */}
                          {(currentAppointment.readyForPayment || currentAppointment.groomingCompleted || currentAppointment.isPaid || currentAppointment.price) && (
                            <div className="w-full flex items-center justify-between pt-2 mt-1 border-t border-gray-100 gap-2">
                              <div className="flex items-center gap-2">
                                {currentAppointment.isPaid && currentAppointment.paidOnline && (
                                  <span className="text-xs text-green-600 font-medium">✓ Paid online</span>
                                )}
                                {currentAppointment.isPaid && !currentAppointment.paidOnline && (
                                  <span className="text-xs text-green-600 font-medium">✓ Paid in-store</span>
                                )}
                                {currentAppointment.readyForPayment && !currentAppointment.isPaid && (
                                  <span className="text-xs text-amber-600 font-medium">
                                    Online pay pending: ${parseFloat(currentAppointment.finalAmount || currentAppointment.price || '0').toFixed(2)}
                                  </span>
                                )}
                                {currentAppointment.groomingCompleted && !currentAppointment.readyForPayment && (!currentAppointment.isPaid || !currentAppointment.paidOnline) && (
                                  <span className="text-xs text-green-700 font-medium">✓ Done</span>
                                )}
                              </div>
                              {(!currentAppointment.isPaid || !currentAppointment.paidOnline) && currentAppointment.price && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={`h-7 text-xs px-2 ${currentAppointment.readyForPayment ? 'border-orange-300 text-orange-600 hover:bg-orange-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}
                                  disabled={markReadyForPaymentMutation.isPending || updateAppointmentGroomingCompletedMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const amt = currentAppointment.price || '0';
                                    if (currentAppointment.readyForPayment) {
                                      // Clear: un-mark both done and ready
                                      markReadyForPaymentMutation.mutate({ id: currentAppointment.id, finalAmount: amt, readyForPayment: false });
                                      updateAppointmentGroomingCompletedMutation.mutate({ id: currentAppointment.id, groomingCompleted: false });
                                    } else {
                                      // Mark Ready: mark grooming done
                                      updateAppointmentGroomingCompletedMutation.mutate({ id: currentAppointment.id, groomingCompleted: true });
                                      markReadyForPaymentMutation.mutate({ id: currentAppointment.id, finalAmount: amt, readyForPayment: true });
                                    }
                                  }}
                                >
                                  {currentAppointment.readyForPayment ? 'Clear' : 'Mark Ready'}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (() => {
                      const pageIndicators = getPageIndicators(approvedAppointmentsPage, totalPages);
                      return (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-green-200">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setApprovedAppointmentsPage(prev => Math.max(0, prev - 1))}
                            disabled={approvedAppointmentsPage === 0}
                            className="text-green-700 hover:text-green-900"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </Button>
                          
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-green-700">
                              Page {approvedAppointmentsPage + 1} of {totalPages}
                            </span>
                            <div className="flex gap-2">
                              {pageIndicators.map((idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setApprovedAppointmentsPage(idx)}
                                  className={`w-2 h-2 rounded-full transition-all ${
                                    idx === approvedAppointmentsPage 
                                      ? 'bg-green-700 w-6' 
                                      : 'bg-green-300 hover:bg-green-500'
                                  }`}
                                  aria-label={`Page ${idx + 1}`}
                                />
                              ))}
                            </div>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setApprovedAppointmentsPage(prev => Math.min(totalPages - 1, prev + 1))}
                            disabled={approvedAppointmentsPage === totalPages - 1}
                            className="text-green-700 hover:text-green-900"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </Button>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Pending Approval Section */}
          {unapprovedAppointments.length > 0 && (
            <Card className="border-2 border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <CalendarIcon className="w-5 h-5" />
                  Pending Approval ({unapprovedAppointments.length})
                </CardTitle>
                <CardDescription className="text-orange-600">
                  New grooming appointments awaiting admin approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sortGroupedAppointmentsByEarliest(Object.entries(groupedUnapprovedAppointments))
                    .map(([phone, phoneAppointments]) => {
                    const currentAppointment = getCurrentAppointment(phone, phoneAppointments);
                    const isHighlighted = matchesSearch(currentAppointment, 'appointment');
                    const hasMultiple = phoneAppointments.length > 1;
                    
                    return (
                    <div 
                      key={`${phone}-${currentAppointment.id}`} 
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg gap-3 ${
                        isHighlighted 
                          ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                          : 'border-orange-300 bg-white'
                      }`}
                    >
                      <div 
                        className="flex-1 cursor-pointer hover:bg-gray-50 rounded p-2"
                        onClick={() => setSelectedAppointment(currentAppointment)}
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className="bg-orange-500 text-white">Pending Approval</Badge>
                          {currentAppointment.source === 'google_calendar' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              Google Calendar
                            </Badge>
                          )}
                          {currentAppointment.groomerTag && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                              Groomer: {capitalizeWords(currentAppointment.groomerTag)}
                            </Badge>
                          )}
                          {hasMultiple && (
                            <Badge 
                              variant="outline" 
                              className="bg-purple-500 text-white border-purple-600 cursor-pointer hover:bg-purple-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                cycleAppointmentGroup(phone, groupedUnapprovedAppointments);
                              }}
                            >
                              {appointmentGroupIndexes[phone] !== undefined ? appointmentGroupIndexes[phone] + 1 : 1} / {phoneAppointments.length}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold">{getCombinedServiceLabel(currentAppointment)}</h3>
                        <p className="text-sm text-gray-600 break-words">
                          Pet: {currentAppointment.pets && currentAppointment.pets.length > 0 
                            ? currentAppointment.pets.map((p: any) => capitalizeWords(p.petName)).join(', ')
                            : capitalizeWords(currentAppointment.petName)
                          } ({currentAppointment.petType || (currentAppointment.pets && currentAppointment.pets[0]?.petType) || 'dog'})
                        </p>
                        {getAppointmentAddOnLabels(currentAppointment).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {getAppointmentAddOnLabels(currentAppointment).map((label) => (
                              <span key={label} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                                + {label}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-gray-600">Owner: {capitalizeWords(currentAppointment.ownerFirstName)} {capitalizeWords(currentAppointment.ownerLastName)}</p>
                        <p className="text-sm text-gray-600">Phone: {currentAppointment.ownerPhoneNumber}</p>
                        <p className="text-xs text-gray-500">Date: {parseLocalDate(currentAppointment.appointmentDate).toLocaleDateString()} at {currentAppointment.appointmentTime}</p>
                        {currentAppointment.specialNotes && (
                          <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">Notes: {currentAppointment.specialNotes}</div>
                        )}
                        <p className="text-xs text-gray-500">Booked: {new Date(currentAppointment.createdAt).toLocaleString()}</p>
                        {hasMultiple && (
                          <p className="text-xs text-purple-600 mt-1 font-medium">Click purple badge to cycle through {phoneAppointments.length} appointments</p>
                        )}
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                          onClick={() => approveAppointmentMutation.mutate(currentAppointment.id)}
                          disabled={approveAppointmentMutation.isPending || rejectAppointmentMutation.isPending || (typedUser?.isGroomer && !typedUser?.isAdmin)}
                          data-testid={`approve-appointment-${currentAppointment.id}`}
                        >
                          {approveAppointmentMutation.isPending ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full sm:w-auto"
                          onClick={() => rejectAppointmentMutation.mutate(currentAppointment.id)}
                          disabled={approveAppointmentMutation.isPending || rejectAppointmentMutation.isPending || (typedUser?.isGroomer && !typedUser?.isAdmin)}
                          data-testid={`reject-appointment-${currentAppointment.id}`}
                        >
                          {rejectAppointmentMutation.isPending ? 'Rejecting...' : 'Reject'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending Appointments Section - Always Visible */}
          <Card className="border-2 border-yellow-200 bg-yellow-50/30">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-yellow-700">
                  <CalendarIcon className="w-5 h-5" />
                  Pending Appointments ({(appointments as any[]).filter((a: any) => a.status === 'scheduled').length})
                </CardTitle>
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  {typedUser?.isAdmin && (
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        showDeleteConfirmation(
                          'Clear Past Pending Appointments',
                          'This will permanently delete all pending appointments with dates in the past. This action cannot be undone.',
                          'All past pending appointments',
                          () => cleanupPastAppointmentsMutation.mutate(['scheduled'])
                        );
                      }}
                      disabled={cleanupPastAppointmentsMutation.isPending}
                      data-testid="button-cleanup-past-appointments"
                      className="w-full sm:w-auto bg-red-50 border-red-200 hover:bg-red-100 text-red-700"
                    >
                      <Trash2 className={`w-4 h-4 mr-2`} />
                      {cleanupPastAppointmentsMutation.isPending ? 'Cleaning...' : 'Clear Past'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sortGroupedAppointmentsByEarliest(Object.entries(groupedPendingAppointments))
                  .map(([phone, phoneAppointments]) => {
                  const currentAppointment = getCurrentAppointment(phone, phoneAppointments);
                  const isHighlighted = matchesSearch(currentAppointment, 'appointment');
                  const hasMultiple = phoneAppointments.length > 1;
                  
                  return (
                    <div 
                      key={`${phone}-${currentAppointment.id}`} 
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        isHighlighted 
                          ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                          : 'border bg-white'
                      }`}
                    >
                      <div 
                        className="flex-1 p-2 rounded cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedAppointment(currentAppointment)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{formatServiceType(currentAppointment.serviceType || currentAppointment.service)}</h3>
                          {currentAppointment.source === 'google_calendar' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              Synced
                            </Badge>
                          )}
                          {hasMultiple && (
                            <Badge 
                              variant="outline" 
                              className="bg-purple-500 text-white border-purple-600 text-xs cursor-pointer hover:bg-purple-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                cycleAppointmentGroup(phone, groupedPendingAppointments);
                              }}
                            >
                              {appointmentGroupIndexes[phone] !== undefined ? appointmentGroupIndexes[phone] + 1 : 1} / {phoneAppointments.length}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 break-words">
                          Pet: {currentAppointment.pets && currentAppointment.pets.length > 0 
                            ? currentAppointment.pets.map((p: any) => capitalizeWords(p.petName)).join(', ')
                            : capitalizeWords(currentAppointment.petName)
                          } ({currentAppointment.petType || (currentAppointment.pets && currentAppointment.pets[0]?.petType) || 'dog'})
                        </p>
                        <p className="text-sm text-gray-600">Owner: {capitalizeWords(currentAppointment.ownerFirstName)} {capitalizeWords(currentAppointment.ownerLastName)}</p>
                        <p className="text-sm text-gray-600">Phone: {currentAppointment.ownerPhoneNumber}</p>
                        <p className="text-xs text-gray-500">{parseLocalDate(currentAppointment.appointmentDate).toLocaleDateString()} at {currentAppointment.appointmentTime}</p>
                        {currentAppointment.contactNotes && (
                          <div className="text-xs mt-1.5 p-1.5 bg-amber-50 rounded border border-amber-200">
                            <span className="font-medium text-amber-800">Contact Notes:</span>{' '}
                            <span className="text-amber-700">{currentAppointment.contactNotes}</span>
                          </div>
                        )}
                        {currentAppointment.price && (
                          <p className="text-xs text-green-700 font-medium mt-1">
                            Price: ${currentAppointment.price}
                          </p>
                        )}
                        {currentAppointment.itemsTotal && (
                          <p className="text-xs text-blue-700 font-medium">+ Items: ${currentAppointment.itemsTotal}</p>
                        )}
                        <p className="text-xs text-purple-600 mt-1 font-medium">{hasMultiple ? 'Click purple badge to cycle through dates' : 'Click to view details'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          key={`appointment-${currentAppointment.id}-${currentAppointment.status}`}
                          value={currentAppointment.status}
                          onValueChange={(status) => updateAppointmentMutation.mutate({ id: currentAppointment.id, status })}
                          disabled={!!typedUser?.isGroomer && !typedUser?.isAdmin}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">Pending</SelectItem>
                            <SelectItem value="confirmed">Approved</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Denied Appointments - Collapsible Button (Only visible to admins) */}
          {typedUser?.isAdmin && (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <Button
                  variant="outline"
                  className="flex-1 justify-between border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700"
                  onClick={() => setShowDeniedAppointments(!showDeniedAppointments)}
                  data-testid="button-toggle-denied"
                >
                  <span className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    Denied Appointments ({Object.values(groupedDeniedAppointments).flat().length})
                  </span>
                  {showDeniedAppointments ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    showDeleteConfirmation(
                      'Clear Past Denied Appointments',
                      'This will permanently delete all denied appointments with dates in the past. This action cannot be undone.',
                      'All past denied appointments',
                      () => cleanupPastAppointmentsMutation.mutate(['rejected', 'cancelled'])
                    );
                  }}
                  disabled={cleanupPastAppointmentsMutation.isPending}
                  data-testid="button-cleanup-past-denied"
                  className="bg-red-50 border-red-200 hover:bg-red-100 text-red-700 sm:w-auto"
                >
                  <Trash2 className={`w-4 h-4 mr-2`} />
                  {cleanupPastAppointmentsMutation.isPending ? 'Cleaning...' : 'Clear Past'}
                </Button>
              </div>

              {showDeniedAppointments && (() => {
                const phoneGroups = sortGroupedAppointmentsByEarliest(Object.entries(groupedDeniedAppointments));
                const totalPages = Math.ceil(phoneGroups.length / APPOINTMENTS_PER_PAGE);
                const startIdx = deniedAppointmentsPage * APPOINTMENTS_PER_PAGE;
                const paginatedPhoneGroups = phoneGroups.slice(startIdx, startIdx + APPOINTMENTS_PER_PAGE);

                const handleDeniedTouchStart = (e: React.TouchEvent) => {
                  setDeniedTouchStart(e.targetTouches[0].clientX);
                };

                const handleDeniedTouchMove = (e: React.TouchEvent) => {
                  setDeniedTouchEnd(e.targetTouches[0].clientX);
                };

                const handleDeniedTouchEnd = () => {
                  if (!deniedTouchStart || !deniedTouchEnd) return;
                  const distance = deniedTouchStart - deniedTouchEnd;
                  const minSwipeDistance = 50;
                  
                  if (distance > minSwipeDistance && deniedAppointmentsPage < totalPages - 1) {
                    setDeniedAppointmentsPage(prev => prev + 1);
                  }
                  if (distance < -minSwipeDistance && deniedAppointmentsPage > 0) {
                    setDeniedAppointmentsPage(prev => prev - 1);
                  }
                  
                  setDeniedTouchStart(0);
                  setDeniedTouchEnd(0);
                };

                return (
                  <Card className="border-2 border-red-200 bg-red-50/30">
                    <CardContent className="pt-3 pb-3">
                      <div 
                        className="space-y-2"
                        onTouchStart={handleDeniedTouchStart}
                        onTouchMove={handleDeniedTouchMove}
                        onTouchEnd={handleDeniedTouchEnd}
                      >
                        {paginatedPhoneGroups.map(([phone, phoneAppointments]) => {
                          const currentAppointment = getCurrentAppointment(phone, phoneAppointments);
                          const isHighlighted = matchesSearch(currentAppointment, 'appointment');
                          const hasMultiple = phoneAppointments.length > 1;
                          
                          return (
                          <div 
                            key={`${phone}-${currentAppointment.id}`}
                            className={`flex flex-col sm:flex-row sm:items-start justify-between p-3 border rounded-lg gap-2 ${
                              isHighlighted 
                                ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                                : 'border bg-white'
                            }`}
                          >
                            <div 
                              className="flex-1 p-1.5 rounded min-w-0 cursor-pointer hover:bg-gray-50"
                              onClick={() => setSelectedAppointment(currentAppointment)}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <h3 className="font-semibold text-sm">{formatServiceType(currentAppointment.serviceType || currentAppointment.service)}</h3>
                                {currentAppointment.source === 'google_calendar' && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs px-1.5 py-0">
                                    <CalendarIcon className="w-3 h-3 mr-0.5" />
                                    Synced
                                  </Badge>
                                )}
                                {hasMultiple && (
                                  <Badge 
                                    variant="outline" 
                                    className="bg-purple-500 text-white border-purple-600 text-xs cursor-pointer hover:bg-purple-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cycleAppointmentGroup(phone, groupedDeniedAppointments);
                                    }}
                                  >
                                    {appointmentGroupIndexes[phone] !== undefined ? appointmentGroupIndexes[phone] + 1 : 1} / {phoneAppointments.length}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 space-y-0.5">
                                <p className="break-words">
                                  Pet: {currentAppointment.pets && currentAppointment.pets.length > 0 
                                    ? currentAppointment.pets.map((p: any) => capitalizeWords(p.petName)).join(', ')
                                    : currentAppointment.petName
                                  } ({currentAppointment.petType || (currentAppointment.pets && currentAppointment.pets[0]?.petType) || 'dog'})
                                </p>
                                <p>Owner: {currentAppointment.ownerFirstName} {currentAppointment.ownerLastName}</p>
                                <p>Phone: {currentAppointment.ownerPhoneNumber}</p>
                                <p className="text-gray-500">{parseLocalDate(currentAppointment.appointmentDate).toLocaleDateString()} at {currentAppointment.appointmentTime}</p>
                              </div>
                              {currentAppointment.contactNotes && (
                                <div className="text-xs mt-1.5 p-1.5 bg-amber-50 rounded border border-amber-200">
                                  <span className="font-medium text-amber-800">Contact Notes:</span>{' '}
                                  <span className="text-amber-700">{currentAppointment.contactNotes}</span>
                                </div>
                              )}
                              {currentAppointment.price && (
                                <p className="text-xs text-green-700 font-medium mt-1">
                                  Price: ${currentAppointment.price}
                                </p>
                              )}
                              {currentAppointment.itemsTotal && (
                                <p className="text-xs text-blue-700 font-medium">+ Items: ${currentAppointment.itemsTotal}</p>
                              )}
                              <p className="text-xs text-purple-600 mt-0.5 font-medium">{hasMultiple ? 'Click purple badge to cycle through dates' : 'Click to view details'}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full sm:w-auto flex-shrink-0">
                              <Select
                                key={`appointment-${currentAppointment.id}-${currentAppointment.status}`}
                                value={currentAppointment.status}
                                onValueChange={(status) => updateAppointmentMutation.mutate({ id: currentAppointment.id, status })}
                              >
                                <SelectTrigger className="w-full sm:w-28 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="scheduled">Pending</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  showDeleteConfirmation(
                                    'Delete Appointment',
                                    'Are you sure you want to permanently delete this appointment? This action cannot be undone.',
                                    `${currentAppointment.ownerFirstName || ''} ${currentAppointment.ownerLastName || ''} - ${currentAppointment.appointmentDate}`,
                                    () => deleteAppointmentMutation.mutate(currentAppointment.id)
                                  );
                                }}
                                disabled={deleteAppointmentMutation.isPending}
                                data-testid={`button-delete-appointment-${currentAppointment.id}`}
                                title="Delete appointment"
                                className="w-full sm:w-auto h-8"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      </div>

                      {/* Pagination Controls */}
                      {totalPages > 1 && (() => {
                        const pageIndicators = getPageIndicators(deniedAppointmentsPage, totalPages);
                        return (
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-red-200">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeniedAppointmentsPage(prev => Math.max(0, prev - 1))}
                              disabled={deniedAppointmentsPage === 0}
                              className="text-red-700 hover:text-red-900"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </Button>
                            
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-red-700">
                                Page {deniedAppointmentsPage + 1} of {totalPages}
                              </span>
                              <div className="flex gap-2">
                                {pageIndicators.map((idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setDeniedAppointmentsPage(idx)}
                                    className={`w-2 h-2 rounded-full transition-all ${
                                      idx === deniedAppointmentsPage 
                                        ? 'bg-red-700 w-6' 
                                        : 'bg-red-300 hover:bg-red-500'
                                    }`}
                                    aria-label={`Page ${idx + 1}`}
                                  />
                                ))}
                              </div>
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeniedAppointmentsPage(prev => Math.min(totalPages - 1, prev + 1))}
                              disabled={deniedAppointmentsPage === totalPages - 1}
                              className="text-red-700 hover:text-red-900"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </Button>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management ({filteredUsers.length}{userSearchQuery ? ` of ${(users as any[]).length}` : ''})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, email, or phone..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                  {userSearchQuery && (
                    <button onClick={() => setUserSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowUnverifiedOnly(v => !v)}
                  className={`px-3 py-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors ${showUnverifiedOnly ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-red-400 hover:text-red-600'}`}
                >
                  {showUnverifiedOnly ? 'Unverified Only ✕' : 'Unverified Only'}
                </button>
              </div>
              {filteredUsers.length === 0 && (userSearchQuery || showUnverifiedOnly) && (
                <p className="text-center text-gray-500 py-6">
                  {showUnverifiedOnly ? 'No unverified accounts found.' : `No users match "${userSearchQuery}"`}
                </p>
              )}
              <div className="space-y-4">
                {filteredUsers.map((userItem: any) => (
                  <Card key={userItem.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold">{userItem.firstName} {userItem.lastName}</h3>
                          <p className="text-sm text-gray-600 truncate">{userItem.email}</p>
                          {userItem.phoneNumber && (
                            <a href={`tel:${userItem.phoneNumber}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span className="truncate">{userItem.phoneNumber}</span>
                            </a>
                          )}
                          <p className="text-xs text-gray-500">
                            Joined: {new Date(userItem.createdAt).toLocaleDateString()}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {userItem.isSuperiorManager && (
                              <Badge className="text-xs bg-yellow-400 text-black border border-yellow-500">Owner</Badge>
                            )}
                            {userItem.isAdmin && (
                              <Badge variant="default" className="text-xs">Admin</Badge>
                            )}
                            {userItem.isGroomer && (
                              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">Groomer</Badge>
                            )}
                            {userItem.isChargeAccount && (
                              <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 border border-orange-300">Charge Account</Badge>
                            )}
                            {!userItem.isAdmin && !userItem.isGroomer && !userItem.isChargeAccount && !userItem.isSuperiorManager && (
                              <Badge variant="outline" className="text-xs">Customer</Badge>
                            )}
                            {userItem.emailVerified === false && (
                              <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-400">Unverified</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:min-w-[140px]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">Admin</span>
                            <Switch
                              checked={userItem.isAdmin}
                              onCheckedChange={(checked) => {
                                showDeleteConfirmation(
                                  checked ? 'Grant Admin Access' : 'Remove Admin Access',
                                  checked
                                    ? `This will give ${userItem.firstName} ${userItem.lastName} full admin privileges.`
                                    : `This will remove admin privileges from ${userItem.firstName} ${userItem.lastName}.`,
                                  '',
                                  () => updateAdminMutation.mutate({ userId: userItem.id, isAdmin: checked }),
                                  checked ? 'Yes, Grant Access' : 'Yes, Remove Access',
                                  'confirm'
                                );
                              }}
                              disabled={updateAdminMutation.isPending}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">Groomer</span>
                            <Switch
                              checked={userItem.isGroomer}
                              onCheckedChange={(checked) => {
                                showDeleteConfirmation(
                                  checked ? 'Add Groomer Role' : 'Remove Groomer Role',
                                  checked
                                    ? `This will add ${userItem.firstName} ${userItem.lastName} to the groomer roster.`
                                    : `This will remove groomer access from ${userItem.firstName} ${userItem.lastName}.`,
                                  '',
                                  () => updateUserGroomerRoleMutation.mutate({ userId: userItem.id, isGroomer: checked }),
                                  checked ? 'Yes, Add Groomer' : 'Yes, Remove Groomer',
                                  'confirm'
                                );
                              }}
                              disabled={updateUserGroomerRoleMutation.isPending}
                            />
                          </div>
                          <div className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-md border ${userItem.isChargeAccount ? 'bg-orange-500/20 border-orange-400' : 'bg-orange-500/5 border-orange-500/30'}`}>
                            <span className="text-sm font-semibold text-orange-400 flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5" />
                              Charge Acct
                            </span>
                            <Switch
                              checked={!!userItem.isChargeAccount}
                              onCheckedChange={(checked) => {
                                showDeleteConfirmation(
                                  checked ? 'Enable Charge Account' : 'Disable Charge Account',
                                  checked
                                    ? `${userItem.firstName} ${userItem.lastName} will be switched to a charge account — no payment collected at checkout.`
                                    : `${userItem.firstName} ${userItem.lastName} will be returned to standard checkout with payment required.`,
                                  '',
                                  () => updateChargeAccountMutation.mutate({ userId: userItem.id, isChargeAccount: checked }),
                                  checked ? 'Yes, Enable Charge Account' : 'Yes, Disable Charge Account',
                                  'confirm'
                                );
                              }}
                              disabled={updateChargeAccountMutation.isPending}
                            />
                          </div>
                          {userItem.emailVerified === false && (
                            <Button
                              size="sm"
                              className="w-full bg-green-700 hover:bg-green-600 text-white"
                              onClick={() => {
                                showDeleteConfirmation(
                                  'Verify Email Account',
                                  `Manually verify the email address for ${userItem.firstName} ${userItem.lastName} (${userItem.email}) so they can log in.`,
                                  '',
                                  () => verifyEmailMutation.mutate(userItem.id),
                                  'Yes, Verify Account',
                                  'confirm'
                                );
                              }}
                              disabled={verifyEmailMutation.isPending}
                            >
                              ✓ Verify Account
                            </Button>
                          )}
                          {typedUser?.isSuperiorManager && (
                            <div className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-md border ${userItem.isSuperiorManager ? 'bg-yellow-400/20 border-yellow-500' : 'bg-yellow-400/5 border-yellow-500/30'}`}>
                              <span className="text-sm font-semibold text-yellow-600 flex items-center gap-1">
                                ★ Owner
                              </span>
                              <Switch
                                checked={!!userItem.isSuperiorManager}
                                onCheckedChange={(checked) => {
                                  showDeleteConfirmation(
                                    checked ? 'Grant Owner' : 'Remove Owner',
                                    checked
                                      ? `This will grant Owner privileges to ${userItem.firstName} ${userItem.lastName}.`
                                      : `This will remove Owner privileges from ${userItem.firstName} ${userItem.lastName}.`,
                                    '',
                                    () => updateSuperiorManagerMutation.mutate({ userId: userItem.id, isSuperiorManager: checked }),
                                    checked ? 'Yes, Grant Owner' : 'Yes, Remove Owner',
                                    'confirm'
                                  );
                                }}
                                disabled={updateSuperiorManagerMutation.isPending}
                              />
                            </div>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              showDeleteConfirmation(
                                'Delete User Account',
                                'Are you sure you want to permanently delete this user account? All associated data will be lost. This action cannot be undone.',
                                `${userItem.firstName} ${userItem.lastName} (${userItem.email || 'No email'})`,
                                () => deleteUserMutation.mutate(userItem.id)
                              );
                            }}
                            disabled={deleteUserMutation.isPending || userItem.id === typedUser?.id}
                            data-testid={`button-delete-user-${userItem.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Account
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Super-admin: store ID lookup */}
          {(typedUser as any)?.isSuperAdmin && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Search className="w-5 h-5" />
                  Store ID Lookup
                </CardTitle>
                <p className="text-sm text-blue-700">
                  Find a store's numeric ID by searching its name or URL slug.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by store name or slug…"
                    value={tenantLookupSearch}
                    onChange={(e) => setTenantLookupSearch(e.target.value)}
                    className="pl-9 bg-white"
                  />
                  {tenantLookupSearch && (
                    <button
                      onClick={() => setTenantLookupSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {(() => {
                  const q = tenantLookupSearch.trim().toLowerCase();
                  const filtered = q
                    ? allTenants.filter(
                        (t: any) =>
                          t.name?.toLowerCase().includes(q) ||
                          t.slug?.toLowerCase().includes(q)
                      )
                    : allTenants;
                  if (allTenants.length === 0) {
                    return <p className="text-sm text-blue-600">Loading stores…</p>;
                  }
                  if (filtered.length === 0) {
                    return <p className="text-sm text-gray-500">No stores match "{tenantLookupSearch}"</p>;
                  }
                  return (
                    <div className="overflow-x-auto rounded-md border border-blue-200">
                      <table className="w-full text-sm">
                        <thead className="bg-blue-100 text-blue-800">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold w-16">ID</th>
                            <th className="text-left px-3 py-2 font-semibold">Name</th>
                            <th className="text-left px-3 py-2 font-semibold">Slug</th>
                            <th className="text-left px-3 py-2 font-semibold w-24">Status</th>
                            <th className="text-left px-3 py-2 font-semibold w-44">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                          {filtered.map((t: any) => (
                            <tr key={t.id} className="bg-white hover:bg-blue-50 transition-colors">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <code className="font-mono font-bold text-blue-700">#{t.id}</code>
                                  <button
                                    title="Copy ID to clipboard"
                                    onClick={() => {
                                      const text = String(t.id);
                                      const doFallback = () => {
                                        try {
                                          const el = document.createElement('textarea');
                                          el.value = text;
                                          el.style.position = 'fixed';
                                          el.style.opacity = '0';
                                          document.body.appendChild(el);
                                          el.select();
                                          document.execCommand('copy');
                                          document.body.removeChild(el);
                                        } catch {}
                                        setCopiedTenantId(t.id);
                                        setTimeout(() => setCopiedTenantId(null), 2000);
                                      };
                                      if (navigator.clipboard) {
                                        navigator.clipboard.writeText(text)
                                          .then(() => { setCopiedTenantId(t.id); setTimeout(() => setCopiedTenantId(null), 2000); })
                                          .catch(doFallback);
                                      } else {
                                        doFallback();
                                      }
                                    }}
                                    className="ml-1 p-0.5 rounded text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors"
                                  >
                                    {copiedTenantId === t.id
                                      ? <Check className="w-3.5 h-3.5 text-green-600" />
                                      : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-medium">{t.name}</td>
                              <td className="px-3 py-2 text-gray-600 font-mono text-xs">{t.slug}</td>
                              <td className="px-3 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  t.subscriptionStatus === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : t.subscriptionStatus === 'trial'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {t.subscriptionStatus ?? 'none'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {t.subscriptionStatus === 'trial' && (() => {
                                  const sentAt = t.trialWarningEmailSentAt ? new Date(t.trialWarningEmailSentAt) : null;
                                  const sentRecently = sentAt ? (Date.now() - sentAt.getTime()) < 24 * 60 * 60 * 1000 : false;
                                  const relativeLabel = sentAt ? (() => {
                                    const diffMs = Date.now() - sentAt.getTime();
                                    const diffMins = Math.floor(diffMs / 60000);
                                    if (diffMins < 1) return "Sent just now";
                                    if (diffMins < 60) return `Sent ${diffMins}m ago`;
                                    const diffHrs = Math.floor(diffMins / 60);
                                    if (diffHrs < 24) return `Sent ${diffHrs}h ago`;
                                    const diffDays = Math.floor(diffHrs / 24);
                                    return `Sent ${diffDays}d ago`;
                                  })() : null;
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={`text-xs h-7 border-yellow-400 text-yellow-700 hover:bg-yellow-50 ${sentRecently ? 'opacity-50' : ''}`}
                                        disabled={sendTrialReminderMutation.isPending}
                                        onClick={() => sendTrialReminderMutation.mutate(t.id)}
                                      >
                                        <Mail className="w-3 h-3 mr-1" />
                                        Send Trial Reminder
                                      </Button>
                                      {relativeLabel && (
                                        <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                                          <Clock className="w-2.5 h-2.5" />
                                          {relativeLabel}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Super-admin: Stripe credential refresh */}
          {(typedUser as any)?.isSuperAdmin && (
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <RefreshCw className="w-5 h-5" />
                  Stripe Credential Refresh
                </CardTitle>
                <p className="text-sm text-purple-700">
                  After rotating a Stripe API key, the server caches the old key for up to one hour. Click below to force an immediate reload so the new key takes effect right away.
                </p>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="border-purple-400 text-purple-800 hover:bg-purple-100"
                  disabled={refreshStripeCredentialsMutation.isPending}
                  onClick={() => refreshStripeCredentialsMutation.mutate()}
                  data-testid="button-refresh-stripe-credentials"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshStripeCredentialsMutation.isPending ? 'animate-spin' : ''}`} />
                  {refreshStripeCredentialsMutation.isPending ? 'Refreshing…' : 'Refresh Stripe Keys'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Super-admin: users with no tenant assigned */}
          {(typedUser as any)?.isSuperAdmin && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                  Unassigned Users ({noTenantUsers.length})
                </CardTitle>
                <p className="text-sm text-amber-700">
                  These accounts are not linked to any store. Assign them to a tenant so they can use the app.
                </p>
              </CardHeader>
              {noTenantUsers.length === 0 ? (
                <CardContent>
                  <p className="text-sm text-green-700 font-medium">✓ All accounts are linked to a store.</p>
                </CardContent>
              ) : (
                <CardContent className="space-y-3">
                  {noTenantUsers.map((u: any) => (
                    <NoTenantUserRow
                      key={u.id}
                      user={u}
                      tenants={allTenants}
                      onAssigned={refetchNoTenantUsers}
                    />
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Super-admin: audit log */}
          {(typedUser as any)?.isSuperAdmin && (
            <Card className="border-slate-300 bg-slate-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <History className="w-5 h-5" />
                  Audit Log
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Super-admin writes made on behalf of tenants. Filter by tenant ID or actor user ID.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Tenant ID</label>
                    <Input
                      placeholder="e.g. 42"
                      value={auditLogTenantFilter}
                      onChange={(e) => { setAuditLogTenantFilter(e.target.value); setAuditLogPage(0); }}
                      className="bg-white h-8 text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Actor User ID</label>
                    <Input
                      placeholder="e.g. 7"
                      value={auditLogActorFilter}
                      onChange={(e) => { setAuditLogActorFilter(e.target.value); setAuditLogPage(0); }}
                      className="bg-white h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => { setAuditLogTenantFilter(""); setAuditLogActorFilter(""); setAuditLogPage(0); }}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs ml-2"
                      onClick={() => refetchAuditLog()}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Table */}
                {auditLogLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading audit log…
                  </div>
                ) : (auditLogData?.entries?.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-500 py-4">No audit log entries found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Timestamp</th>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Actor User</th>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Target Tenant</th>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Action</th>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Record Type</th>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Path</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(auditLogData?.entries ?? []).map((entry: any) => (
                          <tr key={entry.id} className="bg-white hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-600">
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <code className="font-mono text-slate-700">{entry.actorUserId ?? "—"}</code>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <code className="font-mono font-bold text-blue-700">#{entry.targetTenantId ?? "—"}</code>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                entry.actionType === "create"
                                  ? "bg-green-100 text-green-700"
                                  : entry.actionType === "delete"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {entry.actionType ?? "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                              {entry.recordType ?? "—"}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500 max-w-[220px] truncate" title={entry.metadata?.path ?? ""}>
                              {entry.metadata?.path ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {(auditLogData?.total ?? 0) > AUDIT_LOG_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">
                      Showing {auditLogPage * AUDIT_LOG_PAGE_SIZE + 1}–{Math.min((auditLogPage + 1) * AUDIT_LOG_PAGE_SIZE, auditLogData?.total ?? 0)} of {auditLogData?.total ?? 0} entries
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={auditLogPage === 0}
                        onClick={() => setAuditLogPage((p) => Math.max(0, p - 1))}
                      >
                        <ChevronLeft className="w-3 h-3 mr-1" />
                        Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={(auditLogPage + 1) * AUDIT_LOG_PAGE_SIZE >= (auditLogData?.total ?? 0)}
                        onClick={() => setAuditLogPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="space-y-6">
          {/* Appointment Calendar */}
          <AppointmentCalendar appointments={appointments} />
        </TabsContent>

        <TabsContent value="contacts" className="space-y-6">
          <ContactsManager />
        </TabsContent>



        <TabsContent value="database" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Stage Import (Preview & Approve)
              </CardTitle>
              <CardDescription>
                Upload Excel file with duplicate detection - preview changes before applying
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info Banner */}
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-purple-800 dark:text-purple-300 mb-1">Smart Duplicate Detection</p>
                    <ul className="list-disc list-inside space-y-1 text-purple-700 dark:text-purple-400">
                      <li>Detects duplicates by name + brand + size</li>
                      <li>Shows which items will be added, updated, or skipped</li>
                      <li>Preview all changes before applying</li>
                      <li>Safer than direct import - you can review first</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  id="excel-stage-file"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    try {
                      const formData = new FormData();
                      formData.append('file', file);

                      toast({
                        title: "Analyzing...",
                        description: "Detecting duplicates, please wait..."
                      });

                      const response = await fetch('/api/admin/inventory/stage-import', {
                        method: 'POST',
                        credentials: 'include',
                        body: formData
                      });

                      const result = await response.json();

                      if (!response.ok) {
                        throw new Error(result.message || 'Staging failed');
                      }

                      // Show summary and ask for approval
                      const sessionId = result.sessionId;
                      const summary = `Analysis complete:\n\n✓ ${result.stats.new} new items will be added\n✓ ${result.stats.updates} items will be updated\n✓ ${result.stats.duplicates} exact duplicates will be skipped\n\nTotal: ${result.stats.total} items processed\n\nDo you want to apply these changes?`;
                      
                      const approved = window.confirm(summary);
                      
                      if (approved) {
                        // Approve and apply
                        toast({
                          title: "Applying changes...",
                          description: "Please wait..."
                        });
                        
                        const approveResponse = await fetch(`/api/admin/inventory/approve/${sessionId}`, {
                          method: 'POST',
                          credentials: 'include'
                        });
                        
                        const approveResult = await approveResponse.json();
                        
                        if (!approveResponse.ok) {
                          throw new Error(approveResult.message || 'Approval failed');
                        }
                        
                        toast({
                          title: "Import successful",
                          description: `${approveResult.stats.created} created, ${approveResult.stats.updated} updated`
                        });
                        
                        // Reload supplies data
                        queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                      } else {
                        // Reject
                        await fetch(`/api/admin/inventory/reject/${sessionId}`, {
                          method: 'DELETE',
                          credentials: 'include'
                        });
                        
                        toast({
                          title: "Import cancelled",
                          description: "No changes were made"
                        });
                      }
                    } catch (error) {
                      console.error('Staging error:', error);
                      toast({
                        title: "Staging failed",
                        description: error instanceof Error ? error.message : "Failed to stage Excel file",
                        variant: "destructive"
                      });
                    }

                    // Reset file input
                    e.target.value = '';
                  }}
                  data-testid="input-excel-stage"
                />

                <Button
                  onClick={() => {
                    document.getElementById('excel-stage-file')?.click();
                  }}
                  className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto"
                  data-testid="button-stage-excel"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Stage & Preview Import
                </Button>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Upload to see what will be added, updated, or duplicated
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Supplies Sync (Safe for Production)
              </CardTitle>
              <CardDescription>
                Export and import ONLY supplies inventory - safe to use in production
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Info Banner */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-green-600 dark:text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-green-800 dark:text-green-300 mb-1">Safe for Production</p>
                    <ul className="list-disc list-inside space-y-1 text-green-700 dark:text-green-400">
                      <li>Only updates supplies inventory - won't affect users, orders, or appointments</li>
                      <li>Works in both development and production environments</li>
                      <li>Perfect for syncing product name updates to production</li>
                      <li>Uses upsert - updates existing items by ID, adds new items</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Export Section */}
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-lg mb-1">Export Supplies</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Download only the supplies inventory as a JSON file (e.g., from development with updated names)
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/admin/supplies/export', {
                        credentials: 'include'
                      });
                      
                      if (!response.ok) {
                        throw new Error('Export failed');
                      }
                      
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `supplies-export-${Date.now()}.json`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      
                      toast({
                        title: "Export successful",
                        description: "Supplies inventory exported successfully"
                      });
                    } catch (error) {
                      console.error('Export error:', error);
                      toast({
                        title: "Export failed",
                        description: "Failed to export supplies",
                        variant: "destructive"
                      });
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-export-supplies"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Supplies Only
                </Button>
              </div>

              {/* Import Section */}
              <div className="space-y-3 pt-4 border-t">
                <div>
                  <h3 className="font-semibold text-lg mb-1">Import Supplies</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Upload a supplies-only export file to update inventory (e.g., import to production with updated names)
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="full-sync-checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      data-testid="checkbox-full-sync"
                    />
                    <label htmlFor="full-sync-checkbox" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Full Sync (delete items not in import file)
                    </label>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 text-xs text-amber-700 dark:text-amber-400">
                    <strong>Warning:</strong> Full Sync will delete any supplies that exist in the database but are not in the import file. Use this to keep development in sync with production.
                  </div>
                  <input
                    type="file"
                    accept="application/json"
                    id="supplies-import-file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const fullSyncCheckbox = document.getElementById('full-sync-checkbox') as HTMLInputElement;
                      const fullSync = fullSyncCheckbox?.checked || false;

                      try {
                        toast({
                          title: fullSync ? "Full sync importing..." : "Importing supplies...",
                          description: fullSync ? "This will also delete items not in the file." : "Please wait while we process your file."
                        });

                        const text = await file.text();
                        const data = JSON.parse(text);
                        
                        if (data.type !== 'supplies-only') {
                          throw new Error('This file is not a supplies-only export. Please use the correct export file.');
                        }
                        
                        // Add fullSync flag to data
                        data.fullSync = fullSync;
                        
                        const response = await fetch('/api/admin/supplies/import', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          credentials: 'include',
                          body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        
                        if (!response.ok) {
                          throw new Error(result.message || 'Import failed');
                        }
                        
                        const errorCount = result.stats?.errorCount || 0;
                        const deletedCount = result.stats?.deleted || 0;
                        if (errorCount > 0) {
                          toast({
                            title: "Import completed with errors",
                            description: `Imported ${result.stats?.supplies || 0} supplies${deletedCount > 0 ? `, deleted ${deletedCount}` : ''}, ${errorCount} failed.`,
                            variant: "destructive"
                          });
                        } else {
                          toast({
                            title: "Import successful",
                            description: `Imported ${result.stats?.supplies || 0} supplies${deletedCount > 0 ? `, deleted ${deletedCount} items not in file` : ''}`
                          });
                        }
                        
                        setTimeout(() => window.location.reload(), 1500);
                      } catch (error) {
                        toast({
                          title: "Import failed",
                          description: error instanceof Error ? error.message : "Failed to import supplies",
                          variant: "destructive"
                        });
                      }
                      
                      e.target.value = '';
                    }}
                    data-testid="input-import-supplies"
                  />
                  <Button
                    onClick={() => {
                      document.getElementById('supplies-import-file')?.click();
                    }}
                    variant="outline"
                    className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                    data-testid="button-import-supplies"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Supplies Only
                  </Button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select a supplies-only JSON file (safe for production)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sync Images by Name Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                Sync Images by Name
              </CardTitle>
              <CardDescription>
                Match images from Object Storage to products by name/brand - safe for production
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-green-600 dark:text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-green-800 dark:text-green-300 mb-1">Safe for Production</p>
                    <ul className="list-disc list-inside space-y-1 text-green-700 dark:text-green-400">
                      <li>Only updates product image URLs - nothing else</li>
                      <li>Appointments, orders, customers stay untouched</li>
                      <li>Matches by product name and brand (not ID)</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <Button
                onClick={async () => {
                  try {
                    toast({
                      title: "Syncing images...",
                      description: "Matching products to images by name"
                    });
                    
                    const response = await fetch('/api/admin/supplies/sync-images-by-name', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    
                    if (!response.ok) {
                      throw new Error('Sync failed');
                    }
                    
                    const result = await response.json();
                    
                    toast({
                      title: "Sync Complete",
                      description: `Matched ${result.matched} of ${result.totalProducts} products`
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                  } catch (error) {
                    toast({
                      title: "Sync failed",
                      description: error instanceof Error ? error.message : "Failed to sync images",
                      variant: "destructive"
                    });
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-sync-images-by-name-db"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Images by Name
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Process All
              </CardTitle>
              <CardDescription>
                Complete automation: Expand abbreviations → Auto-categorize → Move grooming to healthcare → Audit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-purple-800 dark:text-purple-300 mb-2">Complete Automation Pipeline</p>
                    <ul className="list-disc list-inside space-y-1 text-purple-700 dark:text-purple-500">
                      <li><strong>Step 1:</strong> Expand abbreviations (Vict→VICTOR, Euk→Eukanuba, Ph→Prevue Hendrix or pH)</li>
                      <li><strong>Step 2:</strong> Auto-categorize (live animals, specialty sections, 11 product categories)</li>
                      <li><strong>Step 2a:</strong> Assign brands to products without brands</li>
                      <li><strong>Step 2b-d:</strong> Cleanup categories, split food, move grooming products to healthcare</li>
                      <li><strong>Step 3:</strong> Audit for unknown abbreviations needing research</li>
                    </ul>
                    <p className="mt-2 text-purple-600 dark:text-purple-400 font-medium">⏱️ Estimated time: 10-20 seconds for 7,000+ products</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={async () => {
                  try {
                    toast({
                      title: "Processing Started",
                      description: "Running complete automation... This may take 10-20 seconds",
                    });

                    const res = await fetch('/api/admin/supplies/process-all', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    
                    if (!res.ok) {
                      if (res.status === 401 || res.status === 403) {
                        throw new Error('Unauthorized');
                      }
                      throw new Error('Failed to process all operations');
                    }
                    
                    const result = await res.json();
                    const { stats, totalDuration } = result;
                    
                    const specialtyCount = (stats.filterType?.aquatic || 0) + (stats.filterType?.reptile || 0);
                    const groomingMoved = stats.cleanup?.groomingToHealthcare || 0;
                    
                    toast({
                      title: "All Processing Complete",
                      description: `✓ Expanded ${stats.expand.changed} names | ✓ ${specialtyCount} specialty items | ✓ ${groomingMoved} grooming→healthcare | ✓ ${stats.audit.unknownCount} unknown abbrevs | ${totalDuration}`,
                    });

                    queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/pets'] });
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: error instanceof Error && error.message === 'Unauthorized' 
                        ? "Authentication required" 
                        : "Failed to complete processing",
                      variant: "destructive"
                    });
                  }
                }}
                className="bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:from-purple-700 hover:via-pink-700 hover:to-red-700 text-white font-bold"
                data-testid="button-process-all"
              >
                <Zap className="w-4 h-4 mr-2" />
                Process All
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                One-click automation: abbreviations, categories, brands, grooming, and audit
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Unmatched Invoice Items
              </CardTitle>
              <CardDescription>
                577 items from supplier invoices that couldn't be matched to products in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={async () => {
                  try {
                    const response = await fetch('/api/admin/unmatched-invoice-items', {
                      credentials: 'include'
                    });
                    
                    if (!response.ok) {
                      throw new Error('Download failed');
                    }
                    
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'unmatched_invoice_items.csv';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    toast({
                      title: "Download Complete",
                      description: "CSV file downloaded successfully"
                    });
                  } catch (error) {
                    console.error('Download error:', error);
                    toast({
                      title: "Download Failed",
                      description: "Failed to download file",
                      variant: "destructive"
                    });
                  }
                }}
                className="bg-brand-blue hover:bg-blue-600"
                data-testid="button-download-unmatched-items"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Unmatched Items CSV
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Full Database Sync (Development Only)
              </CardTitle>
              <CardDescription>
                Export all data and import to development environment only
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Warning Banner */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Important Notes</p>
                    <ul className="list-disc list-inside space-y-1 text-yellow-700 dark:text-yellow-400">
                      <li>Export downloads a JSON file with all database tables</li>
                      <li>Import is only available in development environment</li>
                      <li>Import will overwrite existing data (upsert by ID)</li>
                      <li>Always backup before importing</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Export Section */}
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-lg mb-1">Export Database</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Download all database tables as a JSON file. Use this to backup production data or sync to development.
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/admin/database/export', {
                        credentials: 'include'
                      });
                      
                      if (!response.ok) {
                        throw new Error('Export failed');
                      }
                      
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `database-export-${Date.now()}.json`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      
                      toast({
                        title: "Export successful",
                        description: "Database export downloaded successfully"
                      });
                    } catch (error) {
                      console.error('Export error:', error);
                      toast({
                        title: "Export failed",
                        description: "Failed to export database",
                        variant: "destructive"
                      });
                    }
                  }}
                  className="bg-brand-blue hover:bg-blue-600"
                  data-testid="button-export-database"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Database
                </Button>
              </div>

              {/* Import Section */}
              <div className="space-y-3 pt-4 border-t">
                <div>
                  <h3 className="font-semibold text-lg mb-1">Import Database</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Upload a previously exported JSON file to sync production data to development.
                  </p>
                </div>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="application/json"
                    id="database-import-file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        
                        const response = await fetch('/api/admin/database/import', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          credentials: 'include',
                          body: JSON.stringify(data)
                        });
                        
                        const result = await response.json();
                        
                        if (!response.ok) {
                          throw new Error(result.message || 'Import failed');
                        }
                        
                        toast({
                          title: "Import successful",
                          description: `Imported ${Object.values(result.stats || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0)} records`
                        });
                        
                        // Reload the page to show fresh data
                        setTimeout(() => window.location.reload(), 1500);
                      } catch (error) {
                        console.error('Import error:', error);
                        toast({
                          title: "Import failed",
                          description: error instanceof Error ? error.message : "Failed to import database",
                          variant: "destructive"
                        });
                      }
                      
                      // Reset file input
                      e.target.value = '';
                    }}
                    data-testid="input-import-file"
                  />
                  <Button
                    onClick={() => {
                      document.getElementById('database-import-file')?.click();
                    }}
                    variant="outline"
                    className="border-brand-blue text-brand-blue hover:bg-brand-blue/10"
                    data-testid="button-import-database"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Database
                  </Button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select a JSON file exported from production database
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inv-audit" className="space-y-4">
          {typedUser?.isAdmin && <InventoryAudit />}
        </TabsContent>

        <TabsContent value="pos-tracker" className="space-y-4">
          {typedUser?.isAdmin && <PosScanTracker />}
        </TabsContent>

        <TabsContent value="pos-reports" className="space-y-4">
          {typedUser?.isAdmin && <PosReports />}
        </TabsContent>

        <TabsContent value="grooming">
          <Card>
            <CardHeader>
              <CardTitle>Service Appointment Settings</CardTitle>
              <CardDescription>
                Configure appointment restrictions, time slots, and capacity limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Operating Hours */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Operating Hours</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <input
                      type="time"
                      defaultValue={groomingSettings.find(s => s.setting === 'start_time')?.value || '09:00'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'start_time',
                        value: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">End Time</label>
                    <input
                      type="time"
                      defaultValue={groomingSettings.find(s => s.setting === 'end_time')?.value || '17:00'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'end_time',
                        value: e.target.value
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Available Days */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Available Days</h3>
                <div className="grid grid-cols-2 gap-4">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const settingName = `${day.toLowerCase()}_enabled`;
                    const currentSetting = groomingSettings.find(s => s.setting === settingName);
                    const isEnabled = currentSetting ? currentSetting.value === 'true' : true; // Default to true if not set
                    
                    return (
                      <div key={day} className="flex items-center space-x-3">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            console.log(`Updating ${settingName} to ${checked}`);
                            updateGroomingSettingMutation.mutate({
                              setting: settingName,
                              value: checked.toString()
                            });
                          }}
                          disabled={updateGroomingSettingMutation.isPending}
                        />
                        <label className="text-sm font-medium cursor-pointer" onClick={() => {
                          const newValue = !isEnabled;
                          updateGroomingSettingMutation.mutate({
                            setting: settingName,
                            value: newValue.toString()
                          });
                        }}>
                          {day}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Service Prices */}
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Set the name and estimated price for each service. Use a range like "40-80" or a single price like "35". Prices shown to customers as estimates — final price determined on arrival.</p>

                {/* Service 1 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-800">Service 1 (Primary)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Service Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Full Service, Full Groom, Lawn Mow"
                        defaultValue={groomingSettings.find((s: any) => s.setting === 'service1_name')?.value || 'Full Service'}
                        className="w-full p-2 border rounded"
                        onBlur={(e) => updateGroomingSettingMutation.mutate({
                          setting: 'service1_name',
                          value: e.target.value
                        })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Price ($)</label>
                      <input
                        type="text"
                        placeholder="e.g., 40-80 or 35"
                        defaultValue={groomingSettings.find((s: any) => s.setting === 'full_grooming_price')?.value || '35'}
                        className="w-full p-2 border rounded"
                        onBlur={(e) => updateGroomingSettingMutation.mutate({
                          setting: 'full_grooming_price',
                          value: e.target.value
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* Service 2 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-800">Service 2 (Secondary)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Service Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Basic Service, Bath Only, Edge Trim"
                        defaultValue={groomingSettings.find((s: any) => s.setting === 'service2_name')?.value || 'Basic Service'}
                        className="w-full p-2 border rounded"
                        onBlur={(e) => updateGroomingSettingMutation.mutate({
                          setting: 'service2_name',
                          value: e.target.value
                        })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Price ($)</label>
                      <input
                        type="text"
                        placeholder="e.g., 20-30 or 20"
                        defaultValue={groomingSettings.find((s: any) => s.setting === 'bath_only_price')?.value || '20'}
                        className="w-full p-2 border rounded"
                        onBlur={(e) => updateGroomingSettingMutation.mutate({
                          setting: 'bath_only_price',
                          value: e.target.value
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* Add-Ons */}
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <h4 className="text-base font-semibold text-blue-800 mb-2">Add-On Services</h4>
                  <p className="text-xs text-blue-600 mb-3">Set a name and price for each add-on. Leave the name blank to hide that add-on from the booking form.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {([
                      { nameKey: 'addon1_name', priceKey: 'addon_nail_grind_price', defaultName: 'Nail Grind', defaultPrice: '15', placeholder: 'e.g., Nail Grind, Edge Detail' },
                      { nameKey: 'addon2_name', priceKey: 'addon_teeth_brushing_price', defaultName: 'Brush Teeth', defaultPrice: '10', placeholder: 'e.g., Brush Teeth, Interior Wipe' },
                      { nameKey: 'addon3_name', priceKey: 'addon_furminator_price', defaultName: 'Furminator', defaultPrice: '20', placeholder: 'e.g., Furminator, Tire Shine' },
                      { nameKey: 'addon4_name', priceKey: 'addon_scent_package_price', defaultName: 'Scent Package', defaultPrice: '5', placeholder: 'e.g., Scent Package, Air Freshener' },
                    ] as const).map((addon, i) => (
                      <div key={i} className="bg-white rounded p-3 space-y-2">
                        <label className="block text-xs font-semibold text-gray-700">Add-On {i + 1}</label>
                        <input
                          type="text"
                          placeholder={addon.placeholder}
                          defaultValue={groomingSettings.find((s: any) => s.setting === addon.nameKey)?.value || addon.defaultName}
                          className="w-full p-2 border rounded text-sm"
                          onBlur={(e) => updateGroomingSettingMutation.mutate({ setting: addon.nameKey, value: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder={`Price e.g., ${addon.defaultPrice}`}
                          defaultValue={groomingSettings.find((s: any) => s.setting === addon.priceKey)?.value || addon.defaultPrice}
                          className="w-full p-2 border rounded text-sm"
                          onBlur={(e) => updateGroomingSettingMutation.mutate({ setting: addon.priceKey, value: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Appointment Duration */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Appointment Settings</h3>
                <div className="max-w-xs">
                  <label className="block text-sm font-medium mb-2">Appointment Duration (minutes)</label>
                  <select
                    defaultValue={groomingSettings.find(s => s.setting === 'appointment_duration')?.value || '60'}
                    className="w-full p-2 border rounded"
                    onChange={(e) => updateGroomingSettingMutation.mutate({
                      setting: 'appointment_duration',
                      value: e.target.value
                    })}
                  >
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
              </div>

              {/* Weekly Appointment Limits */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold">Weekly Appointment Limits</h3>
                <p className="text-sm text-gray-600 mb-3">Set appointment limits for each day of the week (Monday through Saturday)</p>
                
                {/* Weekly Limits Grid */}
                <div className="space-y-3">
                  {[
                    { day: 1, name: 'Monday' },
                    { day: 2, name: 'Tuesday' },
                    { day: 3, name: 'Wednesday' },
                    { day: 4, name: 'Thursday' },
                    { day: 5, name: 'Friday' },
                    { day: 6, name: 'Saturday' },
                  ].map(({ day, name }) => {
                    const existingLimit = weeklyLimits.find((l: any) => l.dayOfWeek === day);
                    const isEditing = editingWeeklyLimit?.dayOfWeek === day;
                    const bathLimit = isEditing ? editingWeeklyLimit.bathLimit : (existingLimit?.maxBathAppointments ?? 5);
                    const groomLimit = isEditing ? editingWeeklyLimit.groomLimit : (existingLimit?.maxGroomAppointments ?? 5);

                    return (
                      <div key={day} className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-shrink-0 w-24">
                            <span className="font-medium text-sm">{name}</span>
                          </div>
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium mb-1 text-gray-600">Max Bath</label>
                              <input
                                type="number"
                                min="0"
                                max="50"
                                value={bathLimit}
                                onChange={(e) => setEditingWeeklyLimit({ dayOfWeek: day, bathLimit: parseInt(e.target.value), groomLimit })}
                                className="w-full p-2 border rounded text-sm"
                                data-testid={`input-weekly-limit-bath-${day}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1 text-gray-600">Max Full Groom</label>
                              <input
                                type="number"
                                min="0"
                                max="50"
                                value={groomLimit}
                                onChange={(e) => setEditingWeeklyLimit({ dayOfWeek: day, bathLimit, groomLimit: parseInt(e.target.value) })}
                                className="w-full p-2 border rounded text-sm"
                                data-testid={`input-weekly-limit-groom-${day}`}
                              />
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              upsertWeeklyLimitMutation.mutate({
                                dayOfWeek: day,
                                maxBathAppointments: bathLimit,
                                maxGroomAppointments: groomLimit,
                              });
                            }}
                            disabled={upsertWeeklyLimitMutation.isPending}
                            className="w-full sm:w-auto"
                            size="sm"
                            data-testid={`button-save-weekly-limit-${day}`}
                          >
                            {upsertWeeklyLimitMutation.isPending && editingWeeklyLimit?.dayOfWeek === day ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Special Date Time Slots */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold">Special Date Time Slots</h3>
                <p className="text-sm text-gray-600 mb-3">Configure specific dates (like holidays) with custom booking times</p>
                
                {/* Add/Edit Special Date Form */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Date</label>
                      <Input
                        type="date"
                        value={specialDateForm.date}
                        onChange={(e) => setSpecialDateForm({ ...specialDateForm, date: e.target.value })}
                        className="w-full"
                        data-testid="input-special-date-date"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Name (e.g., Thanksgiving)</label>
                      <Input
                        type="text"
                        value={specialDateForm.name}
                        onChange={(e) => setSpecialDateForm({ ...specialDateForm, name: e.target.value })}
                        placeholder="Holiday name"
                        className="w-full"
                        data-testid="input-special-date-name"
                      />
                    </div>
                  </div>

                  {/* Allowed Times */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Allowed Times</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        type="time"
                        value={newAllowedTime}
                        onChange={(e) => setNewAllowedTime(e.target.value)}
                        className="flex-1"
                        data-testid="input-new-allowed-time"
                      />
                      <Button
                        onClick={() => {
                          if (newAllowedTime) {
                            // Convert 24-hour to 12-hour format
                            const [hours, minutes] = newAllowedTime.split(':');
                            const hour = parseInt(hours);
                            const ampm = hour >= 12 ? 'PM' : 'AM';
                            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                            const formattedTime = `${displayHour}:${minutes} ${ampm}`;
                            
                            if (!specialDateForm.allowedTimes.includes(formattedTime)) {
                              setSpecialDateForm({
                                ...specialDateForm,
                                allowedTimes: [...specialDateForm.allowedTimes, formattedTime].sort()
                              });
                            }
                            setNewAllowedTime('');
                          }
                        }}
                        size="sm"
                        data-testid="button-add-time-slot"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {/* Display allowed times */}
                    <div className="flex flex-wrap gap-2">
                      {specialDateForm.allowedTimes.map((time, index) => (
                        <Badge key={index} variant="secondary" className="gap-1">
                          {time}
                          <button
                            onClick={() => {
                              setSpecialDateForm({
                                ...specialDateForm,
                                allowedTimes: specialDateForm.allowedTimes.filter((_, i) => i !== index)
                              });
                            }}
                            data-testid={`button-remove-time-${index}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (specialDateForm.id) {
                          updateSpecialDateMutation.mutate(specialDateForm as any);
                        } else {
                          createSpecialDateMutation.mutate(specialDateForm);
                        }
                        setSpecialDateForm({ date: '', name: '', allowedTimes: [] });
                      }}
                      disabled={!specialDateForm.date || !specialDateForm.name || specialDateForm.allowedTimes.length === 0}
                      data-testid="button-save-special-date"
                    >
                      {specialDateForm.id ? 'Update' : 'Add'} Special Date
                    </Button>
                    {specialDateForm.id && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSpecialDateForm({ date: '', name: '', allowedTimes: [] });
                        }}
                        data-testid="button-cancel-edit-special-date"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* List of Special Dates */}
                <div className="space-y-2">
                  {specialDates.map((specialDate: any) => (
                    <div key={specialDate.id} className="p-4 bg-white dark:bg-gray-900 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{specialDate.name}</span>
                            <Badge variant="outline">{new Date(specialDate.date).toLocaleDateString()}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(specialDate.allowedTimes || []).map((time: any, index: number) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {time.allowedTime}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSpecialDateForm({
                                id: specialDate.id,
                                date: specialDate.date,
                                name: specialDate.name,
                                allowedTimes: (specialDate.allowedTimes || []).map((t: any) => t.allowedTime)
                              });
                            }}
                            data-testid={`button-edit-special-date-${specialDate.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              showDeleteConfirmation(
                                'Delete Special Date',
                                'Are you sure you want to delete this special date? This action cannot be undone.',
                                specialDate.name,
                                () => deleteSpecialDateMutation.mutate(specialDate.id)
                              );
                            }}
                            data-testid={`button-delete-special-date-${specialDate.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {specialDates.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No special dates configured</p>
                  )}
                </div>
              </div>

              {/* Booking Restrictions */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Booking Restrictions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Advance Booking Limit (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      defaultValue={groomingSettings.find(s => s.setting === 'advance_booking_days')?.value || '30'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'advance_booking_days',
                        value: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Minimum Notice (hours)</label>
                    <input
                      type="number"
                      min="1"
                      max="72"
                      defaultValue={groomingSettings.find(s => s.setting === 'minimum_notice_hours')?.value || '24'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'minimum_notice_hours',
                        value: e.target.value
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* Holiday/Block Dates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Special Dates</h3>
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-2">Blocked Dates (comma-separated, YYYY-MM-DD format)</label>
                    <textarea
                      placeholder="2025-12-25, 2025-01-01"
                      defaultValue={groomingSettings.find(s => s.setting === 'blocked_dates')?.value || ''}
                      className="w-full p-2 border rounded h-20"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'blocked_dates',
                        value: e.target.value
                      })}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter dates when appointments should not be available (holidays, maintenance, etc.)
                    </p>
                  </div>
                </div>
              </div>

              {updateGroomingSettingMutation.isPending && (
                <div className="text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Updating settings...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boarding">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  Boarding Records
                </CardTitle>
                {typedUser?.isAdmin && (
                  <Button 
                    onClick={() => setIsAddBoardingOpen(true)}
                    className="w-full sm:w-auto bg-brand-blue hover:bg-blue-600"
                    data-testid="button-add-boarding"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Boarding
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <BoardingManagement isAddOpen={isAddBoardingOpen} setIsAddOpen={setIsAddBoardingOpen} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleManagement />
        </TabsContent>

        <TabsContent value="astro" className="space-y-6">
          <AstroLoyaltyManager />
        </TabsContent>

        <TabsContent value="email-center" className="space-y-6">
          <EmailCenter groomingSettings={groomingSettings as any[]} />
        </TabsContent>

        <TabsContent value="charge-accounts" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Charge Account Reports</h2>
              <p className="text-gray-400 text-sm mt-1">All outstanding orders billed to in-store charge accounts</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchChargeReports()} className="border-gray-600 text-gray-300 hover:bg-gray-700">
              Refresh
            </Button>
          </div>

          {chargeReportsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
            </div>
          ) : chargeAccountReports.length === 0 ? (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="py-12 text-center text-gray-400">
                No outstanding charge account orders found.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {chargeAccountReports.map((entry: any) => {
                const { user, orders: userOrders } = entry;
                const grandTotal = userOrders.reduce((sum: number, { order }: any) => sum + parseFloat(order.totalAmount || '0'), 0);
                const discPct = chargeDiscounts[user.id] ?? 0;
                const discAmt = grandTotal * (discPct / 100);
                const finalAmt = grandTotal - discAmt;
                return (
                  <Card key={user.id} className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div>
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                              <span className="inline-block bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">Charge Account</span>
                              {user.firstName} {user.lastName}
                            </CardTitle>
                            <p className="text-gray-400 text-sm mt-1">{user.email}</p>
                            {user.phoneNumber && (
                              <a href={`tel:${user.phoneNumber}`} className="text-sm text-blue-400 hover:underline flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />
                                {user.phoneNumber}
                              </a>
                            )}
                            <p className="text-gray-500 text-xs mt-0.5">
                              {userOrders.length} order{userOrders.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>

                        {/* Discount + Totals + Email row */}
                        <div className="bg-gray-750 border border-gray-700 rounded-lg p-3 space-y-3">
                          {/* Discount percentage control */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-gray-300 text-sm font-medium shrink-0">Courtesy Discount:</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              {[0, 10, 15, 20, 25, 30, 35].map((pct) => (
                                <button
                                  key={pct}
                                  onClick={() => setChargeDiscounts(prev => ({ ...prev, [user.id]: pct }))}
                                  className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                                    discPct === pct
                                      ? 'bg-amber-500 border-amber-400 text-black'
                                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                  }`}
                                >
                                  {pct === 0 ? 'None' : `${pct}%`}
                                </button>
                              ))}
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={discPct}
                                  onChange={(e) => {
                                    const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                    setChargeDiscounts(prev => ({ ...prev, [user.id]: val }));
                                  }}
                                  className="w-16 bg-gray-700 border border-gray-600 text-white text-sm rounded px-2 py-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="0"
                                />
                                <span className="text-gray-400 text-sm">%</span>
                              </div>
                            </div>
                          </div>

                          {/* Total summary + Email button */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-gray-700">
                            <div className="text-sm space-y-0.5">
                              {discPct > 0 ? (
                                <>
                                  <div className="text-gray-400">Subtotal: <span className="text-white">${grandTotal.toFixed(2)}</span></div>
                                  <div className="text-green-400">Discount ({discPct}%): −${discAmt.toFixed(2)}</div>
                                  <div className="text-amber-400 font-bold text-base">Amount Due: ${finalAmt.toFixed(2)}</div>
                                </>
                              ) : (
                                <div className="text-amber-400 font-bold text-base">Grand Total: ${grandTotal.toFixed(2)}</div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0"
                              onClick={() => emailChargeReportMutation.mutate({ userId: user.id, discountPercent: discPct })}
                              disabled={emailChargeReportMutation.isPending}
                            >
                              {emailChargeReportMutation.isPending ? 'Sending...' : 'Email Statement'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                      {userOrders.map(({ order, items }: any) => {
                        const orderDate = order.orderDate
                          ? new Date(order.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                          : 'Unknown';
                        return (
                          <div key={order.id} className="border border-gray-700 rounded-lg overflow-hidden">
                            <div className="bg-gray-700 px-4 py-2 flex items-center justify-between">
                              <span className="text-gray-200 font-medium text-sm">Order #{order.id}</span>
                              <span className="text-gray-400 text-xs">{orderDate}</span>
                            </div>
                            <div className="divide-y divide-gray-700">
                              {items.length === 0 ? (
                                <p className="text-gray-500 text-sm px-4 py-3">No items recorded</p>
                              ) : (
                                <>
                                  <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-gray-750">
                                    <span className="text-gray-500 text-xs font-semibold uppercase">Item</span>
                                    <span className="text-gray-500 text-xs font-semibold uppercase text-center">Qty</span>
                                    <span className="text-gray-500 text-xs font-semibold uppercase text-right">Unit Price</span>
                                    <span className="text-gray-500 text-xs font-semibold uppercase text-right">Total</span>
                                  </div>
                                  {items.map((item: any, idx: number) => (
                                    <div key={idx} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 items-start">
                                      <span className="text-gray-200 text-sm">{item.itemName}</span>
                                      <span className="text-gray-400 text-sm text-center">×{item.quantity}</span>
                                      <span className="text-gray-400 text-sm text-right hidden sm:block">${parseFloat(item.price || '0').toFixed(2)}</span>
                                      <span className="text-white text-sm text-right font-medium">${(parseFloat(item.price || '0') * (item.quantity || 1)).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                            <div className="bg-gray-700 px-4 py-2 text-right space-y-1">
                              {order.discountAmount && parseFloat(order.discountAmount) > 0 && (
                                <div className="text-green-400 text-xs">Discount: −${parseFloat(order.discountAmount).toFixed(2)}</div>
                              )}
                              {order.taxAmount && parseFloat(order.taxAmount) > 0 && (
                                <div className="text-gray-400 text-xs">Tax: ${parseFloat(order.taxAmount).toFixed(2)}</div>
                              )}
                              <div className="text-amber-400 font-bold text-sm">Order Total: ${parseFloat(order.totalAmount || '0').toFixed(2)}</div>
                            </div>
                            {order.customerNotes && (
                              <div className="bg-yellow-900/30 border-t border-yellow-700/40 px-4 py-2">
                                <span className="text-yellow-300 text-xs font-semibold">Customer Note: </span>
                                <span className="text-yellow-200 text-xs">{order.customerNotes}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="specials" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-500" />
                  Specials & Deals
                </CardTitle>
                <Button size="sm" onClick={openAddSpecial} className="bg-brand-red hover:bg-red-600">
                  <Plus className="w-4 h-4 mr-1" /> Add Special
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(adminSpecials as any[]).length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No specials yet</p>
                  <p className="text-sm mt-1">Add a deal or promotion to show customers on the home screen.</p>
                  <Button className="mt-4 bg-brand-red hover:bg-red-600" onClick={openAddSpecial}>
                    <Plus className="w-4 h-4 mr-1" /> Add First Special
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(adminSpecials as any[]).map((s: any) => (
                    <div key={s.id} className={`flex gap-3 p-3 rounded-lg border ${s.isActive ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}>
                      {s.imageUrl && (
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                          <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{s.title}</p>
                            {s.badgeText && (
                              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full text-white mt-0.5 bg-${s.badgeColor || 'red'}-500`}>
                                {s.badgeText}
                              </span>
                            )}
                            {s.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleSpecialActiveMutation.mutate({ id: s.id, isActive: !s.isActive })}
                              title={s.isActive ? 'Click to hide' : 'Click to show'}
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium cursor-pointer transition-colors ${s.isActive ? 'bg-green-100 text-green-700 border-green-400 hover:bg-green-200' : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'}`}
                            >
                              {s.isActive ? 'Live' : 'Hidden'}
                            </button>
                            <Button size="sm" variant="outline" onClick={() => openEditSpecial(s)} className="h-7 w-7 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteSpecialMutation.mutate(s.id)} disabled={deleteSpecialMutation.isPending} className="h-7 w-7 p-0 border-red-200 text-red-500 hover:bg-red-50">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Sort: {s.sortOrder} {s.linkType !== 'none' && `• Links to: ${s.linkType}`}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add / Edit Special Dialog */}
          <Dialog open={isAddSpecialOpen} onOpenChange={(open) => { if (!open) { setIsAddSpecialOpen(false); setEditingSpecial(null); } }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingSpecial ? 'Edit Special' : 'Add New Special'}</DialogTitle>
                <DialogDescription>Fill in the details for this deal or promotion.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title *</Label>
                  <Input value={specialForm.title} onChange={e => setSpecialForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 20% Off All Dog Food" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={specialForm.description} onChange={e => setSpecialForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the deal..." rows={2} />
                </div>
                <div>
                  <Label>Badge Text</Label>
                  <Input value={specialForm.badgeText} onChange={e => setSpecialForm(f => ({ ...f, badgeText: e.target.value }))} placeholder="e.g. 20% OFF, SALE, BOGO" maxLength={50} />
                </div>
                <div>
                  <Label>Badge Color</Label>
                  <select value={specialForm.badgeColor} onChange={e => setSpecialForm(f => ({ ...f, badgeColor: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="red">Red</option>
                    <option value="orange">Orange</option>
                    <option value="green">Green</option>
                    <option value="blue">Blue</option>
                    <option value="purple">Purple</option>
                    <option value="yellow">Yellow</option>
                  </select>
                </div>
                <SpecialMultiImageUpload
                  mainImageUrl={specialForm.imageUrl}
                  additionalImageUrls={specialForm.imageUrls}
                  onMainImageChange={(url) => setSpecialForm(f => ({ ...f, imageUrl: url }))}
                  onAdditionalImagesChange={(urls) => setSpecialForm(f => ({ ...f, imageUrls: urls }))}
                />
                <div>
                  <Label>Link Type</Label>
                  <select value={specialForm.linkType} onChange={e => setSpecialForm(f => ({ ...f, linkType: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="none">No Link</option>
                    <option value="supplies">Supplies Page</option>
                    <option value="pets">Pets Page</option>
                    <option value="external">External URL</option>
                  </select>
                </div>
                {specialForm.linkType === 'external' && (
                  <div>
                    <Label>External URL</Label>
                    <Input value={specialForm.externalUrl} onChange={e => setSpecialForm(f => ({ ...f, externalUrl: e.target.value }))} placeholder="https://..." />
                  </div>
                )}
                <div>
                  <Label>Sort Order <span className="text-xs text-gray-400">(lower = shows first)</span></Label>
                  <Input type="number" value={specialForm.sortOrder} onChange={e => setSpecialForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={specialForm.isActive} onCheckedChange={v => setSpecialForm(f => ({ ...f, isActive: v }))} />
                  <Label>{specialForm.isActive ? 'Live — visible to customers' : 'Hidden — not shown to customers'}</Label>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setIsAddSpecialOpen(false); setEditingSpecial(null); }}>Cancel</Button>
                  <Button className="flex-1 bg-brand-red hover:bg-red-600" onClick={() => saveSpecialMutation.mutate()} disabled={saveSpecialMutation.isPending || !specialForm.title.trim()}>
                    {saveSpecialMutation.isPending ? 'Saving...' : (editingSpecial ? 'Save Changes' : 'Create Special')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <ApplicationsPanel />
        </TabsContent>

        <TabsContent value="feedback" className="space-y-6">
          <FeedbackPanel />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          {!typedUser?.isEmployee && <StoreCodeCard />}
          <FeaturesPanel />
          {!typedUser?.isEmployee && <PayPeriodCard />}
          <StoreHoursPanel />
          <SettingsPanel />
          <TrackedItemsSettingsPanel />
          <LoyaltySettingsPanel />
          <LegalPagesPanel />
        </TabsContent>

        <TabsContent value="non-payment" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-xl font-semibold">Non-Payment</h2>
              {nonPaymentCount > 0 && (
                <Badge className="bg-red-600 text-white">{nonPaymentCount}</Badge>
              )}
            </div>
            {nonPaymentCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-gray-400 text-gray-600"
                disabled={dismissAllNonPaymentMutation.isPending}
                onClick={() => showDeleteConfirmation(
                  'Dismiss All Non-Payment',
                  `This will mark all ${nonPaymentCount} appointment(s) as paid and clear the Non-Payment list. Use this to start fresh.`,
                  `${nonPaymentCount} appointment(s)`,
                  () => dismissAllNonPaymentMutation.mutate()
                )}
              >
                {dismissAllNonPaymentMutation.isPending ? 'Clearing...' : 'Dismiss All'}
              </Button>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Past and today's confirmed/completed appointments that have not been marked paid. These are held here until payment is collected and recorded.
          </p>
          {nonPaymentCount === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">All clear — no outstanding payments.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {nonPaymentAppointments.map((apt: any) => (
                <Card key={apt.id} className="border-red-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">
                            {apt.ownerFirstName} {apt.ownerLastName}
                          </span>
                          <Badge variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50">
                            Unpaid
                          </Badge>
                          {apt.tipAmount && (
                            <Badge className="text-xs bg-purple-100 text-purple-700 border border-purple-300">
                              Tip: ${parseFloat(apt.tipAmount).toFixed(2)}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <p>
                            Pet: {apt.pets && apt.pets.length > 0
                              ? apt.pets.map((p: any) => capitalizeWords(p.petName)).join(', ')
                              : apt.petName
                            } ({apt.petType || (apt.pets && apt.pets[0]?.petType) || 'dog'})
                          </p>
                          <p>
                            Service: {apt.pets && apt.pets.length > 0
                              ? apt.pets.map((p: any) => p.serviceType).join(', ')
                              : apt.serviceType
                            }
                          </p>
                          {(apt.groomerName || (apt.pets && apt.pets[0]?.groomerName)) && (
                            <p>Groomer: {apt.groomerName || apt.pets[0]?.groomerName}</p>
                          )}
                          <p>Phone: {apt.ownerPhoneNumber}</p>
                          <p className="text-gray-500 font-medium">
                            {parseLocalDate(apt.appointmentDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at {apt.appointmentTime}
                          </p>
                          {apt.price && (
                            <p className="text-amber-700 font-semibold">Amount: ${apt.price}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => updateAppointmentIsPaidMutation.mutate({ id: apt.id, isPaid: true })}
                          disabled={updateAppointmentIsPaidMutation.isPending || updateAppointmentMutation.isPending}
                        >
                          <DollarSign className="w-3.5 h-3.5 mr-1" />
                          Mark Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => showDeleteConfirmation(
                            'Cancel Appointment',
                            `Cancel the appointment for ${apt.ownerFirstName} ${apt.ownerLastName}? This will remove it from Non-Payment.`,
                            `${apt.ownerFirstName} ${apt.ownerLastName}'s appointment`,
                            () => updateAppointmentMutation.mutate({ id: apt.id, status: 'cancelled' })
                          )}
                          disabled={updateAppointmentMutation.isPending || updateAppointmentIsPaidMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="waitlist" className="space-y-4">
          <WaitlistTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <TasksTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="announcements" className="space-y-4">
          <AnnouncementsTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="estimates" className="space-y-4">
          <EstimatesTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="invoicing" className="space-y-4">
          <InvoicingTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="time-clock" className="space-y-4">
          <TimeClockTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="intake-forms" className="space-y-4">
          <IntakeFormsTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="sms-blasts" className="space-y-4">
          <SMSBlastsTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="memberships" className="space-y-4">
          <MembershipsTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <StaffTab typedUser={typedUser} />
        </TabsContent>

        <TabsContent value="homepage" className="space-y-4">
          <HomepageTab />
        </TabsContent>

      </Tabs>

      {/* SMS Confirmation Dialog for Grooming Completed */}
      <Dialog open={smsConfirmDialog.isOpen} onOpenChange={(open) => !open && closeSmsConfirmDialog()}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-green-600" />
              Send SMS Notification
            </DialogTitle>
            <DialogDescription>
              {smsConfirmDialog.customerPhone ? (
                <>Sending to <strong>{smsConfirmDialog.customerName}</strong> at <strong>{smsConfirmDialog.customerPhone}</strong></>
              ) : (
                <span className="text-amber-600">No phone number on file for {smsConfirmDialog.customerName}. Message will not be sent.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sms-message">Message (editable - add price, notes, etc.)</Label>
              <Textarea
                id="sms-message"
                value={smsConfirmDialog.message}
                onChange={(e) => setSmsConfirmDialog(prev => ({ ...prev, message: e.target.value }))}
                className="min-h-[120px] text-sm"
                placeholder="Enter SMS message..."
              />
              <p className="text-xs text-muted-foreground">
                {smsConfirmDialog.message.length} characters
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeSmsConfirmDialog}>
              Cancel
            </Button>
            <Button 
              onClick={confirmSmsAndMarkDone}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              {smsConfirmDialog.customerPhone ? "Send & Mark Done" : "Mark Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Has the customer been called?" confirmation before marking Done */}
      <AlertDialog open={pendingDoneId !== null} onOpenChange={(open) => { if (!open) setPendingDoneId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Has the customer been called?</AlertDialogTitle>
            <AlertDialogDescription>
              Before marking this appointment as done, please confirm you have called the customer to verify their information is accurate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDoneId(null)}>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDoneId !== null) {
                  updateAppointmentGroomingCompletedMutation.mutate({ id: pendingDoneId, groomingCompleted: true });
                  setPendingDoneId(null);
                }
              }}
            >
              Yes, Mark Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Appointment Details Dialog */}
      {selectedAppointment && (
        <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
          <DialogContent className="max-w-md mx-auto max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Appointment Details
              </DialogTitle>
              <DialogDescription>View appointment information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Service</Label>
                  <p className="text-gray-900">{formatServiceType(selectedAppointment.serviceType)}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Date</Label>
                    <p className="text-gray-900">{parseLocalDate(selectedAppointment.appointmentDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Time</Label>
                    <p className="text-gray-900">{selectedAppointment.appointmentTime}</p>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-gray-900 mb-2">{trackedItemsSingular} Information</h4>
                  {selectedAppointment.pets && selectedAppointment.pets.length > 0 ? (
                    <div className="space-y-3">
                      {selectedAppointment.pets.map((pet: any, index: number) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg">
                          <div className="font-medium text-sm text-gray-600 mb-2">{trackedItemsSingular} {index + 1}</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs font-semibold text-gray-600">Name</Label>
                              <p className="text-gray-900">{capitalizeWords(pet.petName)}</p>
                            </div>
                            <div>
                              <Label className="text-xs font-semibold text-gray-600">Type</Label>
                              <p className="text-gray-900">{pet.petType}</p>
                            </div>
                            <div className="col-span-2">
                              <Label className="text-xs font-semibold text-gray-600">Service</Label>
                              <p className="text-gray-900">{formatServiceType(pet.serviceType)}</p>
                            </div>
                            {(pet.specialNotes || pet.notes) && (
                              <div className="col-span-2">
                                <Label className="text-xs font-semibold text-gray-600">Notes</Label>
                                <p className="text-gray-900 text-sm whitespace-pre-wrap">{pet.specialNotes || pet.notes}</p>
                              </div>
                            )}
                            {pet.price && (
                              <div className="col-span-2">
                                <Label className="text-xs font-semibold text-gray-600">Price</Label>
                                <p className="text-gray-900 text-sm font-medium text-green-700">${pet.price}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Show appointment-level notes for multi-pet appointments */}
                      {selectedAppointment.specialNotes && (
                        <div className="mt-3 bg-amber-50 p-3 rounded-lg border border-amber-200">
                          <Label className="text-sm font-semibold text-amber-800">Appointment Notes</Label>
                          <p className="text-gray-900 whitespace-pre-wrap mt-1">{selectedAppointment.specialNotes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-semibold text-gray-700">Pet Name</Label>
                          <p className="text-gray-900">{capitalizeWords(selectedAppointment.petName)}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold text-gray-700">Pet Type</Label>
                          <p className="text-gray-900">{selectedAppointment.petType}</p>
                        </div>
                      </div>
                      {selectedAppointment.specialNotes && (
                        <div className="mt-3">
                          <Label className="text-sm font-semibold text-gray-700">Special Notes</Label>
                          <p className="text-gray-900 whitespace-pre-wrap">{selectedAppointment.specialNotes}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {/* Total Price Section */}
                {selectedAppointment.price && (() => {
                  const isConfirmed = selectedAppointment.priceConfirmed;
                  const serviceType = (selectedAppointment.serviceType || (selectedAppointment.pets?.[0]?.serviceType) || '').toLowerCase();
                  const hasFullGrooming = serviceType.includes('full') || serviceType.includes('groom') && !serviceType.includes('bath');
                  const hasPetsWithFullGrooming = selectedAppointment.pets?.some((p: any) => {
                    const st = (p.serviceType || '').toLowerCase();
                    return st.includes('full') || (st.includes('groom') && !st.includes('bath'));
                  });
                  const isFullGrooming = hasFullGrooming || hasPetsWithFullGrooming;
                  
                  if (!isConfirmed) {
                    const rangeSetting = isFullGrooming 
                      ? groomingSettings.find((s: any) => s.setting === 'full_grooming_price')?.value 
                      : groomingSettings.find((s: any) => s.setting === 'bath_only_price')?.value;
                    const rangeDisplay = rangeSetting || (isFullGrooming ? '40-80' : '20-35');
                    return (
                      <div className="border-t pt-3">
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-300">
                          <Label className="text-sm font-semibold text-amber-800">Total Price</Label>
                          <p className="text-xl font-bold text-amber-600">${rangeDisplay}</p>
                          <p className="text-xs text-amber-700 font-medium mt-1">&#9888; Price not confirmed - call to verify</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="border-t pt-3">
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <Label className="text-sm font-semibold text-green-800">Grooming Price</Label>
                        <p className="text-xl font-bold text-green-700">${selectedAppointment.price}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Items Sold section - for front desk POS lookup */}
                {selectedAppointment.items && selectedAppointment.items.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" />
                      Items Sold ({selectedAppointment.items.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedAppointment.items.map((item: any) => (
                        <div key={item.id} className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                          <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                          {item.sku && (
                            <p className="text-xs text-gray-700 font-mono mt-0.5">UPC: {item.sku}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.brand ? `${item.brand} · ` : ''}Qty {item.quantity} × ${parseFloat(item.price).toFixed(2)} = ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                        <span className="text-xs font-semibold text-gray-600">Items Total</span>
                        <span className="text-sm font-bold text-blue-700">${selectedAppointment.itemsTotal}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t pt-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Owner Information</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Name</Label>
                      <p className="text-gray-900">{capitalizeWords(selectedAppointment.ownerFirstName)} {capitalizeWords(selectedAppointment.ownerLastName)}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Phone Number</Label>
                      <p className="text-gray-900">{selectedAppointment.ownerPhoneNumber}</p>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Status</Label>
                    <Badge 
                      variant={
                        selectedAppointment.status === 'confirmed' ? 'default' : 
                        selectedAppointment.status === 'rejected' ? 'destructive' : 
                        'secondary'
                      }
                    >
                      {selectedAppointment.status === 'scheduled' ? 'Pending' : 
                       selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                {selectedAppointment.notes && (
                  <div className="border-t pt-3">
                    <Label className="text-sm font-semibold text-gray-700">Notes</Label>
                    <p className="text-gray-900 whitespace-pre-wrap">{selectedAppointment.notes}</p>
                  </div>
                )}

              </div>
            </div>
            {selectedAppointment.status === 'confirmed' && typedUser?.isAdmin && (
              <DialogFooter className="border-t pt-4">
                <Button
                  variant="destructive"
                  onClick={() => {
                    showDeleteConfirmation(
                      'Delete Appointment',
                      'Are you sure you want to permanently delete this approved appointment? This action cannot be undone.',
                      `${selectedAppointment.ownerFirstName || ''} ${selectedAppointment.ownerLastName || ''} - ${selectedAppointment.appointmentDate}`,
                      () => {
                        deleteAppointmentMutation.mutate(selectedAppointment.id);
                        setSelectedAppointment(null);
                      }
                    );
                  }}
                  disabled={deleteAppointmentMutation.isPending}
                  data-testid={`button-delete-appointment-details-${selectedAppointment.id}`}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Appointment
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Appointment Dialog - Multi-Pet */}
      {editingAppointment && (
        <EditAppointmentDialog 
          appointmentId={editingAppointment.id}
          initialOwnerFirstName={editOwnerFirstName}
          initialOwnerLastName={editOwnerLastName}
          initialOwnerPhone={editOwnerPhone}
          initialDate={editDate}
          initialTime={editTime}
          onClose={() => {
            setEditingAppointment(null);
            setEditPets([]);
            setEditPricingMode('individual');
            setEditTotalPriceOverride('');
            setEditOwnerFirstName('');
            setEditOwnerLastName('');
            setEditOwnerPhone('');
            setEditDate(undefined);
            setEditTime('');
          }}
          onOpenScanner={(cb) => setEditApptScannerCb(() => cb)}
          scannerOpen={!!editApptScannerCb}
          groomers={groomers}
          isBookingDateAvailable={isBookingDateAvailable}
          bookingAvailableTimeSlots={bookingAvailableTimeSlots}
        />
      )}

      {/* Appointment items barcode scanner — rendered outside all dialogs so Radix/scroll-lock cannot block it */}
      {editApptScannerCb && (
        <BarcodeScanner
          onClose={() => setEditApptScannerCb(null)}
          onDetected={(upc) => {
            const cb = editApptScannerCb;
            setEditApptScannerCb(null);
            cb(upc);
          }}
        />
      )}

      {/* Delete Pet Confirmation */}
      <AlertDialog open={!!petToDelete} onOpenChange={(open) => !open && setPetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this pet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{petToDelete?.name}</span> ({petToDelete?.species}{petToDelete?.morph ? ` - ${petToDelete.morph}` : ''}) from the inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (petToDelete) {
                  deletePetMutation.mutate(petToDelete.id);
                  setPetToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Pet Dialog */}
      {editingPet && (
        <Dialog open={!!editingPet} onOpenChange={() => setEditingPet(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Pet</DialogTitle>
              <DialogDescription>Update pet information.</DialogDescription>
            </DialogHeader>
            <EditPetForm 
              pet={editingPet}
              onSubmit={(data) => editPetMutation.mutate({ id: editingPet.id, data })} 
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Supply Dialog */}
      {editingSupply && (
        <Dialog open={!!editingSupply} onOpenChange={() => setEditingSupply(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Supply</DialogTitle>
              <DialogDescription>Update supply information.</DialogDescription>
            </DialogHeader>
            <EditSupplyForm 
              supply={editingSupply}
              onSubmit={(data) => editSupplyMutation.mutate({ id: editingSupply.id, data })} 
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Book Appointment Modal */}
      <Dialog open={isBookAppointmentOpen} onOpenChange={setIsBookAppointmentOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Book New Appointment</DialogTitle>
            <DialogDescription>Fill in the form below to book a new grooming appointment.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBookingSubmit} className="space-y-4">
            {/* Contact Search */}
            <div className="relative">
              <Label>Search Existing Contact</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search by name, phone, or pet name..."
                  value={bookingContactSearch}
                  onChange={(e) => {
                    setBookingContactSearch(e.target.value);
                    setShowBookingContactDropdown(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => bookingContactSearch.trim().length > 0 && setShowBookingContactDropdown(true)}
                  className="pr-10"
                  data-testid="input-booking-contact-search"
                />
                {bookingContactSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setBookingContactSearch('');
                      setShowBookingContactDropdown(false);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    data-testid="button-clear-booking-contact-search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {showBookingContactDropdown && filteredBookingContacts.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                  {filteredBookingContacts.map((contact: any, index: number) => (
                    <div
                      key={contact.id || index}
                      className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                      onClick={() => handleBookingSelectContact(contact)}
                      data-testid={`booking-contact-option-${index}`}
                    >
                      <div className="font-medium">{contact.name}</div>
                      {contact.phoneNumber && (
                        <div className="text-sm text-gray-600">{contact.phoneNumber}</div>
                      )}
                      {contact.petNames && contact.petNames.length > 0 && (
                        <div className="text-xs text-purple-600">🐾 {contact.petNames.join(', ')}</div>
                      )}
                      {contact.email && (
                        <div className="text-xs text-gray-500">{contact.email}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Owner Information */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input
                  type="text"
                  value={bookingOwnerInfo.firstName}
                  onChange={(e) => setBookingOwnerInfo({ ...bookingOwnerInfo, firstName: e.target.value })}
                  required
                  data-testid="input-booking-firstname"
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  type="text"
                  value={bookingOwnerInfo.lastName}
                  onChange={(e) => setBookingOwnerInfo({ ...bookingOwnerInfo, lastName: e.target.value })}
                  required
                  data-testid="input-booking-lastname"
                />
              </div>
            </div>

            <div>
              <Label>Phone Number *</Label>
              <Input
                type="tel"
                value={bookingOwnerInfo.phoneNumber}
                onChange={(e) => setBookingOwnerInfo({ ...bookingOwnerInfo, phoneNumber: e.target.value })}
                required
                data-testid="input-booking-phone"
              />
            </div>

            {/* Pet Information */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-lg font-semibold">Pets Information</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBookingPets([...bookingPets, { name: '', type: 'Dog', serviceType: '', notes: '', groomerId: '' }])}
                  data-testid="button-add-pet"
                >
                  Add Another Pet
                </Button>
              </div>

              {bookingPets.map((pet, index) => (
                <div key={index} className="border p-4 rounded-lg space-y-3 relative">
                  {bookingPets.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setBookingPets(bookingPets.filter((_, i) => i !== index))}
                      data-testid={`button-remove-pet-${index}`}
                    >
                      Remove
                    </Button>
                  )}

                  <div className="font-medium text-sm text-gray-700">{trackedItemsSingular} {index + 1}</div>

                  <div>
                    <Label>{trackedItemsSingular} Name *</Label>
                    <Input
                      type="text"
                      value={pet.name}
                      onChange={(e) => {
                        const newPets = [...bookingPets];
                        newPets[index].name = e.target.value;
                        setBookingPets(newPets);
                      }}
                      required
                      data-testid={`input-pet-name-${index}`}
                    />
                  </div>

                  <div>
                    <Label>Pet Type *</Label>
                    <Select
                      value={pet.type}
                      onValueChange={(value) => {
                        const newPets = [...bookingPets];
                        newPets[index].type = value;
                        // Cats can only have Bath Only service
                        if (value === 'Cat') {
                          newPets[index].serviceType = 'grooming-bath';
                        }
                        setBookingPets(newPets);
                      }}
                    >
                      <SelectTrigger data-testid={`select-pet-type-${index}`}>
                        <SelectValue placeholder="Select pet type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dog">Dog</SelectItem>
                        <SelectItem value="Cat">Cat</SelectItem>
                        <SelectItem value="Bird">Bird</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Service Type *</Label>
                    {pet.type === 'Cat' && (
                      <p className="text-xs text-purple-600 mb-1">Cats receive Bath Only service.</p>
                    )}
                    <Select
                      value={pet.serviceType}
                      onValueChange={(value) => {
                        const newPets = [...bookingPets];
                        newPets[index].serviceType = value;
                        setBookingPets(newPets);
                      }}
                    >
                      <SelectTrigger data-testid={`select-service-type-${index}`}>
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {pet.type !== 'Cat' && (
                          <SelectItem value="grooming-full">Full Grooming ${servicePrices?.fullGrooming || '35'} (Prices will vary)</SelectItem>
                        )}
                        <SelectItem value="grooming-bath">Bath Only ${servicePrices?.bathOnly || '20'} (Prices will vary)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Groomer (Optional)</Label>
                    <Select
                      value={pet.groomerId || "none"}
                      onValueChange={(value) => {
                        const newPets = [...bookingPets];
                        newPets[index].groomerId = value === "none" ? "" : value;
                        setBookingPets(newPets);
                      }}
                    >
                      <SelectTrigger data-testid={`select-groomer-${index}`}>
                        <SelectValue placeholder="Select groomer (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Preference</SelectItem>
                        {Array.isArray(availableGroomersForBooking) && availableGroomersForBooking.map((groomer: any) => (
                          <SelectItem key={groomer.id} value={groomer.id.toString()}>
                            {groomer.specialties ? `${groomer.name} (${groomer.specialties})` : groomer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {bookingSelectedDateStr && availableGroomersForBooking.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No groomers available on this date</p>
                    )}
                  </div>

                  <div>
                    <Label>Special Notes</Label>
                    <Textarea
                      value={pet.notes}
                      onChange={(e) => {
                        const newPets = [...bookingPets];
                        newPets[index].notes = e.target.value;
                        setBookingPets(newPets);
                      }}
                      placeholder="Any special instructions..."
                      data-testid={`input-pet-notes-${index}`}
                    />
                  </div>
                </div>
              ))}

              {/* Total Price Display */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Price:</span>
                  <span className="text-xl font-bold">
                    ${bookingPets.reduce((sum, pet) => {
                      const prices: any = { 'grooming-full': 0, 'grooming-bath': 0 };
                      return sum + (prices[pet.serviceType] || 0);
                    }, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <Label>Select Date *</Label>
              <div className="flex flex-col md:flex-row gap-4">
                <Calendar
                  mode="single"
                  selected={bookingSelectedDate}
                  onSelect={(date) => {
                    setBookingSelectedDate(date);
                    setBookingPets(prev => prev.map(pet => ({ ...pet, groomerId: '' })));
                  }}
                  disabled={(date) => !isBookingDateAvailable(date)}
                  className="rounded-md border flex-shrink-0"
                  components={{
                    DayContent: ({ date }) => {
                      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                      const slots = (availableSlots as any)[dateStr];
                      const isAvailable = isBookingDateAvailable(date);
                      const totalSlots = slots ? slots.totalAvailable : 0;
                      
                      return (
                        <div className="flex flex-col items-center">
                          <span>{date.getDate()}</span>
                          {isAvailable && totalSlots > 0 && (
                            <span className="text-[10px] text-green-600 font-medium leading-none">
                              {totalSlots} left
                            </span>
                          )}
                          {isAvailable && totalSlots === 0 && slots && (
                            <span className="text-[10px] text-red-500 font-medium leading-none">
                              Full
                            </span>
                          )}
                        </div>
                      );
                    }
                  }}
                />
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-1">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> The slots shown left open include baths and grooms. It may say 10 left and the slots open are baths not grooms or vice versa.
                  </p>
                </div>
              </div>
            </div>

            {/* Time Selection */}
            <div>
              <Label>Select Time *</Label>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 border rounded">
                {bookingAvailableTimeSlots.map((time) => (
                  <Button
                    key={time}
                    type="button"
                    variant={bookingSelectedTime === time ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBookingSelectedTime(time)}
                    data-testid={`time-slot-${time.replace(/[:\s]/g, '-')}`}
                  >
                    {time}
                  </Button>
                ))}
              </div>
            </div>

            {/* Recurring Appointment Options */}
            <div className="border p-4 rounded-lg space-y-4 bg-gray-50">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="recurring-checkbox"
                  checked={isRecurring}
                  onChange={(e) => {
                    setIsRecurring(e.target.checked);
                    if (!e.target.checked) {
                      setCustomRecurringDates([]);
                    }
                  }}
                  className="h-5 w-5 rounded border-gray-300"
                  data-testid="checkbox-recurring"
                />
                <Label htmlFor="recurring-checkbox" className="text-base font-semibold cursor-pointer">
                  Make this a recurring appointment
                </Label>
              </div>

              {isRecurring && (
                <div className="space-y-4 pl-8">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="recurring-monthly"
                        name="recurringType"
                        checked={recurringType === 'monthly'}
                        onChange={() => {
                          setRecurringType('monthly');
                          setCustomRecurringDates([]);
                        }}
                        className="h-4 w-4"
                        data-testid="radio-recurring-monthly"
                      />
                      <Label htmlFor="recurring-monthly" className="cursor-pointer">
                        Monthly (same day each month)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="recurring-custom"
                        name="recurringType"
                        checked={recurringType === 'custom'}
                        onChange={() => setRecurringType('custom')}
                        className="h-4 w-4"
                        data-testid="radio-recurring-custom"
                      />
                      <Label htmlFor="recurring-custom" className="cursor-pointer">
                        Custom dates
                      </Label>
                    </div>
                  </div>

                  {recurringType === 'monthly' && bookingSelectedDate && (
                    <p className="text-sm text-gray-600">
                      Appointments will be created on the {bookingSelectedDate.getDate()}th of each month for the next 6 months.
                    </p>
                  )}

                  {recurringType === 'custom' && (
                    <div className="space-y-3">
                      <Label>Select additional dates:</Label>
                      <Calendar
                        mode="multiple"
                        selected={customRecurringDates}
                        onSelect={(dates) => setCustomRecurringDates(dates || [])}
                        disabled={(date) => {
                          if (bookingSelectedDate && date.toDateString() === bookingSelectedDate.toDateString()) {
                            return true;
                          }
                          return !isBookingDateAvailable(date);
                        }}
                        className="rounded-md border"
                      />
                      {customRecurringDates.length > 0 && (
                        <div className="text-sm text-gray-600">
                          <strong>Additional dates selected:</strong>
                          <ul className="list-disc pl-5 mt-1">
                            {customRecurringDates.map((date, idx) => (
                              <li key={idx}>{date.toLocaleDateString()}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBookAppointmentOpen(false)}
                data-testid="button-cancel-booking"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAppointmentMutation.isPending}
                data-testid="button-submit-booking"
              >
                {createAppointmentMutation.isPending ? "Creating..." : "Create Appointment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Capacity Error Dialog */}
      <Dialog open={showAdminCapacityDialog} onOpenChange={setShowAdminCapacityDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Fully Booked</DialogTitle>
            <DialogDescription className="text-center text-base pt-4">
              We are fully booked for that day. Please select a different date.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setShowAdminCapacityDialog(false)}
              className="bg-brand-red hover:bg-red-600 text-white px-8"
              data-testid="button-admin-capacity-dialog-close"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bookingErrorMessage} onOpenChange={(open) => { if (!open) setBookingErrorMessage(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-red-600">Booking Error</DialogTitle>
            <DialogDescription className="text-center text-base pt-4">
              {bookingErrorMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setBookingErrorMessage(null)}
              className="bg-brand-red hover:bg-red-600 text-white px-8"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Global Delete Confirmation Dialog */}
      <DeleteConfirmationDialog 
        confirmation={deleteConfirmation}
        onClose={closeDeleteConfirmation}
      />
      </div>
    </div>
  );
}

function EditPetForm({ pet, onSubmit }: { pet: any; onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: pet.name || "",
    species: pet.species || "",
    breed: pet.breed || "",
    age: pet.age || "",
    price: pet.price || "",
    description: pet.description || "",
    imageUrl: pet.imageUrl || "",
    isAvailable: pet.isAvailable || false,
    quantity: pet.quantity ?? "",
  });
  const [imageUrls, setImageUrls] = useState<string[]>(pet.imageUrls || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData, imageUrls, quantity: formData.quantity === "" ? null : Number(formData.quantity) };
    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Species</label>
        <Select value={formData.species} onValueChange={(value) => setFormData({ ...formData, species: value })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Small Animals">Small Animals</SelectItem>
            <SelectItem value="bird">Bird</SelectItem>
            <SelectItem value="fish">Fish</SelectItem>
            <SelectItem value="reptile">Reptile</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Breed</label>
        <input
          type="text"
          value={formData.breed}
          onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Age</label>
        <input
          type="text"
          value={formData.age}
          onChange={(e) => setFormData({ ...formData, age: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Price ($)</label>
        <input
          type="number"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full p-2 border rounded"
          rows={3}
        />
      </div>
      <ImageUpload 
        imageUrl={formData.imageUrl} 
        onImageChange={(url) => setFormData({ ...formData, imageUrl: url })} 
      />
      <MultiImageUpload
        imageUrls={imageUrls}
        onImagesChange={setImageUrls}
      />
      <div>
        <label className="block text-sm font-medium mb-1">Quantity (optional)</label>
        <input
          type="number"
          min="0"
          value={formData.quantity}
          onChange={(e) => setFormData({ ...formData, quantity: e.target.value === "" ? "" : parseInt(e.target.value) })}
          className="w-full p-2 border rounded"
          placeholder="Leave blank if not tracking"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isAvailable}
          onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
        />
        <label className="text-sm">Available</label>
      </div>
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Pet
      </Button>
    </form>
  );
}

function EditSupplyForm({ supply, onSubmit }: { supply: any; onSubmit: (data: any) => void }) {
  const NON_RESTOCKABLE_TEXT = "⚠️ This item will not be restocked once sold out.";
  const { data: categoryDefs = [] } = useQuery<{id: number; key: string; label: string}[]>({
    queryKey: ["/api/admin/categories"],
  });
  
  const [formData, setFormData] = useState({
    name: supply.name || "",
    brand: supply.brand || "",
    category: supply.category || "",
    price: supply.price || "",
    description: supply.description || "",
    imageUrl: supply.imageUrl || "",
    imageUrls: supply.imageUrls || [],
    stockQuantity: supply.stockQuantity || 0,
    nonRestockable: supply.nonRestockable || false,
    sku: supply.sku || "",
    size: supply.size || "",
    color: supply.color || "",
    style: supply.style || "",
    mfgPart: supply.mfgPart || "",
    vendor: supply.vendor || "",
    ingredients: supply.ingredients || "",
    instructions: supply.instructions || "",
    guaranteedAnalysis: supply.guaranteedAnalysis || "",
  });
  
  const handleNonRestockableChange = (checked: boolean) => {
    let newDescription = formData.description || "";
    
    if (checked) {
      if (!newDescription.includes(NON_RESTOCKABLE_TEXT)) {
        newDescription = newDescription.trim() 
          ? `${newDescription.trim()}\n\n${NON_RESTOCKABLE_TEXT}`
          : NON_RESTOCKABLE_TEXT;
      }
    } else {
      newDescription = newDescription.replace(NON_RESTOCKABLE_TEXT, "").trim();
      newDescription = newDescription.replace(/\n\n$/, "");
    }
    
    setFormData({ 
      ...formData, 
      nonRestockable: checked, 
      description: newDescription 
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <textarea
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full p-2 border rounded resize-none"
          rows={2}
          required
          data-testid="input-supply-name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Brand</label>
        <input
          type="text"
          value={formData.brand}
          onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
          className="w-full p-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">SKU</label>
        <input
          type="text"
          value={formData.sku}
          onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
          className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-800"
          placeholder="Product SKU number"
          data-testid="input-supply-sku"
        />
      </div>
      
      {/* ExaTouch POS Fields - Optional */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
        <div className="col-span-2">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-2">ExaTouch POS Fields (Optional)</p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Size</label>
          <input
            type="text"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            className="w-full p-2 border rounded text-sm"
            placeholder="e.g., 4lb, 12lb, Large"
            data-testid="input-supply-size"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Color</label>
          <input
            type="text"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="w-full p-2 border rounded text-sm"
            placeholder="e.g., Red, Blue, Natural"
            data-testid="input-supply-color"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Style</label>
          <input
            type="text"
            value={formData.style}
            onChange={(e) => setFormData({ ...formData, style: e.target.value })}
            className="w-full p-2 border rounded text-sm"
            placeholder="e.g., Grain-Free, Chicken"
            data-testid="input-supply-style"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Mfg Part #</label>
          <input
            type="text"
            value={formData.mfgPart}
            onChange={(e) => setFormData({ ...formData, mfgPart: e.target.value })}
            className="w-full p-2 border rounded text-sm"
            placeholder="Manufacturer part number"
            data-testid="input-supply-mfgpart"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium mb-1">Vendor</label>
          <Select value={formData.vendor || "none"} onValueChange={(value) => setFormData({ ...formData, vendor: value === "none" ? "" : value })}>
            <SelectTrigger className="w-full text-sm" data-testid="select-supply-vendor">
              <SelectValue placeholder="Select vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="Central">Central</SelectItem>
              <SelectItem value="Coastal">Coastal</SelectItem>
              <SelectItem value="Phillips">Phillips</SelectItem>
              <SelectItem value="Penn-Plax">Penn-Plax</SelectItem>
              <SelectItem value="Nelsons">Nelsons</SelectItem>
              <SelectItem value="Science Diet">Science Diet</SelectItem>
              <SelectItem value="Supreme">Supreme</SelectItem>
              <SelectItem value="Prevue">Prevue</SelectItem>
              <SelectItem value="Specialty Pet Products">Specialty Pet Products</SelectItem>
              <SelectItem value="Valhoma">Valhoma</SelectItem>
              <SelectItem value="Pets First">Pets First</SelectItem>
              <SelectItem value="MidWest">MidWest</SelectItem>
              <SelectItem value="Tuesday's Natural Dog Company">Tuesday's Natural Dog Company</SelectItem>
              <SelectItem value="SodaPup">SodaPup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categoryDefs.map(cat => (
              <SelectItem key={cat.key} value={cat.key}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Price ($)</label>
        <input
          type="number"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Stock Quantity</label>
        <input
          type="number"
          value={formData.stockQuantity}
          onChange={(e) => setFormData({ ...formData, stockQuantity: Number(e.target.value) })}
          className="w-full p-2 border rounded"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full p-2 border rounded"
          rows={3}
          data-testid="input-supply-description"
        />
      </div>
      
      <Accordion type="multiple" className="w-full border rounded-lg">
        <AccordionItem value="ingredients" className="border-b-0">
          <AccordionTrigger className="px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:no-underline">
            Ingredient Information
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <textarea
              value={formData.ingredients}
              onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
              className="w-full p-2 border rounded text-sm"
              rows={4}
              placeholder="Enter ingredient list..."
              data-testid="input-supply-ingredients"
            />
          </AccordionContent>
        </AccordionItem>
        
        <AccordionItem value="analysis" className="border-b-0">
          <AccordionTrigger className="px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:no-underline">
            Guaranteed Analysis
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <textarea
              value={formData.guaranteedAnalysis}
              onChange={(e) => setFormData({ ...formData, guaranteedAnalysis: e.target.value })}
              className="w-full p-2 border rounded text-sm"
              rows={4}
              placeholder="Enter guaranteed analysis (use pipe separator for table format, e.g., Crude Protein|12%|Crude Fat|5%)..."
              data-testid="input-supply-analysis"
            />
          </AccordionContent>
        </AccordionItem>
        
        <AccordionItem value="instructions" className="border-b-0">
          <AccordionTrigger className="px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:no-underline">
            Usage Instructions
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full p-2 border rounded text-sm"
              rows={4}
              placeholder="Enter feeding/usage instructions..."
              data-testid="input-supply-instructions"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      
      <div className="flex items-center space-x-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
        <Checkbox
          id="non-restockable"
          checked={formData.nonRestockable}
          onCheckedChange={handleNonRestockableChange}
          data-testid="checkbox-non-restockable"
        />
        <div className="flex-1">
          <label 
            htmlFor="non-restockable" 
            className="text-sm font-medium cursor-pointer text-amber-800 dark:text-amber-300"
          >
            Non-Restockable Item
          </label>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            Mark this item as not being restocked once sold out
          </p>
        </div>
      </div>
      
      <SupplyMultiImageUpload 
        supplyId={supply.id}
        mainImageUrl={formData.imageUrl}
        additionalImageUrls={formData.imageUrls}
        onMainImageChange={(newUrl) => setFormData(prev => ({ ...prev, imageUrl: newUrl }))}
        onAdditionalImagesChange={(urls) => setFormData(prev => ({ ...prev, imageUrls: urls }))}
      />
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Supply
      </Button>
    </form>
  );
}

function SpecialMultiImageUpload({
  mainImageUrl,
  additionalImageUrls,
  onMainImageChange,
  onAdditionalImagesChange,
}: {
  mainImageUrl: string;
  additionalImageUrls: string[];
  onMainImageChange: (url: string) => void;
  onAdditionalImagesChange: (urls: string[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteReady, setPasteReady] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const allImages = [mainImageUrl, ...additionalImageUrls].filter(url => url && url.trim() !== '');

  const handleFileUpload = async (file: File) => {
    setPasteReady(false);
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid File", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Please select an image under 10MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await fetch('/api/admin/specials/upload-image', { method: 'POST', credentials: 'include', body: formData });
      if (!response.ok) { const err = await response.json(); throw new Error(err.message || 'Upload failed'); }
      const data = await response.json();
      if (!mainImageUrl || mainImageUrl.trim() === '') {
        onMainImageChange(data.storedPath);
      } else {
        onAdditionalImagesChange([...additionalImageUrls, data.storedPath]);
      }
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message || "Failed to upload image.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!pasteReady) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) { e.preventDefault(); handleFileUpload(file); break; }
        }
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPasteReady(false); };
    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('paste', handlePaste); document.removeEventListener('keydown', handleKeyDown); };
  }, [pasteReady, mainImageUrl, additionalImageUrls]);

  const addImageUrl = (url: string) => {
    if (!url?.trim()) return;
    const trimmed = url.trim();
    if (!mainImageUrl || mainImageUrl.trim() === '') { onMainImageChange(trimmed); } 
    else { onAdditionalImagesChange([...additionalImageUrls, trimmed]); }
    setUrlInput('');
  };

  const removeImage = (index: number) => {
    if (index === 0) {
      if (additionalImageUrls.length > 0) { onMainImageChange(additionalImageUrls[0]); onAdditionalImagesChange(additionalImageUrls.slice(1)); }
      else { onMainImageChange(''); }
    } else {
      onAdditionalImagesChange(additionalImageUrls.filter((_, i) => i !== index - 1));
    }
  };

  const setAsPrimary = (index: number) => {
    if (index === 0) return;
    const newPrimary = additionalImageUrls[index - 1];
    onMainImageChange(newPrimary);
    onAdditionalImagesChange([mainImageUrl, ...additionalImageUrls.filter((_, i) => i !== index - 1)]);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragEnd = () => { setDraggedIndex(null); setDragOverIndex(null); };
  const handleDropOnImage = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    const sourceIndex = draggedIndex;
    setDraggedIndex(null); setDragOverIndex(null);
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    const reordered = [...allImages];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onMainImageChange(reordered[0] || '');
    onAdditionalImagesChange(reordered.slice(1));
  };

  return (
    <div className="space-y-3">
      <Label>Images ({allImages.length}) — drag to reorder, first image is main</Label>
      {allImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allImages.map((url, index) => (
            <div
              key={`special-img-${index}-${url.slice(-15)}`}
              draggable
              onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, index); }}
              onDragEnd={(e) => { e.stopPropagation(); handleDragEnd(); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index); }}
              onDragLeave={(e) => { e.stopPropagation(); setDragOverIndex(null); }}
              onDrop={(e) => { e.stopPropagation(); handleDropOnImage(e, index); }}
              className={`relative border-2 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                index === 0 ? 'border-blue-500' : 'border-gray-300'
              } ${draggedIndex === index ? 'opacity-50 scale-95' : ''} ${dragOverIndex === index ? 'border-dashed border-orange-500' : ''}`}
            >
              <img src={url} alt={`Special ${index + 1}`} className="w-full h-28 object-cover bg-gray-100 dark:bg-gray-800 pointer-events-none" />
              <div className="absolute top-1 left-1 flex gap-1">
                {index === 0 && <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">Main</span>}
                {url?.startsWith('/public-objects/') && <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">Stored</span>}
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                {index !== 0 && (
                  <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0 bg-white hover:bg-blue-100" onClick={() => setAsPrimary(index)} title="Set as main">
                    <Star className="w-3 h-3" />
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0 bg-white hover:bg-red-100" onClick={() => removeImage(index)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="absolute bottom-1 left-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-xs">{index + 1}</div>
            </div>
          ))}
        </div>
      )}
      <div
        className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer text-center ${
          pasteReady ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300'
        }`}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onClick={() => { if (!pasteReady) setPasteReady(true); }}
      >
        {pasteReady ? (
          <div onClick={(e) => e.stopPropagation()}>
            <ClipboardPaste className="w-8 h-8 text-green-600 mx-auto mb-2 animate-pulse" />
            <p className="text-sm text-green-700 font-medium">Paste (Ctrl+V) or drop an image</p>
            <p className="text-xs text-green-600 mt-1">
              Press Escape to cancel •{' '}
              <span className="underline cursor-pointer" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>Browse files</span>
            </p>
          </div>
        ) : (
          <><Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" /><p className="text-sm text-gray-500">{allImages.length === 0 ? 'Add main image' : 'Add another image'}</p><p className="text-xs text-gray-400 mt-1">Click to activate paste · drag &amp; drop · or browse below</p></>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} className="hidden" />
      {uploading && <div className="flex items-center justify-center gap-2 text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin" />Uploading...</div>}
      {!pasteReady && !uploading && (
        <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />Browse files
        </Button>
      )}
      <div className="flex gap-2">
        <Input placeholder="Paste image URL here..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl(urlInput); } }} />
        <Button type="button" variant="outline" onClick={() => addImageUrl(urlInput)} disabled={!urlInput.trim()}>Add URL</Button>
      </div>
    </div>
  );
}

function SupplyImageUpload({ supplyId, currentImageUrl, onImageUploaded }: { 
  supplyId: number; 
  currentImageUrl: string; 
  onImageUploaded: (url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteActive, setPasteActive] = useState(false);
  const { toast } = useToast();

  // Handle clipboard paste (Ctrl+V / Cmd+V)
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!pasteActive) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleFileUploadInternal(file);
          return;
        }
      }
    }
  }, [pasteActive]);

  // Register paste event listener when component is focused
  useEffect(() => {
    if (pasteActive) {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }
  }, [pasteActive, handlePaste]);

  const handleFileUploadInternal = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file (JPG, PNG, GIF, or WebP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image under 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/admin/supplies/${supplyId}/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const data = await response.json();
      onImageUploaded(data.storedPath);
      // Success toast removed to speed up workflow
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUploadInternal(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const isObjectStorageImage = currentImageUrl?.startsWith('/public-objects/');

  return (
    <div className="space-y-3">
      <Label>Product Image (Object Storage)</Label>
      <div 
        ref={dropZoneRef}
        tabIndex={0}
        className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 
          pasteActive ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFocus={() => setPasteActive(true)}
        onBlur={() => setPasteActive(false)}
        onClick={() => dropZoneRef.current?.focus()}
      >
        {pasteActive && (
          <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm p-2 rounded mb-2 text-center">
            Ready to paste! Press Ctrl+V (or Cmd+V on Mac) to paste an image
          </div>
        )}
        {currentImageUrl ? (
          <div className="space-y-3">
            <div className="relative">
              <img 
                src={currentImageUrl} 
                alt="Current product" 
                className="w-full h-40 object-contain rounded bg-gray-100 dark:bg-gray-800" 
              />
              {isObjectStorageImage && (
                <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  Stored Permanently
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 break-all">{currentImageUrl}</p>
          </div>
        ) : (
          <div className="text-center py-6">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Tap here to paste an image
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Click here first, then Ctrl+V to paste
            </p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUploadInternal(file);
          e.target.value = '';
        }}
        className="hidden"
        data-testid="input-supply-image-upload"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full mt-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        data-testid="button-supply-upload-image"
      >
        {uploading ? (
          <>
            <span className="animate-spin mr-2">⏳</span>
            Uploading to Object Storage...
          </>
        ) : currentImageUrl ? 'Replace Image' : 'Upload Image'}
      </Button>
      <p className="text-xs text-gray-500 mt-1">
        Drag & drop, paste (Ctrl+V), or browse to upload. Images are permanently stored.
      </p>
    </div>
  );
}

// Multi-Image Upload Component for Supplies - supports carousel/swipe on customer view
// supplyId is optional - when null, works in URL-only mode for new products
function SupplyMultiImageUpload({ 
  supplyId, 
  mainImageUrl, 
  additionalImageUrls, 
  onMainImageChange,
  onAdditionalImagesChange 
}: { 
  supplyId?: number | null; 
  mainImageUrl: string;
  additionalImageUrls: string[];
  onMainImageChange: (url: string) => void;
  onAdditionalImagesChange: (urls: string[]) => void;
}) {
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteReady, setPasteReady] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const allImages = [mainImageUrl, ...additionalImageUrls].filter(url => url && url.trim() !== '');

  // Drag and drop reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOverImage = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDropOnImage = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const sourceIndex = draggedIndex;
    
    // Clear drag state immediately
    setDraggedIndex(null);
    setDragOverIndex(null);
    
    if (sourceIndex === null || sourceIndex === targetIndex) {
      return;
    }

    // Get current images as a fresh copy
    const currentMain = mainImageUrl;
    const currentAdditional = [...additionalImageUrls];
    const currentAll = [currentMain, ...currentAdditional].filter(url => url && url.trim() !== '');
    
    // Validate indices
    if (sourceIndex < 0 || sourceIndex >= currentAll.length || targetIndex < 0 || targetIndex >= currentAll.length) {
      return;
    }

    // Reorder: remove from source, insert at target
    const reordered = [...currentAll];
    const [movedImage] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedImage);

    // Update state with reordered images
    onMainImageChange(reordered[0] || '');
    onAdditionalImagesChange(reordered.slice(1));
  };

  useEffect(() => {
    if (!pasteReady) return;
    
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleFileUpload(file);
            break;
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPasteReady(false);
      }
    };

    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pasteReady, mainImageUrl, additionalImageUrls]);

  const handleFileUpload = async (file: File) => {
    setPasteReady(false);
    if (!file) return;
    
    // Cannot upload files without a supplyId
    if (!supplyId) {
      toast({
        title: "Save Product First",
        description: "Please create the product first, then you can upload images in the edit form.",
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file (JPG, PNG, GIF, or WebP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image under 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/admin/supplies/${supplyId}/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const data = await response.json();
      
      // Backend sets first image as main, subsequent images append to imageUrls
      if (data.isMainImage) {
        // This was the first image - it's now the main image
        onMainImageChange(data.storedPath);
      } else {
        // This was an additional image - append to the list
        onAdditionalImagesChange([...additionalImageUrls, data.storedPath]);
      }
      // Success toast removed to speed up workflow
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  // Add image via URL (works without supplyId)
  const addImageUrl = (url: string) => {
    if (!url || !url.trim()) return;
    const trimmedUrl = url.trim();
    
    // Add as main if no images, otherwise add to additional
    if (!mainImageUrl || mainImageUrl.trim() === '') {
      onMainImageChange(trimmedUrl);
    } else {
      onAdditionalImagesChange([...additionalImageUrls, trimmedUrl]);
    }
    setUrlInput('');
  };

  const removeImage = (index: number) => {
    // Get the actual URL being removed for clarity
    const urlToRemove = allImages[index];
    console.log(`Removing image at index ${index}: ${urlToRemove?.substring(0, 50)}...`);
    
    if (index === 0) {
      // Removing main image
      if (additionalImageUrls.length > 0) {
        // Promote first additional to main
        onMainImageChange(additionalImageUrls[0]);
        onAdditionalImagesChange(additionalImageUrls.slice(1));
      } else {
        onMainImageChange('');
      }
    } else {
      // Removing from additional images array
      // index in allImages = index - 1 in additionalImageUrls (since allImages[0] = mainImageUrl)
      const additionalIndex = index - 1;
      const newAdditional = additionalImageUrls.filter((_, i) => i !== additionalIndex);
      console.log(`Removed additional image at additionalIndex ${additionalIndex}, new count: ${newAdditional.length}`);
      onAdditionalImagesChange(newAdditional);
    }
  };

  const setAsPrimary = (index: number) => {
    if (index === 0) return;
    // index in allImages = index - 1 in additionalImageUrls
    const additionalIndex = index - 1;
    const newPrimary = additionalImageUrls[additionalIndex];
    // Keep current main as first additional, then all others except the promoted one
    const newAdditional = [mainImageUrl, ...additionalImageUrls.filter((_, i) => i !== additionalIndex)];
    onMainImageChange(newPrimary);
    onAdditionalImagesChange(newAdditional);
    // Success toast removed to speed up workflow
  };

  return (
    <div className="space-y-3">
      <Label>Product Images ({allImages.length}) - Drag to reorder, customers see in this order</Label>
      
      {allImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allImages.map((url, index) => (
            <div 
              key={`img-${index}-${url.slice(-20)}`}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                handleDragStart(e, index);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                handleDragEnd();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDragOverImage(e, index);
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                setDragOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDropOnImage(e, index);
              }}
              className={`relative border-2 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                index === 0 ? 'border-blue-500' : 'border-gray-300'
              } ${draggedIndex === index ? 'opacity-50 scale-95' : ''} ${
                dragOverIndex === index ? 'border-dashed border-orange-500 bg-orange-50' : ''
              }`}
            >
              <img 
                src={getProductImageUrl(url)} 
                alt={`Product ${index + 1}`} 
                className="w-full h-28 object-contain bg-gray-100 dark:bg-gray-800 pointer-events-none" 
              />
              <div className="absolute top-1 left-1 flex gap-1">
                {index === 0 && (
                  <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
                    Main
                  </span>
                )}
                {url?.startsWith('/public-objects/') && (
                  <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
                    Stored
                  </span>
                )}
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                {index !== 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0 bg-white hover:bg-blue-100"
                    onClick={() => setAsPrimary(index)}
                    title="Set as main image"
                  >
                    <Star className="w-3 h-3" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0 bg-white hover:bg-red-100"
                  onClick={() => removeImage(index)}
                  title="Remove image"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="absolute bottom-1 left-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-xs">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File upload drop zone */}
      <div 
        className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
          pasteReady 
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
            : dragOver 
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
              : 'border-gray-300'
        }`}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) {
            if (supplyId) {
              handleFileUpload(file);
            } else {
              toast({
                title: "Save Product First",
                description: "Create the product first, then upload images via file drop.",
                variant: "destructive",
              });
            }
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onClick={() => { if (!pasteReady) setPasteReady(true); }}
      >
        <div className="text-center py-2">
          {pasteReady ? (
            <div onClick={(e) => e.stopPropagation()}>
              <ClipboardPaste className="w-8 h-8 text-green-600 mx-auto mb-2 animate-pulse" />
              <p className="text-sm text-green-700 font-medium">Paste (Ctrl+V) or drop an image</p>
              <p className="text-xs text-green-600 mt-1">
                Press Escape to cancel •{' '}
                {supplyId && (
                  <span className="underline cursor-pointer" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>Browse files</span>
                )}
              </p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {allImages.length === 0 ? 'Add main product image' : 'Add another image'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Click to activate paste · drag &amp; drop · or browse below</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = '';
          }}
          className="hidden"
          data-testid="input-multi-image-upload"
        />
      </div>
      
      {uploading && (
        <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading to Object Storage...
        </div>
      )}
      
      {supplyId && !pasteReady && !uploading && (
        <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />Browse files
        </Button>
      )}

      {/* URL Input for adding images via URL */}
      <div className="flex gap-2">
        <Input
          placeholder="Paste image URL here..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addImageUrl(urlInput);
            }
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => addImageUrl(urlInput)}
          disabled={!urlInput.trim()}
        >
          Add URL
        </Button>
      </div>
      
      <p className="text-xs text-gray-500">
        {supplyId 
          ? 'Click the area above, then paste (Ctrl+V) or drop an image. Customers can swipe through images like Amazon. First image is the main display.'
          : 'Paste image URLs to add product images. First image is the main display. Customers can swipe through images like Amazon.'
        }
      </p>
    </div>
  );
}

// Image Upload Component with paste URL support
function ImageUpload({ imageUrl, onImageChange }: { imageUrl: string; onImageChange: (url: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteActive, setPasteActive] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const { toast } = useToast();

  // Handle clipboard paste (Ctrl+V / Cmd+V)
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!pasteActive) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleFileUpload(file);
          return;
        }
      }
    }
  }, [pasteActive]);

  // Register paste event listener when component is focused
  useEffect(() => {
    if (pasteActive) {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }
  }, [pasteActive, handlePaste]);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File Too Large",
        description: "Please select an image under 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Upload failed');
      }

      const data = await response.json();
      onImageChange(data.imageUrl);
      // Success toast removed to speed up workflow
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onImageChange(urlInput.trim());
      setUrlInput('');
      // Success toast removed to speed up workflow
    }
  };

  return (
    <div className="space-y-3">
      <Label>Image</Label>
      
      {/* URL Input for pasting image URLs */}
      <div className="flex gap-2">
        <Input
          placeholder="Paste image URL here..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleUrlSubmit())}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleUrlSubmit}
          disabled={!urlInput.trim()}
        >
          Use URL
        </Button>
      </div>
      
      <div 
        ref={dropZoneRef}
        tabIndex={0}
        className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 
          pasteActive ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFocus={() => setPasteActive(true)}
        onBlur={() => setPasteActive(false)}
        onClick={() => dropZoneRef.current?.focus()}
      >
        {pasteActive && (
          <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm p-2 rounded mb-2 text-center">
            Ready to paste! Press Ctrl+V (or Cmd+V on Mac) to paste an image
          </div>
        )}
        {imageUrl ? (
          <div className="relative">
            <img src={imageUrl} alt="Preview" className="w-full sm:h-40 h-24 object-cover rounded" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={(e) => { e.stopPropagation(); onImageChange(''); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center sm:py-8 py-4">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Tap above to paste, or use button below to browse</p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full mt-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading...' : imageUrl ? 'Change Image' : 'Upload Image'}
      </Button>
    </div>
  );
}

// Multi-Image Upload Component
function MultiImageUpload({ imageUrls, onImagesChange, label = "Additional Photos" }: { imageUrls: string[]; onImagesChange: (urls: string[]) => void; label?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const { toast } = useToast();

  const uploadSingleFile = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('image', file);
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
      body: fd,
    });
    if (!response.ok) throw new Error('Upload failed');
    const data = await response.json();
    return data.imageUrl;
  };

  const handleFilesSelected = async (files: FileList) => {
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast({ title: "Skipped", description: `${file.name} is not an image.`, variant: "destructive" });
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Skipped", description: `${file.name} exceeds 5MB.`, variant: "destructive" });
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: validFiles.length });
    const newUrls: string[] = [];
    for (const file of validFiles) {
      try {
        const url = await uploadSingleFile(file);
        if (url) newUrls.push(url);
        setUploadProgress(p => ({ ...p, done: p.done + 1 }));
      } catch {
        toast({ title: "Upload Failed", description: `Failed to upload ${file.name}.`, variant: "destructive" });
        setUploadProgress(p => ({ ...p, done: p.done + 1 }));
      }
    }
    onImagesChange([...imageUrls, ...newUrls]);
    setUploading(false);
  };

  const removeImage = (index: number) => {
    onImagesChange(imageUrls.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <Label>{label} ({imageUrls.length})</Label>

      {imageUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {imageUrls.map((url, index) => (
            <div key={index} className="relative border rounded-lg overflow-hidden">
              <img src={getProductImageUrl(url)} alt={`Photo ${index + 1}`} className="w-full h-24 object-cover" />
              <button
                type="button"
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                onClick={() => removeImage(index)}
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-1 left-1 bg-black/50 text-white px-1 rounded text-xs">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="w-4 h-4 mr-2" />
        {uploading
          ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
          : 'Select Photos from Gallery'}
      </Button>
    </div>
  );
}

function AddPetForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    species: '',
    breed: '',
    age: '',
    price: '',
    description: '',
    imageUrl: '',
    isAvailable: true,
    quantity: '' as string | number,
  });
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData, imageUrls, quantity: formData.quantity === "" ? null : Number(formData.quantity) };
    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Pet Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div>
        <Label htmlFor="species">Species</Label>
        <Select value={formData.species} onValueChange={(value) => setFormData({ ...formData, species: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Small Animals">Small Animals</SelectItem>
            <SelectItem value="bird">Bird</SelectItem>
            <SelectItem value="fish">Fish</SelectItem>
            <SelectItem value="reptile">Reptile</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="breed">Breed</Label>
          <Input
            id="breed"
            value={formData.breed}
            onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="price">Price</Label>
        <Input
          id="price"
          type="number"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          required
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <ImageUpload 
        imageUrl={formData.imageUrl} 
        onImageChange={(url) => setFormData({ ...formData, imageUrl: url })} 
      />
      <MultiImageUpload
        imageUrls={imageUrls}
        onImagesChange={setImageUrls}
        label="Additional Photos"
      />
      <div>
        <Label htmlFor="quantity">Quantity (optional)</Label>
        <Input
          id="quantity"
          type="number"
          min="0"
          value={formData.quantity}
          onChange={(e) => setFormData({ ...formData, quantity: e.target.value === "" ? "" : parseInt(e.target.value) })}
          placeholder="Leave blank if not tracking"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Switch
          id="isAvailable"
          checked={formData.isAvailable}
          onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
        />
        <Label htmlFor="isAvailable">Available</Label>
      </div>
      <Button type="submit" className="w-full">Add Pet</Button>
    </form>
  );
}

function AddSupplyForm({ onSubmit, initialUpc }: { onSubmit: (data: any) => void; initialUpc?: string }) {
  const { data: categoryDefs = [] } = useQuery<{id: number; key: string; label: string}[]>({
    queryKey: ["/api/admin/categories"],
  });
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    brand: '',
    price: '',
    description: '',
    imageUrl: '',
    stockQuantity: '',
    weight: '',
    size: '',
    color: '',
    style: '',
    mfgPart: '',
    vendor: '',
    sku: initialUpc || '',
    isActive: true,
    ingredients: '',
    guaranteedAnalysis: '',
    instructions: '',
    instructionLabel: '',
    nonRestockable: false,
  });
  
  // Additional images for carousel
  const [additionalImageUrls, setAdditionalImageUrls] = useState<string[]>([]);
  
  // Collapsible sections state
  const [showIngredients, setShowIngredients] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      stockQuantity: parseInt(formData.stockQuantity) || 0,
      imageUrls: additionalImageUrls,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Product Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="category">Category</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categoryDefs.map(cat => (
                <SelectItem key={cat.key} value={cat.key}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="stockQuantity">Stock Quantity</Label>
          <Input
            id="stockQuantity"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={formData.stockQuantity}
            onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value.replace(/\D/g, '') })}
            placeholder="0"
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="sku">SKU/UPC</Label>
        <Input
          id="sku"
          value={formData.sku}
          onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
          placeholder="Product SKU or UPC code"
          data-testid="input-add-supply-sku"
        />
      </div>
      
      {/* ExaTouch POS Fields - Optional */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
        <div className="col-span-2">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-2">ExaTouch POS Fields (Optional)</p>
        </div>
        <div>
          <Label htmlFor="size" className="text-xs">Size</Label>
          <Input
            id="size"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
            placeholder="e.g., 4lb, 12lb, Large"
            className="text-sm"
            data-testid="input-add-supply-size"
          />
        </div>
        <div>
          <Label htmlFor="color" className="text-xs">Color</Label>
          <Input
            id="color"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            placeholder="e.g., Red, Blue, Natural"
            className="text-sm"
            data-testid="input-add-supply-color"
          />
        </div>
        <div>
          <Label htmlFor="style" className="text-xs">Style</Label>
          <Input
            id="style"
            value={formData.style}
            onChange={(e) => setFormData({ ...formData, style: e.target.value })}
            placeholder="e.g., Grain-Free, Chicken"
            className="text-sm"
            data-testid="input-add-supply-style"
          />
        </div>
        <div>
          <Label htmlFor="mfgPart" className="text-xs">Mfg Part #</Label>
          <Input
            id="mfgPart"
            value={formData.mfgPart}
            onChange={(e) => setFormData({ ...formData, mfgPart: e.target.value })}
            placeholder="Manufacturer part number"
            className="text-sm"
            data-testid="input-add-supply-mfgpart"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="vendor" className="text-xs">Vendor</Label>
          <Select value={formData.vendor || "none"} onValueChange={(value) => setFormData({ ...formData, vendor: value === "none" ? "" : value })}>
            <SelectTrigger className="w-full text-sm" data-testid="select-add-supply-vendor">
              <SelectValue placeholder="Select vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="Central">Central</SelectItem>
              <SelectItem value="Coastal">Coastal</SelectItem>
              <SelectItem value="Phillips">Phillips</SelectItem>
              <SelectItem value="Penn-Plax">Penn-Plax</SelectItem>
              <SelectItem value="Nelsons">Nelsons</SelectItem>
              <SelectItem value="Science Diet">Science Diet</SelectItem>
              <SelectItem value="Supreme">Supreme</SelectItem>
              <SelectItem value="Prevue">Prevue</SelectItem>
              <SelectItem value="Specialty Pet Products">Specialty Pet Products</SelectItem>
              <SelectItem value="Valhoma">Valhoma</SelectItem>
              <SelectItem value="Pets First">Pets First</SelectItem>
              <SelectItem value="MidWest">MidWest</SelectItem>
              <SelectItem value="Tuesday's Natural Dog Company">Tuesday's Natural Dog Company</SelectItem>
              <SelectItem value="SodaPup">SodaPup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      
      {/* Collapsible Sections - Match Edit Form */}
      <div className="space-y-2">
        {/* Ingredient Information */}
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30"
            onClick={() => setShowIngredients(!showIngredients)}
          >
            <span className="font-medium">Ingredient Information</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showIngredients ? 'rotate-180' : ''}`} />
          </button>
          {showIngredients && (
            <div className="p-3 border-t">
              <Textarea
                placeholder="Enter full ingredient list from manufacturer..."
                value={formData.ingredients}
                onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                rows={4}
              />
            </div>
          )}
        </div>
        
        {/* Guaranteed Analysis */}
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30"
            onClick={() => setShowAnalysis(!showAnalysis)}
          >
            <span className="font-medium">Guaranteed Analysis</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showAnalysis ? 'rotate-180' : ''}`} />
          </button>
          {showAnalysis && (
            <div className="p-3 border-t">
              <Textarea
                placeholder="Crude Protein (min): 10%&#10;Crude Fat (min): 5%&#10;Crude Fiber (max): 2%&#10;Moisture (max): 78%"
                value={formData.guaranteedAnalysis}
                onChange={(e) => setFormData({ ...formData, guaranteedAnalysis: e.target.value })}
                rows={4}
              />
            </div>
          )}
        </div>
        
        {/* Usage Instructions */}
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30"
            onClick={() => setShowInstructions(!showInstructions)}
          >
            <span className="font-medium">Usage Instructions</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
          {showInstructions && (
            <div className="p-3 border-t space-y-3">
              <div>
                <Label className="text-xs">Label (e.g., "Feeding Guidelines")</Label>
                <Input
                  placeholder="Feeding Guidelines"
                  value={formData.instructionLabel}
                  onChange={(e) => setFormData({ ...formData, instructionLabel: e.target.value })}
                />
              </div>
              <Textarea
                placeholder="Enter feeding/usage instructions..."
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                rows={4}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Non-Restockable Checkbox */}
      <div className="p-3 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-orange-50 dark:bg-orange-900/20">
        <div className="flex items-start gap-3">
          <Checkbox
            id="nonRestockable"
            checked={formData.nonRestockable}
            onCheckedChange={(checked) => setFormData({ ...formData, nonRestockable: checked as boolean })}
          />
          <div>
            <Label htmlFor="nonRestockable" className="text-orange-700 dark:text-orange-400 font-medium cursor-pointer">
              Non-Restockable Item
            </Label>
            <p className="text-xs text-orange-600 dark:text-orange-500">
              Mark this item as not being restocked once sold out
            </p>
          </div>
        </div>
      </div>
      
      <SupplyMultiImageUpload
        supplyId={null}
        mainImageUrl={formData.imageUrl}
        additionalImageUrls={additionalImageUrls}
        onMainImageChange={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
        onAdditionalImagesChange={setAdditionalImageUrls}
      />
      <Button type="submit" className="w-full">Add Supply</Button>
    </form>
  );
}

// GroomerForm moved to GroomersSection.tsx

// Close the wrapper div at the end of the main return
// Adding this closing tag before the component ends