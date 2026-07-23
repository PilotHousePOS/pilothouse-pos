import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn, getActiveTenantSlug } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { safeGoBack } from "@/lib/navigation";

const DEFAULT_SERVICES = [
  { id: 'grooming-full', name: 'Full Grooming', description: 'Complete grooming service', price: '35' },
  { id: 'grooming-bath', name: 'Bath Only', description: 'Professional bath and dry', price: '20' },
];

export default function Booking() {
  // Fetch service prices from settings
  const { data: servicePrices } = useQuery<{
    fullGrooming: string; bathOnly: string;
    nailGrind: string; teethBrushing: string; furminator: string; scentPackage: string;
  }>({
    queryKey: ["/api/service-prices"],
  });

  // Build services list with dynamic prices (supports ranges like "40-80")
  const SERVICES = servicePrices ? [
    { id: 'grooming-full', name: 'Full Grooming', description: 'Complete grooming service', price: servicePrices.fullGrooming },
    { id: 'grooming-bath', name: 'Bath Only', description: 'Professional bath and dry', price: servicePrices.bathOnly },
  ] : DEFAULT_SERVICES;

  const ADD_ONS = [
    { id: 'nail-grind', label: 'Nail Grind', price: servicePrices?.nailGrind || '15', priceVaries: false },
    { id: 'teeth-brushing', label: 'Brush Teeth', price: servicePrices?.teethBrushing || '10', priceVaries: false },
    { id: 'furminator', label: 'Furminator — Size dependent. Price determined upon arrival.', price: servicePrices?.furminator || '20', priceVaries: true },
    { id: 'scent-package', label: 'Scent Package', price: servicePrices?.scentPackage || '5', priceVaries: false },
  ];
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedGroomer, setSelectedGroomer] = useState('');
  const [pets, setPets] = useState<Array<{
    name: string;
    type: string;
    serviceType: string;
    notes: string;
    groomerId?: string;
    addOns: string[];
  }>>([{
    name: '',
    type: 'dog',
    serviceType: 'grooming-full',
    notes: '',
    groomerId: '',
    addOns: [],
  }]);
  
  const [ownerInfo, setOwnerInfo] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });

  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showCapacityDialog, setShowCapacityDialog] = useState(false);
  const [showPhoneConfirmDialog, setShowPhoneConfirmDialog] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState<{ baseData: any; dates: string[] } | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringType, setRecurringType] = useState<'monthly' | 'custom'>('monthly');
  const [customRecurringDates, setCustomRecurringDates] = useState<Date[]>([]);

  // Fetch current user data to check if admin/groomer
  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    refetchOnWindowFocus: true,
  });

  // Fetch grooming settings
  const { data: groomingSettings = [] } = useQuery({
    queryKey: ["/api/grooming-settings"],
    retry: false,
  });

  // Fetch contacts for search
  const { data: allContacts = [] } = useQuery({
    queryKey: ["/api/contacts"],
    retry: false,
  });

  // Fetch the logged-in customer's saved pets so they can quickly pick from their profile
  const { data: savedPets = [] } = useQuery<any[]>({
    queryKey: ["/api/customer-pets"],
    retry: false,
    enabled: !!currentUser && !(currentUser as any)?.isAdmin && !(currentUser as any)?.isGroomer,
  });

  // Fetch all special dates for calendar availability checking
  const { data: allSpecialDates = [] } = useQuery({
    queryKey: ["/api/admin/special-dates"],
    retry: false,
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
      
      const slug = getActiveTenantSlug();
      const response = await fetch(`/api/appointments/available-slots?startDate=${startStr}&endDate=${endStr}`, {
        headers: slug ? { 'X-Tenant-Slug': slug } : {},
      });
      if (!response.ok) return {};
      return response.json();
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Use local date string to avoid timezone issues (e.g., UTC+5 would shift dates)
  const selectedDateStr = selectedDate 
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : '';

  // Fetch groomers available for the selected date (checks blocked days)
  const { data: availableGroomers = [] } = useQuery({
    queryKey: ["/api/groomers/available-for-date", selectedDateStr],
    queryFn: async () => {
      if (!selectedDateStr) return [];
      const slug = getActiveTenantSlug();
      const response = await fetch(`/api/groomers/available-for-date/${selectedDateStr}`, {
        headers: slug ? { 'X-Tenant-Slug': slug } : {},
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedDateStr,
    retry: false,
  });

  // Fetch special date settings for selected date
  const { data: specialDate } = useQuery({
    queryKey: ["/api/special-dates", selectedDateStr],
    queryFn: async () => {
      if (!selectedDateStr) return null;
      const slug = getActiveTenantSlug();
      const response = await fetch(`/api/special-dates/${selectedDateStr}`, {
        headers: slug ? { 'X-Tenant-Slug': slug } : {},
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!selectedDateStr,
    retry: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect to login if session has expired
  useEffect(() => {
    if (!isUserLoading && currentUser === null) {
      window.location.href = "/api/login";
    }
  }, [currentUser, isUserLoading]);

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return [];
    
    const query = contactSearch.toLowerCase();
    const searchDigits = contactSearch.replace(/\D/g, '');
    
    return (allContacts as any[]).filter(contact => {
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
  }, [contactSearch, allContacts]);

  // Handle contact selection
  const handleSelectContact = (contact: any) => {
    // Pattern: "FirstName LastName"
    // Example: "Angie Arnendariz"
    
    let contactName = contact.name || '';
    
    // Remove phone number from the name if present
    const phoneDigits = (contact.phoneNumber || '').replace(/\D/g, '');
    if (phoneDigits) {
      contactName = contactName.replace(phoneDigits, '').trim();
    }
    
    // Split remaining parts
    const nameParts = contactName.split(/\s+/).filter(Boolean);
    
    // Parse as "FirstName LastName" format
    let firstName = '';
    let lastName = '';
    
    if (nameParts.length >= 2) {
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    } else if (nameParts.length === 1) {
      lastName = nameParts[0];
    }
    
    // Update owner info with parsed names
    setOwnerInfo({
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
      setPets(newPets);
      
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      toast({
        title: "Contact Selected",
        description: `Information populated for ${fullName} - ${contact.petNames.join(', ')}`,
      });
    } else {
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      toast({
        title: "Contact Selected",
        description: `Information populated for ${fullName}`,
      });
    }
    
    setContactSearch(contact.name || '');
    setShowContactDropdown(false);
  };

  // Check if a date is available for booking
  // True when at least one pet in the form is a cat
  const hasCat = pets.some(p => p.type === 'cat');

  // Returns true if a time string (e.g. "9:15 AM") is strictly after 9:00 AM
  const isTimeAfter9AM = (timeStr: string) => {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return false;
    const hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const period = match[3].toUpperCase();
    if (period === 'PM') return true;
    if (hour > 9) return true;
    if (hour === 9 && minute > 0) return true;
    return false;
  };

  const isDateAvailable = (date: Date) => {
    // Block past dates using Central Time
    const nowCentral = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const todayCentral = new Date(nowCentral.getFullYear(), nowCentral.getMonth(), nowCentral.getDate());
    const dateToCheck = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (dateToCheck < todayCentral) return false;

    // Use local date string to avoid timezone issues
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Check if this is a special date - special dates override normal restrictions
    const hasSpecialDate = (allSpecialDates as any[]).some(sd => sd.date === dateString);
    if (hasSpecialDate) {
      // Special dates are always available regardless of other settings (but still can't be in the past)
      return true;
    }
    
    // Enforce no Sunday appointments as per user requirements
    if (date.getDay() === 0) return false; // Sunday = 0
    
    const settings = groomingSettings as any[];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayEnabledSetting = settings.find(s => s.setting === `${dayName}_enabled`);
    const isDayEnabled = dayEnabledSetting ? dayEnabledSetting.value === 'true' : true;
    
    if (!isDayEnabled) return false;
    
    // Check blocked dates
    const blockedDates = settings.find(s => s.setting === 'blocked_dates')?.value || '';
    const blockedList = blockedDates.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    
    if (blockedList.includes(dateString)) return false;

    // Cats are only accepted Mon (1), Tue (2), Thu (4)
    if (hasCat && ![1, 2, 4].includes(date.getDay())) return false;
    
    // Check advance booking limit
    const advanceBookingDays = parseInt(settings.find(s => s.setting === 'advance_booking_days')?.value || '30');
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + advanceBookingDays);
    // Normalize maxDate to end of day to ensure the full last day is bookable
    maxDate.setHours(23, 59, 59, 999);
    
    // Normalize the date being checked to start of day for consistent comparison
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    if (checkDate > maxDate) return false;
    
    return true;
  };

  // Generate available time slots in 15-minute intervals
  const availableTimeSlots = useMemo(() => {
    // If selected date is not available, don't show any time slots
    if (selectedDate && !isDateAvailable(selectedDate)) {
      return [];
    }
    
    // If there's a special date with custom times, use those instead
    if (specialDate && specialDate.allowedTimes && specialDate.allowedTimes.length > 0) {
      return specialDate.allowedTimes.map((t: any) => t.allowedTime).sort();
    }
    
    // Otherwise, generate regular time slots
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
    
    // Generate slots in 15-minute intervals
    while (currentTime < endDateTime) {
      const timeString = currentTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
      slots.push(timeString);
      currentTime.setMinutes(currentTime.getMinutes() + 15); // 15-minute intervals
    }

    // If the selected date is today (CST), hide time slots that have already passed
    if (selectedDate) {
      const nowCentral = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const todayCentral = new Date(nowCentral.getFullYear(), nowCentral.getMonth(), nowCentral.getDate());
      const selectedMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      if (selectedMidnight.getTime() === todayCentral.getTime()) {
        return slots.filter(slot => {
          const match = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (!match) return true;
          let h = parseInt(match[1]);
          const m = parseInt(match[2]);
          const period = match[3].toUpperCase();
          if (period === 'PM' && h !== 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          const slotTime = new Date(nowCentral.getFullYear(), nowCentral.getMonth(), nowCentral.getDate(), h, m, 0);
          return slotTime > nowCentral;
        });
      }
    }

    return slots;
  }, [groomingSettings, specialDate, selectedDate, allSpecialDates]);

  const createAppointmentMutation = useMutation({
    mutationFn: async (appointmentData: any) => {
      const response = await apiRequest("POST", "/api/appointments", appointmentData);
      return response.json();
    },
    onSuccess: (data: any) => {
      let description = "Your appointment has been successfully scheduled.";
      if (data?.remainingSlots) {
        const total = data.remainingSlots.totalAvailable;
        if (total > 0) {
          description = `Your appointment is scheduled! ${total} slot${total !== 1 ? 's' : ''} remaining for this date.`;
        } else {
          description = "Your appointment is scheduled! This date is now fully booked.";
        }
      }
      toast({
        title: "Appointment Booked!",
        description,
      });
      // Reset form
      setSelectedDate(new Date());
      setSelectedTime('');
      setSelectedGroomer('');
      setPets([{ name: '', type: 'dog', serviceType: 'grooming-full', notes: '', groomerId: '', addOns: [] }]);
      setOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      setSmsConsent(false);
      setContactSearch('');
      setIsRecurring(false);
      setRecurringType('monthly');
      setCustomRecurringDates([]);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/available-slots"] });
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
        setShowCapacityDialog(true);
        return;
      }
      
      // For other errors, show toast with actual error message
      toast({
        title: "Booking Failed",
        description: errorText || "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fires the actual booking mutation(s) — called either directly from handleSubmit
  // or from the phone-confirm dialog when the user confirms the number is correct.
  const fireBooking = async (baseData: any, dates: string[]) => {
    if (dates.length === 1) {
      createAppointmentMutation.mutate({
        ...baseData,
        appointmentDate: dates[0],
      });
    } else {
      let successCount = 0;
      let failedDates: string[] = [];
      let capacityFailedDates: string[] = [];
      let unauthorizedError = false;
      for (const date of dates) {
        try {
          await apiRequest("POST", "/api/appointments", { ...baseData, appointmentDate: date });
          successCount++;
        } catch (err: any) {
          if (isUnauthorizedError(err)) { unauthorizedError = true; break; }
          let errorText = '';
          if (err?.message) {
            const parts = err.message.split(': ', 2);
            if (parts.length === 2) { try { errorText = JSON.parse(parts[1]).message || ''; } catch { errorText = parts[1]; } }
            else { errorText = err.message; }
          }
          if (errorText.includes('capacity is fully booked') || errorText.includes('capacity would be exceeded')) {
            capacityFailedDates.push(date);
          } else { failedDates.push(date); }
        }
      }
      if (unauthorizedError) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      const totalFailed = failedDates.length + capacityFailedDates.length;
      if (totalFailed === 0) {
        toast({ title: "Recurring Appointments Created", description: `Successfully created ${successCount} appointments.` });
      } else if (capacityFailedDates.length > 0 && successCount === 0) {
        setShowCapacityDialog(true);
        return;
      } else {
        let failureMsg = `Created ${successCount} appointments.`;
        if (capacityFailedDates.length > 0) failureMsg += ` ${capacityFailedDates.length} date(s) fully booked.`;
        if (failedDates.length > 0) failureMsg += ` ${failedDates.length} failed.`;
        toast({ title: "Partial Success", description: failureMsg, variant: "destructive" });
      }
      setSelectedDate(new Date());
      setSelectedTime('');
      setSelectedGroomer('');
      setPets([{ name: '', type: 'dog', serviceType: 'grooming-full', notes: '', groomerId: '', addOns: [] }]);
      setOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      setContactSearch('');
      setIsRecurring(false);
      setRecurringType('monthly');
      setCustomRecurringDates([]);
    }
  };

  const handleSubmit = async () => {
    try {
    
    // Validate all pets have required fields
    const invalidPet = pets.find(pet => !pet.name || !pet.type || !pet.serviceType);
    
    const bookingUser = currentUser as any;
    const isAdminOrGroomerBooking = bookingUser?.isAdmin || bookingUser?.isGroomer;

    if (!selectedDate || !selectedTime || invalidPet || !ownerInfo.lastName || !ownerInfo.phoneNumber) {
      const missing: string[] = [];
      if (!selectedDate) missing.push("appointment date");
      if (!selectedTime) missing.push("appointment time");
      if (!ownerInfo.lastName) missing.push("last name");
      if (!ownerInfo.phoneNumber) missing.push("phone number");
      if (invalidPet) {
        if (!invalidPet.name) missing.push("pet name");
        if (!invalidPet.type) missing.push("animal type");
        if (!invalidPet.serviceType) missing.push("service type (Full Grooming or Bath Only)");
      }
      toast({
        title: "Missing Information",
        description: `Please fill in: ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    if (!isAdminOrGroomerBooking && ownerInfo.phoneNumber && !smsConsent) {
      toast({
        title: "SMS Consent Required",
        description: "Please check the box to consent to receive text message updates about your appointment.",
        variant: "destructive",
      });
      return;
    }

    // Helper: add a dollar amount to a price string that may be a range like "40-80"
    const addToPrice = (basePrice: string, addOnTotal: number): string => {
      if (addOnTotal === 0) return basePrice;
      if (basePrice.includes('-')) {
        const [low, high] = basePrice.split('-').map(p => parseFloat(p.trim()) || 0);
        return `${low + addOnTotal}-${high + addOnTotal}`;
      }
      return ((parseFloat(basePrice) || 0) + addOnTotal).toString();
    };

    // Build price description from all pets — base service price + add-on prices
    const priceDescription = pets.map(pet => {
      const serviceData = SERVICES.find(s => s.id === pet.serviceType);
      const basePrice = serviceData?.price || '0';
      const addOnTotal = (pet.addOns || []).reduce((sum, id) => {
        const addon = ADD_ONS.find(a => a.id === id);
        return sum + (parseFloat(addon?.price || '0') || 0);
      }, 0);
      return addToPrice(basePrice, addOnTotal);
    }).join(' + ');

    // Build list of dates to create appointments for
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // Use a Set to automatically prevent duplicates
    const appointmentDateSet = new Set<string>();
    
    // Always include the primary selected date
    appointmentDateSet.add(formatDate(selectedDate));
    
    if (isRecurring) {
      if (recurringType === 'monthly') {
        // Generate dates for the next 6 months on the same day
        for (let i = 1; i <= 6; i++) {
          const futureDate = new Date(selectedDate);
          futureDate.setMonth(futureDate.getMonth() + i);
          // Handle edge case where day doesn't exist in future month (e.g., Jan 31 -> Feb 28)
          if (futureDate.getDate() !== selectedDate.getDate()) {
            // Set to last day of previous month
            futureDate.setDate(0);
          }
          appointmentDateSet.add(formatDate(futureDate));
        }
      } else if (recurringType === 'custom' && customRecurringDates.length > 0) {
        // Add custom selected dates (Set prevents duplicates automatically)
        customRecurringDates.forEach(date => {
          appointmentDateSet.add(formatDate(date));
        });
      }
    }
    
    const uniqueAppointmentDates = [...appointmentDateSet];

    const baseAppointmentData = {
      appointmentTime: selectedTime,
      ...(selectedGroomer && { groomerId: parseInt(selectedGroomer) }),
      ownerFirstName: ownerInfo.firstName,
      ownerLastName: ownerInfo.lastName,
      ownerPhoneNumber: ownerInfo.phoneNumber,
      price: priceDescription,
      isRecurring: isRecurring,
      recurringType: isRecurring ? recurringType : undefined,
      pets: pets.map(pet => ({
        petName: pet.name,
        petType: pet.type,
        serviceType: pet.serviceType,
        specialNotes: pet.notes,
        groomerId: pet.groomerId ? parseInt(pet.groomerId) : undefined,
        addOns: pet.addOns.length > 0 ? pet.addOns.join(',') : undefined,
      })),
    };

    // Phone number mismatch check — only for regular customers (not admin/groomer)
    const user = currentUser as any;
    const isAdminOrGroomer = user?.isAdmin || user?.isGroomer;
    if (!isAdminOrGroomer && user?.phoneNumber) {
      const enteredDigits = ownerInfo.phoneNumber.replace(/\D/g, '');
      const accountDigits = (user.phoneNumber as string).replace(/\D/g, '');
      if (enteredDigits && accountDigits && enteredDigits !== accountDigits) {
        setPendingBookingData({ baseData: baseAppointmentData, dates: uniqueAppointmentDates });
        setShowPhoneConfirmDialog(true);
        return;
      }
    }

    // No mismatch — proceed directly
    await fireBooking(baseAppointmentData, uniqueAppointmentDates);

    } catch (err: any) {
      toast({
        title: "Booking Error",
        description: err?.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  const addPet = () => {
    setPets([...pets, { name: '', type: 'dog', serviceType: 'grooming-full', notes: '', groomerId: '', addOns: [] }]);
  };

  const removePet = (index: number) => {
    if (pets.length === 1) {
      toast({
        title: "Cannot Remove",
        description: "You must have at least one pet for the appointment.",
        variant: "destructive",
      });
      return;
    }
    setPets(pets.filter((_, i) => i !== index));
  };

  const updatePet = (index: number, field: string, value: string) => {
    const updated = [...pets];
    const changes: Record<string, any> = { [field]: value };
    // When pet type changes to cat, force Bath Only and clear add-ons
    if (field === 'type' && value === 'cat') {
      changes.serviceType = 'grooming-bath';
      changes.addOns = [];
    }
    updated[index] = { ...updated[index], ...changes };
    setPets(updated);
  };

  // When hasCat changes to true, clear any date/time that's now invalid for cats
  useEffect(() => {
    if (hasCat) {
      let dateCleared = false;
      if (selectedDate) {
        const day = selectedDate.getDay();
        if (![1, 2, 4].includes(day)) {
          setSelectedDate(undefined);
          setSelectedTime('');
          dateCleared = true;
        }
      }
      if (!dateCleared && selectedTime && isTimeAfter9AM(selectedTime)) {
        setSelectedTime('');
      }
      if (dateCleared) {
        toast({
          title: "Date Cleared",
          description: "Cat grooming is only available Monday, Tuesday, and Thursday. Please select a new date.",
          variant: "destructive",
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCat]);

  const togglePetAddOn = (index: number, addOnId: string) => {
    const updated = [...pets];
    const current = updated[index].addOns || [];
    updated[index] = {
      ...updated[index],
      addOns: current.includes(addOnId)
        ? current.filter(a => a !== addOnId)
        : [...current, addOnId],
    };
    setPets(updated);
  };

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

      <div className="px-6 pt-16 pb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Book Appointment</h2>

      {/* Loading state while checking user role */}
      {isUserLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue mx-auto mb-4"></div>
            <p className="text-gray-600">Loading booking options...</p>
          </div>
        </div>
      ) : (
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">

        {/* Date Selection */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Select Date</Label>
          <div className="flex flex-col md:flex-row gap-4">
            <Card className="flex-shrink-0">
              <CardContent className="p-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => !isDateAvailable(date)}
                  className="rounded-md border-none"
                  components={{
                    DayContent: ({ date }) => {
                      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                      const slots = (availableSlots as any)[dateStr];
                      const isAvailable = isDateAvailable(date);
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
              </CardContent>
            </Card>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-1">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> The slots shown left open include baths and grooms. It may say 10 left and the slots open are baths not grooms or vice versa.
              </p>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <div className="text-yellow-600 font-bold text-lg">⚠️</div>
            <div>
              <h4 className="font-bold text-yellow-800 mb-2">IMPORTANT NOTICE</h4>
              <p className="text-sm text-yellow-700">
                <strong>NO Poodles, Doodles, German Shepherds, or Large Breed Dogs after 12:00 PM!</strong>
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                If you schedule for after 12:00 PM with a large dog, you will be asked to reschedule when you arrive.
              </p>
            </div>
          </div>
        </div>

        {/* Special Date Notice */}
        {specialDate && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <div className="text-blue-600 font-bold text-lg">ℹ️</div>
              <div>
                <h4 className="font-bold text-blue-800 mb-1">Special Date: {specialDate.name}</h4>
                <p className="text-sm text-blue-700">
                  Limited time slots available for this date.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cat-only notice */}
        {hasCat && (
          <div className="bg-purple-50 border border-purple-300 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <div className="text-purple-600 font-bold text-lg">🐱</div>
              <div>
                <h4 className="font-bold text-purple-800 mb-1">Cat Grooming — Limited Availability</h4>
                <p className="text-sm text-purple-700">
                  For the safety of your cat, we accept cats <strong>Monday, Tuesday, and Thursday only</strong>, and they must arrive <strong>by 9:00 AM</strong>. This minimizes exposure to dogs during peak hours.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Time Slots */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Available Times</Label>
          <div className="grid grid-cols-3 gap-3">
            {availableTimeSlots.map((time) => {
              const disabledForCat = hasCat && isTimeAfter9AM(time);
              return (
                <Button
                  key={time}
                  type="button"
                  variant={selectedTime === time ? "default" : "outline"}
                  disabled={disabledForCat}
                  className={`py-2 px-3 text-sm ${
                    selectedTime === time
                      ? 'bg-brand-blue text-white'
                      : disabledForCat
                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed line-through opacity-60'
                      : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                  }`}
                  onClick={() => { if (!disabledForCat) setSelectedTime(time); }}
                >
                  {time}
                </Button>
              );
            })}
          </div>
          {hasCat && (
            <p className="text-xs text-purple-600 mt-2">Times after 9:00 AM are unavailable for cats.</p>
          )}
        </div>

        {/* Recurring Appointment Options */}
        <Card>
          <CardContent className="p-4 space-y-4">
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
              <Label htmlFor="recurring-checkbox" className="text-base font-semibold text-gray-900 cursor-pointer">
                Make this a recurring appointment
              </Label>
            </div>

            {isRecurring && (
              <div className="space-y-4 pl-8">
                <div className="flex flex-col space-y-3">
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
                    <Label htmlFor="recurring-monthly" className="text-gray-700 cursor-pointer">
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
                    <Label htmlFor="recurring-custom" className="text-gray-700 cursor-pointer">
                      Custom dates
                    </Label>
                  </div>
                </div>

                {recurringType === 'monthly' && selectedDate && (
                  <p className="text-sm text-gray-600">
                    Appointments will be created on the {selectedDate.getDate()}th of each month for the next 6 months.
                  </p>
                )}

                {recurringType === 'custom' && (
                  <div className="space-y-3">
                    <Label className="text-sm text-gray-700">Select additional dates:</Label>
                    <Calendar
                      mode="multiple"
                      selected={customRecurringDates}
                      onSelect={(dates) => setCustomRecurringDates(dates || [])}
                      disabled={(date) => {
                        if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
                          return true;
                        }
                        return !isDateAvailable(date);
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
          </CardContent>
        </Card>

        {/* Groomer Selection */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Select Groomer (Optional)</Label>
          <Select value={selectedGroomer || "none"} onValueChange={(value) => setSelectedGroomer(value === "none" ? "" : value)}>
            <SelectTrigger className="border-gray-300 rounded-xl" data-testid="select-groomer">
              <SelectValue placeholder="No preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Preference</SelectItem>
              {Array.isArray(availableGroomers) && availableGroomers.map((groomer: any) => {
                const remaining = groomer.fullGroomsRemaining ?? 5;
                const isFull = remaining <= 0;
                return (
                  <SelectItem key={groomer.id} value={groomer.id.toString()}>
                    {groomer.name}{groomer.specialties ? ` (${groomer.specialties})` : ''}{isFull ? ' - Full Grooms Full' : remaining < 5 ? ` - ${remaining} full groom${remaining !== 1 ? 's' : ''} left` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Choose a preferred groomer or leave as "No Preference". Each groomer can take up to 5 full grooms per day.
          </p>
        </div>

        {/* Contact Search */}
        <div className="relative">
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Search Existing Contact</Label>
          <Input
            type="text"
            placeholder="Search by name, phone, or pet name..."
            value={contactSearch}
            onChange={(e) => {
              setContactSearch(e.target.value);
              setShowContactDropdown(e.target.value.trim().length > 0);
            }}
            onFocus={() => contactSearch.trim().length > 0 && setShowContactDropdown(true)}
            className="border-gray-300 rounded-xl"
            data-testid="input-contact-search"
          />
          
          {showContactDropdown && filteredContacts.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {filteredContacts.map((contact: any, index: number) => (
                <div
                  key={contact.id || index}
                  className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                  onClick={() => handleSelectContact(contact)}
                  data-testid={`contact-option-${index}`}
                >
                  <div className="font-medium text-gray-900">{contact.name}</div>
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
          
          {showContactDropdown && contactSearch.trim().length > 0 && filteredContacts.length === 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg p-4 text-center text-sm text-gray-500">
              No contacts found matching "{contactSearch}"
            </div>
          )}
        </div>

        {/* Owner Information */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Owner Information</Label>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder="First Name"
                value={ownerInfo.firstName}
                onChange={(e) => setOwnerInfo({ ...ownerInfo, firstName: e.target.value })}
                className="border-gray-300 rounded-xl"
                data-testid="input-owner-firstname"
              />
              <Input
                type="text"
                placeholder="Last Name *"
                value={ownerInfo.lastName}
                onChange={(e) => setOwnerInfo({ ...ownerInfo, lastName: e.target.value })}
                className="border-gray-300 rounded-xl"
                data-testid="input-owner-lastname"
              />
            </div>
            <Input
              type="tel"
              placeholder="Phone Number *"
              value={ownerInfo.phoneNumber}
              onChange={(e) => setOwnerInfo({ ...ownerInfo, phoneNumber: e.target.value })}
              className="border-gray-300 rounded-xl"
              data-testid="input-owner-phone"
            />
            {/* SMS Consent — required for Twilio toll-free compliance */}
            {!(currentUser as any)?.isAdmin && !(currentUser as any)?.isGroomer && (
              <label className="flex items-start gap-2 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-blue-600"
                  data-testid="checkbox-sms-consent"
                />
                <span className="text-xs text-gray-600 leading-snug">
                  By providing my phone number, I consent to receive text message updates about my appointment from PilotHouse. Message &amp; data rates may apply. Reply <strong>STOP</strong> to opt out.
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Pet Information - Multiple Pets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold text-gray-900">Pet Information</Label>
            <Button
              type="button"
              onClick={addPet}
              variant="outline"
              size="sm"
              className="text-brand-blue border-brand-blue hover:bg-brand-blue hover:text-white"
              data-testid="button-add-pet"
            >
              + Add Another Pet
            </Button>
          </div>
          
          {pets.map((pet, index) => (
            <Card key={index} className="mb-4">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">Pet {index + 1}</h4>
                  {pets.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removePet(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-remove-pet-${index}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                
                {savedPets.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(value) => {
                      const chosen = savedPets.find((p: any) => String(p.id) === value);
                      if (chosen) {
                        updatePet(index, 'name', chosen.name);
                        updatePet(index, 'type', chosen.species);
                      }
                    }}
                  >
                    <SelectTrigger className="border-gray-300 rounded-xl bg-blue-50" data-testid={`select-saved-pet-${index}`}>
                      <SelectValue placeholder="Or choose from your saved pets" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedPets.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} ({p.species})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Input
                  type="text"
                  placeholder="Pet Name *"
                  value={pet.name}
                  onChange={(e) => updatePet(index, 'name', e.target.value)}
                  className="border-gray-300 rounded-xl"
                  data-testid={`input-pet-name-${index}`}
                />
                
                <Select value={pet.type} onValueChange={(value) => updatePet(index, 'type', value)}>
                  <SelectTrigger className="border-gray-300 rounded-xl" data-testid={`select-pet-type-${index}`}>
                    <SelectValue placeholder="Select Pet Type *" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="cat">Cat</SelectItem>
                    <SelectItem value="bird">Bird</SelectItem>
                    <SelectItem value="fish">Fish</SelectItem>
                    <SelectItem value="reptile">Reptile</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                
                <div>
                  <Label className="text-xs text-gray-600 mb-2 block">Service Type *</Label>
                  {pet.type === 'cat' && (
                    <p className="text-xs text-purple-600 mb-2">Cats receive Bath Only service.</p>
                  )}
                  <RadioGroup value={pet.serviceType} onValueChange={(value) => updatePet(index, 'serviceType', value)}>
                    <div className="space-y-2">
                      {SERVICES.filter(s => pet.type !== 'cat' || s.id === 'grooming-bath').map((service) => (
                        <div key={service.id} className="flex items-center space-x-3 p-2 border rounded-lg hover:bg-gray-50">
                          <RadioGroupItem value={service.id} id={`${service.id}-${index}`} data-testid={`radio-service-${service.id}-${index}`} />
                          <Label htmlFor={`${service.id}-${index}`} className="flex-1 cursor-pointer">
                            <div className="font-medium text-gray-900">{service.name} ${service.price}</div>
                            <div className="text-xs text-gray-500">
                              (Prices will vary. This is an estimated price. Price is determined by size upon arrival.)
                              {service.id === 'grooming-full' && <span> (Hair cut, Bath, and Nail Clip)</span>}
                              {service.id === 'grooming-bath' && <span> (Bath, and Nail Clip)</span>}
                            </div>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                </div>

                {pet.type !== 'cat' && (
                <div>
                  <Label className="text-xs text-gray-600 mb-2 block">Add-On Services (Optional)</Label>
                  <div className="space-y-2">
                    {ADD_ONS.map((addon) => {
                      const checked = (pet.addOns || []).includes(addon.id);
                      return (
                        <div
                          key={addon.id}
                          className={`flex items-center space-x-3 p-2 border rounded-lg cursor-pointer transition-colors ${checked ? 'border-brand-red bg-red-50' : 'hover:bg-gray-50'}`}
                          onClick={() => togglePetAddOn(index, addon.id)}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePetAddOn(index, addon.id)}
                            className="w-4 h-4 accent-red-600"
                            data-testid={`checkbox-addon-${addon.id}-${index}`}
                          />
                          <span className="flex-1 text-sm font-medium text-gray-900">{addon.label}</span>
                          {addon.priceVaries
                            ? <span className="text-xs text-amber-600 font-medium whitespace-nowrap">price varies</span>
                            : <span className="text-sm text-gray-500">+${addon.price}</span>
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                <div>
                  <Label className="text-xs text-gray-600 mb-2 block">Groomer for this Pet (Optional)</Label>
                  <Select 
                    value={pet.groomerId || "default"} 
                    onValueChange={(value) => updatePet(index, 'groomerId', value === "default" ? "" : value)}
                  >
                    <SelectTrigger className="border-gray-300 rounded-xl" data-testid={`select-pet-groomer-${index}`}>
                      <SelectValue placeholder="Use appointment default" />
                    </SelectTrigger>
                    <SelectContent side="top" avoidCollisions={false}>
                      <SelectItem value="default">
                        {selectedGroomer ? "Use Appointment Default" : "No Preference"}
                      </SelectItem>
                      {Array.isArray(availableGroomers) && availableGroomers.map((groomer: any) => {
                        const remaining = groomer.fullGroomsRemaining ?? 5;
                        const isFull = remaining <= 0;
                        return (
                          <SelectItem key={groomer.id} value={groomer.id.toString()}>
                            {groomer.name}{groomer.specialties ? ` (${groomer.specialties})` : ''}{isFull ? ' - Full Grooms Full' : remaining < 5 ? ` - ${remaining} full groom${remaining !== 1 ? 's' : ''} left` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Override appointment-level groomer for this specific pet
                  </p>
                </div>
                
                <Textarea
                  placeholder="Special notes or instructions..."
                  value={pet.notes}
                  onChange={(e) => updatePet(index, 'notes', e.target.value)}
                  className="border-gray-300 rounded-xl h-20 resize-none"
                  data-testid={`textarea-pet-notes-${index}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Book Button */}
        <Button 
          type="button"
          onClick={handleSubmit}
          disabled={createAppointmentMutation.isPending}
          className="w-full bg-brand-red hover:bg-red-600 text-white py-4 rounded-xl font-semibold text-lg shadow-lg mb-6"
        >
          {createAppointmentMutation.isPending 
            ? "Booking..." 
            : "Confirm Booking"
          }
        </Button>
      </form>
      )}
      
      {/* Phone Number Mismatch Confirmation Dialog */}
      <Dialog open={showPhoneConfirmDialog} onOpenChange={setShowPhoneConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Phone Number Doesn't Match</DialogTitle>
            <DialogDescription className="text-base pt-3">
              The number you entered{' '}
              <span className="font-semibold text-gray-900">({ownerInfo.phoneNumber})</span>{' '}
              is different from the phone number on your account{' '}
              <span className="font-semibold text-gray-900">({(currentUser as any)?.phoneNumber})</span>.
              <br /><br />
              Is this the correct number to use for this appointment?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setShowPhoneConfirmDialog(false);
                setPendingBookingData(null);
              }}
              data-testid="button-phone-confirm-no"
            >
              No, let me change it
            </Button>
            <Button
              className="bg-brand-red hover:bg-red-600 text-white"
              onClick={async () => {
                setShowPhoneConfirmDialog(false);
                if (pendingBookingData) {
                  await fireBooking(pendingBookingData.baseData, pendingBookingData.dates);
                  setPendingBookingData(null);
                }
              }}
              data-testid="button-phone-confirm-yes"
            >
              Yes, use this number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Capacity Error Dialog */}
      <Dialog open={showCapacityDialog} onOpenChange={setShowCapacityDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Fully Booked</DialogTitle>
            <DialogDescription className="text-center text-base pt-4">
              We are fully booked for that day. Please select a different date.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setShowCapacityDialog(false)}
              className="bg-brand-red hover:bg-red-600 text-white px-8"
              data-testid="button-capacity-dialog-close"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
