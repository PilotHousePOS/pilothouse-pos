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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { safeGoBack } from "@/lib/navigation";

const SERVICES = [
  { id: 'grooming-full', name: 'Full Grooming', description: 'Complete grooming service', price: 35 },
  { id: 'grooming-bath', name: 'Bath Only', description: 'Professional bath and dry', price: 20 },
];

export default function Booking() {
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedGroomer, setSelectedGroomer] = useState('');
  const [petInfo, setPetInfo] = useState({
    name: '',
    type: '',
    notes: '',
  });
  
  const [ownerInfo, setOwnerInfo] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });

  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Fetch grooming settings
  const { data: groomingSettings = [] } = useQuery({
    queryKey: ["/api/admin/grooming-settings"],
    retry: false,
  });

  // Fetch available groomers for selected date
  const { data: availableGroomers = [] } = useQuery({
    queryKey: ["/api/groomers/available", selectedDate?.getDay()],
    queryFn: () => selectedDate ? 
      fetch(`/api/groomers/available/${selectedDate.getDay()}`).then(res => res.json()) : 
      [],
    enabled: !!selectedDate,
    retry: false,
  });

  // Fetch contacts for search
  const { data: allContacts = [] } = useQuery({
    queryKey: ["/api/contacts"],
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
    // Pattern: "LastName PetName PhoneNumber GroomerTag"
    // Example: "Diaz Oreo 3183344619"
    
    let contactName = contact.name || '';
    
    // Remove phone number from the name if present
    const phoneDigits = (contact.phoneNumber || '').replace(/\D/g, '');
    if (phoneDigits) {
      contactName = contactName.replace(phoneDigits, '').trim();
    }
    
    // Split remaining parts
    const nameParts = contactName.split(/\s+/).filter(Boolean);
    
    // First word is Last Name
    const lastName = nameParts[0] || '';
    
    // Remaining words (before phone/groomer tag) are Pet Name(s)
    const petName = nameParts.slice(1).join(' ') || '';
    
    // Update owner info with last name only (no first name in this pattern)
    setOwnerInfo({
      firstName: '',
      lastName,
      phoneNumber: contact.phoneNumber || '',
    });
    
    // Auto-fill pet name if extracted
    if (petName) {
      setPetInfo(prev => ({
        ...prev,
        name: petName,
      }));
    }
    
    setContactSearch(contact.name || '');
    setShowContactDropdown(false);
    
    toast({
      title: "Contact Selected",
      description: `Information populated for ${lastName}${petName ? ` - ${petName}` : ''}`,
    });
  };

  // Reset groomer selection when date changes
  useEffect(() => {
    setSelectedGroomer('');
  }, [selectedDate]);

  // Generate available time slots in 15-minute intervals
  const availableTimeSlots = useMemo(() => {
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
  }, [groomingSettings]);

  // Check if a date is available for booking
  const isDateAvailable = (date: Date) => {
    // Enforce no Sunday appointments as per user requirements
    if (date.getDay() === 0) return false; // Sunday = 0
    
    const settings = groomingSettings as any[];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayEnabledSetting = settings.find(s => s.setting === `${dayName}_enabled`);
    const isDayEnabled = dayEnabledSetting ? dayEnabledSetting.value === 'true' : true;
    
    if (!isDayEnabled) return false;
    
    // Check blocked dates
    const blockedDates = settings.find(s => s.setting === 'blocked_dates')?.value || '';
    const dateString = date.toISOString().split('T')[0];
    const blockedList = blockedDates.split(',').map((d: string) => d.trim()).filter((d: string) => d);
    
    if (blockedList.includes(dateString)) return false;
    
    // Check advance booking limit
    const advanceBookingDays = parseInt(settings.find(s => s.setting === 'advance_booking_days')?.value || '30');
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + advanceBookingDays);
    
    if (date > maxDate) return false;
    
    // Prevent same-day bookings - customers can only book starting from tomorrow
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < tomorrow) return false;
    
    return true;
  };

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
      setSelectedService('');
      setSelectedDate(new Date());
      setSelectedTime('');
      setSelectedGroomer('');
      setPetInfo({ name: '', type: '', notes: '' });
      setOwnerInfo({ firstName: '', lastName: '', phoneNumber: '' });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
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
        title: "Booking Failed",
        description: "Failed to book appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const selectedServiceData = SERVICES.find(s => s.id === selectedService);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedService || !selectedDate || !selectedTime || !petInfo.name || !petInfo.type || 
        !ownerInfo.lastName || !ownerInfo.phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields including owner information.",
        variant: "destructive",
      });
      return;
    }

    const serviceData = SERVICES.find(s => s.id === selectedService);
    if (!serviceData) return;

    createAppointmentMutation.mutate({
      serviceType: selectedService,
      appointmentDate: selectedDate.toISOString().split('T')[0],
      appointmentTime: selectedTime,
      ...(selectedGroomer && { groomerId: parseInt(selectedGroomer) }),
      petName: petInfo.name,
      petType: petInfo.type,
      specialNotes: petInfo.notes,
      ownerFirstName: ownerInfo.firstName,
      ownerLastName: ownerInfo.lastName,
      ownerPhoneNumber: ownerInfo.phoneNumber,
      price: serviceData.price.toString(),
    });
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
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Service Selection */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Select Service</Label>
          <RadioGroup value={selectedService} onValueChange={setSelectedService}>
            <div className="space-y-3">
              {SERVICES.map((service) => (
                <Card key={service.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    <Label htmlFor={service.id} className="flex items-center space-x-3 cursor-pointer">
                      <RadioGroupItem value={service.id} id={service.id} />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{service.name}</div>
                        <div className="text-sm text-gray-500">{service.description}</div>
                      </div>
                    </Label>
                  </CardContent>
                </Card>
              ))}
            </div>
          </RadioGroup>
        </div>

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
                <strong>NO Poodles, Doodles, German Shepherds, or Large Mix Breed Dogs after 12:00 PM!</strong>
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                If you schedule for after 12:00 PM with a large dog, you will be asked to reschedule when you arrive.
              </p>
            </div>
          </div>
        </div>

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

{/* Groomer selection hidden per user request */}

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

        {/* Pet Information */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Pet Information</Label>
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="Pet Name *"
              value={petInfo.name}
              onChange={(e) => setPetInfo({ ...petInfo, name: e.target.value })}
              className="border-gray-300 rounded-xl"
              required
            />
            <Select value={petInfo.type} onValueChange={(value) => setPetInfo({ ...petInfo, type: value })}>
              <SelectTrigger className="border-gray-300 rounded-xl">
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
            <Textarea
              placeholder="Special notes or instructions..."
              value={petInfo.notes}
              onChange={(e) => setPetInfo({ ...petInfo, notes: e.target.value })}
              className="border-gray-300 rounded-xl h-20 resize-none"
            />
          </div>
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
      </div>
    </div>
  );
}
