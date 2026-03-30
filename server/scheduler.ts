import cron from 'node-cron';
import { storage } from './storage';

// Helper to normalize dates to local timezone (America/Chicago) for accurate comparison
// Prevents late evening CST appointments from shifting to next day in UTC
export function getLocalDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD format
}

// Helper to get day of week in America/Chicago timezone
// Prevents late evening CST appointments from being misidentified as next day in UTC
export function getLocalDayOfWeek(date: Date): number {
  // Format the date in America/Chicago timezone and parse to get local day
  const formatter = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'America/Chicago', 
    weekday: 'short' 
  });
  const dayName = formatter.format(date); // 'Mon', 'Tue', etc.
  
  // Map day names to numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
  const dayMap: { [key: string]: number } = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };
  
  return dayMap[dayName] ?? 0;
}

// Helper function to check if appointment would exceed capacity
async function checkAppointmentCapacity(
  appointmentDate: Date, 
  pets: Array<{ serviceType: string }>
): Promise<{ withinCapacity: boolean; reason?: string }> {
  // Get day of week in America/Chicago timezone (not UTC)
  const dayOfWeek = getLocalDayOfWeek(appointmentDate); // 0=Sunday, 1=Monday, ..., 6=Saturday
  // Use stored date for matching (consistent with SQL atomic check)
  const appointmentDateStr = appointmentDate.toISOString().split('T')[0];
  
  // Sunday has no limits
  if (dayOfWeek === 0) {
    return { withinCapacity: true };
  }
  
  // Check weekly limits for Monday-Saturday (1-6)
  if (dayOfWeek >= 1 && dayOfWeek <= 6) {
    const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
    
    if (!weeklyLimit) {
      return { withinCapacity: true }; // No limits configured
    }
    
    // Count existing appointments for this date by service type
    // Use stored date for matching (consistent with SQL atomic check)
    const allAppointments = await storage.getAppointments();
    const appointmentsOnDate = allAppointments.filter((apt: any) => {
      const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
      return aptDateStr === appointmentDateStr && 
             apt.status !== 'cancelled' && 
             apt.status !== 'rejected';
    });
    
    // Count total dogs/pets by service type (not appointments)
    let bathDogs = 0;
    let groomDogs = 0;
    
    for (const apt of appointmentsOnDate) {
      const aptPets = await storage.getAppointmentPets(apt.id);
      if (aptPets && aptPets.length > 0) {
        bathDogs += aptPets.filter((p: any) => p.serviceType === 'grooming-bath').length;
        groomDogs += aptPets.filter((p: any) => p.serviceType === 'grooming-full').length;
      } else {
        // Legacy single-pet appointment
        if (apt.serviceType === 'grooming-bath') bathDogs++;
        if (apt.serviceType === 'grooming-full') groomDogs++;
      }
    }
    
    // Count requested pets by service type
    const requestedBaths = pets.filter((p: any) => p.serviceType === 'grooming-bath').length;
    const requestedGrooms = pets.filter((p: any) => p.serviceType === 'grooming-full').length;
    
    // Check if adding these pets would exceed capacity
    if (bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
      return {
        withinCapacity: false,
        reason: `Bath grooming capacity exceeded (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked)`
      };
    }
    
    if (groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
      return {
        withinCapacity: false,
        reason: `Full grooming capacity exceeded (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked)`
      };
    }
  }
  
  return { withinCapacity: true };
}

