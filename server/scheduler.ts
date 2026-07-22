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
export async function checkAppointmentCapacity(
  appointmentDate: Date, 
  pets: Array<{ serviceType: string }>,
  tenantId?: number
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
    const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek, tenantId);
    
    if (!weeklyLimit) {
      return { withinCapacity: true }; // No limits configured
    }
    
    // Count existing appointments for this date by service type
    // Use stored date for matching (consistent with SQL atomic check)
    const allAppointments = await storage.getAppointments(undefined, tenantId);
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

// Per-tenant nightly appointment cleanup
async function runDailyAppointmentCleanup(tenantId: number): Promise<void> {
  const allAppointments = await storage.getAppointments(undefined, tenantId);

  // Get today's date at start of day for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First, reset isHere flag for ALL appointments (regardless of date or status)
  const appointmentsWithHere = allAppointments.filter((apt: any) => apt.isHere === true);
  
  console.log(`[Tenant ${tenantId}] Resetting "Here" status for ${appointmentsWithHere.length} appointments`);
  
  for (const appointment of appointmentsWithHere) {
    await storage.updateAppointmentIsHere(appointment.id, false, tenantId);
  }
  
  // Second, reset isPaid flag only for today's or future appointments that were marked paid in-store.
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD
  const appointmentsWithPaid = allAppointments.filter((apt: any) =>
    apt.isPaid === true &&
    !apt.paidOnline &&
    apt.appointmentDate >= todayStr
  );
  
  console.log(`[Tenant ${tenantId}] Resetting "Paid" status for ${appointmentsWithPaid.length} upcoming in-store-paid appointments`);
  
  for (const appointment of appointmentsWithPaid) {
    await storage.updateAppointmentIsPaid(appointment.id, false, tenantId);
  }
  
  // Then, delete approved appointments (confirmed or completed) that are 2+ days old
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const pastApprovedAppointments = allAppointments.filter((apt: any) => {
    if (apt.status !== 'confirmed' && apt.status !== 'completed') return false;
    if (!apt.isPaid && !apt.paidOnline && apt.checkedIn) return false;
    const appointmentDate = new Date(apt.appointmentDate);
    appointmentDate.setHours(0, 0, 0, 0);
    return appointmentDate < yesterday;
  });
  
  console.log(`[Tenant ${tenantId}] Saving ${pastApprovedAppointments.length} past approved appointments to history`);
  
  for (const appointment of pastApprovedAppointments) {
    try {
      const history = await storage.saveAppointmentToHistory(appointment, { tenantId });
      console.log(`[Tenant ${tenantId}] Saved appointment ${appointment.id} to history (history ID: ${history.id})`);
    } catch (error) {
      console.error(`[Tenant ${tenantId}] Failed to save appointment ${appointment.id} to history:`, error);
    }
    await storage.deleteAppointment(appointment.id, tenantId);
    console.log(`[Tenant ${tenantId}] Deleted past appointment: ${appointment.id}`);
  }
}

// Per-tenant daily sales report
async function runDailyReportForTenant(tenantId: number): Promise<void> {
  const settings = await storage.getGroomingSettings(tenantId);
  const enabledSetting = settings.find((s: any) => s.setting === 'daily_report_enabled');
  const emailsSetting = settings.find((s: any) => s.setting === 'daily_report_emails');
  const timeSetting = settings.find((s: any) => s.setting === 'daily_report_time');

  if (enabledSetting?.value !== 'true' || !emailsSetting?.value) {
    return; // Report not enabled or no emails configured
  }

  const configuredTime = timeSetting?.value || '21:00';
  const [configHour] = configuredTime.split(':').map(Number);
  
  const now = new Date();
  const currentHour = parseInt(now.toLocaleTimeString('en-US', { 
    timeZone: 'America/Chicago', 
    hour: '2-digit', 
    hour12: false 
  }));

  if (currentHour === configHour) {
    console.log(`[Tenant ${tenantId}] Running scheduled Daily Sales Report at ${configuredTime} CST`);
    const { sendDailySalesReport } = await import('./dailySalesReport');
    const emails = emailsSetting.value.split(',').map((e: string) => e.trim()).filter((e: string) => e);
    if (emails.length > 0) {
      await sendDailySalesReport(emails, undefined, tenantId);
      console.log(`[Tenant ${tenantId}] Daily sales report sent successfully`);
    }
  }
}

