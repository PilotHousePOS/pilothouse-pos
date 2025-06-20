import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  { id: 'grooming', name: 'Pet Grooming', description: 'Full service grooming', price: 0 },
  { id: 'vet', name: 'Vet Checkup', description: 'Health examination', price: 75 },
  { id: 'training', name: 'Training Session', description: '1-hour training', price: 60 },
];

const TIME_SLOTS = [
  '9:00 AM', '10:30 AM', '1:00 PM', '2:30 PM', '4:00 PM', '5:30 PM'
];

export default function Booking() {
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [petInfo, setPetInfo] = useState({
    name: '',
    type: '',
    notes: '',
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    
    if (!selectedService || !selectedDate || !selectedTime || !petInfo.name || !petInfo.type) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
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
                        <div className="text-sm text-gray-500">{service.description} - ${service.price}</div>
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
                disabled={(date) => date < new Date()}
                className="rounded-md border-none"
              />
            </CardContent>
          </Card>
        </div>

        {/* Time Slots */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">Available Times</Label>
          <div className="grid grid-cols-3 gap-3">
            {TIME_SLOTS.map((time) => (
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
            : `Confirm Booking${selectedServiceData ? ` - $${selectedServiceData.price}` : ''}`
          }
        </Button>
      </form>
    </div>
  );
}