export function initializeScheduledTasks() {
  // Clear approved appointments and reset "Here" status every day at 12:00 AM
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('Running scheduled task: Clearing past approved appointments and resetting ALL "Here" and "Paid" statuses at midnight');
      
      const allAppointments = await storage.getAppointments();
      
      // Get today's date at start of day for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // First, reset isHere flag for ALL appointments (regardless of date or status)
      const appointmentsWithHere = allAppointments.filter((apt: any) => apt.isHere === true);
      
      console.log(`Resetting "Here" status for ${appointmentsWithHere.length} appointments (all appointments, not just past ones)`);
      
      for (const appointment of appointmentsWithHere) {
        await storage.updateAppointmentIsHere(appointment.id, false);
        console.log(`Reset "Here" status for appointment: ${appointment.id} (${appointment.ownerLastName}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      // Second, reset isPaid flag for ALL appointments (regardless of date or status)
      const appointmentsWithPaid = allAppointments.filter((apt: any) => apt.isPaid === true);
      
      console.log(`Resetting "Paid" status for ${appointmentsWithPaid.length} appointments (all appointments, not just past ones)`);
      
      for (const appointment of appointmentsWithPaid) {
        await storage.updateAppointmentIsPaid(appointment.id, false);
        console.log(`Reset "Paid" status for appointment: ${appointment.id} (${appointment.ownerLastName}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      // Then, delete approved appointments (confirmed or completed) that are 2+ days old
      // Yesterday's appointments are retained so admins can reference them the next morning
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      const pastApprovedAppointments = allAppointments.filter((apt: any) => {
        // Include both confirmed and completed as "approved" statuses
        if (apt.status !== 'confirmed' && apt.status !== 'completed') return false;
        
        const appointmentDate = new Date(apt.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        // Only delete appointments older than yesterday (2+ days ago)
        return appointmentDate < yesterday;
      });
      
      console.log(`Saving ${pastApprovedAppointments.length} past approved appointments to history before deletion`);
      
      for (const appointment of pastApprovedAppointments) {
        try {
          // Save to history before deleting
          const history = await storage.saveAppointmentToHistory(appointment);
          console.log(`Saved appointment ${appointment.id} to history (history ID: ${history.id})`);
        } catch (error) {
          console.error(`Failed to save appointment ${appointment.id} to history:`, error);
          // Continue with deletion even if history save fails
        }
        
        await storage.deleteAppointment(appointment.id);
        console.log(`Deleted past appointment: ${appointment.id} from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      console.log('Successfully cleared past approved appointments and reset "Here" and "Paid" statuses');
    } catch (error) {
      console.error('Error clearing past approved appointments:', error);
    }
  }, {
    timezone: "America/Chicago"
  });

  // Google Calendar sync has been removed - transition period complete

  // Daily Sales Report - runs every hour to check if it's time to send
  cron.schedule('0 * * * *', async () => {
    try {
      const settings = await storage.getGroomingSettings();
      const enabledSetting = settings.find((s: any) => s.setting === 'daily_report_enabled');
      const emailsSetting = settings.find((s: any) => s.setting === 'daily_report_emails');
      const timeSetting = settings.find((s: any) => s.setting === 'daily_report_time');

      if (enabledSetting?.value !== 'true' || !emailsSetting?.value) {
        return; // Report not enabled or no emails configured
      }

      const configuredTime = timeSetting?.value || '21:00';
      const [configHour] = configuredTime.split(':').map(Number);
      
      // Get current hour in America/Chicago timezone
      const now = new Date();
      const currentHour = parseInt(now.toLocaleTimeString('en-US', { 
        timeZone: 'America/Chicago', 
        hour: '2-digit', 
        hour12: false 
      }));

      if (currentHour === configHour) {
        console.log(`Running scheduled Daily Sales Report at ${configuredTime} CST`);
        
        const { sendDailySalesReport } = await import('./dailySalesReport');
        const emails = emailsSetting.value.split(',').map((e: string) => e.trim()).filter((e: string) => e);
        
        if (emails.length > 0) {
          await sendDailySalesReport(emails);
          console.log('Daily sales report sent successfully');
        }
      }
    } catch (error) {
      console.error('Error running daily sales report:', error);
    }
  }, {
    timezone: "America/Chicago"
  });

  // Abandoned cart recovery - runs every 6 hours, sends email for carts idle 24+ hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('Running abandoned cart recovery check...');
      const abandonedCarts = await storage.getAbandonedCarts(24);
      
      if (abandonedCarts.length === 0) {
        console.log('No abandoned carts found');
        return;
      }

      console.log(`Found ${abandonedCarts.length} abandoned carts to notify`);
      
      const { notificationService } = await import('./notifications');

      for (const cart of abandonedCarts) {
        try {
          // Resolve item names from supply IDs
          const enrichedItems: Array<{name: string; price: string; quantity: number}> = [];
          for (const item of cart.items) {
            let name = 'Item';
            let price = '0';
            if (item.supplyId) {
              const supply = await storage.getSupply(item.supplyId);
              if (supply) {
                name = supply.name;
                price = supply.price?.toString() || '0';
              }
            }
            enrichedItems.push({ name, price, quantity: item.quantity || 1 });
          }

          const sent = await notificationService.sendAbandonedCartNotification(
            cart.email,
            cart.firstName,
            enrichedItems
          );

          if (sent) {
            await storage.updateAbandonedCartEmailSent(cart.userId);
            console.log(`Abandoned cart email sent to ${cart.email}`);
          }
        } catch (err) {
          console.error(`Failed to send abandoned cart email to ${cart.email}:`, err);
        }
      }
    } catch (error) {
      console.error('Error running abandoned cart recovery:', error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log('Scheduled tasks initialized:');
  console.log('- Clear approved appointments and reset "Here"/"Paid" flags: Daily at 12:00 AM (CST)');
  console.log('- Daily Sales Report: Hourly check (sends at configured time if enabled)');
  console.log('- Abandoned Cart Recovery: Every 6 hours (24+ hour idle carts)');
}