// Per-tenant monthly sales report
async function runMonthlyReportForTenant(tenantId: number): Promise<void> {
  const settings = await storage.getGroomingSettings(tenantId);
  const enabled = settings.find((s: any) => s.setting === 'monthly_report_enabled')?.value === 'true';
  const emails  = settings.find((s: any) => s.setting === 'monthly_report_emails')?.value || '';
  const day     = parseInt(settings.find((s: any) => s.setting === 'monthly_report_day')?.value  || '1');
  const time    = settings.find((s: any) => s.setting === 'monthly_report_time')?.value || '08:00';
  if (!enabled || !emails) return;

  const now = new Date();
  const cstParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const cstDay    = parseInt(cstParts.find(p => p.type === 'day')?.value    || '0');
  const cstHour   = parseInt(cstParts.find(p => p.type === 'hour')?.value   || '0');
  const [cfgHour] = time.split(':').map(Number);

  if (cstDay === day && cstHour === cfgHour) {
    console.log(`[Tenant ${tenantId}] Running monthly sales report`);
    const { sendMonthlySalesReport } = await import('./periodicSalesReport');
    await sendMonthlySalesReport(emails.split(',').map((e: string) => e.trim()).filter(Boolean), tenantId);
    console.log(`[Tenant ${tenantId}] Monthly sales report sent`);
  }
}

// Per-tenant yearly sales report
async function runYearlyReportForTenant(tenantId: number): Promise<void> {
  const settings = await storage.getGroomingSettings(tenantId);
  const enabled = settings.find((s: any) => s.setting === 'yearly_report_enabled')?.value === 'true';
  const emails  = settings.find((s: any) => s.setting === 'yearly_report_emails')?.value || '';
  const time    = settings.find((s: any) => s.setting === 'yearly_report_time')?.value || '08:00';
  if (!enabled || !emails) return;

  const now = new Date();
  const cstParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false,
  }).formatToParts(now);
  const cstMonth  = parseInt(cstParts.find(p => p.type === 'month')?.value ?? '0');
  const cstDay    = parseInt(cstParts.find(p => p.type === 'day')?.value   ?? '0');
  const cstHour   = parseInt(cstParts.find(p => p.type === 'hour')?.value  ?? '0');
  const [cfgHour] = time.split(':').map(Number);

  if (cstMonth === 1 && cstDay === 1 && cstHour === cfgHour) {
    const prevYear = now.getFullYear() - 1;
    console.log(`[Tenant ${tenantId}] Running yearly sales report for ${prevYear}`);
    const { sendYearlySalesReport } = await import('./periodicSalesReport');
    await sendYearlySalesReport(emails.split(',').map((e: string) => e.trim()).filter(Boolean), prevYear, tenantId);
    console.log(`[Tenant ${tenantId}] Yearly sales report sent`);
  }
}

