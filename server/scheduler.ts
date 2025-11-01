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

  // Auto-sync Google Calendar appointments every day at 7:00 AM
  cron.schedule('0 7 * * *', async () => {
    try {
      console.log('Running scheduled task: Auto-syncing Google Calendar appointments at 7:00 AM');
      
      const { syncAppointmentsFromCalendarEvents } = await import('./googleCalendar');
      
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
      const result = await syncAppointmentsFromCalendarEvents(storage);
      console.log('Auto-sync completed:', result);
    } catch (error) {
      console.error('Error auto-syncing Google Calendar appointments:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  console.log('Scheduled tasks initialized:');
  console.log('- Clear approved appointments: Daily at 12:00 AM (EST)');
  console.log('- Auto-sync Google Calendar: Daily at 7:00 AM (EST)');
}
