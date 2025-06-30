import { useState, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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

const SERVICES = [
  { id: 'grooming-full', name: 'Full Grooming', description: 'Complete grooming service', price: 35 },
  { id: 'grooming-bath', name: 'Bath Only', description: 'Professional bath and dry', price: 20 },
];

export default function Booking() {
  // Fetch grooming settings
  const { data: groomingSettings = [] } = useQuery({
    queryKey: ["/api/admin/grooming-settings"],
    retry: false,
  });
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
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

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate available time slots based on settings
  const availableTimeSlots = useMemo(() => {
    const settings = groomingSettings as any[];
    const startTime = settings.find(s => s.setting === 'start_time')?.value || '09:00';
    const endTime = settings.find(s => s.setting === 'end_time')?.value || '17:00';
    const duration = parseInt(settings.find(s => s.setting === 'appointment_duration')?.value || '90');
    
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
      currentTime.setMinutes(currentTime.getMinutes() + duration);
    }
    
    return slots;
  }, [groomingSettings]);

  // Check if a date is available for booking
  const isDateAvailable = (date: Date) => {
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
    
    // Check minimum notice
    const minimumNoticeHours = parseInt(settings.find(s => s.setting === 'minimum_notice_hours')?.value || '24');
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + minimumNoticeHours);
    
    if (date < minDate) return false;
    
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
        !ownerInfo.firstName || !ownerInfo.lastName || !ownerInfo.phoneNumber) {
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
    <div className="px-6 py-4 pb-20">
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

        {/* Owner Information */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Owner Information</Label>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder="First Name *"
                value={ownerInfo.firstName}
                onChange={(e) => setOwnerInfo({ ...ownerInfo, firstName: e.target.value })}
                className="border-gray-300 rounded-xl"
                required
              />
              <Input
                type="text"
                placeholder="Last Name *"
                value={ownerInfo.lastName}
                onChange={(e) => setOwnerInfo({ ...ownerInfo, lastName: e.target.value })}
                className="border-gray-300 rounded-xl"
                required
              />
            </div>
            <Input
              type="tel"
              placeholder="Phone Number *"
              value={ownerInfo.phoneNumber}
              onChange={(e) => setOwnerInfo({ ...ownerInfo, phoneNumber: e.target.value })}
              className="border-gray-300 rounded-xl"
              required
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
  );
}
