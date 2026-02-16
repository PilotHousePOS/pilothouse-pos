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
  Wrench
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import AdminNotifications from "@/components/admin-notifications";
import EmailCenter from "@/components/admin/EmailCenter";
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
                                <div className="flex items-center gap-1.5 px-2 py-1 border rounded bg-white">
                                  <Checkbox
                                    id={`cal-grooming-completed-${appointment.id}`}
                                    checked={appointment.groomingCompleted || false}
                                    onCheckedChange={(checked) => {
                                      updateAppointmentGroomingCompletedMutation.mutate({ 
                                        id: appointment.id, 
                                        groomingCompleted: !!checked 
                                      });
                                    }}
                                  />
                                  <label 
                                    htmlFor={`cal-grooming-completed-${appointment.id}`}
                                    className="text-xs font-medium cursor-pointer"
                                  >
                                    Done
                                  </label>
                                </div>
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
              <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
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
  
  const { data: editServicePrices } = useQuery<{ fullGrooming: string; bathOnly: string }>({
    queryKey: ["/api/service-prices"],
  });
  
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
    
    if (field === 'serviceType' && pricingMode === 'individual') {
      const priceStr = value === 'grooming-full' 
        ? (editServicePrices?.fullGrooming || '35') 
        : (editServicePrices?.bathOnly || '20');
      const basePrice = priceStr.includes('-') ? priceStr.split('-')[0] : priceStr;
      updated[index].price = basePrice;
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
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Pets ({pets.length})</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => {
                  const defaultPrice = editServicePrices?.fullGrooming || '35';
                  const basePrice = defaultPrice.includes('-') ? defaultPrice.split('-')[0] : defaultPrice;
                  setPets([...pets, {
                    id: null,
                    name: '',
                    type: 'Dog',
                    serviceType: 'grooming-full',
                    notes: '',
                    groomerId: null,
                    price: basePrice,
                  }]);
                }}
                data-testid="button-add-pet"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Pet
              </Button>
            </div>
            
            {/* Pet Cards - Stacked */}
            {pets.map((pet, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">Pet {index + 1}</span>
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
            When customers, groomers, or admins reply to any email from Animal House, the reply will go to both the main sending email and this alternate address. Useful as a fallback if your primary email has delivery issues.
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

// Loyalty Settings Panel Component
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


export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const typedUser = user as User;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [isAddSupplyOpen, setIsAddSupplyOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [petToDelete, setPetToDelete] = useState<any>(null);
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
    message: "Your Fur Baby is ready for pick-up please give us a call to let us know you're on your way. The Animal House 318-323-6090."
  });
  
  const defaultSmsMessage = "Your Fur Baby is ready for pick-up please give us a call to let us know you're on your way. The Animal House 318-323-6090.";
  
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
  
  const { data: pendingOrders = [], refetch: refetchPendingOrders } = useQuery<any[]>({
    queryKey: ["/api/admin/pending-orders"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

  const { data: allOrdersWithItems = [], refetch: refetchAllOrders } = useQuery<any[]>({
    queryKey: ["/api/admin/orders-with-items"],
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

  const { data: groomingSettings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/grooming-settings"],
    enabled: Boolean(isAuthenticated && typedUser?.isAdmin),
  });

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

  const { data: specialDates = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/special-dates"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });


  const groomersQuery = useQuery<any[]>({
    queryKey: ["/api/admin/groomers"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

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

  // Update groomer weekly off-days mutation
  const updateGroomerOffDaysMutation = useMutation({
    mutationFn: async ({ id, offDays }: { id: number; offDays: number[] }) => {
      await apiRequest("PUT", `/api/admin/groomers/${id}`, { offDays });
    },
    onSuccess: () => {
      toast({
        title: "Off Days Updated",
        description: "Groomer's weekly off-days have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/groomers"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update off-days.",
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
  // Count orders that are NOT picked up (pending_approval, approved, ready_for_pickup are all "pending" from admin perspective)
  const pendingOrdersCount = (orders as any[]).filter((o: any) => 
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
            <div className="text-2xl font-bold mb-1">{pendingOrdersCount}</div>
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

      <Tabs defaultValue="appointments" className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex gap-1 h-auto p-1 min-w-full lg:min-w-0">
            <TabsTrigger value="appointments" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Appointments
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Calendar
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Contacts
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
              <TabsTrigger value="grooming" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                <span className="hidden lg:inline">Grooming Settings</span>
                <span className="lg:hidden">Grooming</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="groomers" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              Groomers
            </TabsTrigger>
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
            <TabsTrigger value="orders" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
              <span className="hidden lg:inline">Orders & Refunds</span>
              <span className="lg:hidden">Orders</span>
            </TabsTrigger>
            {typedUser?.isAdmin && (
              <TabsTrigger value="settings" className="flex-none text-xs py-3 px-3 whitespace-nowrap">
                Settings
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
                      <div className="flex items-center gap-2">
                        <Badge variant={pet.isAvailable ? "default" : "secondary"} className="text-xs">
                          {pet.isAvailable ? "Available" : "Unavailable"}
                        </Badge>
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
                                        >
                                          Approve
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
                              const price = parseFloat(currentAppointment.price);
                              const serviceType = (currentAppointment.serviceType || (currentAppointment.pets?.[0]?.serviceType) || '').toLowerCase();
                              const hasFullGrooming = serviceType.includes('full') || serviceType.includes('groom') && !serviceType.includes('bath');
                              const hasPetsWithFullGrooming = currentAppointment.pets?.some((p: any) => {
                                const st = (p.serviceType || '').toLowerCase();
                                return st.includes('full') || (st.includes('groom') && !st.includes('bath'));
                              });
                              const isFullGrooming = hasFullGrooming || hasPetsWithFullGrooming;
                              const defaultPrice = isFullGrooming ? 35 : 20;
                              const isUnedited = price === defaultPrice;
                              
                              if (isUnedited) {
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
                            <div className="flex items-center gap-1.5 px-2 py-1 border rounded bg-white">
                              <Checkbox
                                id={`grooming-completed-${currentAppointment.id}`}
                                checked={currentAppointment.groomingCompleted || false}
                                onCheckedChange={(checked) => {
                                  // Simply toggle the done status without SMS
                                  updateAppointmentGroomingCompletedMutation.mutate({ 
                                    id: currentAppointment.id, 
                                    groomingCompleted: !!checked 
                                  });
                                }}
                                data-testid={`checkbox-grooming-completed-${currentAppointment.id}`}
                              />
                              <label 
                                htmlFor={`grooming-completed-${currentAppointment.id}`}
                                className="text-xs font-medium cursor-pointer"
                              >
                                Done
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

              {/* Service Prices */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Service Prices</h3>
                <p className="text-sm text-gray-600">Set estimated prices for grooming services. Use a range like "40-80" or single price like "35". These are displayed to customers with a note that prices may vary.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Full Grooming Price ($)</label>
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
                  <div>
                    <label className="block text-sm font-medium mb-2">Bath Only Price ($)</label>
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
                        
                        {/* Weekly Off-Days - Admin only */}
                        {typedUser?.isAdmin && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-gray-500 mb-2">Weekly Off-Days (click to toggle)</p>
                            <div className="flex flex-wrap gap-1">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                                const isOffDay = groomer.offDays?.includes(idx) || false;
                                return (
                                  <Button
                                    key={day}
                                    variant={isOffDay ? "destructive" : "outline"}
                                    size="sm"
                                    className="text-xs px-2 py-1 h-7"
                                    onClick={() => {
                                      const currentOffDays = groomer.offDays || [];
                                      const newOffDays = isOffDay
                                        ? currentOffDays.filter((d: number) => d !== idx)
                                        : [...currentOffDays, idx];
                                      updateGroomerOffDaysMutation.mutate({ id: groomer.id, offDays: newOffDays });
                                    }}
                                    disabled={updateGroomerOffDaysMutation.isPending}
                                  >
                                    {day}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}

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
                                <UserIcon className="w-5 h-5 text-orange-600" />
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
          <EmailCenter groomingSettings={groomingSettings as any[]} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <StoreHoursPanel />
          <SettingsPanel />
          <LoyaltySettingsPanel />
          <LegalPagesPanel />
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
                {selectedAppointment.price && (() => {
                  const price = parseFloat(selectedAppointment.price);
                  const serviceType = (selectedAppointment.serviceType || (selectedAppointment.pets?.[0]?.serviceType) || '').toLowerCase();
                  const hasFullGrooming = serviceType.includes('full') || serviceType.includes('groom') && !serviceType.includes('bath');
                  const hasPetsWithFullGrooming = selectedAppointment.pets?.some((p: any) => {
                    const st = (p.serviceType || '').toLowerCase();
                    return st.includes('full') || (st.includes('groom') && !st.includes('bath'));
                  });
                  const isFullGrooming = hasFullGrooming || hasPetsWithFullGrooming;
                  const defaultPrice = isFullGrooming ? 35 : 20;
                  const isUnedited = price === defaultPrice;
                  
                  if (isUnedited) {
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
                        <Label className="text-sm font-semibold text-green-800">Total Price</Label>
                        <p className="text-xl font-bold text-green-700">${selectedAppointment.price}</p>
                      </div>
                    </div>
                  );
                })()}
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                        <SelectItem value="grooming-full">Full Grooming ${servicePrices?.fullGrooming || '35'} (Prices will vary)</SelectItem>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData, quantity: formData.quantity === "" ? null : Number(formData.quantity) };
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
    quantity: '' as string | number,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = { ...formData, quantity: formData.quantity === "" ? null : Number(formData.quantity) };
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