// Check for trials expiring within 3 days and send one warning email per trial period
export async function runTrialExpiryWarnings(): Promise<void> {
  const allTenants = await storage.getAllTenants();
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  for (const tenant of allTenants) {
    try {
      // Only trial tenants with a set expiry date
      if (tenant.subscriptionStatus !== 'trial' || !tenant.trialEndsAt) continue;

      const trialEndsAt = new Date(tenant.trialEndsAt).getTime();
      const msLeft = trialEndsAt - now;

      // Skip if already expired or more than 3 days away
      if (msLeft <= 0 || msLeft > threeDaysMs) continue;

      // Skip if we already sent the warning during this trial period
      if (tenant.trialWarningEmailSentAt) continue;

      const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      // Find the tenant owner's email
      if (!tenant.ownerId) {
        // Only alert once — skip if we already sent the owner-missing alert for this tenant
        if (tenant.trialOwnerMissingAlertSentAt) {
          console.log(`[Tenant ${tenant.id}] Owner-missing alert already sent at ${tenant.trialOwnerMissingAlertSentAt}, skipping`);
          continue;
        }
        console.warn(`[Tenant ${tenant.id}] No ownerId set, skipping trial warning email — alerting super-admins`);
        const { sendTrialOwnerMissingAlertToSuperAdmins } = await import('./sendgrid');
        await sendTrialOwnerMissingAlertToSuperAdmins({
          id: tenant.id,
          name: tenant.name,
          trialEndsAt: tenant.trialEndsAt,
          ownerId: tenant.ownerId,
        });
        await storage.updateTenant(tenant.id, { trialOwnerMissingAlertSentAt: new Date() } as any);
        continue;
      }

      const owner = await storage.getUser(tenant.ownerId);
      if (!owner?.email) {
        // Only alert once — skip if we already sent the owner-missing alert for this tenant
        if (tenant.trialOwnerMissingAlertSentAt) {
          console.log(`[Tenant ${tenant.id}] Owner-missing alert already sent at ${tenant.trialOwnerMissingAlertSentAt}, skipping`);
          continue;
        }
        console.warn(`[Tenant ${tenant.id}] Owner has no email, skipping trial warning email — alerting super-admins`);
        const { sendTrialOwnerMissingAlertToSuperAdmins } = await import('./sendgrid');
        await sendTrialOwnerMissingAlertToSuperAdmins({
          id: tenant.id,
          name: tenant.name,
          trialEndsAt: tenant.trialEndsAt,
          ownerId: tenant.ownerId,
        });
        await storage.updateTenant(tenant.id, { trialOwnerMissingAlertSentAt: new Date() } as any);
        continue;
      }

      // Owner email is now present — clear any previous owner-missing alert flag so
      // future runs can alert again if the email is removed later.
      if (tenant.trialOwnerMissingAlertSentAt) {
        await storage.updateTenant(tenant.id, { trialOwnerMissingAlertSentAt: null } as any);
      }

      const { sendTrialWarningEmail } = await import('./sendgrid');
      await sendTrialWarningEmail(
        owner.email,
        owner.firstName || 'there',
        daysLeft,
        tenant.name,
      );

      // Mark as sent so we don't send again this trial period
      await storage.updateTenant(tenant.id, { trialWarningEmailSentAt: new Date() } as any);
      console.log(`[Tenant ${tenant.id}] Trial warning email sent to ${owner.email} (${daysLeft} days left)`);
    } catch (err) {
      console.error(`[Tenant ${tenant.id}] Failed to send trial warning email:`, err);
    }
  }
}

