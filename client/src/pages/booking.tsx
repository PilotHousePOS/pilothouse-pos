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
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { safeGoBack } from "@/lib/navigation";

const SERVICES = [
  { id: 'grooming-full', name: 'Full Grooming', description: 'Complete grooming service', price: 75 },
  { id: 'grooming-bath', name: 'Bath Only', description: 'Professional bath and dry', price: 45 },
];

export default function Booking() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedGroomer, setSelectedGroomer] = useState('');
  const [pets, setPets] = useState<Array<{
    name: string;
    type: string;
    serviceType: string;
    notes: string;
    groomerId?: string;
  }>>([{
    name: '',
    type: 'dog',
    serviceType: '',
    notes: '',
    groomerId: '',
  }]);
  
  const [ownerInfo, setOwnerInfo] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });

  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showCapacityDialog, setShowCapacityDialog] = useState(false);

  // Fetch current user data to check if admin/groomer
  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Fetch grooming settings
  const { data: groomingSettings = [] } = useQuery({
    queryKey: ["/api/admin/grooming-settings"],
    retry: false,
  });

  // Fetch active groomers
  const { data: availableGroomers = [] } = useQuery({
    queryKey: ["/api/groomers"],
    retry: false,
  });

  // Fetch contacts for search
  const { data: allContacts = [] } = useQuery({
    queryKey: ["/api/contacts"],
    retry: false,
  });

  // Fetch all special dates for calendar availability checking
  const { data: allSpecialDates = [] } = useQuery({
    queryKey: ["/api/admin/special-dates"],
    retry: false,
  });

  // Fetch special date settings for selected date
  // Use local date string to avoid timezone issues (e.g., UTC+5 would shift dates)
  const selectedDateStr = selectedDate 
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : '';
  const { data: specialDate } = useQuery({
    queryKey: ["/api/special-dates", selectedDateStr],
    queryFn: async () => {
      if (!selectedDateStr) return null;
      const response = await fetch(`/api/special-dates/${selectedDateStr}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!selectedDateStr,
    retry: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return [];
    
    const query = contactSearch.toLowerCase();
    const searchDigits = contactSearch.replace(/\D/g, '');
    
    return (allContacts as any[]).filter(contact => {
      const name = (contact.name || '').toLowerCase();
      const phone = (contact.phoneNumber || '').replace(/\D/g, '');
      
      const nameMatch = name.includes(query);
      const phoneMatch = searchDigits.length > 0 && phone.includes(searchDigits);
      
      return nameMatch || phoneMatch;
    }).slice(0, 10); // Limit to 10 results
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
      // First word is firstName, second word is lastName
      firstName = nameParts[0];
      lastName = nameParts[1];
    } else if (nameParts.length === 1) {
      // Only one name provided - use as lastName
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
  const isDateAvailable = (date: Date) => {
    // Use local date string to avoid timezone issues
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Check if this is a special date - special dates override normal restrictions
    const hasSpecialDate = (allSpecialDates as any[]).some(sd => sd.date === dateString);
    if (hasSpecialDate) {
      // Special dates are always available regardless of other settings
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
    
    // Prevent same-day bookings for customers only (admins/groomers can book same-day)
    const user = currentUser as any;
    const isAdminOrGroomer = user?.isAdmin || user?.isGroomer;
    
    if (!isAdminOrGroomer) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const selectedDate = new Date(date);
      selectedDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < tomorrow) return false;
    }
    
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
    // Enforce 1:30 PM cutoff as per user requirements
    const endTime = '13:30'; // Hard-coded 1:30 PM limit
    
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
    
    return slots;
  }, [groomingSettings, specialDate, selectedDate, allSpecialDates]);

  const createAppointmentMutation = useMutation({
    mutationFn: async (appointmentData: any) => {
      await apiRequest("POST", "/api/appointments", appointmentData);
    },
    onSuccess: () => {
      toast({
        title: "Appointment Booked!",
        description: "Your appointment has been successfully scheduled.",
      });
      // Reset form
      setSelectedDate(new Date());
      setSelectedTime('');
      setSelectedGroomer('');
      setPets([{ name: '', type: 'dog', serviceType: '', notes: '', groomerId: '' }]);
      setOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
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
      
      // For other errors, show toast
      toast({
        title: "Booking Failed",
        description: "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all pets have required fields
    const invalidPet = pets.find(pet => !pet.name || !pet.type || !pet.serviceType);
    
    if (!selectedDate || !selectedTime || invalidPet || !ownerInfo.lastName || !ownerInfo.phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields for all pets and owner information.",
        variant: "destructive",
      });
      return;
    }

    // Calculate total price from all pets
    const totalPrice = pets.reduce((sum, pet) => {
      const serviceData = SERVICES.find(s => s.id === pet.serviceType);
      return sum + (serviceData?.price || 0);
    }, 0);

    createAppointmentMutation.mutate({
      appointmentDate: selectedDate.toISOString().split('T')[0],
      appointmentTime: selectedTime,
      ...(selectedGroomer && { groomerId: parseInt(selectedGroomer) }),
      ownerFirstName: ownerInfo.firstName,
      ownerLastName: ownerInfo.lastName,
      ownerPhoneNumber: ownerInfo.phoneNumber,
      price: totalPrice.toString(),
      pets: pets.map(pet => ({
        petName: pet.name,
        petType: pet.type,
        serviceType: pet.serviceType,
        specialNotes: pet.notes,
        groomerId: pet.groomerId ? parseInt(pet.groomerId) : undefined,
      })),
    });
  };

  const addPet = () => {
    setPets([...pets, { name: '', type: 'dog', serviceType: '', notes: '', groomerId: '' }]);
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
    updated[index] = { ...updated[index], [field]: value };
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
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Date Selection */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Select Date</Label>
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => !isDateAvailable(date)}
                className="rounded-md border-none"
              />
            </CardContent>
          </Card>
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

        {/* Time Slots */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Available Times</Label>
          <div className="grid grid-cols-3 gap-3">
            {availableTimeSlots.map((time) => (
              <Button
                key={time}
                type="button"
                variant={selectedTime === time ? "default" : "outline"}
                className={`py-2 px-3 text-sm ${
                  selectedTime === time
                    ? 'bg-brand-blue text-white'
                    : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedTime(time)}
              >
                {time}
              </Button>
            ))}
          </div>
        </div>

        {/* Groomer Selection */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Select Groomer (Optional)</Label>
          <Select value={selectedGroomer || "none"} onValueChange={(value) => setSelectedGroomer(value === "none" ? "" : value)}>
            <SelectTrigger className="border-gray-300 rounded-xl" data-testid="select-groomer">
              <SelectValue placeholder="No preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Preference</SelectItem>
              {Array.isArray(availableGroomers) && availableGroomers.map((groomer: any) => (
                <SelectItem key={groomer.id} value={groomer.id.toString()}>
                  {groomer.specialties ? `${groomer.name} (${groomer.specialties})` : groomer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Choose a preferred groomer or leave as "No Preference"
          </p>
        </div>

        {/* Contact Search */}
        <div className="relative">
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Search Existing Contact</Label>
          <Input
            type="text"
            placeholder="Search by name or phone number..."
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
                required
                data-testid="input-owner-lastname"
              />
            </div>
            <Input
              type="tel"
              placeholder="Phone Number *"
              value={ownerInfo.phoneNumber}
              onChange={(e) => setOwnerInfo({ ...ownerInfo, phoneNumber: e.target.value })}
              className="border-gray-300 rounded-xl"
              required
              data-testid="input-owner-phone"
            />
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
                
                <Input
                  type="text"
                  placeholder="Pet Name *"
                  value={pet.name}
                  onChange={(e) => updatePet(index, 'name', e.target.value)}
                  className="border-gray-300 rounded-xl"
                  required
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
                  <RadioGroup value={pet.serviceType} onValueChange={(value) => updatePet(index, 'serviceType', value)}>
                    <div className="space-y-2">
                      {SERVICES.map((service) => (
                        <div key={service.id} className="flex items-center space-x-3 p-2 border rounded-lg hover:bg-gray-50">
                          <RadioGroupItem value={service.id} id={`${service.id}-${index}`} data-testid={`radio-service-${service.id}-${index}`} />
                          <Label htmlFor={`${service.id}-${index}`} className="flex-1 cursor-pointer">
                            <div className="font-medium text-gray-900">{service.name}</div>
                            <div className="text-xs text-gray-500">{service.description}</div>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-600 mb-2 block">Groomer for this Pet (Optional)</Label>
                  <Select 
                    value={pet.groomerId || "default"} 
                    onValueChange={(value) => updatePet(index, 'groomerId', value === "default" ? "" : value)}
                  >
                    <SelectTrigger className="border-gray-300 rounded-xl" data-testid={`select-pet-groomer-${index}`}>
                      <SelectValue placeholder="Use appointment default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        {selectedGroomer ? "Use Appointment Default" : "No Preference"}
                      </SelectItem>
                      {Array.isArray(availableGroomers) && availableGroomers.map((groomer: any) => (
                        <SelectItem key={groomer.id} value={groomer.id.toString()}>
                          {groomer.specialties ? `${groomer.name} (${groomer.specialties})` : groomer.name}
                        </SelectItem>
                      ))}
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
          type="submit"
          disabled={createAppointmentMutation.isPending}
          className="w-full bg-brand-red hover:bg-red-600 text-white py-4 rounded-xl font-semibold text-lg shadow-lg"
        >
          {createAppointmentMutation.isPending 
            ? "Booking..." 
            : "Confirm Booking"
          }
        </Button>
      </form>
      )}
      
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
