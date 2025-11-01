import { useState, useEffect, useRef, useMemo } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import AdminNotifications from "@/components/admin-notifications";
import { safeGoBack } from "@/lib/navigation";
import { capitalizeWords } from "@/lib/stringUtils";

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

// Calendar component for confirmed appointments and Google Calendar events
function AppointmentCalendar({ appointments }: { appointments: any[] }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Fetch Google Calendar events for the selected date
  const { data: googleEvents = [] } = useQuery({
    queryKey: ["/api/admin/calendar/events/date", selectedDate.toISOString().split('T')[0]],
    queryFn: async () => {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetch(`/api/admin/calendar/events/date?date=${dateStr}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return [];
        }
        throw new Error('Failed to fetch calendar events');
      }
      return response.json();
    },
    retry: false,
  });

  // Filter confirmed appointments for the selected date
  const confirmedAppointments = appointments.filter((apt: any) => 
    apt.status === 'confirmed' && 
    new Date(apt.appointmentDate).toDateString() === selectedDate.toDateString()
  );

  // Group appointments by time slot
  const timeSlots = [
    '9:00 AM', '9:15 AM', '9:30 AM', '9:45 AM',
    '10:00 AM', '10:15 AM', '10:30 AM', '10:45 AM',
    '11:00 AM', '11:15 AM', '11:30 AM', '11:45 AM',
    '12:00 PM', '12:15 PM', '12:30 PM', '12:45 PM',
    '1:00 PM', '1:15 PM', '1:30 PM'
  ];

  const getAppointmentForTime = (time: string) => {
    return confirmedAppointments.find((apt: any) => apt.appointmentTime === time);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Daily Appointment Calendar
        </CardTitle>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
              ← Previous Day
            </Button>
            <h3 className="text-lg font-semibold">{formatDate(selectedDate)}</h3>
            <Button variant="outline" size="sm" onClick={() => changeDate(1)}>
              Next Day →
            </Button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm text-gray-600 mb-4">
            {confirmedAppointments.length} confirmed appointments + {googleEvents.length} calendar events for this day
          </div>
          
          {timeSlots.map((time) => {
            const appointment = getAppointmentForTime(time);
            const googleEventsList = getGoogleEventsForTime(time);
            const hasAny = appointment || googleEventsList.length > 0;
            
            return (
              <div key={time} className="flex items-start gap-4 p-3 border rounded-lg">
                <div className="w-20 text-sm font-medium text-gray-700 pt-2">
                  {time}
                </div>
                <div className="flex-1 space-y-2">
                  {appointment && (
                    <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {capitalizeWords(appointment.petName)} ({appointment.petType})
                          </h4>
                          <p className="text-sm text-gray-600">
                            Owner: {capitalizeWords(appointment.ownerFirstName)} {capitalizeWords(appointment.ownerLastName)}
                          </p>
                          <p className="text-sm text-gray-600">
                            Phone: {appointment.ownerPhoneNumber}
                          </p>
                          <p className="text-xs text-blue-600">
                            Service: {appointment.serviceType === 'grooming-full' ? 'Full Grooming' : 'Bath Only'}
                          </p>
                        </div>
                        <Badge variant="default" className="bg-green-600">
                          Grooming
                        </Badge>
                      </div>
                      {appointment.specialNotes && (
                        <p className="text-xs text-gray-500 mt-2">
                          Notes: {appointment.specialNotes}
                        </p>
                      )}
                    </div>
                  )}
                  
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
                  
                  {!hasAny && (
                    <div className="text-gray-400 text-sm italic pt-2">
                      Available
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Contacts Manager Component with Search and Event Creation
// Helper component to display appointment history for a contact
function ContactAppointmentHistory({ contactId }: { contactId: number }) {
  const { data: appointments = [], isLoading } = useQuery<any[]>({
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

  // Filter for completed and confirmed appointments only
  const completedAppointments = appointments.filter(apt => 
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
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Grooming History ({completedAppointments.length})</p>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {completedAppointments.map((apt: any) => (
          <div key={apt.id} className="bg-gray-50 rounded p-2 text-xs" data-testid={`appointment-history-${apt.id}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{formatService(apt.serviceType || apt.service)}</p>
                <p className="text-gray-600">{apt.petName} ({apt.petType})</p>
                <p className="text-gray-500">{new Date(apt.appointmentDate).toLocaleDateString()}</p>
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
      </div>
    </div>
  );
}

function ContactsManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<any[]>([]);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [eventContactSearch, setEventContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [eventFormData, setEventFormData] = useState({
    summary: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
  });
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    notes: '',
    animalType: '',
    breed: '',
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedContactId, setExpandedContactId] = useState<string | number | null>(null);

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
      setContactFormData({ name: '', email: '', phoneNumber: '', notes: '', animalType: '', breed: '' });
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
      setContactFormData({ name: '', email: '', phoneNumber: '', notes: '', animalType: '', breed: '' });
      await queryClient.refetchQueries({ queryKey: ["/api/contacts"] });
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
      return await apiRequest("POST", "/api/admin/calendar/sync-contacts");
    },
    onSuccess: (data: any) => {
      toast({
        title: "Sync Complete",
        description: data.message || "Contacts synced successfully from calendar.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync contacts from calendar.",
        variant: "destructive",
      });
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (eventData: any) => {
      await apiRequest("POST", "/api/admin/calendar/events", eventData);
    },
    onSuccess: () => {
      toast({
        title: "Event Created",
        description: "Calendar event has been created successfully.",
      });
      setIsCreateEventOpen(false);
      setSelectedContacts([]);
      setEventFormData({
        summary: '',
        description: '',
        date: '',
        startTime: '',
        endTime: '',
      });
      // Invalidate both the general events list and all date-specific queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar/events/date"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create calendar event.",
        variant: "destructive",
      });
    },
  });

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
          
          return nameMatch || emailMatch || phoneMatch;
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

  const toggleContactSelection = (contact: any) => {
    const contactId = contact.resourceName || contact.email || contact.id;
    if (selectedContacts.find(c => (c.resourceName || c.email || c.id) === contactId)) {
      setSelectedContacts(selectedContacts.filter(c => (c.resourceName || c.email || c.id) !== contactId));
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleAddContact = () => {
    const trimmedEmail = contactFormData.email.trim();
    if (!contactFormData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      toast({
        title: "Validation Error",
        description: "A valid email address is required for calendar event integration.",
        variant: "destructive",
      });
      return;
    }
    createContactMutation.mutate({ ...contactFormData, email: trimmedEmail, name: contactFormData.name.trim() });
  };

  const handleEditContact = (contact: any) => {
    setEditingContact(contact);
    setContactFormData({
      name: contact.name || '',
      email: contact.email || '',
      phoneNumber: contact.phoneNumber || '',
      notes: contact.notes || '',
      animalType: contact.animalType || '',
      breed: contact.breed || '',
    });
  };

  const handleUpdateContact = () => {
    const trimmedEmail = contactFormData.email.trim();
    if (!contactFormData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      toast({
        title: "Validation Error",
        description: "A valid email address is required for calendar event integration.",
        variant: "destructive",
      });
      return;
    }
    updateContactMutation.mutate({
      id: editingContact.id,
      data: { ...contactFormData, email: trimmedEmail, name: contactFormData.name.trim() },
    });
  };

  const handleDeleteContact = (id: number) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      deleteContactMutation.mutate(id);
    }
  };

  const handleCreateEvent = () => {
    if (!eventFormData.summary || !eventFormData.date || !eventFormData.startTime || !eventFormData.endTime) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const startDateTime = `${eventFormData.date}T${eventFormData.startTime}:00`;
    const endDateTime = `${eventFormData.date}T${eventFormData.endTime}:00`;

    // Filter out contacts without email addresses
    const validAttendees = selectedContacts
      .filter(c => c.email)
      .map(c => ({ email: c.email, displayName: c.displayName || c.name }));

    createEventMutation.mutate({
      summary: eventFormData.summary,
      description: eventFormData.description,
      startDateTime,
      endDateTime,
      attendees: validAttendees,
    });
  };

  // Close contact dropdown when clicking outside or when dialog closes
  const handleCloseContactDropdown = () => {
    setShowContactDropdown(false);
  };

  // Reset form when dialog closes
  const handleDialogChange = (open: boolean) => {
    setIsCreateEventOpen(open);
    if (!open) {
      setShowContactDropdown(false);
      setEventContactSearch('');
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
            <Button 
              variant="secondary" 
              onClick={() => syncContactsMutation.mutate()}
              disabled={syncContactsMutation.isPending}
              data-testid="button-sync-contacts"
              className="w-full sm:w-auto"
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncContactsMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="truncate">{syncContactsMutation.isPending ? 'Syncing...' : 'Sync from Calendar'}</span>
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
                    <Label htmlFor="contact-email">Email *</Label>
                    <Input
                      id="contact-email"
                      data-testid="input-contact-email"
                      type="email"
                      placeholder="john@example.com"
                      value={contactFormData.email}
                      onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-phone">Phone Number</Label>
                    <Input
                      id="contact-phone"
                      data-testid="input-contact-phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={contactFormData.phoneNumber}
                      onChange={(e) => setContactFormData({ ...contactFormData, phoneNumber: e.target.value })}
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
                    <Label htmlFor="edit-contact-email">Email *</Label>
                    <Input
                      id="edit-contact-email"
                      data-testid="input-edit-contact-email"
                      type="email"
                      placeholder="john@example.com"
                      value={contactFormData.email}
                      onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-contact-phone">Phone Number</Label>
                    <Input
                      id="edit-contact-phone"
                      data-testid="input-edit-contact-phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={contactFormData.phoneNumber}
                      onChange={(e) => setContactFormData({ ...contactFormData, phoneNumber: e.target.value })}
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
            <Dialog open={isCreateEventOpen} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-event" className="w-full sm:w-auto" size="sm">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Create Event
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Calendar Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="event-summary">Event Title *</Label>
                  <Input
                    id="event-summary"
                    data-testid="input-event-summary"
                    placeholder="Meeting with client"
                    value={eventFormData.summary}
                    onChange={(e) => setEventFormData({ ...eventFormData, summary: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="event-description">Description</Label>
                  <Textarea
                    id="event-description"
                    data-testid="input-event-description"
                    placeholder="Optional event description"
                    value={eventFormData.description}
                    onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="event-date">Date *</Label>
                  <Input
                    id="event-date"
                    data-testid="input-event-date"
                    type="date"
                    value={eventFormData.date}
                    onChange={(e) => setEventFormData({ ...eventFormData, date: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="event-start-time">Start Time *</Label>
                    <Input
                      id="event-start-time"
                      data-testid="input-event-start-time"
                      type="time"
                      value={eventFormData.startTime}
                      onChange={(e) => setEventFormData({ ...eventFormData, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="event-end-time">End Time *</Label>
                    <Input
                      id="event-end-time"
                      data-testid="input-event-end-time"
                      type="time"
                      value={eventFormData.endTime}
                      onChange={(e) => setEventFormData({ ...eventFormData, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="contact-selector">Add Attendees</Label>
                  <div className="relative mt-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="contact-selector"
                        placeholder="Search contacts to add..."
                        value={eventContactSearch}
                        onChange={(e) => setEventContactSearch(e.target.value)}
                        onFocus={() => setShowContactDropdown(true)}
                        className="pl-10"
                        data-testid="input-contact-search"
                      />
                    </div>
                    {showContactDropdown && allContacts.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {allContacts
                          .filter((contact: any) => 
                            contact.displayName?.toLowerCase().includes(eventContactSearch.toLowerCase()) ||
                            contact.name?.toLowerCase().includes(eventContactSearch.toLowerCase()) ||
                            contact.email?.toLowerCase().includes(eventContactSearch.toLowerCase())
                          )
                          .map((contact: any, index: number) => {
                            const isAlreadySelected = selectedContacts.find(c => (c.email === contact.email || c.id === contact.id));
                            return (
                              <div
                                key={contact.email || contact.id || index}
                                className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 ${
                                  isAlreadySelected ? 'bg-blue-50' : ''
                                }`}
                                onClick={() => {
                                  toggleContactSelection(contact);
                                  setEventContactSearch('');
                                }}
                                data-testid={`dropdown-contact-${index}`}
                              >
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{contact.displayName || contact.name}</p>
                                  <p className="text-xs text-gray-500">{contact.email}</p>
                                </div>
                                {isAlreadySelected && (
                                  <Badge variant="default" className="bg-blue-600 text-xs">
                                    Selected
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        {allContacts.filter((contact: any) => 
                          contact.displayName?.toLowerCase().includes(eventContactSearch.toLowerCase()) ||
                          contact.email?.toLowerCase().includes(eventContactSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="p-4 text-center text-sm text-gray-500">
                            No contacts found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {selectedContacts.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-600 mb-2">Selected Attendees ({selectedContacts.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedContacts.map((contact, idx) => (
                          <Badge 
                            key={contact.email} 
                            variant="secondary" 
                            className="text-xs flex items-center gap-1 relative"
                          >
                            <span className="pointer-events-none">{contact.displayName}</span>
                            <button
                              type="button"
                              className="w-3 h-3 cursor-pointer hover:text-red-600 inline-flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleContactSelection(contact);
                              }}
                              aria-label={`Remove ${contact.displayName}`}
                              data-testid={`remove-contact-${idx}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Button 
                  onClick={handleCreateEvent} 
                  className="w-full"
                  disabled={createEventMutation.isPending}
                  data-testid="button-submit-event"
                >
                  {createEventMutation.isPending ? 'Creating...' : 'Create Event'}
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
              className="pl-10"
              data-testid="input-search-contacts"
            />
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
              const isSelected = selectedContacts.find(c => (c.email === contact.email && c.email) || c.resourceName === contact.resourceName || c.id === contact.id);
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
                  className={`border rounded-lg p-4 transition-all cursor-pointer hover:bg-gray-50 ${
                    isSelected ? 'bg-blue-50 border-blue-500' : ''
                  } ${isExpanded ? 'ring-2 ring-blue-400' : ''}`}
                  onClick={() => {
                    if (contact.isDatabaseContact) {
                      // Toggle expand/collapse for database contacts
                      setExpandedContactId(isExpanded ? null : (contact.id || contact.resourceName || contact.email));
                    } else {
                      // For Google Calendar contacts, select them
                      toggleContactSelection(contact);
                    }
                  }}
                  data-testid={`contact-card-${index}`}
                >
                  <div className="flex flex-col gap-2">
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
                    
                    {/* Animal Type/Breed */}
                    {contact.animalType && (
                      <div className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-base flex-shrink-0">🐾</span>
                        <span className="capitalize break-words">
                          {contact.animalType.replace('_', ' ')}{contact.breed && contact.animalType === 'dog' ? ` - ${contact.breed}` : ''}
                        </span>
                      </div>
                    )}
                    
                    {/* Appointment History - visible when expanded */}
                    {contact.isDatabaseContact && isExpanded && contact.phoneNumber && (
                      <div className="pt-2 mt-1 border-t border-gray-200">
                        <ContactAppointmentHistory contactId={contact.id} />
                      </div>
                    )}
                    
                    {/* Edit/Delete buttons - only visible when expanded */}
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
        
        {selectedContacts.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-900 mb-2">
              {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} selected
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsCreateEventOpen(true)}
              className="w-full"
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              Create Event with Selected Contacts
            </Button>
          </div>
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
  const [isSyncAppointmentsConfirmOpen, setIsSyncAppointmentsConfirmOpen] = useState(false);
  const [showApprovedAppointments, setShowApprovedAppointments] = useState(false);
  const [showDeniedAppointments, setShowDeniedAppointments] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editOwnerFirstName, setEditOwnerFirstName] = useState('');
  const [editOwnerLastName, setEditOwnerLastName] = useState('');
  const [editOwnerPhone, setEditOwnerPhone] = useState('');
  const [editPetName, setEditPetName] = useState('');
  const [editPetType, setEditPetType] = useState('');
  
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
  const [bookingContactSearch, setBookingContactSearch] = useState('');
  const [showBookingContactDropdown, setShowBookingContactDropdown] = useState(false);
  const [bookingSelectedService, setBookingSelectedService] = useState('');
  const [bookingSelectedDate, setBookingSelectedDate] = useState<Date | undefined>(new Date());
  const [bookingSelectedTime, setBookingSelectedTime] = useState('');
  const [bookingPetInfo, setBookingPetInfo] = useState({
    name: '',
    type: '',
    notes: '',
  });
  const [bookingOwnerInfo, setBookingOwnerInfo] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });
  const [bookingPrice, setBookingPrice] = useState('');
  
  // Pagination state for appointments
  const [appointmentsPage, setAppointmentsPage] = useState(0);
  const [appointmentsTouchStart, setAppointmentsTouchStart] = useState(0);
  const [appointmentsTouchEnd, setAppointmentsTouchEnd] = useState(0);
  
  // Pagination state for calendar events
  const [calendarEventsPage, setCalendarEventsPage] = useState(0);
  const [calendarEventsTouchStart, setCalendarEventsTouchStart] = useState(0);
  const [calendarEventsTouchEnd, setCalendarEventsTouchEnd] = useState(0);
  
  const ITEMS_PER_PAGE = 4;

  // Always call all hooks at the top level
  const { data: pets = [] } = useQuery({
    queryKey: ["/api/pets"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: supplies = [] } = useQuery({
    queryKey: ["/api/supplies"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
  });

  const { data: unapprovedAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/appointments/unapproved"],
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

  const { data: calendarEvents = [], isError: calendarEventsError } = useQuery<any[]>({
    queryKey: ["/api/admin/calendar/events"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
    retry: false,
  });

  const groomersQuery = useQuery<any[]>({
    queryKey: ["/api/admin/groomers"],
    enabled: Boolean(isAuthenticated && (typedUser?.isAdmin || typedUser?.isGroomer)),
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
      const petName = (appointment.petName || '').toLowerCase();
      
      const nameMatch = fullName.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      const petMatch = petName.includes(query);
      
      return nameMatch || phoneMatch || petMatch;
    });
  }, [search, appointments]);

  // Handle booking contact selection
  const handleBookingSelectContact = (contact: any) => {
    let firstName = '';
    let lastName = '';
    let petName = '';
    
    // Check if this is a Google Calendar contact
    if (contact.source === 'google_calendar') {
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
          petName = petNameWords.join(' ');
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
            petName = petNameWords.join(' ');
          }
        }
      }
    } else {
      // Regular contact - split name normally
      const nameParts = (contact.name || '').split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    setBookingOwnerInfo({
      firstName,
      lastName,
      phoneNumber: contact.phoneNumber || '',
    });
    
    // Auto-populate pet name if extracted from calendar event
    if (petName) {
      setBookingPetInfo(prev => ({
        ...prev,
        name: petName,
      }));
    }
    
    setBookingContactSearch(contact.name || '');
    setShowBookingContactDropdown(false);
    
    toast({
      title: "Contact Selected",
      description: petName 
        ? `Information populated for ${lastName} - Pet: ${petName}`
        : `Information populated for ${contact.name}`,
    });
  };

  // Generate available time slots for booking
  const bookingAvailableTimeSlots = useMemo(() => {
    const settings = groomingSettings as any[];
    const startTime = settings.find(s => s.setting === 'start_time')?.value || '09:00';
    const endTime = '13:30'; // Hard-coded 1:30 PM limit
    
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
    
    const advanceBookingDays = parseInt(settings.find(s => s.setting === 'advance_booking_days')?.value || '30');
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + advanceBookingDays);
    
    if (date > maxDate) return false;
    
    const minimumNoticeHours = parseInt(settings.find(s => s.setting === 'minimum_notice_hours')?.value || '24');
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + minimumNoticeHours);
    
    if (date < minDate) return false;
    
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
      await apiRequest("POST", "/api/supplies", supplyData);
    },
    onSuccess: () => {
      toast({
        title: "Supply Added",
        description: "Supply has been added successfully.",
      });
      setIsAddSupplyOpen(false);
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
        description: "Failed to delete supply.",
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
      price 
    }: { 
      id: number; 
      ownerFirstName?: string;
      ownerLastName?: string;
      ownerPhoneNumber?: string;
      petName?: string;
      petType?: string;
      specialNotes?: string; 
      price?: string;
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
      
      await apiRequest("PATCH", `/api/admin/appointments/${id}/details`, updates);
    },
    onSuccess: async () => {
      toast({
        title: "Appointment Updated",
        description: "Appointment details have been updated successfully.",
      });
      // Wait for refetch to complete before closing dialog
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setEditingAppointment(null);
      setEditNotes('');
      setEditPrice('');
      setEditOwnerFirstName('');
      setEditOwnerLastName('');
      setEditOwnerPhone('');
      setEditPetName('');
      setEditPetType('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update appointment. Please try again.",
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
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const syncAppointmentsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/calendar/sync-appointments");
    },
    onSuccess: (data: any) => {
      toast({
        title: "Appointments Synced",
        description: data.message || "All appointments replaced with Google Calendar events.",
      });
      // Invalidate both appointments and unapproved appointments to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments/unapproved"] });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync appointments from calendar.",
        variant: "destructive",
      });
    },
  });

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
      setBookingSelectedService('');
      setBookingSelectedDate(new Date());
      setBookingSelectedTime('');
      setBookingPetInfo({ name: '', type: '', notes: '' });
      setBookingOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      setBookingPrice('');
      // Refresh appointments
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create appointment.",
        variant: "destructive",
      });
    },
  });

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!bookingSelectedService || !bookingSelectedDate || !bookingSelectedTime || !bookingPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields including price.",
        variant: "destructive",
      });
      return;
    }

    const SERVICES = [
      { id: 'grooming-full', name: 'Full Grooming' },
      { id: 'grooming-bath', name: 'Bath Only' },
    ];

    const serviceData = SERVICES.find(s => s.id === bookingSelectedService);
    if (!serviceData) return;

    const appointmentData = {
      serviceType: serviceData.name,
      service: serviceData.name,
      appointmentDate: bookingSelectedDate.toISOString().split('T')[0],
      appointmentTime: bookingSelectedTime,
      petName: bookingPetInfo.name,
      petType: bookingPetInfo.type,
      specialNotes: bookingPetInfo.notes,
      ownerFirstName: bookingOwnerInfo.firstName,
      ownerLastName: bookingOwnerInfo.lastName,
      ownerPhoneNumber: bookingOwnerInfo.phoneNumber,
      price: bookingPrice,
    };

    createAppointmentMutation.mutate(appointmentData);
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

  const pendingAppointments = (appointments as any[]).filter((a: any) => a.status === 'scheduled').length;
  const pendingOrders = (orders as any[]).filter((o: any) => o.status === 'pending').length;

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

  // Calendar events pagination handlers
  const handleCalendarEventsTouchStart = (e: React.TouchEvent) => {
    setCalendarEventsTouchStart(e.targetTouches[0].clientX);
  };

  const handleCalendarEventsTouchMove = (e: React.TouchEvent) => {
    setCalendarEventsTouchEnd(e.targetTouches[0].clientX);
  };

  const handleCalendarEventsTouchEnd = () => {
    if (!calendarEventsTouchStart || !calendarEventsTouchEnd) return;
    
    const distance = calendarEventsTouchStart - calendarEventsTouchEnd;
    const minSwipeDistance = 50;
    const totalCalendarPages = Math.ceil((calendarEvents as any[]).length / ITEMS_PER_PAGE);
    
    if (distance > minSwipeDistance && calendarEventsPage < totalCalendarPages - 1) {
      setCalendarEventsPage(prev => prev + 1);
    }
    
    if (distance < -minSwipeDistance && calendarEventsPage > 0) {
      setCalendarEventsPage(prev => prev - 1);
    }
    
    setCalendarEventsTouchStart(0);
    setCalendarEventsTouchEnd(0);
  };

  // Calculate paginated data
  const totalAppointmentPages = Math.ceil((appointments as any[]).length / ITEMS_PER_PAGE);
  const paginatedAppointments = (appointments as any[]).slice(
    appointmentsPage * ITEMS_PER_PAGE,
    (appointmentsPage + 1) * ITEMS_PER_PAGE
  );

  const totalCalendarPages = Math.ceil((calendarEvents as any[]).length / ITEMS_PER_PAGE);
  const paginatedCalendarEvents = (calendarEvents as any[]).slice(
    calendarEventsPage * ITEMS_PER_PAGE,
    (calendarEventsPage + 1) * ITEMS_PER_PAGE
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <PawPrint className="w-8 h-8 mx-auto mb-3 text-brand-blue" />
            <div className="text-2xl font-bold mb-1">{(pets as any[]).length}</div>
            <div className="text-sm text-gray-500">Total Pets</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <Package className="w-8 h-8 mx-auto mb-3 text-brand-orange" />
            <div className="text-2xl font-bold mb-1">{(supplies as any[]).length}</div>
            <div className="text-sm text-gray-500">Total Supplies</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <ShoppingBag className="w-8 h-8 mx-auto mb-3 text-brand-red" />
            <div className="text-2xl font-bold mb-1">{pendingOrders}</div>
            <div className="text-sm text-gray-500">Pending Orders</div>
          </CardContent>
        </Card>
        <Card className="min-h-[120px]">
          <CardContent className="p-6 text-center flex flex-col justify-center h-full">
            <CalendarIcon className="w-8 h-8 mx-auto mb-3 text-green-600" />
            <div className="text-2xl font-bold mb-1">{pendingAppointments}</div>
            <div className="text-sm text-gray-500">Pending Appts</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-max min-w-full gap-1 h-auto p-1">
            <TabsTrigger value="inventory" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
              <span className="hidden md:inline">Inventory</span>
              <span className="md:hidden">Stock</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
              <span className="hidden md:inline">Orders & Appointments</span>
              <span className="md:hidden">Orders</span>
            </TabsTrigger>
            {typedUser?.isAdmin && (
              <TabsTrigger value="grooming" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
                <span className="hidden sm:inline">Grooming Settings</span>
                <span className="sm:hidden">Groom</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="groomers" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
              <span className="hidden sm:inline">Groomers</span>
              <span className="sm:hidden">Staff</span>
            </TabsTrigger>
            {typedUser?.isAdmin && (
              <TabsTrigger value="users" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
                Users
              </TabsTrigger>
            )}
            <TabsTrigger value="calendar" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
              <span className="hidden sm:inline">Calendar</span>
              <span className="sm:hidden">Cal</span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex-1 text-xs py-3 px-2 md:px-3 whitespace-nowrap">
              <span className="hidden sm:inline">Contacts</span>
              <span className="sm:hidden">Cont</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="inventory" className="space-y-6">
          {/* Pets Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PawPrint className="w-5 h-5" />
                  Pets ({(pets as any[]).length})
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
              <div className="space-y-4">
                {(pets as any[]).map((pet: any) => (
                  <div key={pet.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-semibold">{pet.name}</h3>
                      <p className="text-sm text-gray-600">{pet.species} • {pet.breed} • ${pet.price}</p>
                      <p className="text-xs text-gray-500">{pet.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={pet.isAvailable ? "default" : "secondary"}>
                        {pet.isAvailable ? "Available" : "Adopted"}
                      </Badge>
                      {typedUser?.isAdmin && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Supplies Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Supplies ({(supplies as any[]).length})
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
                      </DialogHeader>
                      <AddSupplyForm onSubmit={(data) => createSupplyMutation.mutate(data)} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(supplies as any[]).map((supply: any) => (
                  <div key={supply.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-semibold">{supply.name}</h3>
                      <p className="text-sm text-gray-600">{supply.brand} • {supply.category} • ${supply.price}</p>
                      <p className="text-xs text-gray-500">Stock: {supply.stockQuantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={supply.stockQuantity > 0 ? "default" : "destructive"}>
                        {supply.stockQuantity > 0 ? "In Stock" : "Out of Stock"}
                      </Badge>
                      {typedUser?.isAdmin && (
                        <>
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
                            onClick={() => deleteSupplyMutation.mutate(supply.id)}
                            disabled={deleteSupplyMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
              className="pl-10 border-gray-300 rounded-xl"
              data-testid="input-search"
            />
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
                  {unapprovedAppointments.map((appointment: any) => {
                    const isHighlighted = matchesSearch(appointment, 'appointment');
                    return (
                    <div 
                      key={appointment.id} 
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg gap-3 ${
                        isHighlighted 
                          ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                          : 'border-orange-300 bg-white'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className="bg-orange-500 text-white">Pending Approval</Badge>
                          {appointment.source === 'google_calendar' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              Google Calendar
                            </Badge>
                          )}
                          {appointment.groomerTag && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                              Groomer: {capitalizeWords(appointment.groomerTag)}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold">{formatServiceType(appointment.serviceType || appointment.service)}</h3>
                        <p className="text-sm text-gray-600">Pet: {capitalizeWords(appointment.petName)} ({appointment.petType})</p>
                        <p className="text-sm text-gray-600">Owner: {capitalizeWords(appointment.ownerFirstName)} {capitalizeWords(appointment.ownerLastName)}</p>
                        <p className="text-sm text-gray-600">Phone: {appointment.ownerPhoneNumber}</p>
                        <p className="text-xs text-gray-500">Date: {new Date(appointment.appointmentDate).toLocaleDateString()} at {appointment.appointmentTime}</p>
                        {appointment.specialNotes && (
                          <p className="text-xs text-gray-500 mt-1">Notes: {appointment.specialNotes}</p>
                        )}
                        <p className="text-xs text-gray-500">Booked: {new Date(appointment.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                          onClick={() => approveAppointmentMutation.mutate(appointment.id)}
                          disabled={approveAppointmentMutation.isPending || rejectAppointmentMutation.isPending}
                          data-testid={`approve-appointment-${appointment.id}`}
                        >
                          {approveAppointmentMutation.isPending ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full sm:w-auto"
                          onClick={() => rejectAppointmentMutation.mutate(appointment.id)}
                          disabled={approveAppointmentMutation.isPending || rejectAppointmentMutation.isPending}
                          data-testid={`reject-appointment-${appointment.id}`}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-yellow-700">
                  <CalendarIcon className="w-5 h-5" />
                  Pending Appointments ({(appointments as any[]).filter((a: any) => a.status === 'scheduled').length})
                </CardTitle>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSyncAppointmentsConfirmOpen(true)}
                  disabled={syncAppointmentsMutation.isPending}
                  data-testid="button-sync-appointments-groomer"
                  className="w-full sm:w-auto bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncAppointmentsMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncAppointmentsMutation.isPending ? 'Syncing...' : 'Sync from Calendar'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {((search.trim() ? filteredAppointments : appointments) as any[])
                  .filter((a: any) => a.status === 'scheduled')
                  .map((appointment: any) => {
                    const isHighlighted = matchesSearch(appointment, 'appointment');
                    return (
                    <div 
                      key={appointment.id} 
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        isHighlighted 
                          ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                          : 'border bg-white'
                      }`}
                    >
                      <div 
                        className="flex-1 cursor-pointer hover:bg-gray-50 p-2 rounded"
                        onClick={() => setSelectedAppointment(appointment)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{formatServiceType(appointment.serviceType || appointment.service)}</h3>
                          {appointment.source === 'google_calendar' && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              Synced
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Pet: {capitalizeWords(appointment.petName)} ({appointment.petType})</p>
                        <p className="text-sm text-gray-600">Owner: {capitalizeWords(appointment.ownerFirstName)} {capitalizeWords(appointment.ownerLastName)}</p>
                        <p className="text-sm text-gray-600">Phone: {appointment.ownerPhoneNumber}</p>
                        <p className="text-xs text-gray-500">{new Date(appointment.appointmentDate).toLocaleDateString()} at {appointment.appointmentTime}</p>
                        <p className="text-xs text-blue-600 mt-1">Click to view details</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          key={`appointment-${appointment.id}-${appointment.status}`}
                          value={appointment.status}
                          onValueChange={(status) => updateAppointmentMutation.mutate({ id: appointment.id, status })}
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

          {/* Approved Appointments - Collapsible Button */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-between border-2 border-green-200 bg-green-50 hover:bg-green-100 text-green-700"
              onClick={() => setShowApprovedAppointments(!showApprovedAppointments)}
              data-testid="button-toggle-approved"
            >
              <span className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Approved Appointments ({(appointments as any[]).filter((a: any) => a.status === 'confirmed' || a.status === 'completed').length})
              </span>
              {showApprovedAppointments ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </Button>

            {showApprovedAppointments && (() => {
              const approvedAppointments = ((search.trim() ? filteredAppointments : appointments) as any[]).filter((a: any) => a.status === 'confirmed' || a.status === 'completed');
              const totalPages = Math.ceil(approvedAppointments.length / APPOINTMENTS_PER_PAGE);
              const startIdx = approvedAppointmentsPage * APPOINTMENTS_PER_PAGE;
              const paginatedAppointments = approvedAppointments.slice(startIdx, startIdx + APPOINTMENTS_PER_PAGE);

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
                      {paginatedAppointments.map((appointment: any) => {
                        const isHighlighted = matchesSearch(appointment, 'appointment');
                        return (
                        <div 
                          key={appointment.id} 
                          className={`flex flex-col sm:flex-row sm:items-start sm:justify-between p-3 border rounded-lg gap-2 ${
                            isHighlighted 
                              ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                              : 'border bg-white'
                          }`}
                        >
                          <div 
                            className="flex-1 cursor-pointer hover:bg-gray-50 p-1.5 rounded min-w-0"
                            onClick={() => setSelectedAppointment(appointment)}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <h3 className="font-semibold text-sm">{formatServiceType(appointment.serviceType || appointment.service)}</h3>
                              {appointment.source === 'google_calendar' && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs px-1.5 py-0">
                                  <CalendarIcon className="w-3 h-3 mr-0.5" />
                                  Synced
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 space-y-0.5">
                              <p>Pet: {appointment.petName} ({appointment.petType})</p>
                              <p>Owner: {appointment.ownerFirstName} {appointment.ownerLastName}</p>
                              <p>Phone: {appointment.ownerPhoneNumber}</p>
                              <p className="text-gray-500">{new Date(appointment.appointmentDate).toLocaleDateString()} at {appointment.appointmentTime}</p>
                            </div>
                            {appointment.specialNotes && (
                              <p className="text-xs text-gray-700 mt-1.5 break-words" data-testid={`appointment-notes-${appointment.id}`}>
                                <span className="font-medium">Notes:</span> {appointment.specialNotes}
                              </p>
                            )}
                            {appointment.price && (
                              <p className="text-xs text-green-700 font-medium mt-1" data-testid={`appointment-price-${appointment.id}`}>
                                Price: ${appointment.price}
                              </p>
                            )}
                            <p className="text-xs text-blue-600 mt-0.5">Click to view details</p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full sm:w-auto flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-blue-600 border-blue-300 hover:bg-blue-50 w-full sm:w-auto h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAppointment(appointment);
                                setEditOwnerFirstName(appointment.ownerFirstName || '');
                                setEditOwnerLastName(appointment.ownerLastName || '');
                                setEditOwnerPhone(appointment.ownerPhoneNumber || '');
                                setEditPetName(appointment.petName || '');
                                setEditPetType(appointment.petType || '');
                                setEditNotes(appointment.specialNotes || '');
                                setEditPrice(appointment.price || '');
                              }}
                              data-testid={`edit-appointment-${appointment.id}`}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                            <Select
                              key={`appointment-${appointment.id}-${appointment.status}`}
                              value={appointment.status}
                              onValueChange={(status) => updateAppointmentMutation.mutate({ id: appointment.id, status })}
                              disabled={!!typedUser?.isGroomer && !typedUser?.isAdmin}
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

          {/* Denied Appointments - Collapsible Button (Only visible to admins) */}
          {typedUser?.isAdmin && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-between border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700"
                onClick={() => setShowDeniedAppointments(!showDeniedAppointments)}
                data-testid="button-toggle-denied"
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Denied Appointments ({(appointments as any[]).filter((a: any) => a.status === 'rejected' || a.status === 'cancelled').length})
                </span>
                {showDeniedAppointments ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </Button>

              {showDeniedAppointments && (() => {
                const deniedAppointments = ((search.trim() ? filteredAppointments : appointments) as any[]).filter((a: any) => a.status === 'rejected' || a.status === 'cancelled');
                const totalPages = Math.ceil(deniedAppointments.length / APPOINTMENTS_PER_PAGE);
                const startIdx = deniedAppointmentsPage * APPOINTMENTS_PER_PAGE;
                const paginatedAppointments = deniedAppointments.slice(startIdx, startIdx + APPOINTMENTS_PER_PAGE);

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
                        {paginatedAppointments.map((appointment: any) => {
                          const isHighlighted = matchesSearch(appointment, 'appointment');
                          return (
                          <div 
                            key={appointment.id} 
                            className={`flex flex-col sm:flex-row sm:items-start justify-between p-3 border rounded-lg gap-2 ${
                              isHighlighted 
                                ? 'border-2 border-amber-400 bg-amber-50 shadow-md' 
                                : 'border bg-white'
                            }`}
                          >
                            <div 
                              className="flex-1 cursor-pointer hover:bg-gray-50 p-1.5 rounded min-w-0"
                              onClick={() => setSelectedAppointment(appointment)}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <h3 className="font-semibold text-sm">{formatServiceType(appointment.serviceType || appointment.service)}</h3>
                                {appointment.source === 'google_calendar' && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs px-1.5 py-0">
                                    <CalendarIcon className="w-3 h-3 mr-0.5" />
                                    Synced
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 space-y-0.5">
                                <p>Pet: {appointment.petName} ({appointment.petType})</p>
                                <p>Owner: {appointment.ownerFirstName} {appointment.ownerLastName}</p>
                                <p>Phone: {appointment.ownerPhoneNumber}</p>
                                <p className="text-gray-500">{new Date(appointment.appointmentDate).toLocaleDateString()} at {appointment.appointmentTime}</p>
                              </div>
                              <p className="text-xs text-blue-600 mt-0.5">Click to view details</p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full sm:w-auto flex-shrink-0">
                              <Select
                                key={`appointment-${appointment.id}-${appointment.status}`}
                                value={appointment.status}
                                onValueChange={(status) => updateAppointmentMutation.mutate({ id: appointment.id, status })}
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
                                  if (confirm('Are you sure you want to permanently delete this appointment?')) {
                                    deleteAppointmentMutation.mutate(appointment.id);
                                  }
                                }}
                                disabled={deleteAppointmentMutation.isPending}
                                data-testid={`button-delete-appointment-${appointment.id}`}
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

          {/* Google Calendar Events Section */}
          {calendarEvents && calendarEvents.length > 0 && (
            <Card className="border-2 border-purple-200 bg-purple-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-700">
                  <CalendarIcon className="w-5 h-5" />
                  Google Calendar Events ({calendarEvents.length})
                </CardTitle>
                <CardDescription className="text-purple-600">
                  Events from your connected Google Calendar (Read-only)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Previous page button */}
                  {calendarEventsPage > 0 && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg"
                      onClick={() => setCalendarEventsPage(prev => prev - 1)}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                  )}

                  {/* Calendar events grid with swipe support */}
                  <div
                    key={`calendar-events-${calendarEventsPage}`}
                    className="space-y-4"
                    onTouchStart={handleCalendarEventsTouchStart}
                    onTouchMove={handleCalendarEventsTouchMove}
                    onTouchEnd={handleCalendarEventsTouchEnd}
                  >
                    {paginatedCalendarEvents.map((event: any) => (
                      <div key={event.id} className="flex items-center justify-between p-4 border-2 border-purple-200 rounded-lg bg-white">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-purple-600 text-white">
                              <CalendarIcon className="w-3 h-3 mr-1" />
                              Google Calendar
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-purple-900">{event.summary || 'Untitled Event'}</h3>
                          {event.description && (
                            <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                          )}
                          <div className="mt-2 space-y-1">
                            <p className="text-sm text-gray-600">
                              <strong>Start:</strong> {new Date(event.start?.dateTime || event.start?.date).toLocaleString()}
                            </p>
                            <p className="text-sm text-gray-600">
                              <strong>End:</strong> {new Date(event.end?.dateTime || event.end?.date).toLocaleString()}
                            </p>
                            {event.attendees && event.attendees.length > 0 && (
                              <p className="text-sm text-gray-600">
                                <strong>Attendees:</strong> {event.attendees.map((a: any) => a.email).join(', ')}
                              </p>
                            )}
                            {event.linkedContacts && event.linkedContacts.length > 0 && (
                              <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                                <p className="text-xs font-semibold text-purple-700 mb-1">Linked Contacts:</p>
                                {event.linkedContacts.map((contact: any, idx: number) => (
                                  <div key={idx} className="text-xs text-gray-700 ml-2">
                                    <span className="font-medium">{contact.name}</span>
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
                          {event.htmlLink && (
                            <a
                              href={event.htmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-600 hover:underline mt-2 inline-block"
                            >
                              View in Google Calendar →
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Next page button */}
                  {calendarEventsPage < totalCalendarPages - 1 && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg"
                      onClick={() => setCalendarEventsPage(prev => prev + 1)}
                    >
                      <ArrowLeft className="w-5 h-5 rotate-180" />
                    </Button>
                  )}
                </div>

                {/* Page indicators */}
                {totalCalendarPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <span className="text-xs text-gray-500">
                      Page {calendarEventsPage + 1} of {totalCalendarPages}
                    </span>
                    <div className="flex gap-1">
                      {Array.from({ length: totalCalendarPages }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-2 w-2 rounded-full ${
                            i === calendarEventsPage ? 'bg-purple-600' : 'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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
                              if (confirm(`Are you sure you want to delete ${userItem.firstName} ${userItem.lastName}'s account? This action cannot be undone.`)) {
                                deleteUserMutation.mutate(userItem.id);
                              }
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
          
          {/* Google Calendar Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Google Calendar Events
                <Badge variant="secondary" className="ml-2 text-xs">Shared Across All Admins</Badge>
              </CardTitle>
              <CardDescription>
                All admin accounts have access to the same workspace Google Calendar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calendarEventsError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-2">
                    Google Calendar not connected or error fetching events
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    Make sure your Google Calendar is properly connected in the integrations
                  </p>
                  <p className="text-xs text-blue-600 font-medium">
                    ℹ️ All admin accounts share the same workspace calendar
                  </p>
                </div>
              ) : calendarEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No upcoming events found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {calendarEvents.map((event: any, index: number) => (
                    <div 
                      key={event.id || index} 
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-1">
                            {event.summary || 'Untitled Event'}
                          </h4>
                          {event.start && (
                            <p className="text-xs text-gray-600 mb-1">
                              {new Date(event.start.dateTime || event.start.date).toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: event.start.dateTime ? 'numeric' : undefined,
                                minute: event.start.dateTime ? 'numeric' : undefined,
                              })}
                            </p>
                          )}
                          {event.description && (
                            <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                              {event.description}
                            </p>
                          )}
                          {event.attendees && event.attendees.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {event.attendees.slice(0, 3).map((attendee: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {attendee.displayName || attendee.email}
                                </Badge>
                              ))}
                              {event.attendees.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{event.attendees.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        {event.htmlLink && (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-blue text-xs hover:underline ml-2"
                          >
                            View
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="contacts" className="space-y-6">
          <ContactsManager />
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

              {/* Appointment Capacity */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Appointment Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Max Appointments Per Day</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={groomingSettings.find(s => s.setting === 'max_daily_appointments')?.value || '10'}
                      className="w-full p-2 border rounded"
                      onChange={(e) => updateGroomingSettingMutation.mutate({
                        setting: 'max_daily_appointments',
                        value: e.target.value
                      })}
                    />
                  </div>
                  <div>
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
        </TabsContent>
      </Tabs>

      {/* Appointment Details Dialog */}
      {selectedAppointment && (
        <Dialog open={!!selectedAppointment} onOpenChange={() => setSelectedAppointment(null)}>
          <DialogContent className="max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Appointment Details
              </DialogTitle>
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
                    <p className="text-gray-900">{new Date(selectedAppointment.appointmentDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Time</Label>
                    <p className="text-gray-900">{selectedAppointment.appointmentTime}</p>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-gray-900 mb-2">Pet Information</h4>
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
                      <p className="text-gray-900">{selectedAppointment.specialNotes}</p>
                    </div>
                  )}
                </div>
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
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Appointment Dialog */}
      {editingAppointment && (
        <Dialog open={!!editingAppointment} onOpenChange={() => {
          setEditingAppointment(null);
          setEditNotes('');
          setEditPrice('');
          setEditOwnerFirstName('');
          setEditOwnerLastName('');
          setEditOwnerPhone('');
          setEditPetName('');
          setEditPetType('');
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Appointment Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-owner-first-name">Owner First Name</Label>
                  <Input
                    id="edit-owner-first-name"
                    value={editOwnerFirstName}
                    onChange={(e) => setEditOwnerFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-edit-owner-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-owner-last-name">Owner Last Name</Label>
                  <Input
                    id="edit-owner-last-name"
                    value={editOwnerLastName}
                    onChange={(e) => setEditOwnerLastName(e.target.value)}
                    placeholder="Doe"
                    data-testid="input-edit-owner-last-name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-owner-phone">Owner Phone Number</Label>
                <Input
                  id="edit-owner-phone"
                  value={editOwnerPhone}
                  onChange={(e) => setEditOwnerPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  data-testid="input-edit-owner-phone"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-pet-name">Pet Name</Label>
                  <Input
                    id="edit-pet-name"
                    value={editPetName}
                    onChange={(e) => setEditPetName(e.target.value)}
                    placeholder="Buddy"
                    data-testid="input-edit-pet-name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-pet-type">Pet Type</Label>
                  <Input
                    id="edit-pet-type"
                    value={editPetType}
                    onChange={(e) => setEditPetType(e.target.value)}
                    placeholder="Dog"
                    data-testid="input-edit-pet-type"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-notes">Special Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add special notes or instructions for the grooming appointment..."
                  rows={3}
                  data-testid="input-edit-notes"
                />
              </div>
              <div>
                <Label htmlFor="edit-price">Price ($)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="45.00"
                  data-testid="input-edit-price"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingAppointment(null);
                    setEditNotes('');
                    setEditPrice('');
                    setEditOwnerFirstName('');
                    setEditOwnerLastName('');
                    setEditOwnerPhone('');
                    setEditPetName('');
                    setEditPetType('');
                  }}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => updateAppointmentDetailsMutation.mutate({
                    id: editingAppointment.id,
                    ownerFirstName: editOwnerFirstName,
                    ownerLastName: editOwnerLastName,
                    ownerPhoneNumber: editOwnerPhone,
                    petName: editPetName,
                    petType: editPetType,
                    specialNotes: editNotes,
                    price: editPrice
                  })}
                  disabled={updateAppointmentDetailsMutation.isPending}
                  className="bg-brand-blue hover:bg-blue-700"
                  data-testid="button-save-edit"
                >
                  {updateAppointmentDetailsMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Pet Dialog */}
      {editingPet && (
        <Dialog open={!!editingPet} onOpenChange={() => setEditingPet(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Pet</DialogTitle>
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
            </DialogHeader>
            <GroomerForm 
              groomer={editingGroomer}
              onSubmit={(data) => updateGroomerMutation.mutate({ id: editingGroomer.id, data })}
              isPending={updateGroomerMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Groomer Confirmation Dialog */}
      <Dialog open={isSyncAppointmentsConfirmOpen} onOpenChange={setIsSyncAppointmentsConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Sync Appointments from Google Calendar
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-800 dark:text-orange-200 font-semibold mb-2">
                ⚠️ Warning: This action cannot be undone!
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                This will permanently delete <strong>ALL existing appointments</strong> and replace them with events from your Google Calendar.
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Calendar events will be converted to appointments with:
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
              <li>Pet and owner info extracted from event details</li>
              <li>Service type determined from event title</li>
              <li>Phone numbers parsed from descriptions</li>
              <li>Automatic approval for synced appointments</li>
            </ul>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setIsSyncAppointmentsConfirmOpen(false)}
                data-testid="button-cancel-sync-appointments"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  syncAppointmentsMutation.mutate();
                  setIsSyncAppointmentsConfirmOpen(false);
                }}
                disabled={syncAppointmentsMutation.isPending}
                data-testid="button-confirm-sync-appointments"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncAppointmentsMutation.isPending ? 'animate-spin' : ''}`} />
                {syncAppointmentsMutation.isPending ? "Syncing..." : "Yes, Sync Now"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {groomerToDelete && (
        <Dialog open={!!groomerToDelete} onOpenChange={() => setGroomerToDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Groomer</DialogTitle>
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

      {/* Book Appointment Modal */}
      <Dialog open={isBookAppointmentOpen} onOpenChange={setIsBookAppointmentOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Book New Appointment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBookingSubmit} className="space-y-4">
            {/* Contact Search */}
            <div className="relative">
              <Label>Search Existing Contact</Label>
              <Input
                type="text"
                placeholder="Search by name or phone number..."
                value={bookingContactSearch}
                onChange={(e) => {
                  setBookingContactSearch(e.target.value);
                  setShowBookingContactDropdown(e.target.value.trim().length > 0);
                }}
                onFocus={() => bookingContactSearch.trim().length > 0 && setShowBookingContactDropdown(true)}
                data-testid="input-booking-contact-search"
              />
              
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
            <div>
              <Label>Pet Name *</Label>
              <Input
                type="text"
                value={bookingPetInfo.name}
                onChange={(e) => setBookingPetInfo({ ...bookingPetInfo, name: e.target.value })}
                required
                data-testid="input-booking-pet-name"
              />
            </div>

            <div>
              <Label>Pet Type *</Label>
              <Select 
                value={bookingPetInfo.type} 
                onValueChange={(value) => setBookingPetInfo({ ...bookingPetInfo, type: value })}
              >
                <SelectTrigger data-testid="select-booking-pet-type">
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
              <Label>Special Notes</Label>
              <Textarea
                value={bookingPetInfo.notes}
                onChange={(e) => setBookingPetInfo({ ...bookingPetInfo, notes: e.target.value })}
                placeholder="Any special instructions or requirements..."
                data-testid="input-booking-notes"
              />
            </div>

            {/* Service Selection */}
            <div>
              <Label>Select Service *</Label>
              <RadioGroup 
                value={bookingSelectedService} 
                onValueChange={(value) => {
                  setBookingSelectedService(value);
                  // Set default price based on service
                  if (value === 'grooming-full') {
                    setBookingPrice('35');
                  } else if (value === 'grooming-bath') {
                    setBookingPrice('20');
                  }
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="grooming-full" id="booking-full" />
                    <Label htmlFor="booking-full" className="cursor-pointer">Full Grooming</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="grooming-bath" id="booking-bath" />
                    <Label htmlFor="booking-bath" className="cursor-pointer">Bath Only</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Price Selection */}
            {bookingSelectedService && (
              <div>
                <Label>Price (USD) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bookingPrice}
                  onChange={(e) => setBookingPrice(e.target.value)}
                  placeholder="Enter price"
                  required
                  data-testid="input-booking-price"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {bookingSelectedService === 'grooming-full' ? 'Suggested: $35' : 'Suggested: $20'}
                </p>
              </div>
            )}

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
            <SelectItem value="mammals">Mammals</SelectItem>
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
  const [formData, setFormData] = useState({
    name: supply.name || "",
    brand: supply.brand || "",
    category: supply.category || "",
    price: supply.price || "",
    description: supply.description || "",
    imageUrl: supply.imageUrl || "",
    imageUrls: supply.imageUrls || [],
    stockQuantity: supply.stockQuantity || 0,
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
        <label className="block text-sm font-medium mb-1">Brand</label>
        <input
          type="text"
          value={formData.brand}
          onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
          className="w-full p-2 border rounded"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <input
          type="text"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
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
        />
      </div>
      <MultiImageUpload 
        imageUrls={formData.imageUrls || []} 
        onImagesChange={(urls) => setFormData({ ...formData, imageUrls: urls })} 
      />
      <Button type="submit" className="w-full bg-brand-blue hover:bg-blue-600">
        Update Supply
      </Button>
    </form>
  );
}

// Image Upload Component
function ImageUpload({ imageUrl, onImageChange }: { imageUrl: string; onImageChange: (url: string) => void }) {
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
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      onImageChange(data.imageUrl);
      toast({
        title: "Image Uploaded",
        description: "Image has been uploaded successfully.",
      });
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

  return (
    <div className="space-y-3">
      <Label>Image</Label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
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
            <p className="text-sm text-gray-500">Click to upload an image</p>
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
      toast({
        title: "Image Uploaded",
        description: "Image has been uploaded successfully.",
      });
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
            <SelectItem value="mammals">Mammals</SelectItem>
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
    isActive: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      stockQuantity: parseInt(formData.stockQuantity) || 0,
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
              <SelectItem value="toys">Toys</SelectItem>
              <SelectItem value="beds">Beds</SelectItem>
              <SelectItem value="leashes">Leashes</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="fish_tanks">Aquatics</SelectItem>
              <SelectItem value="reptile_tanks">Reptiles</SelectItem>
              <SelectItem value="bird_cages">Bird Cages</SelectItem>
              <SelectItem value="dog_cages">Dog Cages/Houses</SelectItem>
              <SelectItem value="small_animal_cages">Small Animal Cages</SelectItem>
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
            type="number"
            value={formData.stockQuantity}
            onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
            required
          />
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
      <ImageUpload 
        imageUrl={formData.imageUrl} 
        onImageChange={(url) => setFormData({ ...formData, imageUrl: url })} 
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