import cron from 'node-cron';
import { storage } from './storage';

export function initializeScheduledTasks() {
  // Clear approved appointments every day at 12:00 AM
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('Running scheduled task: Clearing approved appointments at midnight');
      
      const allAppointments = await storage.getAppointments();
      const approvedAppointments = allAppointments.filter(
        (apt: any) => apt.status === 'confirmed'
      );
      
      console.log(`Deleting ${approvedAppointments.length} approved appointments`);
      
      for (const appointment of approvedAppointments) {
        await storage.deleteAppointment(appointment.id);
      }
      
      console.log('Successfully cleared all approved appointments');
    } catch (error) {
      console.error('Error clearing approved appointments:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  // Auto-sync Google Calendar appointments and contacts every day at 7:30 AM
  cron.schedule('30 7 * * *', async () => {
    try {
      console.log('Running scheduled task: Auto-syncing Google Calendar appointments and contacts at 7:30 AM');
      
      const { syncAppointmentsFromCalendarEvents, syncContactsFromCalendarEvents } = await import('./googleCalendar');
      const { phoneNumbersMatch } = await import('./phoneUtils');
      
      // First, clean up old Google Calendar appointments with "Not provided" phone numbers
      const allAppointments = await storage.getAppointments();
      const appointmentsToDelete = allAppointments.filter((apt: any) => 
        apt.source === 'google_calendar' && 
        apt.ownerPhoneNumber === 'Not provided'
      );
      
      console.log(`Cleaning up ${appointmentsToDelete.length} old Google Calendar appointments with "Not provided" phone numbers`);
      for (const apt of appointmentsToDelete) {
        await storage.deleteAppointment(apt.id);
      }
      
      // Sync new appointments from Google Calendar
      const appointmentResult = await syncAppointmentsFromCalendarEvents(storage);
      console.log('Auto-sync appointments completed:', appointmentResult);
      
      // Sync contacts from Google Calendar events
      const extractedContacts = await syncContactsFromCalendarEvents();
      const createdContacts = [];
      
      // Cache all contacts once to avoid repeated queries
      const allContacts = await storage.getContacts();

      for (const contactData of extractedContacts) {
        let existingContact = null;
        
        // Check if contact already exists by phone number (if available) using normalized comparison
        if (contactData.phoneNumber) {
          existingContact = allContacts.find((c: any) => 
            c.phoneNumber && phoneNumbersMatch(c.phoneNumber, contactData.phoneNumber)
          );
        }
        
        // If no match by phone, check by email
        if (!existingContact && contactData.email) {
          existingContact = allContacts.find((c: any) => 
            c.email?.toLowerCase() === contactData.email?.toLowerCase()
          );
        }
        
        // Only create if contact doesn't exist
        if (!existingContact) {
          const newContact = await storage.createContact(contactData);
          createdContacts.push(newContact);
          allContacts.push(newContact); // Add to cache for subsequent iterations
        }
      }
      
      console.log(`Auto-sync contacts completed: ${createdContacts.length} new contacts created from ${extractedContacts.length} total extracted`);
    } catch (error) {
      console.error('Error auto-syncing Google Calendar:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  console.log('Scheduled tasks initialized:');
  console.log('- Clear approved appointments: Daily at 12:00 AM (EST)');
  console.log('- Auto-sync Google Calendar appointments and contacts: Daily at 7:30 AM (EST)');
}