export function initializeScheduledTasks() {
  // Clear approved appointments and reset "Here" status every day at 6:00 AM UTC (1:00 AM CST)
  // Must run at 6 AM UTC so that at fire-time the Chicago clock has already rolled to the new day —
  // midnight UTC is only 7 PM CST, which would still see "today" as the previous CST date and
  // incorrectly reset isPaid on appointments from that day.
  cron.schedule('0 6 * * *', async () => {
    try {
      console.log('Running scheduled task: Clearing past approved appointments and resetting "Here"/"Paid" statuses');
      // Iterate per tenant so we never mix data across businesses
      const allTenants = await storage.getAllTenants();
      for (const tenant of allTenants) {
        await runDailyAppointmentCleanup(tenant.id);
      }
      console.log('Successfully completed nightly appointment cleanup for all tenants');
    } catch (error) {
      console.error('Error in nightly appointment cleanup:', error);
    }
  }, {
    timezone: "America/Chicago"
  });

  // Google Calendar sync has been removed - transition period complete

  // Daily Sales Report - runs every hour to check if it's time to send
  cron.schedule('0 * * * *', async () => {
    try {
      const allTenants = await storage.getAllTenants();
      for (const tenant of allTenants) {
        await runDailyReportForTenant(tenant.id);
      }
    } catch (error) {
      console.error('Error running daily sales report:', error);
    }
  }, {
    timezone: "America/Chicago"
  });

  // Monthly Sales Report — runs hourly, fires on configured day+hour per tenant
  cron.schedule('0 * * * *', async () => {
    try {
      const allTenants = await storage.getAllTenants();
      for (const tenant of allTenants) {
        await runMonthlyReportForTenant(tenant.id);
      }
    } catch (err) { console.error('[Scheduler] Monthly report error:', err); }
  }, { timezone: 'America/Chicago' });

  // Yearly Sales Report — runs hourly on Jan 1, fires at configured hour per tenant
  cron.schedule('0 * * * *', async () => {
    try {
      const allTenants = await storage.getAllTenants();
      for (const tenant of allTenants) {
        await runYearlyReportForTenant(tenant.id);
      }
    } catch (err) { console.error('[Scheduler] Yearly report error:', err); }
  }, { timezone: 'America/Chicago' });

  // Trial expiry warnings — runs daily at 9 AM CST, sends one email per tenant within 3 days of expiry
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[Scheduler] Running trial expiry warning check...');
      await runTrialExpiryWarnings();
      console.log('[Scheduler] Trial expiry warning check complete');
    } catch (err) {
      console.error('[Scheduler] Trial expiry warning error:', err);
    }
  }, { timezone: 'America/Chicago' });

  // Abandoned cart recovery - runs every 6 hours, sends email for carts idle 24+ hours
  // Iterates per tenant so each business's cart notification uses its own settings
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('Running abandoned cart recovery check...');
      const allTenants = await storage.getAllTenants();
      const { notificationService } = await import('./notifications');

      for (const tenant of allTenants) {
        const abandonedCarts = await storage.getAbandonedCarts(24, tenant.id);
        if (abandonedCarts.length === 0) continue;

        console.log(`[Tenant ${tenant.id}] Found ${abandonedCarts.length} abandoned carts to notify`);

        for (const cart of abandonedCarts) {
          try {
            // Resolve item names from supply IDs
            const enrichedItems: Array<{name: string; price: string; quantity: number}> = [];
            for (const item of cart.items) {
              let name = 'Item';
              let price = '0';
              if (item.supplyId) {
                const supply = await storage.getSupply(item.supplyId, tenant.id);
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
              enrichedItems,
              tenant.id
            );

            if (sent) {
              await storage.updateAbandonedCartEmailSent(cart.userId);
              console.log(`[Tenant ${tenant.id}] Abandoned cart email sent to ${cart.email}`);
            }
          } catch (err) {
            console.error(`[Tenant ${tenant.id}] Failed to send abandoned cart email to ${cart.email}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('Error running abandoned cart recovery:', error);
    }
  }, {
    timezone: "America/Chicago"
  });

  console.log('Scheduled tasks initialized:');
  console.log('- Clear approved appointments and reset "Here"/"Paid" flags: Daily at 6:00 AM UTC (1 AM CST) per tenant');
  console.log('- Daily Sales Report: Hourly check per tenant (sends at configured time if enabled)');
  console.log('- Monthly Sales Report: Hourly check per tenant (sends on configured day/time if enabled)');
  console.log('- Yearly Sales Report: Hourly check on Jan 1 per tenant (sends at configured time if enabled)');
  console.log('- Trial Expiry Warning: Daily at 9 AM CST (one email per tenant, ≤3 days before trial ends)');
  console.log('- Abandoned Cart Recovery: Every 6 hours (24+ hour idle carts)');
}
