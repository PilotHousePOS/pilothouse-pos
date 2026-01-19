import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus,
  Edit,
  Trash2,
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
  Type,
  Image,
  Camera,
  BookOpen,
  Zap,
  CalendarX2,
  ClipboardPaste,
  Send
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import AdminNotifications from "@/components/admin-notifications";
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
}

function DeleteConfirmationDialog({ 
  confirmation, 
  onClose 
}: { 
  confirmation: DeleteConfirmation; 
  onClose: () => void;
}) {
  return (
    <AlertDialog open={confirmation.isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md" data-testid="delete-confirmation-dialog">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
              {confirmation.title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base pt-2">
            {confirmation.description}
          </AlertDialogDescription>
          {confirmation.itemName && (
            <div className="mt-3 p-3 bg-muted rounded-lg border-2 border-red-200 dark:border-red-800">
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
            className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white"
            data-testid="delete-confirm-button"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Yes, Delete Permanently
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
            <h3 className="text-lg font-semibold whitespace-nowrap">{formatDate(selectedDate)}</h3>
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
                            
                            {/* Right side - Contact Notes and Badge */}
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <Badge variant="default" className="bg-green-600">
                                Grooming
                              </Badge>
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
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{formatService(apt.serviceType || apt.service)}</p>
                <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
                <p className="text-gray-500">{parseLocalDate(apt.appointmentDate).toLocaleDateString()}</p>
              </div>
              {apt.price && (
                <p className="text-green-700 font-semibold">${apt.price}</p>
              )}
            </div>
            {apt.specialNotes && (
              <p className="text-gray-600 mt-1 italic">{apt.specialNotes}</p>
            )}
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
function ContactFullHistoryDialog({ contactId, contactName, isOpen, onClose }: { 
  contactId: number; 
  contactName: string;
  isOpen: boolean; 
  onClose: () => void;
}) {
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

  const { toast } = useToast();

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
                          <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
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
                        <Badge variant="outline" className="text-xs bg-gray-200">{apt.status}</Badge>
                      </div>
                      {apt.notes && (
                        <p className="text-gray-600 mt-2 italic text-xs">{apt.notes}</p>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
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

  // Dog breeds list for the breed selector
  const dogBreeds = [
    'Golden Retriever', 'Labrador Retriever', 'German Shepherd', 'French Bulldog',
    'Bulldog', 'Poodle', 'Beagle', 'Rottweiler', 'Yorkshire Terrier', 'Boxer',
    'Dachshund', 'Siberian Husky', 'Great Dane', 'Doberman Pinscher', 'Shih Tzu',
    'Boston Terrier', 'Pomeranian', 'Havanese', 'Cavalier King Charles Spaniel',
    'Shetland Sheepdog', 'Miniature Schnauzer', 'Pembroke Welsh Corgi', 'Chihuahua',
    'Australian Shepherd', 'Mastiff', 'Cocker Spaniel', 'Border Collie', 'Pug',
    'Other/Mixed Breed'
  ].sort();
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
      await apiRequest("POST", "/api/contacts", contactData);
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add contact.",
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

  const handleDeleteContact = (id: number) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      deleteContactMutation.mutate(id);
    }
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
                      placeholder="(555) 123-4567"
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
                      <Select
                        value={contactFormData.breed}
                        onValueChange={(value) => setContactFormData({ ...contactFormData, breed: value })}
                      >
                        <SelectTrigger id="contact-breed" data-testid="select-dog-breed">
                          <SelectValue placeholder="Select dog breed" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {dogBreeds.map((breed) => (
                            <SelectItem key={breed} value={breed}>
                              {breed}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      placeholder="(555) 123-4567"
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
                      <Select
                        value={contactFormData.breed}
                        onValueChange={(value) => setContactFormData({ ...contactFormData, breed: value })}
                      >
                        <SelectTrigger id="edit-contact-breed" data-testid="select-edit-dog-breed">
                          <SelectValue placeholder="Select dog breed" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {dogBreeds.map((breed) => (
                            <SelectItem key={breed} value={breed}>
                              {breed}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  className={`border rounded-lg p-4 transition-all cursor-pointer hover:bg-gray-50 min-w-0 overflow-hidden ${isExpanded ? 'ring-2 ring-blue-400' : ''}`}
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
                      <p className="font-semibold text-base break-words truncate">
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
                    </div>
                    
                    {/* Right side - Permanent Notes */}
                    {contact.notes && (
                      <div className="flex-shrink-0 w-32 sm:w-40 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">Notes</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 break-words line-clamp-4">
                          {contact.notes}
                        </p>
                      </div>
                    )}
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
                      <div className="flex gap-2 pt-2 mt-1 border-t border-gray-200">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditContact(contact);
                          }}
                          data-testid={`button-edit-contact-${index}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          <span className="text-sm">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryDialogContact({ id: contact.id, name: contact.displayName || contact.name });
                          }}
                          data-testid={`button-view-history-${index}`}
                        >
                          <History className="w-4 h-4 mr-1" />
                          <span className="text-sm">History</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteContact(contact.id);
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
          />
        )}
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

// Batch search result type
interface BatchSearchResult {
  productId: number;
  productName: string;
  brand: string | null;
  success: boolean;
  searchQuery: string;
  imageUrl: string | null;
  approved: boolean;
  error: string | null;
}

// Order Photo Upload Manager Component
function OrderPhotoUploadManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [priceMultiplier, setPriceMultiplier] = useState<string | number>("1.5");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [editingItems, setEditingItems] = useState<Map<number, { itemName: string; quantity: number; unitPrice: number; markedUpPrice: number }>>(new Map());
  const [editingPhotoName, setEditingPhotoName] = useState<number | null>(null);
  const [photoNameInput, setPhotoNameInput] = useState<string>('');

  // Fetch uploaded order photos
  const { data: orderPhotos, isLoading: photosLoading, refetch: refetchPhotos } = useQuery({
    queryKey: ['/api/admin/order-photos'],
  });

  // Fetch extracted items for selected photo
  const { data: extractedItems, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: [`/api/admin/order-photos/${selectedPhotoId}`],
    enabled: selectedPhotoId !== null,
  });

  // Upload and process photo mutation
  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ file, multiplier }: { file: File; multiplier: number }) => {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('priceMultiplier', multiplier.toString());

      const response = await fetch('/api/admin/order-photos', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload photo');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/order-photos'] });
      setSelectedFile(null);
      setPreviewUrl(null);
      toast({
        title: "Success",
        description: "Order photo processed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update extracted item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { itemName: string; quantity: number; unitPrice: number; markedUpPrice: number } }) => {
      await apiRequest('PUT', `/api/admin/extracted-items/${id}`, {
        itemName: data.itemName,
        quantity: data.quantity,
        unitPrice: data.unitPrice.toString(),
        markedUpPrice: data.markedUpPrice.toString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/order-photos/${selectedPhotoId}`] });
      toast({
        title: "Success",
        description: "Item updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add items to inventory mutation
  const addToInventoryMutation = useMutation({
    mutationFn: async (itemIds: number[]) => {
      await apiRequest('POST', '/api/admin/extracted-items/add-to-inventory', { itemIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/order-photos/${selectedPhotoId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      toast({
        title: "Success",
        description: "Items added to inventory successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/admin/order-photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/order-photos'] });
      if (selectedPhotoId) {
        setSelectedPhotoId(null);
      }
      toast({
        title: "Success",
        description: "Photo deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete extracted item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/admin/extracted-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/order-photos/${selectedPhotoId}`] });
      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update photo name mutation
  const updatePhotoNameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await apiRequest('PUT', `/api/admin/order-photos/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/order-photos'] });
      setEditingPhotoName(null);
      setPhotoNameInput('');
      toast({
        title: "Success",
        description: "Order name updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    try {
      const multiplier = typeof priceMultiplier === 'string' ? parseFloat(priceMultiplier) || 1.5 : priceMultiplier;
      await uploadPhotoMutation.mutateAsync({ file: selectedFile, multiplier });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateItem = (id: number) => {
    const editedData = editingItems.get(id);
    if (editedData) {
      updateItemMutation.mutate({ id, data: editedData });
      const newMap = new Map(editingItems);
      newMap.delete(id);
      setEditingItems(newMap);
    }
  };

  const handleAddToInventory = () => {
    const items = extractedItems?.extractedItems || [];
    const notAddedItems = items.filter((item: any) => !item.addedToInventory);
    if (notAddedItems.length === 0) {
      toast({
        title: "Info",
        description: "All items are already in inventory",
      });
      return;
    }
    const itemIds = notAddedItems.map((item: any) => item.id);
    addToInventoryMutation.mutate(itemIds);
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            AI Order Photo Upload
          </CardTitle>
          <CardDescription>
            Upload supplier order photos and extract items with AI vision (GPT-5)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">How It Works</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                  <li>Upload photo of supplier order with item names, quantities, and prices</li>
                  <li>AI extracts all items automatically using GPT-5 vision</li>
                  <li>Review and edit extracted items before adding to inventory</li>
                  <li>Price multiplier applies markup (e.g., 1.5 = 50% markup on wholesale)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Price Multiplier (Markup)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={priceMultiplier}
                  onChange={(e) => setPriceMultiplier(e.target.value)}
                  className="w-32 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
                  data-testid="input-price-multiplier"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {(() => {
                    const multiplier = typeof priceMultiplier === 'string' ? parseFloat(priceMultiplier) : priceMultiplier;
                    return isNaN(multiplier) ? '0' : ((multiplier - 1) * 100).toFixed(0);
                  })()}% markup
                </span>
              </div>
            </div>

            <div>
              <input
                type="file"
                accept="image/*,application/pdf"
                id="order-photo-file"
                className="hidden"
                onChange={handleFileChange}
              />
              <label
                htmlFor="order-photo-file"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                data-testid="button-select-photo"
              >
                <Image className="w-4 h-4" />
                Select Photo or PDF
              </label>
            </div>

            {previewUrl && (
              <div className="space-y-3">
                {selectedFile?.type === 'application/pdf' ? (
                  <div className="p-6 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center">
                    <FileText className="w-16 h-16 mx-auto mb-3 text-gray-400" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      PDF selected - Ready to process
                    </p>
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt="Order preview"
                    className="max-w-full h-auto max-h-96 rounded-lg border dark:border-gray-700"
                    data-testid="img-order-preview"
                  />
                )}
                <Button
                  onClick={handleUpload}
                  disabled={isProcessing || !selectedFile}
                  className="w-full"
                  data-testid="button-upload-process"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing with AI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Upload & Process with AI
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Photos List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Uploaded Order Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photosLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !orderPhotos?.length ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
              No order photos uploaded yet
            </p>
          ) : (
            <div className="space-y-3">
              {orderPhotos.map((photo: any) => (
                <div
                  key={photo.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedPhotoId === photo.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedPhotoId(photo.id)}
                  data-testid={`card-photo-${photo.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {editingPhotoName === photo.id ? (
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={photoNameInput}
                            onChange={(e) => setPhotoNameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updatePhotoNameMutation.mutate({ id: photo.id, name: photoNameInput });
                              } else if (e.key === 'Escape') {
                                setEditingPhotoName(null);
                                setPhotoNameInput('');
                              }
                            }}
                            className="flex-1 px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
                            placeholder="Enter order name..."
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`input-photo-name-${photo.id}`}
                          />
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              updatePhotoNameMutation.mutate({ id: photo.id, name: photoNameInput });
                            }}
                            disabled={updatePhotoNameMutation.isPending}
                            data-testid={`button-save-photo-name-${photo.id}`}
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPhotoName(null);
                              setPhotoNameInput('');
                            }}
                            data-testid={`button-cancel-photo-name-${photo.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {photo.name || `Order ${new Date(photo.createdAt).toLocaleDateString()}`}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPhotoName(photo.id);
                              setPhotoNameInput(photo.name || `Order ${new Date(photo.createdAt).toLocaleDateString()}`);
                            }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            data-testid={`button-edit-photo-name-${photo.id}`}
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {new Date(photo.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Multiplier: {photo.priceMultiplier}x • Items: {photo.itemCount || 0}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={photo.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-view-photo-${photo.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this photo and all extracted items?')) {
                            deletePhotoMutation.mutate(photo.id);
                          }
                        }}
                        data-testid={`button-delete-photo-${photo.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted Items */}
      {selectedPhotoId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Extracted Items
              </span>
              {extractedItems?.extractedItems?.some((item: any) => !item.addedToInventory) && (
                <Button
                  onClick={handleAddToInventory}
                  disabled={addToInventoryMutation.isPending}
                  data-testid="button-add-all-to-inventory"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Add All to Inventory
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : !extractedItems?.extractedItems?.length ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No items extracted from this photo
              </p>
            ) : (
              <div className="space-y-3">
                {extractedItems.extractedItems.map((item: any) => {
                  const isEditing = editingItems.has(item.id);
                  const editData = editingItems.get(item.id) || {
                    itemName: item.itemName,
                    quantity: item.quantity,
                    unitPrice: parseFloat(item.unitPrice || 0),
                    markedUpPrice: parseFloat(item.markedUpPrice || 0),
                  };

                  return (
                    <div
                      key={item.id}
                      className={`p-4 border rounded-lg ${
                        item.addedToInventory
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                      data-testid={`item-${item.id}`}
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium">Item Name</label>
                            <input
                              type="text"
                              value={editData.itemName}
                              onChange={(e) => {
                                const newMap = new Map(editingItems);
                                newMap.set(item.id, { ...editData, itemName: e.target.value });
                                setEditingItems(newMap);
                              }}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 mt-1"
                              data-testid={`input-edit-name-${item.id}`}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-sm font-medium">Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={editData.quantity}
                                onChange={(e) => {
                                  const newMap = new Map(editingItems);
                                  newMap.set(item.id, { ...editData, quantity: parseInt(e.target.value) || 1 });
                                  setEditingItems(newMap);
                                }}
                                className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 mt-1"
                                data-testid={`input-edit-quantity-${item.id}`}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Unit Cost ($)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editData.unitPrice}
                                onChange={(e) => {
                                  const newMap = new Map(editingItems);
                                  newMap.set(item.id, { ...editData, unitPrice: parseFloat(e.target.value) || 0 });
                                  setEditingItems(newMap);
                                }}
                                className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 mt-1"
                                data-testid={`input-edit-price-${item.id}`}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Final Retail ($)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editData.markedUpPrice}
                                onChange={(e) => {
                                  const newMap = new Map(editingItems);
                                  newMap.set(item.id, { ...editData, markedUpPrice: parseFloat(e.target.value) || 0 });
                                  setEditingItems(newMap);
                                }}
                                className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 mt-1"
                                data-testid={`input-edit-retail-price-${item.id}`}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleUpdateItem(item.id)}
                              disabled={updateItemMutation.isPending}
                              data-testid={`button-save-${item.id}`}
                            >
                              <Save className="w-4 h-4 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const newMap = new Map(editingItems);
                                newMap.delete(item.id);
                                setEditingItems(newMap);
                              }}
                              data-testid={`button-cancel-${item.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-medium mb-1">{item.itemName}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Quantity: {item.quantity} • Unit Cost: ${parseFloat(item.unitPrice || 0).toFixed(2)} → Retail: ${parseFloat(item.markedUpPrice || 0).toFixed(2)}
                              {item.addedToInventory && (
                                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                                  ✓ Added to Inventory
                                </span>
                              )}
                            </div>
                          </div>
                          {!item.addedToInventory && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const newMap = new Map(editingItems);
                                  newMap.set(item.id, {
                                    itemName: item.itemName,
                                    quantity: item.quantity,
                                    unitPrice: parseFloat(item.unitPrice || 0),
                                    markedUpPrice: parseFloat(item.markedUpPrice || 0),
                                  });
                                  setEditingItems(newMap);
                                }}
                                data-testid={`button-edit-${item.id}`}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm(`Delete "${item.itemName}"?`)) {
                                    deleteItemMutation.mutate(item.id);
                                  }
                                }}
                                disabled={deleteItemMutation.isPending}
                                data-testid={`button-delete-item-${item.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Product Image Upload Zone - Supports drag & drop, paste, and file browse
function ProductImageUploadZone({ productId, onImageUploaded }: { 
  productId: number; 
  onImageUploaded: (storedPath: string) => void;
}) {
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteActive, setPasteActive] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (file: File) => {
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

      const response = await fetch(`/api/admin/supplies/${productId}/upload-image`, {
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
  }, [productId, onImageUploaded, toast]);

  // Handle clipboard paste (Ctrl+V / Cmd+V)
  const handlePaste = useCallback((e: ClipboardEvent) => {
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
    
    toast({
      title: "No Image Found",
      description: "No image was found in your clipboard. Try copying an image first.",
      variant: "destructive",
    });
  }, [pasteActive, handleFileUpload, toast]);

  // Register paste event listener when component is focused
  useEffect(() => {
    if (pasteActive) {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }
  }, [pasteActive, handlePaste]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">Upload Image Directly</Label>
      <div 
        ref={dropZoneRef}
        tabIndex={0}
        className={`border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer text-center ${
          uploading ? 'opacity-50 pointer-events-none' :
          dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 
          pasteActive ? 'border-green-500 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-300' : 
          'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onFocus={() => setPasteActive(true)}
        onBlur={() => setPasteActive(false)}
        onClick={() => dropZoneRef.current?.focus()}
        data-testid="image-upload-zone"
      >
        {uploading ? (
          <div className="py-4">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
            <p className="text-sm text-gray-600">Uploading to Object Storage...</p>
          </div>
        ) : pasteActive ? (
          <div className="py-4">
            <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm p-3 rounded mb-3">
              Ready! Press <strong>Ctrl+V</strong> (or Cmd+V on Mac) to paste an image
            </div>
            <p className="text-xs text-gray-500">Or drag & drop, or click below to browse</p>
          </div>
        ) : (
          <div className="py-4">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Click here to enable paste, or drag & drop
            </p>
            <p className="text-xs text-gray-500">
              Supports: Copy image from Central/dealer site → Click here → Ctrl+V
            </p>
          </div>
        )}
        
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
          data-testid="input-image-file"
        />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={uploading}
          data-testid="button-browse-image"
        >
          Browse Files
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Images are permanently stored and won't disappear.
      </p>
    </div>
  );
}

// Product Image Manager Component
function ProductImageManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(true); // Toggle for missing vs all
  
  // Batch search state
  const [isBatchSearching, setIsBatchSearching] = useState(false);
  const [batchSearchProgress, setBatchSearchProgress] = useState(0);
  const [batchSearchTotal, setBatchSearchTotal] = useState(0);
  const [batchSearchResults, setBatchSearchResults] = useState<BatchSearchResult[]>([]);
  const [maxProducts, setMaxProducts] = useState(20);
  const [showBatchResults, setShowBatchResults] = useState(false);
  
  // Image URL Sync state (for syncing between dev and production)
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Fetch image stats
  const { data: imageStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/supplies/image-stats'],
  });

  // Fetch products (with option to show all or just missing images)
  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['/api/admin/supplies/by-filter', selectedBrand, selectedCategory, searchQuery, showMissingOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (selectedBrand) params.append('brand', selectedBrand);
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('missingOnly', showMissingOnly ? 'true' : 'false');
      
      const response = await fetch(`/api/admin/supplies/by-filter?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    enabled: showProducts,
  });

  // Update product image mutation
  const updateImageMutation = useMutation({
    mutationFn: async ({ productId, imageUrl }: { productId: number; imageUrl: string }) => {
      await apiRequest('PUT', `/api/admin/supplies/${productId}/image`, { imageUrl });
    },
    onSuccess: () => {
      // Invalidate queries to refresh statistics
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/without-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      
      toast({
        title: 'Success',
        description: 'Product image updated successfully',
      });
      setSelectedProduct(null);
      setImageUrl('');
      refetchProducts();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update product image',
        variant: 'destructive',
      });
    },
  });

  // Batch update images mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async (updates: { productId: number; imageUrl: string }[]) => {
      for (const update of updates) {
        await apiRequest('PUT', `/api/admin/supplies/${update.productId}/image`, { 
          imageUrl: update.imageUrl 
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/without-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      
      toast({
        title: 'Success',
        description: 'Batch images updated successfully',
      });
      setBatchSearchResults([]);
      setShowBatchResults(false);
      refetchProducts();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update batch images',
        variant: 'destructive',
      });
    },
  });

  // Download and store image permanently in object storage
  const downloadImageMutation = useMutation({
    mutationFn: async ({ productId, externalUrl }: { productId: number; externalUrl: string }) => {
      const response = await apiRequest('POST', `/api/admin/supplies/${productId}/download-image`, { externalUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/without-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      
      toast({
        title: 'Success',
        description: 'Image downloaded and stored permanently',
      });
      setSelectedProduct(null);
      setImageUrl('');
      refetchProducts();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download and store image',
        variant: 'destructive',
      });
    },
  });

  // Start batch search for images
  const handleStartBatchSearch = async () => {
    if (!products || products.length === 0) {
      toast({
        title: 'No products',
        description: 'No products available to search',
        variant: 'destructive',
      });
      return;
    }

    const productIds = products.slice(0, maxProducts).map((p: any) => p.id);
    
    setIsBatchSearching(true);
    setBatchSearchProgress(0);
    setBatchSearchTotal(productIds.length);
    setBatchSearchResults([]);

    try {
      const response = await fetch('/api/admin/supplies/batch-image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productIds, maxProducts }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || 'Batch search failed');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.results)) {
        // Filter out any malformed results and ensure proper typing
        const validResults = data.results.filter((r: any) => 
          r && typeof r.productId === 'number' && r.productName
        );
        
        setBatchSearchResults(validResults as BatchSearchResult[]);
        setShowBatchResults(true);
        
        const successCount = validResults.filter((r: BatchSearchResult) => r.success).length;
        const errorCount = validResults.filter((r: BatchSearchResult) => !r.success).length;
        
        toast({
          title: 'Search Complete',
          description: `Processed ${data.processed} products. ${successCount} successful${errorCount > 0 ? `, ${errorCount} failed` : ''}. Review results below.`,
        });
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Batch search error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to perform batch search',
        variant: 'destructive',
      });
    } finally {
      setIsBatchSearching(false);
    }
  };

  // Save approved images
  const handleSaveBatchResults = () => {
    const approved = batchSearchResults.filter(r => r.approved && r.imageUrl);
    
    if (approved.length === 0) {
      toast({
        title: 'No images selected',
        description: 'Please approve at least one image to save',
        variant: 'destructive',
      });
      return;
    }

    const updates = approved.map(r => ({
      productId: r.productId,
      imageUrl: r.imageUrl,
    }));

    batchUpdateMutation.mutate(updates);
  };

  // Toggle approval for a batch result
  const toggleApproval = (index: number) => {
    setBatchSearchResults(prev => 
      prev.map((r, i) => i === index ? { ...r, approved: !r.approved } : r)
    );
  };

  // Update image URL for a batch result
  const updateBatchResultImage = (index: number, imageUrl: string) => {
    setBatchSearchResults(prev =>
      prev.map((r, i) => i === index ? { ...r, imageUrl, approved: true } : r)
    );
  };

  const handleBrandSearch = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedCategory('');
    setSearchQuery('');
    setShowProducts(true);
  };

  const handleCategorySearch = (category: string) => {
    setSelectedCategory(category);
    setSelectedBrand('');
    setSearchQuery('');
    setShowProducts(true);
  };

  const handleManualSearch = () => {
    setSelectedBrand('');
    setSelectedCategory('');
    setShowProducts(true);
  };

  const products = productsData || [];

  return (
    <div className="space-y-6">
      {/* Statistics Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5" />
            Product Image Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="text-center py-4">Loading statistics...</div>
          ) : imageStats ? (
            <div className="space-y-6">
              {/* Overall Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{(imageStats as any).totalProducts || 0}</div>
                  <div className="text-sm text-gray-600">Total Products</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{(imageStats as any).withImages || 0}</div>
                  <div className="text-sm text-gray-600">With Images</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{(imageStats as any).withoutImages || 0}</div>
                  <div className="text-sm text-gray-600">Missing Images</div>
                </div>
              </div>

              {/* Brand Breakdown */}
              <div>
                <h3 className="font-semibold mb-3">Top Brands Needing Images</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {((imageStats as any).byBrand || []).slice(0, 10).map((brand: any) => (
                    <div key={brand.brand} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <span className="font-medium">{brand.brand}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600">Total: {brand.total}</span>
                        <span className="text-red-600">Missing: {brand.withoutImages}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleBrandSearch(brand.brand)}
                          data-testid={`button-select-brand-${brand.brand}`}
                        >
                          Search
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category Breakdown */}
              <div>
                <h3 className="font-semibold mb-3">Categories</h3>
                <div className="flex items-center gap-4 mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showMissingOnly}
                      onChange={(e) => setShowMissingOnly(e.target.checked)}
                      className="rounded"
                      data-testid="checkbox-missing-only"
                    />
                    Show only products missing images
                  </label>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {((imageStats as any).byCategory || []).slice(0, 10).map((cat: any) => (
                    <div key={cat.category} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <span className="font-medium">{formatCategory(cat.category)}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600">Total: {cat.total}</span>
                        <span className="text-red-600">Missing: {cat.withoutImages}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCategorySearch(cat.category)}
                          data-testid={`button-select-category-${cat.category}`}
                        >
                          {showMissingOnly ? 'Missing' : 'All'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Sync Images by Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Sync Images by Name
          </CardTitle>
          <CardDescription>
            Match images from Object Storage to products by name/brand. Works across environments where product IDs differ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
            <p className="text-blue-800 dark:text-blue-300">
              Images are stored in shared Object Storage. This matches products to images by their name and brand instead of ID.
            </p>
          </div>
          
          <Button
            onClick={async () => {
              setIsImporting(true);
              setImportResult(null);
              try {
                const response = await fetch('/api/admin/supplies/sync-images-by-name', {
                  method: 'POST',
                  credentials: 'include',
                });
                
                if (!response.ok) {
                  throw new Error('Sync failed');
                }
                
                const result = await response.json();
                setImportResult({
                  totalImages: result.totalImages,
                  matched: result.matched,
                  unmatched: result.unmatched,
                  totalProducts: result.totalProducts
                });
                
                toast({
                  title: "Sync Complete",
                  description: `Matched ${result.matched} products to images`
                });
                
                queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
              } catch (error) {
                toast({
                  title: "Sync failed",
                  description: error instanceof Error ? error.message : "Failed to sync images",
                  variant: "destructive"
                });
              } finally {
                setIsImporting(false);
              }
            }}
            disabled={isImporting}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-sync-images-by-name"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isImporting ? 'animate-spin' : ''}`} />
            {isImporting ? 'Syncing...' : 'Sync Images by Name'}
          </Button>
          
          {importResult && importResult.matched !== undefined && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-sm">
              <div className="font-semibold text-green-700 dark:text-green-400 mb-2">Sync Results</div>
              <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                <div>Images in storage: {importResult.totalImages}</div>
                <div>Products in database: {importResult.totalProducts}</div>
                <div className="text-green-600">Matched: {importResult.matched}</div>
                <div className="text-yellow-600">Unmatched: {importResult.unmatched}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export/Import Image URLs for Production Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export/Import Image URLs
          </CardTitle>
          <CardDescription>
            Export image URLs from development and import them into the published app to sync all product photos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="text-amber-800 dark:text-amber-300">
              <strong>Step 1:</strong> Export image URLs from this development environment.<br/>
              <strong>Step 2:</strong> Open the published app's admin panel and import the JSON file.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                window.open('/api/admin/supplies/export-image-urls', '_blank');
                toast({
                  title: "Export Started",
                  description: "Downloading image URLs JSON file..."
                });
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-export-image-urls"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Image URLs
            </Button>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  setIsImporting(true);
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    const response = await fetch('/api/admin/supplies/import-image-urls', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify(data)
                    });
                    
                    if (!response.ok) {
                      const error = await response.json();
                      throw new Error(error.message || 'Import failed');
                    }
                    
                    const result = await response.json();
                    setImportResult(result);
                    
                    toast({
                      title: "Import Complete",
                      description: `Updated ${result.updated} product image URLs`
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
                  } catch (error) {
                    toast({
                      title: "Import failed",
                      description: error instanceof Error ? error.message : "Failed to import image URLs",
                      variant: "destructive"
                    });
                  } finally {
                    setIsImporting(false);
                    e.target.value = '';
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isImporting}
                data-testid="input-import-image-urls"
              />
              <Button
                className="bg-green-600 hover:bg-green-700 text-white pointer-events-none"
                disabled={isImporting}
              >
                <Upload className="w-4 h-4 mr-2" />
                {isImporting ? 'Importing...' : 'Import Image URLs'}
              </Button>
            </div>
          </div>
          
          {importResult && importResult.updated !== undefined && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-sm">
              <div className="font-semibold text-green-700 dark:text-green-400 mb-2">Import Results</div>
              <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                <div>Total in file: {importResult.totalInImport}</div>
                <div className="text-green-600">Updated: {importResult.updated}</div>
                <div className="text-yellow-600">Skipped: {importResult.skipped}</div>
                <div className="text-red-600">Not found: {importResult.notFound}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Product Search */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Product Image Search</CardTitle>
          <CardDescription>
            Search for individual products and add image URLs from major distributors (Chewy, Petco, PetSmart)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Search by product name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-product-search"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  data-testid="button-clear-product-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button 
              variant="outline" 
              onClick={handleManualSearch}
              data-testid="button-search-product"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {/* Products List */}
          {showProducts && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {selectedBrand ? `Brand: ${selectedBrand}` : 
                   selectedCategory ? `Category: ${selectedCategory}` : 
                   'Search Results'}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowProducts(false);
                    setSelectedBrand('');
                    setSelectedCategory('');
                    setSearchQuery('');
                  }}
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              </div>

              {productsLoading ? (
                <div className="text-center py-4">Loading products...</div>
              ) : products.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No products found</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {products.map((product: any) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        setSelectedProduct(product);
                        setImageUrl(product.imageUrl || '');
                      }}
                      data-testid={`product-row-${product.id}`}
                    >
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-gray-600">
                          {product.brand && <span>Brand: {product.brand} | </span>}
                          <span>Category: {formatCategory(product.category)}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Add Image
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedProduct && (
            <div className="border rounded-lg p-4 space-y-4 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Edit Image for: {selectedProduct.name}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedProduct(null);
                    setImageUrl('');
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div>
                <p className="text-sm text-gray-600">Brand: {selectedProduct.brand || 'Unknown'}</p>
                <p className="text-sm text-gray-600">Category: {formatCategory(selectedProduct.category)}</p>
              </div>

              {/* Direct Image Upload Zone */}
              <ProductImageUploadZone 
                productId={selectedProduct.id}
                onImageUploaded={(storedPath) => {
                  queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/by-filter'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                  toast({
                    title: 'Success',
                    description: 'Image uploaded and stored permanently!',
                  });
                  setSelectedProduct(null);
                  setImageUrl('');
                  refetchProducts();
                }}
              />

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium mb-2">Or use a URL:</p>
                <div className="space-y-2">
                  <Input
                    placeholder="Paste image URL from distributor website..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    data-testid="input-image-url"
                  />
                  {imageUrl && (
                    <div className="border rounded p-2 bg-white">
                      <img 
                        src={imageUrl} 
                        alt="Preview" 
                        className="max-w-xs max-h-48 object-contain mx-auto"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder-supply.jpg';
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    onClick={() => {
                      downloadImageMutation.mutate({
                        productId: selectedProduct.id,
                        externalUrl: imageUrl,
                      });
                    }}
                    disabled={!imageUrl || downloadImageMutation.isPending}
                    data-testid="button-download-store-image"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {downloadImageMutation.isPending ? 'Downloading...' : 'Download & Store from URL'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProduct(null);
                      setImageUrl('');
                    }}
                    data-testid="button-cancel-image"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Search Tools */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Image Search</CardTitle>
          <CardDescription>
            Search for images for all products in a specific brand or category
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-semibold mb-1">Cost Management</p>
                <p>Web searches consume your monthly Replit credits. Batch searching {((imageStats as any)?.totalProducts) || 7316} products may use significant credits. Search selectively by brand or category to manage costs.</p>
              </div>
            </div>
          </div>

          {selectedBrand && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Selected Brand: {selectedBrand}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedBrand('');
                    setShowBatchResults(false);
                    setBatchSearchResults([]);
                  }}
                  data-testid="button-clear-brand"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="max-products">Number of products to process (max 50)</Label>
                  <Input
                    id="max-products"
                    type="number"
                    min="1"
                    max="50"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(Math.min(50, Math.max(1, parseInt(e.target.value) || 20)))}
                    className="mt-2"
                    data-testid="input-max-products"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {products?.length || 0} products available without images
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleStartBatchSearch}
                    disabled={isBatchSearching || !products || products.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="button-start-batch-search"
                  >
                    {isBatchSearching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Start Batch Search
                      </>
                    )}
                  </Button>
                </div>

                {isBatchSearching && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing products...</span>
                      <span>{batchSearchProgress} / {batchSearchTotal}</span>
                    </div>
                    <Progress value={(batchSearchProgress / batchSearchTotal) * 100} />
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedCategory && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold capitalize">Selected Category: {selectedCategory}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory('');
                    setShowBatchResults(false);
                    setBatchSearchResults([]);
                  }}
                  data-testid="button-clear-category"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="max-products-cat">Number of products to process (max 50)</Label>
                  <Input
                    id="max-products-cat"
                    type="number"
                    min="1"
                    max="50"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(Math.min(50, Math.max(1, parseInt(e.target.value) || 20)))}
                    className="mt-2"
                    data-testid="input-max-products-category"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {products?.length || 0} products available without images
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleStartBatchSearch}
                    disabled={isBatchSearching || !products || products.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-start-batch-search-category"
                  >
                    {isBatchSearching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Start Batch Search
                      </>
                    )}
                  </Button>
                </div>

                {isBatchSearching && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing products...</span>
                      <span>{batchSearchProgress} / {batchSearchTotal}</span>
                    </div>
                    <Progress value={(batchSearchProgress / batchSearchTotal) * 100} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batch Search Results */}
          {showBatchResults && batchSearchResults.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Batch Search Results</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowBatchResults(false);
                      setBatchSearchResults([]);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <CardDescription>
                  Review and approve images before saving. You can manually edit image URLs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Note:</strong> Automated web search is preparing search queries for you. 
                    For each product, use the provided search query to find images on distributor websites 
                    (Chewy, Petco, PetSmart, Amazon), then paste the image URL below.
                  </p>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {batchSearchResults.map((result, index) => (
                    <div 
                      key={result.productId} 
                      className={`border rounded-lg p-4 space-y-3 ${result.success ? 'bg-white dark:bg-gray-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200'}`}
                      data-testid={`batch-result-${index}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{result.productName}</h4>
                          {result.brand && (
                            <p className="text-sm text-gray-600">Brand: {result.brand}</p>
                          )}
                          {result.error && (
                            <p className="text-sm text-red-600 mt-1">
                              <strong>Error:</strong> {result.error}
                            </p>
                          )}
                          {result.success && result.searchQuery && (
                            <p className="text-xs text-gray-500 mt-1 break-all">
                              <strong>Search:</strong> {result.searchQuery}
                            </p>
                          )}
                        </div>
                        <Badge 
                          variant={result.success ? (result.approved ? "default" : "outline") : "destructive"}
                          className={result.approved ? "bg-green-600" : ""}
                        >
                          {result.success ? (result.approved ? "Approved" : "Pending") : "Failed"}
                        </Badge>
                      </div>

                      {result.success && (
                        <div className="space-y-2">
                          <Label>Image URL</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Paste image URL here..."
                              value={result.imageUrl || ''}
                              onChange={(e) => updateBatchResultImage(index, e.target.value)}
                              data-testid={`input-batch-image-${index}`}
                            />
                            <Button
                              size="sm"
                              variant={result.approved ? "default" : "outline"}
                              onClick={() => toggleApproval(index)}
                              disabled={!result.imageUrl}
                              data-testid={`button-approve-${index}`}
                            >
                              {result.approved ? <CheckCircle2 className="w-4 h-4" /> : "Approve"}
                            </Button>
                          </div>
                          
                          {result.imageUrl && (
                            <div className="border rounded p-2 bg-gray-50 dark:bg-gray-900">
                              <img 
                                src={result.imageUrl} 
                                alt="Preview" 
                                className="max-w-xs max-h-32 object-contain mx-auto"
                                onError={(e) => {
                                  e.currentTarget.src = '/placeholder-supply.jpg';
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={handleSaveBatchResults}
                    disabled={batchUpdateMutation.isPending || !batchSearchResults.some(r => r.approved)}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-save-batch"
                  >
                    {batchUpdateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save {batchSearchResults.filter(r => r.approved).length} Approved Images
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowBatchResults(false);
                      setBatchSearchResults([]);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<string[]>(['A', 'B']);
  const [scheduleData, setScheduleData] = useState<Record<string, any[]>>({ A: [], B: [] });
  const [isSaving, setIsSaving] = useState(false);
  
  // Pay period: Wednesday through Tuesday
  const DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'];
  
  // Calculate dates for each section (week starts on Wednesday)
  const getDatesForSection = (section: string) => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ... 3 = Wednesday
    
    // Calculate days to subtract to get to Wednesday of current week
    // Wednesday = 3, so we need: (currentDay - 3 + 7) % 7 days ago was Wednesday
    const daysToWednesday = (currentDay - 3 + 7) % 7;
    const currentWeekWednesday = new Date(now);
    currentWeekWednesday.setDate(now.getDate() - daysToWednesday);
    currentWeekWednesday.setHours(0, 0, 0, 0);
    
    // Section index determines week offset (A = current week, B = next week, etc.)
    const sectionIndex = sections.indexOf(section);
    const weekOffset = sectionIndex * 7;
    const sectionWednesday = new Date(currentWeekWednesday);
    sectionWednesday.setDate(currentWeekWednesday.getDate() + weekOffset);
    
    // Generate dates for all days of the week (Wed-Tue)
    return DAYS.map((_, index) => {
      const date = new Date(sectionWednesday);
      date.setDate(sectionWednesday.getDate() + index);
      return date;
    });
  };
  
  // Fetch schedule entries
  const scheduleQuery = useQuery({
    queryKey: ['/api/admin/schedule'],
  });
  
  // Organize schedule data by section and employee
  useEffect(() => {
    if (scheduleQuery.data) {
      const entries = scheduleQuery.data as any[];
      
      // Find all unique sections from data
      const existingSections = [...new Set(entries.map((e: any) => e.section))].filter(Boolean).sort();
      if (existingSections.length > 0) {
        setSections(existingSections);
      }
      
      const organized: Record<string, any[]> = {};
      
      // Initialize all sections
      (existingSections.length > 0 ? existingSections : sections).forEach(section => {
        organized[section] = [];
      });
      
      // Group by section and employee
      (existingSections.length > 0 ? existingSections : sections).forEach(section => {
        const sectionEntries = entries.filter((e: any) => e.section === section);
        const employees = [...new Set(sectionEntries.map((e: any) => e.employeeName))];
        
        organized[section] = employees.map((empName, idx) => {
          const empEntries = sectionEntries.filter((e: any) => e.employeeName === empName);
          const schedule: Record<string, string> = {};
          
          DAYS.forEach(day => {
            const dayEntry = empEntries.find((e: any) => e.dayOfWeek === day);
            schedule[day] = dayEntry?.timeSlot || 'OFF';
          });
          
          return {
            employeeName: empName,
            displayOrder: idx,
            ...schedule
          };
        });
      });
      
      setScheduleData(organized);
    }
  }, [scheduleQuery.data]);
  
  const handleCellChange = (section: string, employeeIndex: number, day: string, value: string) => {
    setScheduleData(prev => ({
      ...prev,
      [section]: prev[section].map((emp, idx) => 
        idx === employeeIndex ? { ...emp, [day]: value } : emp
      )
    }));
  };
  
  const handleEmployeeNameChange = (section: string, employeeIndex: number, newName: string) => {
    setScheduleData(prev => ({
      ...prev,
      [section]: prev[section].map((emp, idx) => 
        idx === employeeIndex ? { ...emp, employeeName: newName } : emp
      )
    }));
  };
  
  const addEmployee = (section: string) => {
    const currentSectionData = scheduleData[section] || [];
    const newEmployee: any = {
      employeeName: 'New Employee',
      displayOrder: currentSectionData.length,
    };
    
    DAYS.forEach(day => {
      newEmployee[day] = 'OFF';
    });
    
    setScheduleData(prev => ({
      ...prev,
      [section]: [...(prev[section] || []), newEmployee]
    }));
  };
  
  const removeEmployee = (section: string, employeeIndex: number) => {
    setScheduleData(prev => ({
      ...prev,
      [section]: (prev[section] || []).filter((_, idx) => idx !== employeeIndex)
    }));
  };
  
  const addSection = () => {
    // Get next section letter (A, B, C, D, ...)
    const nextLetter = String.fromCharCode(65 + sections.length); // 65 = 'A'
    setSections(prev => [...prev, nextLetter]);
    setScheduleData(prev => ({ ...prev, [nextLetter]: [] }));
  };
  
  const removeSection = (sectionToRemove: string) => {
    if (sections.length <= 1) {
      toast({ title: 'Cannot remove last section', variant: 'destructive' });
      return;
    }
    setSections(prev => prev.filter(s => s !== sectionToRemove));
    setScheduleData(prev => {
      const newData = { ...prev };
      delete newData[sectionToRemove];
      return newData;
    });
  };
  
  const saveSchedule = async () => {
    setIsSaving(true);
    try {
      const entries: any[] = [];
      
      sections.forEach(section => {
        (scheduleData[section] || []).forEach((employee, idx) => {
          DAYS.forEach(day => {
            entries.push({
              section,
              employeeName: employee.employeeName,
              dayOfWeek: day,
              timeSlot: employee[day] || 'OFF',
              displayOrder: idx
            });
          });
        });
      });
      
      await apiRequest('POST', '/api/admin/schedule/batch', { entries });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/schedule'] });
      toast({ title: 'Schedule saved successfully' });
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast({ title: 'Failed to save schedule', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (scheduleQuery.isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Employee Schedule
          </CardTitle>
          <Button 
            onClick={saveSchedule}
            disabled={isSaving}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
            data-testid="button-save-schedule"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Schedule
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="flex items-center gap-2 pb-2 border-b">
          <span className="text-sm text-gray-600">Manage Sections:</span>
          <Button 
            size="sm"
            variant="outline"
            onClick={addSection}
            data-testid="button-add-section"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Section
          </Button>
          <span className="text-xs text-gray-500 ml-2">(Pay period: Wed - Tue)</span>
        </div>
        
        {sections.map(section => (
          <div key={section} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900 bg-green-200 px-3 py-1 rounded">
                  Section {section}
                </h3>
                {sections.length > 1 && (
                  <Button 
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSection(section)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    data-testid={`button-remove-section-${section}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => addEmployee(section)}
                data-testid={`button-add-employee-${section}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Employee
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-green-100">
                    <th className="border border-gray-300 px-2 py-2 text-left text-sm font-semibold min-w-[120px]">Employee</th>
                    {DAYS.map((day, index) => {
                      const dates = getDatesForSection(section);
                      const date = dates[index];
                      const month = date.getMonth() + 1;
                      const dayNum = date.getDate();
                      return (
                        <th key={day} className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold min-w-[100px]">
                          {day.substring(0, 3)} {month}/{dayNum}
                        </th>
                      );
                    })}
                    <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold w-[80px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(scheduleData[section] || []).map((employee, empIdx) => (
                    <tr key={empIdx} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1">
                        <input
                          type="text"
                          value={employee.employeeName}
                          onChange={(e) => handleEmployeeNameChange(section, empIdx, e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                          data-testid={`input-employee-name-${section}-${empIdx}`}
                        />
                      </td>
                      {DAYS.map(day => (
                        <td key={day} className="border border-gray-300 px-1 py-1">
                          <input
                            type="text"
                            value={employee[day] || 'OFF'}
                            onChange={(e) => handleCellChange(section, empIdx, day, e.target.value)}
                            className="w-full px-2 py-1 text-sm text-center border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="OFF"
                            data-testid={`input-schedule-${section}-${empIdx}-${day}`}
                          />
                        </td>
                      ))}
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeEmployee(section, empIdx)}
                          data-testid={`button-remove-employee-${section}-${empIdx}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(scheduleData[section] || []).length === 0 && (
                    <tr>
                      <td colSpan={DAYS.length + 2} className="border border-gray-300 px-4 py-8 text-center text-gray-500">
                        No employees in this section. Click "Add Employee" to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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
      const groomers = [...new Set(entries.map((e: any) => e.groomerName))];
      
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
    let startDate, endDate, isActual;
    
    if (record.actualDropOffDate && record.actualPickUpDate) {
      startDate = record.actualDropOffDate;
      endDate = record.actualPickUpDate;
      isActual = true;
    } else {
      startDate = record.estimatedDropOffDate;
      endDate = record.estimatedPickUpDate;
      isActual = false;
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
                      {record.status === 'completed' && record.actualDropOffDate && record.actualPickUpDate ? (
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
        <DialogContent className="max-w-md mx-auto">
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
        <DialogContent className="max-w-md mx-auto">
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
    notes: initialData?.notes || '',
  });
  
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
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('BoardingForm submit with data:', formData);
    onSubmit(formData);
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
      
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
        <p className="text-sm">
          <span className="font-medium">Estimated Days:</span> {estimatedDays} day{estimatedDays !== 1 ? 's' : ''}
        </p>
        <p className="text-sm font-semibold mt-1">
          <span>Estimated Total:</span> ${estimatedTotal.toFixed(2)}
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
  
  // State for capacity error dialog
  const [showCapacityDialog, setShowCapacityDialog] = useState(false);
  
  // Track which appointment we've initialized for (prevents overwriting edits on refetch)
  const initializedAppointmentId = useRef<number | null>(null);
  
  // Wrap onClose to reset the initialization guard
  const handleClose = () => {
    initializedAppointmentId.current = null;
    onClose();
  };
  
  // Service prices constant
  const SERVICES = [
    { id: 'grooming-full', name: 'Full Grooming', price: 35 },
    { id: 'grooming-bath', name: 'Bath Only', price: 20 },
  ];
  
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
        price: appointmentData.price ? parseFloat(appointmentData.price).toString() : '35',
      }]);
    }
    
    // Set pricing mode based on appointment data
    setPricingMode(appointmentData.pricingMode || 'individual');
    // Only update override price if explicitly set (preserve any previous value if switching modes)
    if (appointmentData.pricingMode === 'override' && appointmentData.price) {
      setTotalPriceOverride(parseFloat(appointmentData.price).toString());
    }
    
    // Mark this appointment as initialized
    initializedAppointmentId.current = appointmentId;
  }, [appointmentData, appointmentId]);
  
  // Calculate total price in individual mode
  const calculatedTotal = pets.reduce((sum, pet) => sum + (parseFloat(pet.price) || 0), 0);
  
  // Update pet field
  const updatePet = (index: number, field: string, value: any) => {
    const updated = [...pets];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-update price when service changes in individual mode
    if (field === 'serviceType' && pricingMode === 'individual') {
      const service = SERVICES.find(s => s.id === value);
      if (service) {
        updated[index].price = service.price.toString();
      }
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
          specialNotes: pet.notes,
          groomerId: pet.groomerId || null,
          price: pet.price,
        })),
      };
      
      // Set total price based on mode
      if (pricingMode === 'override') {
        updates.price = totalPriceOverride;
      } else {
        updates.price = calculatedTotal.toString();
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
    onSuccess: async () => {
      toast({
        title: "Appointment Updated",
        description: "Appointment details have been updated successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      handleClose();
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
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
            <h3 className="font-semibold text-sm">Pets ({pets.length})</h3>
            
            {/* Pet Cards - Stacked */}
            {pets.map((pet, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3 bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm">Pet {index + 1}</span>
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
                        <SelectItem value="grooming-full">Full Grooming</SelectItem>
                        <SelectItem value="grooming-bath">Bath Only</SelectItem>
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
                  onChange={(e) => setTotalPriceOverride(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-total-override"
                  className="max-w-xs"
                />
                <p className="text-xs text-gray-600 mt-1">This overrides individual pet prices</p>
              </div>
            )}
          </div>
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

// Email & Text Center Component for sending emails and SMS to users
function EmailCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'email' | 'sms' | 'automated'>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'customers' | 'groomers' | 'admins'>('all');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Automated message form state
  const [showAutoMessageForm, setShowAutoMessageForm] = useState(false);
  const [editingAutoMessage, setEditingAutoMessage] = useState<any>(null);
  const [autoMessageForm, setAutoMessageForm] = useState({
    name: '',
    triggerType: 'appointment_reminder' as string,
    triggerValue: '24',
    targetAudience: 'appointment_customers' as string,
    channel: 'email' as string,
    emailSubject: '',
    emailBody: '',
    smsBody: '',
    isActive: true
  });

  // Fetch automated messages
  const { data: automatedMessages = [], isLoading: loadingAutoMessages } = useQuery<any[]>({
    queryKey: ['/api/admin/automated-messages'],
  });

  // Fetch all recipients for selection
  const { data: recipients = [], isLoading: loadingRecipients } = useQuery<any[]>({
    queryKey: ['/api/admin/email/recipients'],
  });

  // Filter recipients based on search and role
  const filteredRecipients = (recipients as any[]).filter((r: any) => {
    const matchesSearch = r.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.phoneNumber && r.phoneNumber.includes(searchTerm));
    
    if (!matchesSearch) return false;
    
    switch (roleFilter) {
      case 'customers':
        return !r.isAdmin && !r.isGroomer;
      case 'groomers':
        return r.isGroomer;
      case 'admins':
        return r.isAdmin;
      default:
        return true;
    }
  });

  // Recipients with phone numbers for SMS
  const recipientsWithPhones = filteredRecipients.filter((r: any) => r.phoneNumber);

  const handleSendEmail = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both subject and message",
        variant: "destructive"
      });
      return;
    }

    if (!sendToAll && selectedRecipients.length === 0) {
      toast({
        title: "No Recipients Selected",
        description: "Please select at least one recipient or choose 'Send to All'",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject,
          message,
          sendToAll,
          roleFilter: sendToAll ? roleFilter : undefined,
          recipients: sendToAll ? undefined : selectedRecipients
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Emails Sent",
          description: result.message
        });
        setSubject('');
        setMessage('');
        setSelectedRecipients([]);
      } else {
        toast({
          title: "Failed to Send",
          description: result.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!message.trim()) {
      toast({
        title: "Missing Message",
        description: "Please enter a message to send",
        variant: "destructive"
      });
      return;
    }

    if (!sendToAll && selectedRecipients.length === 0) {
      toast({
        title: "No Recipients Selected",
        description: "Please select at least one recipient with a phone number",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/admin/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          sendToAll,
          roleFilter: sendToAll ? roleFilter : undefined,
          recipients: sendToAll ? undefined : selectedRecipients
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Text Messages Sent",
          description: result.message
        });
        setMessage('');
        setSelectedRecipients([]);
      } else {
        toast({
          title: "Failed to Send",
          description: result.message || "Something went wrong",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send text messages. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const toggleRecipient = (id: number | string) => {
    const idStr = String(id);
    setSelectedRecipients(prev =>
      prev.includes(idStr) ? prev.filter(r => r !== idStr) : [...prev, idStr]
    );
  };

  const selectAll = () => {
    const recipientsList = activeTab === 'sms' ? recipientsWithPhones : filteredRecipients;
    setSelectedRecipients(recipientsList.map((r: any) => String(r.id)));
  };

  const clearAll = () => {
    setSelectedRecipients([]);
  };

  const resetAutoMessageForm = () => {
    setAutoMessageForm({
      name: '',
      triggerType: 'appointment_reminder',
      triggerValue: '24',
      targetAudience: 'appointment_customers',
      channel: 'email',
      emailSubject: '',
      emailBody: '',
      smsBody: '',
      isActive: true
    });
    setEditingAutoMessage(null);
    setShowAutoMessageForm(false);
  };

  const handleSaveAutoMessage = async () => {
    if (!autoMessageForm.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (autoMessageForm.channel === 'email' && (!autoMessageForm.emailSubject.trim() || !autoMessageForm.emailBody.trim())) {
      toast({ title: "Email subject and body required", variant: "destructive" });
      return;
    }
    if (autoMessageForm.channel === 'sms' && !autoMessageForm.smsBody.trim()) {
      toast({ title: "SMS body required", variant: "destructive" });
      return;
    }

    try {
      const url = editingAutoMessage
        ? `/api/admin/automated-messages/${editingAutoMessage.id}`
        : '/api/admin/automated-messages';
      const method = editingAutoMessage ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(autoMessageForm)
      });

      if (response.ok) {
        toast({ title: editingAutoMessage ? "Message updated" : "Message created" });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/automated-messages'] });
        resetAutoMessageForm();
      } else {
        const result = await response.json();
        toast({ title: result.message || "Failed to save", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error saving message", variant: "destructive" });
    }
  };

  const handleDeleteAutoMessage = async (id: number) => {
    if (!confirm('Delete this automated message?')) return;
    try {
      await fetch(`/api/admin/automated-messages/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/automated-messages'] });
      toast({ title: "Message deleted" });
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleToggleAutoMessage = async (id: number, isActive: boolean) => {
    try {
      await fetch(`/api/admin/automated-messages/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive })
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/automated-messages'] });
    } catch (error) {
      toast({ title: "Failed to toggle", variant: "destructive" });
    }
  };

  const editAutoMessage = (msg: any) => {
    setAutoMessageForm({
      name: msg.name,
      triggerType: msg.triggerType,
      triggerValue: msg.triggerValue || '24',
      targetAudience: msg.targetAudience,
      channel: msg.channel,
      emailSubject: msg.emailSubject || '',
      emailBody: msg.emailBody || '',
      smsBody: msg.smsBody || '',
      isActive: msg.isActive
    });
    setEditingAutoMessage(msg);
    setShowAutoMessageForm(true);
  };

  const getTriggerLabel = (type: string, value: string) => {
    switch (type) {
      case 'appointment_reminder': return `${value} hours before appointment`;
      case 'daily': return `Daily at ${value}`;
      case 'weekly': return `Weekly on ${value}`;
      default: return type;
    }
  };

  const getAudienceLabel = (audience: string) => {
    const labels: Record<string, string> = {
      all: 'All Users',
      customers: 'Customers Only',
      groomers: 'Groomers Only',
      admins: 'Admins Only',
      appointment_customers: 'Appointment Customers'
    };
    return labels[audience] || audience;
  };

  const getRoleCount = (role: string) => {
    switch (role) {
      case 'customers':
        return (recipients as any[]).filter((r: any) => !r.isAdmin && !r.isGroomer).length;
      case 'groomers':
        return (recipients as any[]).filter((r: any) => r.isGroomer).length;
      case 'admins':
        return (recipients as any[]).filter((r: any) => r.isAdmin).length;
      default:
        return recipients.length;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Communication Center
          </CardTitle>
          <CardDescription>
            Send emails and text messages to customers, groomers, and admins
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tab Selection */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={activeTab === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('email'); setSelectedRecipients([]); }}
            >
              <Mail className="w-4 h-4 mr-2" />
              Email
            </Button>
            <Button
              variant={activeTab === 'sms' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('sms'); setSelectedRecipients([]); }}
            >
              <Phone className="w-4 h-4 mr-2" />
              Text Message
            </Button>
            <Button
              variant={activeTab === 'automated' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('automated'); setSelectedRecipients([]); }}
            >
              <Clock className="w-4 h-4 mr-2" />
              Automated
            </Button>
          </div>

          {/* Automated Messages Tab */}
          {activeTab === 'automated' && (
            <div className="space-y-4">
              {!showAutoMessageForm ? (
                <>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Create scheduled messages that send automatically based on triggers.
                    </p>
                    <Button onClick={() => setShowAutoMessageForm(true)} className="bg-brand-blue hover:bg-blue-600">
                      <Plus className="w-4 h-4 mr-2" /> New Message
                    </Button>
                  </div>

                  {loadingAutoMessages ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                  ) : (automatedMessages as any[]).length === 0 ? (
                    <div className="text-center py-8 border rounded-lg">
                      <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground">No automated messages yet</p>
                      <Button onClick={() => setShowAutoMessageForm(true)} variant="outline" className="mt-3">
                        <Plus className="w-4 h-4 mr-2" /> Create Your First
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(automatedMessages as any[]).map((msg: any) => (
                        <div key={msg.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{msg.name}</h4>
                                <Badge variant={msg.isActive ? 'default' : 'secondary'}>
                                  {msg.isActive ? 'Active' : 'Paused'}
                                </Badge>
                                <Badge variant="outline">{msg.channel.toUpperCase()}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {getTriggerLabel(msg.triggerType, msg.triggerValue)} • {getAudienceLabel(msg.targetAudience)}
                              </p>
                              {msg.channel === 'email' && (
                                <p className="text-sm mt-2 truncate">Subject: {msg.emailSubject}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={msg.isActive}
                                onCheckedChange={(checked) => handleToggleAutoMessage(msg.id, checked)}
                              />
                              <Button size="icon" variant="ghost" onClick={() => editAutoMessage(msg)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDeleteAutoMessage(msg.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold">{editingAutoMessage ? 'Edit' : 'New'} Automated Message</h4>
                    <Button variant="ghost" size="sm" onClick={resetAutoMessageForm}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <Label>Name</Label>
                    <Input
                      value={autoMessageForm.name}
                      onChange={(e) => setAutoMessageForm({ ...autoMessageForm, name: e.target.value })}
                      placeholder="e.g., Appointment Reminder"
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Trigger Type</Label>
                      <Select
                        value={autoMessageForm.triggerType}
                        onValueChange={(v) => setAutoMessageForm({ ...autoMessageForm, triggerType: v })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
                          <SelectItem value="daily">Daily Schedule</SelectItem>
                          <SelectItem value="weekly">Weekly Schedule</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>
                        {autoMessageForm.triggerType === 'appointment_reminder' ? 'Hours Before' : 
                         autoMessageForm.triggerType === 'daily' ? 'Time (HH:MM)' : 'Day'}
                      </Label>
                      <Input
                        value={autoMessageForm.triggerValue}
                        onChange={(e) => setAutoMessageForm({ ...autoMessageForm, triggerValue: e.target.value })}
                        placeholder={autoMessageForm.triggerType === 'appointment_reminder' ? '24' : '09:00'}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Target Audience</Label>
                      <Select
                        value={autoMessageForm.targetAudience}
                        onValueChange={(v) => setAutoMessageForm({ ...autoMessageForm, targetAudience: v })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="appointment_customers">Appointment Customers</SelectItem>
                          <SelectItem value="all">All Users</SelectItem>
                          <SelectItem value="customers">Customers Only</SelectItem>
                          <SelectItem value="groomers">Groomers Only</SelectItem>
                          <SelectItem value="admins">Admins Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Channel</Label>
                      <Select
                        value={autoMessageForm.channel}
                        onValueChange={(v) => setAutoMessageForm({ ...autoMessageForm, channel: v })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(autoMessageForm.channel === 'email' || autoMessageForm.channel === 'both') && (
                    <>
                      <div>
                        <Label>Email Subject</Label>
                        <Input
                          value={autoMessageForm.emailSubject}
                          onChange={(e) => setAutoMessageForm({ ...autoMessageForm, emailSubject: e.target.value })}
                          placeholder="Reminder: Your Appointment Tomorrow"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Email Body</Label>
                        <Textarea
                          value={autoMessageForm.emailBody}
                          onChange={(e) => setAutoMessageForm({ ...autoMessageForm, emailBody: e.target.value })}
                          placeholder="Dear {{customerName}}, your appointment is scheduled for {{appointmentTime}}..."
                          rows={4}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Available placeholders: {'{{customerName}}'}, {'{{petName}}'}, {'{{appointmentTime}}'}, {'{{appointmentDate}}'}
                        </p>
                      </div>
                    </>
                  )}

                  {(autoMessageForm.channel === 'sms' || autoMessageForm.channel === 'both') && (
                    <div>
                      <Label>SMS Message</Label>
                      <Textarea
                        value={autoMessageForm.smsBody}
                        onChange={(e) => setAutoMessageForm({ ...autoMessageForm, smsBody: e.target.value })}
                        placeholder="Reminder: {{petName}}'s appointment is tomorrow at {{appointmentTime}}. See you then!"
                        rows={3}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {autoMessageForm.smsBody.length}/160 characters
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSaveAutoMessage} className="flex-1 bg-brand-blue hover:bg-blue-600">
                      {editingAutoMessage ? 'Update Message' : 'Create Message'}
                    </Button>
                    <Button variant="outline" onClick={resetAutoMessageForm}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Email/SMS Content */}
          {activeTab !== 'automated' && (
            <>
          {/* Role Filter */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Target Audience</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={roleFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('all')}
              >
                All ({getRoleCount('all')})
              </Button>
              <Button
                variant={roleFilter === 'customers' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('customers')}
              >
                Customers ({getRoleCount('customers')})
              </Button>
              <Button
                variant={roleFilter === 'groomers' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('groomers')}
              >
                Groomers ({getRoleCount('groomers')})
              </Button>
              <Button
                variant={roleFilter === 'admins' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter('admins')}
              >
                Admins ({getRoleCount('admins')})
              </Button>
            </div>
          </div>

          {/* Quick Templates */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick Templates</Label>
            <div className="flex flex-wrap gap-2">
              {activeTab === 'email' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('Important Notice from Animal House Pet Store');
                      setMessage('Dear Valued Customer,\n\nWe have an important update to share with you.\n\n[Your message here]\n\nThank you for being a loyal customer!\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    General Announcement
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('Scheduled Maintenance Notice');
                      setMessage('Dear Valued Customer,\n\nWe want to inform you about scheduled maintenance:\n\n• Date: [DATE]\n• Time: [TIME]\n• Expected Duration: [DURATION]\n\nDuring this time, our online services may be temporarily unavailable.\n\nWe apologize for any inconvenience.\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    Maintenance Notice
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('Special Promotion at Animal House Pet Store!');
                      setMessage('Dear Valued Customer,\n\nWe have an exciting promotion just for you!\n\n[Promotion details here]\n\nDon\'t miss out on these amazing deals!\n\nVisit us in store or online.\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    Promotion
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubject('New Password Requirements - Action Required');
                      setMessage('Dear Valued Customer,\n\nStarting January 23rd, 2026, we are implementing stronger password requirements to better protect your account.\n\nNew passwords must now contain:\n• At least 6 characters\n• At least one capital letter\n• At least one number\n\nPlease log in and update your password within the next 24 hours.\n\nTo reset your password, visit our website and click "Forgot Password" on the login page.\n\nThank you for helping us keep your account secure!\n\nBest regards,\nAnimal House Pet Store');
                    }}
                  >
                    Password Update Notice
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage('Your pet is ready for pickup at Animal House! Please come by during business hours.')}
                  >
                    Pet Ready
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage('Your order is ready for pickup at Animal House Pet Store!')}
                  >
                    Order Ready
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage('Reminder: Your grooming appointment is tomorrow at Animal House. See you then!')}
                  >
                    Appointment Reminder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage('Animal House Pet Store: [Your message here]')}
                  >
                    Custom Message
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Message Form */}
          <div className="space-y-4">
            {activeTab === 'email' && (
              <div>
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label htmlFor="message-body">{activeTab === 'email' ? 'Message' : 'Text Message'}</Label>
              <Textarea
                id="message-body"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={activeTab === 'email' ? "Enter your message..." : "Enter text message (160 chars recommended)..."}
                rows={activeTab === 'email' ? 8 : 4}
                className="mt-1"
              />
              {activeTab === 'sms' && (
                <p className="text-xs text-muted-foreground mt-1">
                  {message.length} characters {message.length > 160 && '(may be split into multiple messages)'}
                </p>
              )}
            </div>
          </div>

          {/* Recipient Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Recipients</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="send-to-all"
                  checked={sendToAll}
                  onCheckedChange={setSendToAll}
                />
                <Label htmlFor="send-to-all" className="text-sm">
                  Send to All {roleFilter === 'all' ? '' : roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
                </Label>
              </div>
            </div>

            {!sendToAll && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={activeTab === 'sms' ? "Search by name or phone..." : "Search by name or email..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>Clear</Button>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {selectedRecipients.length} recipient(s) selected
                  {activeTab === 'sms' && ` (${recipientsWithPhones.length} have phone numbers)`}
                </div>

                <ScrollArea className="h-48 border rounded">
                  {loadingRecipients ? (
                    <div className="p-4 text-center text-muted-foreground">Loading recipients...</div>
                  ) : (activeTab === 'sms' ? recipientsWithPhones : filteredRecipients).length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      {activeTab === 'sms' ? 'No recipients with phone numbers found' : 'No recipients found'}
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {(activeTab === 'sms' ? recipientsWithPhones : filteredRecipients).map((recipient: any) => (
                        <div
                          key={recipient.id}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent ${
                            selectedRecipients.includes(String(recipient.id)) ? 'bg-accent' : ''
                          }`}
                          onClick={() => toggleRecipient(recipient.id)}
                        >
                          <Checkbox
                            checked={selectedRecipients.includes(String(recipient.id))}
                            onCheckedChange={() => toggleRecipient(recipient.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate flex items-center gap-2">
                              {recipient.fullName}
                              {recipient.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                              {recipient.isGroomer && <Badge variant="outline" className="text-xs">Groomer</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {activeTab === 'sms' ? recipient.phoneNumber : recipient.email}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            {sendToAll && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    {activeTab === 'email' 
                      ? `This will send to ${getRoleCount(roleFilter)} ${roleFilter === 'all' ? 'users' : roleFilter} with valid email addresses`
                      : `This will send to ${(recipients as any[]).filter((r: any) => {
                          if (!r.phoneNumber) return false;
                          switch (roleFilter) {
                            case 'customers': return !r.isAdmin && !r.isGroomer;
                            case 'groomers': return r.isGroomer;
                            case 'admins': return r.isAdmin;
                            default: return true;
                          }
                        }).length} ${roleFilter === 'all' ? 'users' : roleFilter} with phone numbers`
                    }
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Send Button */}
          <Button
            onClick={activeTab === 'email' ? handleSendEmail : handleSendSMS}
            disabled={isSending || !message.trim() || (activeTab === 'email' && !subject.trim())}
            className="w-full bg-brand-blue hover:bg-blue-600"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {activeTab === 'email' ? 'Sending Emails...' : 'Sending Text Messages...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {activeTab === 'email' 
                  ? (sendToAll ? `Send Email to ${getRoleCount(roleFilter)}` : `Send Email to ${selectedRecipients.length} Recipient(s)`)
                  : (sendToAll ? `Send Text to ${(recipients as any[]).filter((r: any) => r.phoneNumber).length}` : `Send Text to ${selectedRecipients.length} Recipient(s)`)
                }
              </>
            )}
          </Button>
          </>
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

  // Fetch Astro customers
  const { data: astroCustomers = [], isLoading } = useQuery({
    queryKey: ['/api/admin/astro/customers'],
    enabled: true
  });

  // Test connection mutation
  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const response = await fetch('/api/admin/astro/test-connection', {
        credentials: 'include'
      });
      const result = await response.json();
      setConnectionResult(result);
      
      if (result.success) {
        toast({
          title: "Connection successful!",
          description: "Astro Loyalty API is configured and working"
        });
      } else {
        toast({
          title: "Connection failed",
          description: result.message || "Please check your API credentials",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Test connection error:', error);
      toast({
        title: "Connection test failed",
        description: "Failed to test Astro connection",
        variant: "destructive"
      });
      setConnectionResult({ success: false, message: "Network error" });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Integration Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Astro Loyalty Integration
          </CardTitle>
          <CardDescription>
            Manage customer loyalty program integration with Astro
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Setup Instructions Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Setup Required</p>
                <div className="space-y-2 text-blue-700 dark:text-blue-400">
                  <p>To enable Astro Loyalty integration:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Contact <a href="mailto:developer1.astroloyalty.com" className="underline font-medium">developer1.astroloyalty.com</a> to get API credentials</li>
                    <li>Subscription cost: $50/month</li>
                    <li>Add the following environment variables to your Replit Secrets:
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                        <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-xs">ASTRO_API_KEY</code></li>
                        <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-xs">ASTRO_STORE_ID</code></li>
                        <li><code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-xs">ASTRO_API_URL</code> (optional, defaults to production)</li>
                      </ul>
                    </li>
                    <li>Test the connection using the button below</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Connection Test */}
          <div className="space-y-3">
            <Button
              onClick={testConnection}
              disabled={isTestingConnection}
              className="bg-brand-blue hover:bg-blue-600"
              data-testid="button-test-astro-connection"
            >
              {isTestingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            {/* Connection Status */}
            {connectionResult && (
              <div className={`rounded-lg p-3 ${
                connectionResult.success 
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-start gap-2">
                  {connectionResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-500 mt-0.5" />
                  )}
                  <div className="text-sm">
                    <p className={`font-semibold ${
                      connectionResult.success 
                        ? 'text-green-800 dark:text-green-300'
                        : 'text-red-800 dark:text-red-300'
                    }`}>
                      {connectionResult.success ? 'Connected' : 'Connection Failed'}
                    </p>
                    <p className={
                      connectionResult.success 
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-red-700 dark:text-red-400'
                    }>
                      {connectionResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Features List */}
          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3">Features</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Automatic customer account creation and linking</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Purchase sync to Astro for loyalty points tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Frequent buyer program progress tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Customer loyalty dashboard and status display</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Linked Customers Card */}
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
                  className="border rounded-lg p-4 space-y-2"
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
                      <p className="text-gray-600 dark:text-gray-400">Loyalty Points</p>
                      <p className="font-semibold">{customer.loyaltyPoints || 0}</p>
                    </div>
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

// Brand Catalog Manager Component
function BrandCatalogManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Form schema that handles contextKeywords as comma-separated string for UI
  const formSchema = z.object({
    brand: z.string().min(1, "Brand is required"),
    productLine: z.string().optional(),
    abbreviation: z.string().min(1, "Abbreviation is required"),
    expansion: z.string().min(1, "Expansion is required"),
    evidence: z.string().min(1, "Evidence is required"),
    category: z.string().optional(),
    contextKeywordsString: z.string().optional(),
  });

  // Form with react-hook-form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      brand: "",
      productLine: "",
      abbreviation: "",
      expansion: "",
      evidence: "",
      category: "",
      contextKeywordsString: "",
    },
  });

  // Reset form when editing or adding
  useEffect(() => {
    if (editEntry) {
      form.reset({
        brand: editEntry.brand || "",
        productLine: editEntry.productLine || "",
        abbreviation: editEntry.abbreviation || "",
        expansion: editEntry.expansion || "",
        evidence: editEntry.evidence || "",
        category: editEntry.category || "",
        contextKeywordsString: editEntry.contextKeywords?.join(', ') || "",
      });
    } else if (isAddOpen) {
      form.reset({
        brand: "",
        productLine: "",
        abbreviation: "",
        expansion: "",
        evidence: "",
        category: "",
        contextKeywordsString: "",
      });
    }
  }, [editEntry, isAddOpen, form]);

  // Fetch catalog entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['/api/admin/brand-catalog'],
    queryFn: async () => {
      const res = await fetch('/api/admin/brand-catalog', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch catalog');
      return res.json();
    }
  });

  // Seed catalog mutation
  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/brand-catalog/seed', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to seed catalog');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Catalog seeded with validated brand data" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/brand-catalog'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to seed catalog", variant: "destructive" });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/brand-catalog/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete entry');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Entry deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/brand-catalog'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete entry", variant: "destructive" });
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/admin/brand-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create entry');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Entry created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/brand-catalog'] });
      setIsAddOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/admin/brand-catalog/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update entry');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Entry updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/brand-catalog'] });
      setEditEntry(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Form submission handler - transforms UI data to API schema
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Transform and normalize data for backend schema
    const data = {
      brand: values.brand.trim(),
      productLine: values.productLine?.trim() || null,
      abbreviation: values.abbreviation.trim(),
      expansion: values.expansion.trim(),
      evidence: values.evidence.trim(),
      category: values.category?.trim() || null,
      contextKeywords: values.contextKeywordsString
        ? values.contextKeywordsString.split(',').map(k => k.trim()).filter(Boolean)
        : [],
    };

    if (editEntry) {
      updateMutation.mutate({ id: editEntry.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <>
      {/* Add/Edit Dialog */}
      <Dialog open={isAddOpen || !!editEntry} onOpenChange={(open) => {
        if (!open) {
          setIsAddOpen(false);
          setEditEntry(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Catalog Entry' : 'Add Catalog Entry'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Freshpet" data-testid="input-brand" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="productLine"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Line</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Vital" data-testid="input-product-line" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="abbreviation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abbreviation *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Vit" data-testid="input-abbreviation" />
                      </FormControl>
                      <FormDescription>How it appears in product names</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expansion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expansion *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Vital" data-testid="input-expansion" />
                      </FormControl>
                      <FormDescription>Full form to expand to</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="evidence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evidence *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="URL or source confirming this expansion" data-testid="input-evidence" />
                    </FormControl>
                    <FormDescription>URL or source proving this abbreviation is correct</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Dog Food" data-testid="input-category" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contextKeywordsString"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Context Keywords</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., dog, food, fresh (comma-separated)" data-testid="input-context-keywords" />
                      </FormControl>
                      <FormDescription>Comma-separated keywords to match context</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddOpen(false);
                    setEditEntry(null);
                  }}
                  data-testid="button-cancel-form"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-form"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editEntry ? 'Update Entry' : 'Create Entry'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Brand Catalog ({entries.length} entries)
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Research-backed abbreviation expansions to prevent guesswork
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setIsAddOpen(true)}
              size="sm"
              className="bg-brand-blue hover:bg-blue-600"
              data-testid="button-add-catalog-entry"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </Button>
            <Button 
              onClick={() => seedMutation.mutate()}
              size="sm"
              variant="outline"
              className="bg-green-50 hover:bg-green-100"
              disabled={seedMutation.isPending}
              data-testid="button-seed-catalog"
            >
              <Database className="w-4 h-4 mr-2" />
              {seedMutation.isPending ? 'Seeding...' : 'Seed Catalog'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">Loading catalog...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No catalog entries yet</p>
            <p className="text-sm mt-1">Click "Seed Catalog" to populate with validated brand data</p>
            <p className="text-xs mt-2 max-w-md mx-auto">
              The brand catalog provides research-backed abbreviation expansions for brands like Freshpet, Fromm, Science Diet, and Nutrisource - no more guessing!
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {entries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((entry: any) => (
              <div key={entry.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="font-medium">
                        {entry.brand}
                      </Badge>
                      {entry.productLine && (
                        <Badge variant="secondary" className="text-xs">
                          {entry.productLine}
                        </Badge>
                      )}
                      {entry.category && (
                        <Badge variant="default" className="text-xs bg-blue-100 text-blue-800">
                          {formatCategory(entry.category)}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-semibold text-gray-700">Abbreviation:</span>{' '}
                        <span className="font-mono bg-yellow-100 px-1.5 py-0.5 rounded">{entry.abbreviation}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">Expansion:</span>{' '}
                        <span className="font-mono bg-green-100 px-1.5 py-0.5 rounded">{entry.expansion}</span>
                      </div>
                    </div>
                    {entry.evidence && (
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded border-l-2 border-blue-400">
                        <span className="font-semibold">Evidence:</span> {entry.evidence}
                      </div>
                    )}
                    {entry.contextKeywords && entry.contextKeywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.contextKeywords.map((keyword: string, idx: number) => (
                          <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditEntry(entry)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      data-testid={`button-edit-entry-${entry.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete entry "${entry.abbreviation}" → "${entry.expansion}"?`)) {
                          deleteMutation.mutate(entry.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-entry-${entry.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              ))}
            </div>
            
            {/* Pagination Controls */}
            {entries.length > itemsPerPage && (
              <div className="flex items-center justify-between pt-4 mt-4 border-t">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, entries.length)} of {entries.length} entries
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-sm font-medium">
                      Page {currentPage} of {Math.ceil(entries.length / itemsPerPage)}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(entries.length / itemsPerPage), p + 1))}
                    disabled={currentPage >= Math.ceil(entries.length / itemsPerPage)}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      </Card>
    </>
  );
}

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const typedUser = user as User;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [isAddSupplyOpen, setIsAddSupplyOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [editingSupply, setEditingSupply] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [isAddGroomerOpen, setIsAddGroomerOpen] = useState(false);
  const [editingGroomer, setEditingGroomer] = useState<any>(null);
  const [groomerToDelete, setGroomerToDelete] = useState<any>(null);
  const [isAddBlockedDayOpen, setIsAddBlockedDayOpen] = useState(false);
  const [blockedDayFormData, setBlockedDayFormData] = useState({
    groomerId: '',
    dates: [] as Date[],
    reason: 'sick',
    notes: ''
  });
  const [blockedDaysGroomerFilter, setBlockedDaysGroomerFilter] = useState<string>('all');
  const [isAddBoardingOpen, setIsAddBoardingOpen] = useState(false);
  const [showApprovedAppointments, setShowApprovedAppointments] = useState(false);
  const [showDeniedAppointments, setShowDeniedAppointments] = useState(false);
  const [filterByHere, setFilterByHere] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [isCategorizing, setIsCategorizing] = useState(false);
  
  // Multi-pet editing state
  const [editPets, setEditPets] = useState<any[]>([]);
  const [editPricingMode, setEditPricingMode] = useState<'individual' | 'override'>('individual');
  const [editTotalPriceOverride, setEditTotalPriceOverride] = useState('');
  
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
  const [showCancelledOrders, setShowCancelledOrders] = useState(false);
  
  // Search state for orders and appointments
  const [search, setSearch] = useState('');
  
  // Pagination and search for supplies
  const [supplySearchQuery, setSupplySearchQuery] = useState('');
  const [suppliesPage, setSuppliesPage] = useState(0);
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
  
  const showDeleteConfirmation = (title: string, description: string, itemName: string, onConfirm: () => void) => {
    setDeleteConfirmation({
      isOpen: true,
      title,
      description,
      itemName,
      onConfirm
    });
  };
  
  const closeDeleteConfirmation = () => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }));
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
    queryKey: ["/api/pets", { 
      page: petsPage, 
      limit: PETS_PER_PAGE,
      search: petSearchQuery 
    }],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const pets = (petsData as any)?.pets || [];
  const petsTotalPages = (petsData as any)?.pagination?.totalPages || 0;
  const petsTotal = (petsData as any)?.pagination?.total || 0;

  const { data: suppliesData } = useQuery<any>({
    queryKey: ["/api/supplies", { 
      page: suppliesPage, 
      limit: SUPPLIES_PER_PAGE,
      search: supplySearchQuery 
    }],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });
  
  const supplies = suppliesData?.items || [];
  const suppliesTotalPages = suppliesData?.totalPages || 0;
  const suppliesTotal = suppliesData?.total || 0;

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: unapprovedAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/appointments/unapproved"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: groomers = [] } = useQuery<any[]>({
    queryKey: ["/api/groomers"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: groomingSettings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/grooming-settings"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: weeklyLimits = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/weekly-limits"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: specialDates = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/special-dates"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });


  const groomersQuery = useQuery<any[]>({
    queryKey: ["/api/admin/groomers"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  // Fetch groomer blocked days (sick days, vacation, etc.)
  const { data: groomerBlockedDays = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/groomer-blocked-days"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
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
      
      const nameMatch = name.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      
      return nameMatch || phoneMatch;
    }).slice(0, 10);
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
    const endTime = '12:00'; // Hard-coded 12:00 PM (noon) limit
    
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
    const dateString = date.toISOString().split('T')[0];
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
      toast({
        title: "Success",
        description: "Order deleted successfully",
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
    onSuccess: async () => {
      toast({
        title: "Appointment Updated",
        description: "Appointment details have been updated successfully.",
      });
      // Invalidate all appointment-related queries including contact-specific ones
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      await queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey.some(k => k === "appointments")
      });
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
      // Force immediate refetch of appointments data
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
        description: data.message || "All 'Paid' statuses have been reset.",
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


  // Clamp approved appointments pagination when list shrinks
  useEffect(() => {
    if (!appointments) return;
    
    const approvedAppointments = (appointments as any[]).filter(
      (a: any) => a.status === 'confirmed' || a.status === 'completed'
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
      await apiRequest("POST", "/api/appointments", appointmentData);
    },
    onSuccess: () => {
      toast({
        title: "Appointment Created",
        description: "The appointment has been created successfully.",
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
    },
    onError: (error: any) => {
      // Extract error message from apiRequest error format: "400: {json}"
      let errorText = '';
      if (error?.message) {
        // Parse the error message which is in format "statusCode: jsonText"
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
        // Show centered modal for capacity errors
        setShowAdminCapacityDialog(true);
        return;
      }
      
      // For other errors, show toast
      toast({
        title: "Error",
        description: "Failed to create appointment.",
        variant: "destructive",
      });
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

    const SERVICES = [
      { id: 'grooming-full', name: 'Full Grooming', price: 35 },
      { id: 'grooming-bath', name: 'Bath Only', price: 20 },
    ];

    // Calculate total price from all pets
    const totalPrice = bookingPets.reduce((sum, pet) => {
      const serviceData = SERVICES.find(s => s.id === pet.serviceType);
      return sum + (serviceData?.price || 0);
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

  // Groomer Mutations
  const createGroomerMutation = useMutation({
    mutationFn: async (groomerData: any) => {
      await apiRequest("POST", "/api/admin/groomers", groomerData);
    },
    onSuccess: () => {
      toast({
        title: "Groomer Added",
        description: "Groomer has been added successfully.",
      });
      setIsAddGroomerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groomers"] });
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
        description: "Failed to add groomer.",
        variant: "destructive",
      });
    },
  });

  const updateGroomerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PUT", `/api/admin/groomers/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Groomer Updated",
        description: "Groomer has been updated successfully.",
      });
      setEditingGroomer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groomers"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update groomer.",
        variant: "destructive",
      });
    },
  });

  const deleteGroomerMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/groomers/${id}`);
    },
    onSuccess: async () => {
      toast({
        title: "Groomer Deleted",
        description: "Groomer has been deleted successfully.",
      });
      setGroomerToDelete(null);
      await queryClient.refetchQueries({ queryKey: ["/api/admin/groomers"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete groomer.",
        variant: "destructive",
      });
    },
  });

  const toggleGroomerActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PUT", `/api/admin/groomers/${id}`, { isActive });
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "Groomer status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groomers"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update groomer status.",
        variant: "destructive",
      });
    },
  });

  // Groomer blocked days mutations
  const createBlockedDayMutation = useMutation({
    mutationFn: async (blockedDayData: { groomerId: number; dates: string[]; reason: string; notes?: string }) => {
      for (const date of blockedDayData.dates) {
        await apiRequest("POST", "/api/admin/groomer-blocked-days", {
          groomerId: blockedDayData.groomerId,
          date,
          reason: blockedDayData.reason,
          notes: blockedDayData.notes
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "Blocked Days Added",
        description: `${blockedDayFormData.dates.length} blocked day(s) added successfully.`,
      });
      setIsAddBlockedDayOpen(false);
      setBlockedDayFormData({ groomerId: '', dates: [], reason: 'sick', notes: '' });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groomer-blocked-days"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add blocked days.",
        variant: "destructive",
      });
    },
  });

  const deleteBlockedDayMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/groomer-blocked-days/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Blocked Day Removed",
        description: "Groomer blocked day has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groomer-blocked-days"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove blocked day.",
        variant: "destructive",
      });
    },
  });

  const pendingAppointments = (appointments as any[]).filter((a: any) => a.status === 'scheduled').length;
  const pendingOrders = (orders as any[]).filter((o: any) => o.status === 'pending').length;
  
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

  // Calculate customers paid - filter appointments with isPaid = true
  const appointmentsPaid = (appointments as any[]).filter((a: any) => 
    (a.status === 'confirmed' || a.status === 'completed') && a.isPaid === true
  );
  const customersPaid = appointmentsPaid.length;

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

  if (!typedUser?.isAdmin && !typedUser?.isGroomer) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Administrator or Groomer privileges required</p>
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
        if (a.status !== 'confirmed' && a.status !== 'completed') return false;
        
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
          onClick={safeGoBack}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Header */}
      <div className="px-6 pt-16 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
                queryClient.invalidateQueries({ queryKey: ["/api/supplies"] });
                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col items-center justify-center h-full">
            <PawPrint className="w-8 h-8 mb-3 text-brand-blue" />
            <div className="text-2xl font-bold mb-1">{petsTotal}</div>
            <div className="text-sm text-gray-500">Total Pets</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col items-center justify-center h-full">
            <Package className="w-8 h-8 mb-3 text-brand-orange" />
            <div className="text-2xl font-bold mb-1">{suppliesTotal}</div>
            <div className="text-sm text-gray-500">Total Supplies</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col items-center justify-center h-full">
            <ShoppingBag className="w-8 h-8 mb-3 text-brand-red" />
            <div className="text-2xl font-bold mb-1">{pendingOrders}</div>
            <div className="text-sm text-gray-500">Pending Orders</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col items-center justify-center h-full">
            <CalendarIcon className="w-8 h-8 mb-3 text-green-600" />
            <div className="text-2xl font-bold mb-1">{pendingAppointments}</div>
            <div className="text-sm text-gray-500">Pending Appts</div>
          </CardContent>
        </Card>
        <Card className={`min-h-[120px] ${filterByHere ? 'ring-2 ring-blue-600' : ''}`}>
          <CardContent className="p-6 text-center flex flex-col items-center justify-center h-full relative">
            <div 
              className="cursor-pointer flex flex-col items-center justify-center w-full"
              onClick={() => {
                setFilterByHere(!filterByHere);
                if (!filterByHere) {
                  setShowApprovedAppointments(true);
                }
              }}
              data-testid="card-customers-here"
            >
              <Users className="w-8 h-8 mb-3 text-blue-600" />
              <div className="text-2xl font-bold mb-1" data-testid="dashboard-customers-here">{customersHere}</div>
              <div className="text-sm text-gray-500 mb-2">Customers Here</div>
            </div>
            {typedUser?.isAdmin && customersHere > 0 && (
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
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col items-center justify-center h-full relative">
            <DollarSign className="w-8 h-8 mb-3 text-green-600" />
            <div className="text-2xl font-bold mb-1" data-testid="dashboard-customers-paid">{customersPaid}</div>
            <div className="text-sm text-gray-500 mb-2">Customers Paid</div>
            {typedUser?.isAdmin && customersPaid > 0 && (
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
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex gap-1 h-auto p-1 min-w-full lg:min-w-0">
            <TabsTrigger value="orders" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              <span className="hidden lg:inline">Orders & Appointments</span>
              <span className="lg:hidden">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Calendar
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Contacts
            </TabsTrigger>
            {typedUser?.isAdmin && (
              <TabsTrigger value="grooming" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Grooming Settings</span>
                <span className="lg:hidden">Grooming</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="groomers" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Groomers
            </TabsTrigger>
            {typedUser?.isAdmin && (
              <TabsTrigger value="boarding" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                Boarding
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="schedule" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                Schedule
              </TabsTrigger>
            )}
            <TabsTrigger value="inventory" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Inventory
            </TabsTrigger>
            {typedUser?.isAdmin && (
              <TabsTrigger value="product-images" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Product Images</span>
                <span className="lg:hidden">Images</span>
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="brand-catalog" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Brand Catalog</span>
                <span className="lg:hidden">Brands</span>
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="users" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                Users
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="order-photos" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Order Photos</span>
                <span className="lg:hidden">Photos</span>
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="database" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                Database
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="astro" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Astro Loyalty</span>
                <span className="lg:hidden">Astro</span>
              </TabsTrigger>
            )}
            {typedUser?.isAdmin && (
              <TabsTrigger value="email-center" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Email Center</span>
                <span className="lg:hidden">Email</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="inventory" className="space-y-6">
          {/* Export Inventory Buttons */}
          {typedUser?.isAdmin && (
            <div className="flex justify-end gap-2">
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

          {/* Pets Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PawPrint className="w-5 h-5" />
                  Pets ({petsTotal}{petSearchQuery.trim() ? ` found` : ` total`})
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
                      Add Pet
                    </Button>
                  </div>
                )}
                {typedUser?.isAdmin && (
                  <div className="hidden sm:block">
                    <Dialog open={isAddPetOpen} onOpenChange={setIsAddPetOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-brand-blue hover:bg-blue-600">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Pet
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add New Pet</DialogTitle>
                          <DialogDescription>Add a new pet to your inventory.</DialogDescription>
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
                  <div key={pet.id} className="p-3 border rounded-lg">
                    <div className="flex gap-3">
                      {/* Pet Thumbnail */}
                      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                        {pet.imageUrl ? (
                          <img 
                            src={pet.imageUrl} 
                            alt={pet.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                            data-testid={`img-pet-thumbnail-${pet.id}`}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center ${pet.imageUrl ? 'hidden' : ''}`}>
                          <PawPrint className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                      {/* Name gets full remaining width */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm leading-snug" title={pet.name}>{pet.name}</h3>
                        <p className="text-xs text-gray-600 mt-0.5">{pet.species} • {pet.breed} • ${pet.price}</p>
                      </div>
                    </div>
                    {/* Actions on separate row */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <Badge variant={pet.isAvailable ? "default" : "secondary"} className="text-xs">
                        {pet.isAvailable ? "Available" : "Sold"}
                      </Badge>
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
                            onClick={() => deletePetMutation.mutate(pet.id)}
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
          </Card>

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
              {/* Search bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search supplies by name, brand, or category..."
                    value={supplySearchQuery}
                    onChange={(e) => {
                      setSupplySearchQuery(e.target.value);
                      setSuppliesPage(0); // Reset to first page on search
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                    data-testid="input-supply-search"
                  />
                  {supplySearchQuery && (
                    <button
                      onClick={() => {
                        setSupplySearchQuery('');
                        setSuppliesPage(0);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      data-testid="button-clear-supply-search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {(supplies as any[]).map((supply: any) => (
                  <div key={supply.id} className="p-3 border rounded-lg">
                    <div className="flex gap-3">
                      {/* Supply Thumbnail - use imageUrl or first imageUrls entry */}
                      <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                        {(supply.imageUrl || supply.imageUrls?.[0]) ? (
                          <img 
                            src={supply.imageUrl || supply.imageUrls?.[0]} 
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
          {/* Book Appointment Button */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Orders & Appointments</h2>
            <Button 
              onClick={() => setIsBookAppointmentOpen(true)}
              className="bg-brand-blue hover:bg-blue-700 text-white"
              data-testid="button-book-appointment-admin"
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              Book Appointment
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search Orders & Appointments by customer name, phone, or pet name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-10 border-gray-300 rounded-xl"
              data-testid="input-search"
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
                          className={`flex flex-col sm:flex-row sm:items-start sm:justify-between p-3 border rounded-lg gap-2 ${
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
                              <p>Owner: {currentAppointment.ownerFirstName} {currentAppointment.ownerLastName}</p>
                              <p>Phone: {currentAppointment.ownerPhoneNumber}</p>
                              <p className="text-gray-500">{parseLocalDate(currentAppointment.appointmentDate).toLocaleDateString()} at {currentAppointment.appointmentTime}</p>
                            </div>
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
                            {currentAppointment.price && (
                              <p className="text-xs text-green-700 font-medium mt-1" data-testid={`appointment-price-${currentAppointment.id}`}>
                                Price: ${currentAppointment.price}
                              </p>
                            )}
                            {currentAppointment.groomerId && (
                              <p className="text-xs text-blue-700 font-medium mt-1" data-testid={`appointment-groomer-${currentAppointment.id}`}>
                                Groomer: {(() => {
                                  const groomer = groomers.find((g: any) => 
                                    g.id === currentAppointment.groomerId || 
                                    g.id === parseInt(currentAppointment.groomerId as any)
                                  );
                                  return groomer?.name || 'Unknown';
                                })()}
                              </p>
                            )}
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
                        {currentAppointment.price && (
                          <p className="text-xs text-green-700 font-medium mt-1">
                            Price: ${currentAppointment.price}
                          </p>
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
                              {currentAppointment.price && (
                                <p className="text-xs text-green-700 font-medium mt-1">
                                  Price: ${currentAppointment.price}
                                </p>
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

          {/* Pending Orders Section - Always Visible */}
          {(() => {
            const pendingOrders = (filteredOrders as any[]).filter((o: any) => o.status === 'pending');
            
            return pendingOrders.length > 0 ? (
              <Card className="border-2 border-yellow-200 bg-yellow-50/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-700">
                    <ShoppingBag className="w-5 h-5" />
                    Pending Orders ({pendingOrders.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {pendingOrders.map((order: any) => (
                      <OrderDetailsCard 
                        key={order.id} 
                        order={order} 
                        onStatusUpdate={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                        onDelete={(orderId) => deleteOrderMutation.mutate(orderId)}
                        isHighlighted={matchesSearch(order, 'order')}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null;
          })()}

          {/* In Progress Orders Section - Collapsible */}
          {(() => {
            const inProgressOrders = (filteredOrders as any[]).filter((o: any) => o.status === 'in_progress');
            
            if (inProgressOrders.length === 0) return null;

            return (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-between border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                  onClick={() => setShowInProgressOrders(!showInProgressOrders)}
                  data-testid="toggle-in-progress-orders"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5" />
                    In Progress Orders ({inProgressOrders.length})
                  </span>
                  {showInProgressOrders ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </Button>

                {showInProgressOrders && (
                  <Card className="border-2 border-blue-200 bg-blue-50/30">
                    <CardContent className="pt-3 pb-3">
                    {(() => {
                      const totalPages = Math.ceil(inProgressOrders.length / ORDERS_PER_PAGE);
                      const startIndex = inProgressOrdersPage * ORDERS_PER_PAGE;
                      const paginatedOrders = inProgressOrders.slice(startIndex, startIndex + ORDERS_PER_PAGE);
                      const pageIndicators = getPageIndicators(inProgressOrdersPage, totalPages);

                      const handleTouchStart = (e: React.TouchEvent) => {
                        setInProgressOrdersTouchStart(e.targetTouches[0].clientX);
                      };

                      const handleTouchMove = (e: React.TouchEvent) => {
                        setInProgressOrdersTouchEnd(e.targetTouches[0].clientX);
                      };

                      const handleTouchEnd = () => {
                        if (!inProgressOrdersTouchStart || !inProgressOrdersTouchEnd) return;
                        const distance = inProgressOrdersTouchStart - inProgressOrdersTouchEnd;
                        const minSwipeDistance = 50;
                        
                        if (distance > minSwipeDistance && inProgressOrdersPage < totalPages - 1) {
                          setInProgressOrdersPage(prev => prev + 1);
                        }
                        if (distance < -minSwipeDistance && inProgressOrdersPage > 0) {
                          setInProgressOrdersPage(prev => prev - 1);
                        }
                        
                        setInProgressOrdersTouchStart(0);
                        setInProgressOrdersTouchEnd(0);
                      };

                      return (
                        <>
                          <div 
                            className="space-y-2"
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            {paginatedOrders.map((order: any) => (
                              <OrderDetailsCard 
                                key={order.id} 
                                order={order} 
                                onStatusUpdate={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                                onDelete={(orderId) => deleteOrderMutation.mutate(orderId)}
                                isHighlighted={matchesSearch(order, 'order')}
                              />
                            ))}
                          </div>
                          
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-blue-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setInProgressOrdersPage(prev => Math.max(0, prev - 1))}
                                disabled={inProgressOrdersPage === 0}
                                className="text-blue-700 hover:text-blue-900"
                                data-testid="button-in-progress-orders-prev"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </Button>
                              
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-blue-700">
                                  Page {inProgressOrdersPage + 1} of {totalPages}
                                </span>
                                <div className="flex gap-2">
                                  {pageIndicators.map((idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setInProgressOrdersPage(idx)}
                                      className={`w-2 h-2 rounded-full transition-all ${
                                        idx === inProgressOrdersPage 
                                          ? 'bg-blue-700 w-6' 
                                          : 'bg-blue-300 hover:bg-blue-500'
                                      }`}
                                      aria-label={`Page ${idx + 1}`}
                                      data-testid={`button-in-progress-orders-page-${idx}`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setInProgressOrdersPage(prev => Math.min(totalPages - 1, prev + 1))}
                                disabled={inProgressOrdersPage === totalPages - 1}
                                className="text-blue-700 hover:text-blue-900"
                                data-testid="button-in-progress-orders-next"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </Button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Ready Orders Section - Collapsible */}
          {(() => {
            const readyOrders = (filteredOrders as any[]).filter((o: any) => o.status === 'ready');
            
            if (readyOrders.length === 0) return null;

            return (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-between border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700"
                  onClick={() => setShowReadyOrders(!showReadyOrders)}
                  data-testid="toggle-ready-orders"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5" />
                    Ready Orders ({readyOrders.length})
                  </span>
                  {showReadyOrders ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </Button>

                {showReadyOrders && (
                  <Card className="border-2 border-purple-200 bg-purple-50/30">
                  <CardContent className="pt-3 pb-3">
                    {(() => {
                      const totalPages = Math.ceil(readyOrders.length / ORDERS_PER_PAGE);
                      const startIndex = readyOrdersPage * ORDERS_PER_PAGE;
                      const paginatedOrders = readyOrders.slice(startIndex, startIndex + ORDERS_PER_PAGE);
                      const pageIndicators = getPageIndicators(readyOrdersPage, totalPages);

                      const handleTouchStart = (e: React.TouchEvent) => {
                        setReadyOrdersTouchStart(e.targetTouches[0].clientX);
                      };

                      const handleTouchMove = (e: React.TouchEvent) => {
                        setReadyOrdersTouchEnd(e.targetTouches[0].clientX);
                      };

                      const handleTouchEnd = () => {
                        if (!readyOrdersTouchStart || !readyOrdersTouchEnd) return;
                        const distance = readyOrdersTouchStart - readyOrdersTouchEnd;
                        const minSwipeDistance = 50;
                        
                        if (distance > minSwipeDistance && readyOrdersPage < totalPages - 1) {
                          setReadyOrdersPage(prev => prev + 1);
                        }
                        if (distance < -minSwipeDistance && readyOrdersPage > 0) {
                          setReadyOrdersPage(prev => prev - 1);
                        }
                        
                        setReadyOrdersTouchStart(0);
                        setReadyOrdersTouchEnd(0);
                      };

                      return (
                        <>
                          <div 
                            className="space-y-2"
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            {paginatedOrders.map((order: any) => (
                              <OrderDetailsCard 
                                key={order.id} 
                                order={order} 
                                onStatusUpdate={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                                onDelete={(orderId) => deleteOrderMutation.mutate(orderId)}
                                isHighlighted={matchesSearch(order, 'order')}
                              />
                            ))}
                          </div>
                          
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-purple-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReadyOrdersPage(prev => Math.max(0, prev - 1))}
                                disabled={readyOrdersPage === 0}
                                className="text-purple-700 hover:text-purple-900"
                                data-testid="button-ready-orders-prev"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </Button>
                              
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-purple-700">
                                  Page {readyOrdersPage + 1} of {totalPages}
                                </span>
                                <div className="flex gap-2">
                                  {pageIndicators.map((idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setReadyOrdersPage(idx)}
                                      className={`w-2 h-2 rounded-full transition-all ${
                                        idx === readyOrdersPage 
                                          ? 'bg-purple-700 w-6' 
                                          : 'bg-purple-300 hover:bg-purple-500'
                                      }`}
                                      aria-label={`Page ${idx + 1}`}
                                      data-testid={`button-ready-orders-page-${idx}`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReadyOrdersPage(prev => Math.min(totalPages - 1, prev + 1))}
                                disabled={readyOrdersPage === totalPages - 1}
                                className="text-purple-700 hover:text-purple-900"
                                data-testid="button-ready-orders-next"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </Button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Completed Orders Section - Collapsible */}
          {(() => {
            const completedOrders = (filteredOrders as any[]).filter((o: any) => o.status === 'completed');
            
            if (completedOrders.length === 0) return null;

            return (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-between border-2 border-green-200 bg-green-50 hover:bg-green-100 text-green-700"
                  onClick={() => setShowCompletedOrders(!showCompletedOrders)}
                  data-testid="toggle-completed-orders"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5" />
                    Completed Orders ({completedOrders.length})
                  </span>
                  {showCompletedOrders ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </Button>

                {showCompletedOrders && (
                  <Card className="border-2 border-green-200 bg-green-50/30">
                  <CardContent className="pt-3 pb-3">
                    {(() => {
                      const totalPages = Math.ceil(completedOrders.length / ORDERS_PER_PAGE);
                      const startIndex = completedOrdersPage * ORDERS_PER_PAGE;
                      const paginatedOrders = completedOrders.slice(startIndex, startIndex + ORDERS_PER_PAGE);
                      const pageIndicators = getPageIndicators(completedOrdersPage, totalPages);

                      const handleTouchStart = (e: React.TouchEvent) => {
                        setCompletedOrdersTouchStart(e.targetTouches[0].clientX);
                      };

                      const handleTouchMove = (e: React.TouchEvent) => {
                        setCompletedOrdersTouchEnd(e.targetTouches[0].clientX);
                      };

                      const handleTouchEnd = () => {
                        if (!completedOrdersTouchStart || !completedOrdersTouchEnd) return;
                        const distance = completedOrdersTouchStart - completedOrdersTouchEnd;
                        const minSwipeDistance = 50;
                        
                        if (distance > minSwipeDistance && completedOrdersPage < totalPages - 1) {
                          setCompletedOrdersPage(prev => prev + 1);
                        }
                        if (distance < -minSwipeDistance && completedOrdersPage > 0) {
                          setCompletedOrdersPage(prev => prev - 1);
                        }
                        
                        setCompletedOrdersTouchStart(0);
                        setCompletedOrdersTouchEnd(0);
                      };

                      return (
                        <>
                          <div 
                            className="space-y-2"
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            {paginatedOrders.map((order: any) => (
                              <OrderDetailsCard 
                                key={order.id} 
                                order={order} 
                                onStatusUpdate={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                                onDelete={(orderId) => deleteOrderMutation.mutate(orderId)}
                                isHighlighted={matchesSearch(order, 'order')}
                              />
                            ))}
                          </div>
                          
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-green-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCompletedOrdersPage(prev => Math.max(0, prev - 1))}
                                disabled={completedOrdersPage === 0}
                                className="text-green-700 hover:text-green-900"
                                data-testid="button-completed-orders-prev"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </Button>
                              
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-green-700">
                                  Page {completedOrdersPage + 1} of {totalPages}
                                </span>
                                <div className="flex gap-2">
                                  {pageIndicators.map((idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setCompletedOrdersPage(idx)}
                                      className={`w-2 h-2 rounded-full transition-all ${
                                        idx === completedOrdersPage 
                                          ? 'bg-green-700 w-6' 
                                          : 'bg-green-300 hover:bg-green-500'
                                      }`}
                                      aria-label={`Page ${idx + 1}`}
                                      data-testid={`button-completed-orders-page-${idx}`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCompletedOrdersPage(prev => Math.min(totalPages - 1, prev + 1))}
                                disabled={completedOrdersPage === totalPages - 1}
                                className="text-green-700 hover:text-green-900"
                                data-testid="button-completed-orders-next"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </Button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* Cancelled Orders Section - Collapsible */}
          {(() => {
            const cancelledOrders = (filteredOrders as any[]).filter((o: any) => o.status === 'cancelled');
            
            if (cancelledOrders.length === 0) return null;

            return (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-between border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700"
                  onClick={() => setShowCancelledOrders(!showCancelledOrders)}
                  data-testid="toggle-cancelled-orders"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5" />
                    Cancelled Orders ({cancelledOrders.length})
                  </span>
                  {showCancelledOrders ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </Button>

                {showCancelledOrders && (
                  <Card className="border-2 border-red-200 bg-red-50/30">
                  <CardContent className="pt-3 pb-3">
                    {(() => {
                      const totalPages = Math.ceil(cancelledOrders.length / ORDERS_PER_PAGE);
                      const startIndex = cancelledOrdersPage * ORDERS_PER_PAGE;
                      const paginatedOrders = cancelledOrders.slice(startIndex, startIndex + ORDERS_PER_PAGE);
                      const pageIndicators = getPageIndicators(cancelledOrdersPage, totalPages);

                      const handleTouchStart = (e: React.TouchEvent) => {
                        setCancelledOrdersTouchStart(e.targetTouches[0].clientX);
                      };

                      const handleTouchMove = (e: React.TouchEvent) => {
                        setCancelledOrdersTouchEnd(e.targetTouches[0].clientX);
                      };

                      const handleTouchEnd = () => {
                        if (!cancelledOrdersTouchStart || !cancelledOrdersTouchEnd) return;
                        const distance = cancelledOrdersTouchStart - cancelledOrdersTouchEnd;
                        const minSwipeDistance = 50;
                        
                        if (distance > minSwipeDistance && cancelledOrdersPage < totalPages - 1) {
                          setCancelledOrdersPage(prev => prev + 1);
                        }
                        if (distance < -minSwipeDistance && cancelledOrdersPage > 0) {
                          setCancelledOrdersPage(prev => prev - 1);
                        }
                        
                        setCancelledOrdersTouchStart(0);
                        setCancelledOrdersTouchEnd(0);
                      };

                      return (
                        <>
                          <div 
                            className="space-y-2"
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            {paginatedOrders.map((order: any) => (
                              <OrderDetailsCard 
                                key={order.id} 
                                order={order} 
                                onStatusUpdate={(status) => updateOrderMutation.mutate({ id: order.id, status })}
                                onDelete={(orderId) => deleteOrderMutation.mutate(orderId)}
                                isHighlighted={matchesSearch(order, 'order')}
                              />
                            ))}
                          </div>
                          
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-red-200">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCancelledOrdersPage(prev => Math.max(0, prev - 1))}
                                disabled={cancelledOrdersPage === 0}
                                className="text-red-700 hover:text-red-900"
                                data-testid="button-cancelled-orders-prev"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </Button>
                              
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-red-700">
                                  Page {cancelledOrdersPage + 1} of {totalPages}
                                </span>
                                <div className="flex gap-2">
                                  {pageIndicators.map((idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setCancelledOrdersPage(idx)}
                                      className={`w-2 h-2 rounded-full transition-all ${
                                        idx === cancelledOrdersPage 
                                          ? 'bg-red-700 w-6' 
                                          : 'bg-red-300 hover:bg-red-500'
                                      }`}
                                      aria-label={`Page ${idx + 1}`}
                                      data-testid={`button-cancelled-orders-page-${idx}`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCancelledOrdersPage(prev => Math.min(totalPages - 1, prev + 1))}
                                disabled={cancelledOrdersPage === totalPages - 1}
                                className="text-red-700 hover:text-red-900"
                                data-testid="button-cancelled-orders-next"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </Button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Management ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((userItem: any) => (
                  <Card key={userItem.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{userItem.firstName} {userItem.lastName}</h3>
                          <p className="text-sm text-gray-600">{userItem.email}</p>
                          <p className="text-xs text-gray-500">
                            Joined: {new Date(userItem.createdAt).toLocaleDateString()}
                          </p>
                          <div className="flex gap-2 mt-2">
                            {userItem.isAdmin && (
                              <Badge variant="default" className="text-xs">Admin</Badge>
                            )}
                            {userItem.isGroomer && (
                              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">Groomer</Badge>
                            )}
                            {!userItem.isAdmin && !userItem.isGroomer && (
                              <Badge variant="outline" className="text-xs">Customer</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">Admin</span>
                            <Switch
                              checked={userItem.isAdmin}
                              onCheckedChange={(checked) => {
                                updateAdminMutation.mutate({
                                  userId: userItem.id,
                                  isAdmin: checked
                                });
                              }}
                              disabled={updateAdminMutation.isPending}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium">Groomer</span>
                            <Switch
                              checked={userItem.isGroomer}
                              onCheckedChange={(checked) => {
                                updateUserGroomerRoleMutation.mutate({
                                  userId: userItem.id,
                                  isGroomer: checked
                                });
                              }}
                              disabled={updateUserGroomerRoleMutation.isPending}
                            />
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full mt-2"
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
        </TabsContent>

        <TabsContent value="calendar" className="space-y-6">
          {/* Appointment Calendar */}
          <AppointmentCalendar appointments={appointments} />
        </TabsContent>

        <TabsContent value="contacts" className="space-y-6">
          <ContactsManager />
        </TabsContent>

        <TabsContent value="product-images" className="space-y-6">
          <ProductImageManager />
        </TabsContent>

        <TabsContent value="brand-catalog" className="space-y-6">
          <BrandCatalogManager />
        </TabsContent>

        <TabsContent value="order-photos" className="space-y-6">
          <OrderPhotoUploadManager />
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
                    queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
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

        <TabsContent value="grooming">
          <Card>
            <CardHeader>
              <CardTitle>Grooming Appointment Settings</CardTitle>
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

        <TabsContent value="groomers">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Groomers ({groomersQuery.data?.length || 0})
                </CardTitle>
                {typedUser?.isAdmin && (
                  <Button 
                    onClick={() => setIsAddGroomerOpen(true)}
                    className="w-full sm:w-auto bg-brand-blue hover:bg-blue-600"
                    data-testid="button-add-groomer"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add New Groomer
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {groomersQuery.isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading groomers...</p>
                </div>
              ) : groomersQuery.data?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No groomers found</p>
                  <p className="text-sm mt-1">Click "Add New Groomer" to create one</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groomersQuery.data?.map((groomer: any) => (
                    <Card key={groomer.id} className="border shadow-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                              {groomer.name}
                              <Badge variant={groomer.isActive ? "default" : "secondary"}>
                                {groomer.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </CardTitle>
                            {groomer.specialties && (
                              <p className="text-sm text-gray-600 mt-1">{groomer.specialties}</p>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2 text-sm">
                          {groomer.email && (
                            <div className="flex items-center gap-2 text-gray-600">
                              <Mail className="w-4 h-4" />
                              <span>{groomer.email}</span>
                            </div>
                          )}
                          {groomer.phone && (
                            <div className="flex items-center gap-2 text-gray-600">
                              <Phone className="w-4 h-4" />
                              <span>{groomer.phone}</span>
                            </div>
                          )}
                        </div>
                        {typedUser?.isAdmin && (
                          <div className="flex flex-wrap gap-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-w-[80px]"
                              onClick={() => setEditingGroomer(groomer)}
                              data-testid={`button-edit-groomer-${groomer.id}`}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-w-[100px]"
                              onClick={() => toggleGroomerActiveMutation.mutate({ 
                                id: groomer.id, 
                                isActive: !groomer.isActive 
                              })}
                              disabled={toggleGroomerActiveMutation.isPending}
                              data-testid={`button-toggle-groomer-${groomer.id}`}
                            >
                              {groomer.isActive ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                              {groomer.isActive ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="min-w-[40px]"
                              onClick={() => setGroomerToDelete(groomer)}
                              data-testid={`button-delete-groomer-${groomer.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Groomer Blocked Days Management */}
          {typedUser?.isAdmin && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarX2 className="w-5 h-5" />
                  Blocked Days (Sick/Vacation)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {groomersQuery.data?.filter((g: any) => g.isActive).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarX2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No active groomers found</p>
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="space-y-2">
                    {groomersQuery.data?.filter((g: any) => g.isActive).map((groomer: any) => {
                      const groomerBlockedList = groomerBlockedDays.filter((bd: any) => bd.groomerId === groomer.id);
                      const blockedDates = groomerBlockedList.map((bd: any) => new Date(bd.date + 'T00:00:00'));
                      
                      return (
                        <AccordionItem key={groomer.id} value={`groomer-${groomer.id}`} className="border rounded-lg px-4">
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                                <User className="w-5 h-5 text-orange-600" />
                              </div>
                              <div className="text-left">
                                <p className="font-medium">{groomer.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {groomerBlockedList.length} blocked day{groomerBlockedList.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-4 pb-2">
                              <div className="flex justify-center mb-4">
                                <Calendar
                                  mode="multiple"
                                  selected={blockedDates}
                                  className="rounded-md border"
                                  modifiers={{
                                    blocked: blockedDates
                                  }}
                                  modifiersStyles={{
                                    blocked: { backgroundColor: '#ef4444', color: 'white', borderRadius: '50%' }
                                  }}
                                  disabled
                                />
                              </div>
                              {groomerBlockedList.length > 0 && (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {groomerBlockedList.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((bd: any) => (
                                    <div key={bd.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm">
                                          {new Date(bd.date + 'T00:00:00').toLocaleDateString('en-US', { 
                                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                          })}
                                        </span>
                                        <Badge variant={bd.reason === 'sick' ? 'destructive' : bd.reason === 'vacation' ? 'default' : 'secondary'} className="text-xs">
                                          {bd.reason}
                                        </Badge>
                                        {bd.notes && <span className="text-xs text-muted-foreground">({bd.notes})</span>}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteBlockedDayMutation.mutate(bd.id)}
                                        disabled={deleteBlockedDayMutation.isPending}
                                      >
                                        <Trash2 className="w-3 h-3 text-red-500" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="mt-4 text-center">
                                <Button 
                                  onClick={() => {
                                    setBlockedDayFormData({ ...blockedDayFormData, groomerId: groomer.id.toString() });
                                    setIsAddBlockedDayOpen(true);
                                  }}
                                  className="bg-orange-600 hover:bg-orange-700"
                                  size="sm"
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Add Blocked Days
                                </Button>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          )}
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
          <GroomingSchedule />
        </TabsContent>

        <TabsContent value="astro" className="space-y-6">
          <AstroLoyaltyManager />
        </TabsContent>

        <TabsContent value="email-center" className="space-y-6">
          <EmailCenter />
        </TabsContent>
      </Tabs>

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
                  <h4 className="font-semibold text-gray-900 mb-2">Pet Information</h4>
                  {selectedAppointment.pets && selectedAppointment.pets.length > 0 ? (
                    <div className="space-y-3">
                      {selectedAppointment.pets.map((pet: any, index: number) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg">
                          <div className="font-medium text-sm text-gray-600 mb-2">Pet {index + 1}</div>
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
                {selectedAppointment.price && (
                  <div className="border-t pt-3">
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                      <Label className="text-sm font-semibold text-green-800">Total Price</Label>
                      <p className="text-xl font-bold text-green-700">${selectedAppointment.price}</p>
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
          groomers={groomers}
          isBookingDateAvailable={isBookingDateAvailable}
          bookingAvailableTimeSlots={bookingAvailableTimeSlots}
        />
      )}

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

      {/* Add Groomer Dialog */}
      <Dialog open={isAddGroomerOpen} onOpenChange={setIsAddGroomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Groomer</DialogTitle>
            <DialogDescription>Add a new groomer to your team.</DialogDescription>
          </DialogHeader>
          <GroomerForm 
            onSubmit={(data) => createGroomerMutation.mutate(data)}
            isPending={createGroomerMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Groomer Dialog */}
      {editingGroomer && (
        <Dialog open={!!editingGroomer} onOpenChange={() => setEditingGroomer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Groomer</DialogTitle>
              <DialogDescription>Update groomer information.</DialogDescription>
            </DialogHeader>
            <GroomerForm 
              groomer={editingGroomer}
              onSubmit={(data) => updateGroomerMutation.mutate({ id: editingGroomer.id, data })}
              isPending={updateGroomerMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {groomerToDelete && (
        <Dialog open={!!groomerToDelete} onOpenChange={() => setGroomerToDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Groomer</DialogTitle>
              <DialogDescription>Confirm deletion of groomer from your team.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete <strong>{groomerToDelete.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setGroomerToDelete(null)}
                  data-testid="button-cancel-delete-groomer"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteGroomerMutation.mutate(groomerToDelete.id)}
                  disabled={deleteGroomerMutation.isPending}
                  data-testid="button-confirm-delete-groomer"
                >
                  {deleteGroomerMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Blocked Day Dialog */}
      <Dialog open={isAddBlockedDayOpen} onOpenChange={setIsAddBlockedDayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarX2 className="w-5 h-5" />
              Add Blocked Days
            </DialogTitle>
            <DialogDescription>Block a groomer from being assigned on specific dates (sick days, vacation, etc.). Click multiple dates to select them.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="blocked-groomer">Groomer *</Label>
              <Select
                value={blockedDayFormData.groomerId}
                onValueChange={(value) => setBlockedDayFormData({ ...blockedDayFormData, groomerId: value })}
              >
                <SelectTrigger data-testid="select-blocked-groomer">
                  <SelectValue placeholder="Select a groomer" />
                </SelectTrigger>
                <SelectContent>
                  {groomersQuery.data?.filter((g: any) => g.isActive).map((groomer: any) => (
                    <SelectItem key={groomer.id} value={groomer.id.toString()}>
                      {groomer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dates * <span className="text-sm text-gray-500">({blockedDayFormData.dates.length} selected)</span></Label>
              <div className="border rounded-md p-2 bg-white dark:bg-gray-950">
                <Calendar
                  mode="multiple"
                  selected={blockedDayFormData.dates}
                  onSelect={(dates) => setBlockedDayFormData({ ...blockedDayFormData, dates: dates || [] })}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="rounded-md"
                  data-testid="calendar-blocked-dates"
                />
              </div>
              {blockedDayFormData.dates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {blockedDayFormData.dates.sort((a, b) => a.getTime() - b.getTime()).map((date, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                      {date.toLocaleDateString()}
                      <button
                        type="button"
                        onClick={() => setBlockedDayFormData({
                          ...blockedDayFormData,
                          dates: blockedDayFormData.dates.filter((d) => d.getTime() !== date.getTime())
                        })}
                        className="hover:text-orange-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="blocked-reason">Reason *</Label>
              <Select
                value={blockedDayFormData.reason}
                onValueChange={(value) => setBlockedDayFormData({ ...blockedDayFormData, reason: value })}
              >
                <SelectTrigger data-testid="select-blocked-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="blocked-notes">Notes (Optional)</Label>
              <Textarea
                id="blocked-notes"
                placeholder="Additional notes about why they are blocked..."
                value={blockedDayFormData.notes}
                onChange={(e) => setBlockedDayFormData({ ...blockedDayFormData, notes: e.target.value })}
                data-testid="textarea-blocked-notes"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddBlockedDayOpen(false);
                  setBlockedDayFormData({ groomerId: '', dates: [], reason: 'sick', notes: '' });
                }}
                data-testid="button-cancel-blocked-day"
              >
                Cancel
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={() => {
                  if (!blockedDayFormData.groomerId || blockedDayFormData.dates.length === 0) {
                    toast({
                      title: "Missing Information",
                      description: "Please select a groomer and at least one date.",
                      variant: "destructive",
                    });
                    return;
                  }
                  createBlockedDayMutation.mutate({
                    groomerId: parseInt(blockedDayFormData.groomerId),
                    dates: blockedDayFormData.dates.map(d => {
                      const year = d.getFullYear();
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    }),
                    reason: blockedDayFormData.reason,
                    notes: blockedDayFormData.notes || undefined
                  });
                }}
                disabled={createBlockedDayMutation.isPending}
                data-testid="button-save-blocked-day"
              >
                {createBlockedDayMutation.isPending ? "Adding..." : `Add ${blockedDayFormData.dates.length || ''} Blocked Day${blockedDayFormData.dates.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                  placeholder="Search by name or phone number..."
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

                  <div className="font-medium text-sm text-gray-700">Pet {index + 1}</div>

                  <div>
                    <Label>Pet Name *</Label>
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
                        <SelectItem value="grooming-full">Full Grooming ($35)</SelectItem>
                        <SelectItem value="grooming-bath">Bath Only ($20)</SelectItem>
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
                        {Array.isArray(groomers) && groomers.map((groomer: any) => (
                          <SelectItem key={groomer.id} value={groomer.id.toString()}>
                            {groomer.specialties ? `${groomer.name} (${groomer.specialties})` : groomer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      const prices: any = { 'grooming-full': 35, 'grooming-bath': 20 };
                      return sum + (prices[pet.serviceType] || 0);
                    }, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <Label>Select Date *</Label>
              <Calendar
                mode="single"
                selected={bookingSelectedDate}
                onSelect={setBookingSelectedDate}
                disabled={(date) => !isBookingDateAvailable(date)}
                className="rounded-md border"
              />
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
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
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
      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isAvailable}
          onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
        />
        <label className="text-sm">Available for adoption</label>
      </div>
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Pet
      </Button>
    </form>
  );
}

function EditSupplyForm({ supply, onSubmit }: { supply: any; onSubmit: (data: any) => void }) {
  const NON_RESTOCKABLE_TEXT = "⚠️ This item will not be restocked once sold out.";
  
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
            <SelectItem value="food">Food</SelectItem>
            <SelectItem value="treats">Treats</SelectItem>
            <SelectItem value="toys">Toys</SelectItem>
            <SelectItem value="beds">Beds</SelectItem>
            <SelectItem value="leashesAndCollars">Leashes & Collars</SelectItem>
            <SelectItem value="healthcare">Healthcare</SelectItem>
            <SelectItem value="accessories">Accessories</SelectItem>
            <SelectItem value="aquatics">Aquatics</SelectItem>
            <SelectItem value="reptiles">Reptiles</SelectItem>
            <SelectItem value="birdSupplies">Bird Supplies</SelectItem>
            <SelectItem value="dogCages">Dog Cages/Houses</SelectItem>
            <SelectItem value="smallAnimalSupplies">Small Animal Supplies</SelectItem>
            <SelectItem value="catFood">Cat Food</SelectItem>
            <SelectItem value="catTreats">Cat Treats</SelectItem>
            <SelectItem value="catToys">Cat Toys</SelectItem>
            <SelectItem value="dogFood">Dog Food</SelectItem>
            <SelectItem value="dogTreats">Dog Treats</SelectItem>
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
        onMainImageChange={(newUrl) => setFormData({ ...formData, imageUrl: newUrl })}
        onAdditionalImagesChange={(urls) => setFormData({ ...formData, imageUrls: urls })}
      />
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Supply
      </Button>
    </form>
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
              Drag & drop or paste an image here
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Click here first, then Ctrl+V to paste
            </p>
          </div>
        )}
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
          className="w-full mt-3"
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
      </div>
      <p className="text-xs text-gray-500">
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
                src={url} 
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
        onClick={() => {
          if (supplyId) {
            fileInputRef.current?.click();
          } else {
            setPasteReady(true);
          }
        }}
      >
        <div className="text-center py-2">
          {pasteReady ? (
            <>
              <ClipboardPaste className="w-8 h-8 text-green-600 mx-auto mb-2 animate-pulse" />
              <p className="text-sm text-green-700 font-medium">
                {supplyId ? 'Ready - Paste (Ctrl+V), drop, or click to browse' : 'Paste image URL below'}
              </p>
              <p className="text-xs text-green-600 mt-1">Press Escape to cancel</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {allImages.length === 0 ? 'Add main product image' : 'Add another image'}
              </p>
              {supplyId && (
                <p className="text-xs text-gray-400 mt-1">Click to browse, drag & drop, or paste</p>
              )}
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
              onClick={() => onImageChange('')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center sm:py-8 py-4">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Drag & drop, paste (Ctrl+V), or click to upload</p>
          </div>
        )}
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
          className="w-full mt-3"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : imageUrl ? 'Change Image' : 'Upload Image'}
        </Button>
      </div>
    </div>
  );
}

// Multi-Image Upload Component
function MultiImageUpload({ imageUrls, onImagesChange }: { imageUrls: string[]; onImagesChange: (urls: string[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

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

    if (file.size > 5 * 1024 * 1024) {
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
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      // Add new image to the array
      onImagesChange([...imageUrls, data.imageUrl]);
      // Success toast removed to speed up workflow
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newUrls = imageUrls.filter((_, i) => i !== index);
    onImagesChange(newUrls);
  };

  return (
    <div className="space-y-3">
      <Label>Product Images ({imageUrls.length})</Label>
      
      {/* Display existing images */}
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {imageUrls.map((url, index) => (
            <div key={index} className="relative border-2 border-gray-300 rounded-lg overflow-hidden">
              <img src={url} alt={`Product ${index + 1}`} className="w-full h-32 object-cover" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-white"
                onClick={() => removeImage(index)}
              >
                <X className="w-4 h-4" />
              </Button>
              <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                Image {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new image button */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
        <div className="text-center py-4">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Click to add another image</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = ''; // Reset input
          }}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : '+ Add Image'}
        </Button>
      </div>
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
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
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
      <div className="flex items-center space-x-2">
        <Switch
          id="isAvailable"
          checked={formData.isAvailable}
          onCheckedChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
        />
        <Label htmlFor="isAvailable">Available for adoption</Label>
      </div>
      <Button type="submit" className="w-full">Add Pet</Button>
    </form>
  );
}

function AddSupplyForm({ onSubmit }: { onSubmit: (data: any) => void }) {
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
    sku: '',
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
              <SelectItem value="food">Food</SelectItem>
              <SelectItem value="treats">Treats</SelectItem>
              <SelectItem value="toys">Toys</SelectItem>
              <SelectItem value="beds">Beds</SelectItem>
              <SelectItem value="leashesAndCollars">Leashes & Collars</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="aquatics">Aquatics</SelectItem>
              <SelectItem value="reptiles">Reptiles</SelectItem>
              <SelectItem value="birdSupplies">Bird Supplies</SelectItem>
              <SelectItem value="dogCages">Dog Cages/Houses</SelectItem>
              <SelectItem value="smallAnimalSupplies">Small Animal Supplies</SelectItem>
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
        onMainImageChange={(url) => setFormData({ ...formData, imageUrl: url })}
        onAdditionalImagesChange={setAdditionalImageUrls}
      />
      <Button type="submit" className="w-full">Add Supply</Button>
    </form>
  );
}

function GroomerForm({ groomer, onSubmit, isPending }: { groomer?: any; onSubmit: (data: any) => void; isPending: boolean }) {
  const [formData, setFormData] = useState({
    name: groomer?.name || "",
    email: groomer?.email || "",
    phone: groomer?.phone || "",
    specialties: groomer?.specialties || "",
    isActive: groomer?.isActive !== undefined ? groomer.isActive : true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          data-testid="input-groomer-name"
        />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          data-testid="input-groomer-email"
        />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="(555) 123-4567"
          data-testid="input-groomer-phone"
        />
      </div>
      <div>
        <Label htmlFor="specialties">Specialties</Label>
        <Textarea
          id="specialties"
          value={formData.specialties}
          onChange={(e) => setFormData({ ...formData, specialties: e.target.value })}
          placeholder="e.g., Full Grooming, Bath Only, Large Breeds"
          rows={3}
          data-testid="input-groomer-specialties"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          data-testid="switch-groomer-active"
        />
        <Label>Active</Label>
      </div>
      <Button 
        type="submit" 
        className="w-full bg-brand-blue hover:bg-blue-600"
        disabled={isPending}
        data-testid="button-submit-groomer"
      >
        {isPending ? "Saving..." : (groomer ? "Update Groomer" : "Add Groomer")}
      </Button>
    </form>
  );
}

// Close the wrapper div at the end of the main return
// Adding this closing tag before the component ends