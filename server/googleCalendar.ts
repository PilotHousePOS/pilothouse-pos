import { google } from 'googleapis';
import { extractPhoneNumbers } from './phoneUtils';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Get Google People API client for contacts
export async function getUncachableGooglePeopleClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.people({ version: 'v1', auth: oauth2Client });
}

// Fetch upcoming calendar events
export async function getUpcomingEvents(maxResults: number = 10) {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
}

// Fetch calendar event attendees (contacts)
export async function getEventAttendees(eventId: string) {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    return response.data.attendees || [];
  } catch (error) {
    console.error('Error fetching event attendees:', error);
    throw error;
  }
}

// Get all unique contacts from calendar events
export async function getAllCalendarContacts() {
  try {
    const events = await getUpcomingEvents(100);
    const contactsMap = new Map();

    for (const event of events) {
      if (event.attendees) {
        for (const attendee of event.attendees) {
          if (attendee.email && !contactsMap.has(attendee.email)) {
            contactsMap.set(attendee.email, {
              email: attendee.email,
              displayName: attendee.displayName || attendee.email,
              responseStatus: attendee.responseStatus,
            });
          }
        }
      }
      
      // Also include event organizer
      if (event.organizer?.email && !contactsMap.has(event.organizer.email)) {
        contactsMap.set(event.organizer.email, {
          email: event.organizer.email,
          displayName: event.organizer.displayName || event.organizer.email,
          isOrganizer: true,
        });
      }
    }

    return Array.from(contactsMap.values());
  } catch (error) {
    console.error('Error fetching calendar contacts:', error);
    throw error;
  }
}

// Create a new calendar event
export async function createCalendarEvent(eventData: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: Array<{ email: string; displayName?: string }>;
}) {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const event = {
      summary: eventData.summary,
      description: eventData.description,
      start: {
        dateTime: eventData.startDateTime,
        timeZone: 'America/New_York', // Adjust as needed
      },
      end: {
        dateTime: eventData.endDateTime,
        timeZone: 'America/New_York', // Adjust as needed
      },
      attendees: eventData.attendees?.map(a => ({ email: a.email, displayName: a.displayName })),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return response.data;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}

// Get calendar events for a specific date
export async function getEventsForDate(date: Date) {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Error fetching events for date:', error);
    throw error;
  }
}

// Get real Google Contacts with phone numbers
export async function getGoogleContacts(maxResults: number = 1000) {
  try {
    const people = await getUncachableGooglePeopleClient();
    
    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: maxResults,
      personFields: 'names,emailAddresses,phoneNumbers,photos',
    });

    const contacts = (response.data.connections || []).map((person: any) => {
      const name = person.names?.[0];
      const email = person.emailAddresses?.[0];
      const phone = person.phoneNumbers?.[0];
      const photo = person.photos?.[0];

      return {
        resourceName: person.resourceName,
        displayName: name?.displayName || email?.value || 'Unknown',
        givenName: name?.givenName,
        familyName: name?.familyName,
        email: email?.value || null,
        phoneNumber: phone?.value || null,
        phoneType: phone?.type || null,
        photoUrl: photo?.url || null,
      };
    }).filter((contact: any) => contact.email || contact.phoneNumber); // Only include contacts with email or phone

    return contacts;
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    throw error;
  }
}

/**
 * Sync appointments from Google Calendar events
 * Converts Google Calendar events to appointment records
 * Returns appointment data extracted from calendar events
 */
export async function syncAppointmentsFromCalendarEvents() {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    // Start from today at midnight to sync all current and future appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to midnight
    
    // Fetch events from today through next 90 days
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);

    console.log(`[SYNC] Fetching calendar events from ${today.toISOString()} to ${futureDate.toISOString()}`);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: today.toISOString(),
      timeMax: futureDate.toISOString(),
      maxResults: 500,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    console.log(`[SYNC] Found ${events.length} total calendar events`);
    const appointments = [];

    // Get all contacts to match with events
    const { storage } = await import('./storage');
    const allContacts = await storage.getAllContacts();

    for (const event of events) {
      // Skip events without start time or summary
      if (!event.start?.dateTime || !event.summary) {
        console.log(`[SYNC] Skipping event without start time or summary: ${event.id}`);
        continue;
      }

      const summary = event.summary || '';
      const description = event.description || '';
      const combinedText = `${summary} ${description}`;

      // First, try to find phone number from contact associated with this event
      const eventContact = allContacts.find((contact: any) => 
        contact.source === 'google_calendar' && contact.eventId === event.id && contact.phoneNumber
      );
      
      // Extract phone numbers from description as fallback
      const phoneNumbers = extractPhoneNumbers(combinedText);
      const phoneNumber = eventContact?.phoneNumber || phoneNumbers[0] || null;
      
      // Skip events without phone numbers
      if (!phoneNumber) {
        console.log(`[SYNC] Skipping event without phone number: ${event.id} - "${summary}"`);
        continue;
      }

      // Parse date and time
      const startDateTime = new Date(event.start.dateTime);
      const appointmentDate = startDateTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const appointmentTime = startDateTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }); // HH:MM format

      // Extract owner name - first word in event summary is the customer's last name
      let ownerFirstName = 'Guest';
      let ownerLastName = 'Customer';
      
      // Extract first word from summary as last name
      const summaryWords = summary.trim().split(/\s+/);
      if (summaryWords.length > 0 && summaryWords[0]) {
        ownerLastName = summaryWords[0];
      }
      
      // Try to get first name from contact if available
      if (eventContact?.name) {
        const nameParts = eventContact.name.split(' ');
        ownerFirstName = nameParts[0] || 'Guest';
      } else if (event.attendees && event.attendees.length > 0) {
        const firstAttendee = event.attendees[0];
        const displayName = firstAttendee.displayName || firstAttendee.email?.split('@')[0];
        if (displayName) {
          const nameParts = displayName.split(' ');
          ownerFirstName = nameParts[0] || 'Guest';
        }
      }

      // Extract pet name and groomer tag from summary
      // Format: LastName PetName PhoneNumber GroomerTag
      let petName = 'Pet';
      let petType = 'Dog';
      let groomerTag = null;
      
      if (summaryWords.length > 1) {
        // Find the position of the phone number in the words
        let phoneIndex = -1;
        for (let i = 0; i < summaryWords.length; i++) {
          // Check if this word looks like a phone number
          if (/[\d\(\)\-]+/.test(summaryWords[i]) && summaryWords[i].replace(/[\(\)\-\s]/g, '').length >= 10) {
            phoneIndex = i;
            break;
          }
        }
        
        if (phoneIndex > 1) {
          // Pet name is from word 2 to the phone number (excluding owner last name and phone)
          const petNameWords = summaryWords.slice(1, phoneIndex);
          petName = petNameWords.join(' ');
          
          // Groomer tag is everything after the phone number
          if (phoneIndex < summaryWords.length - 1) {
            const groomerWords = summaryWords.slice(phoneIndex + 1);
            groomerTag = groomerWords.join(' ');
          }
        } else {
          // If no phone found in expected position, use all words after first (old behavior)
          const potentialPetWords = summaryWords.slice(1);
          const petNameWords = potentialPetWords.filter(word => {
            return !/^[\d\(\)\-\s]+$/.test(word);
          });
          if (petNameWords.length > 0) {
            petName = petNameWords.join(' ');
          }
        }
      }

      // Determine service type from summary (default to 'Full Grooming')
      let serviceType = 'Full Grooming';
      const summaryLower = summary.toLowerCase();
      if (summaryLower.includes('bath') && !summaryLower.includes('full')) {
        serviceType = 'Bath Only';
      }

      const appointmentData = {
        googleEventId: event.id,
        serviceType,
        appointmentDate,
        appointmentTime,
        petName,
        petType,
        specialNotes: description || `Synced from Google Calendar: ${summary}`,
        ownerFirstName,
        ownerLastName,
        ownerPhoneNumber: phoneNumber,
        groomerTag,
        status: 'scheduled',
        isApproved: false, // Require admin approval for calendar synced appointments
        price: serviceType === 'Bath Only' ? '45.00' : '75.00', // Default pricing
        source: 'google_calendar',
      };
      
      console.log(`[SYNC] Parsed appointment from event "${summary}":`, JSON.stringify(appointmentData, null, 2));
      appointments.push(appointmentData);
    }

    console.log(`[SYNC] Returning ${appointments.length} appointments to sync`);
    return appointments;
  } catch (error) {
    console.error('Error syncing appointments from calendar:', error);
    throw error;
  }
}

/**
 * Sync contacts from Google Calendar events
 * Extracts name and phone numbers from event descriptions
 * Returns contacts that were created or updated
 */
export async function syncContactsFromCalendarEvents() {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    // Fetch events from the past 30 days and next 90 days
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: pastDate.toISOString(),
      timeMax: futureDate.toISOString(),
      maxResults: 500,
      singleEvents: true,
    });

    const events = response.data.items || [];
    const extractedContacts = [];

    for (const event of events) {
      // Extract data from event
      const summary = event.summary || '';
      const description = event.description || '';
      const combinedText = `${summary} ${description}`;

      // Extract phone numbers (optional)
      const phoneNumbers = extractPhoneNumbers(combinedText);

      // Process attendees if available
      if (event.attendees && event.attendees.length > 0) {
        for (let attendeeIndex = 0; attendeeIndex < event.attendees.length; attendeeIndex++) {
          const attendee = event.attendees[attendeeIndex];
          // Skip if attendee has no email
          if (!attendee.email) continue;

          // Get name from attendee or use email username
          let name = attendee.displayName || attendee.email.split('@')[0];
          
          // If we found phone numbers, create one contact per phone number with unique temp email
          if (phoneNumbers.length > 0) {
            for (let i = 0; i < phoneNumbers.length; i++) {
              const phoneNumber = phoneNumbers[i];
              // Create unique temp email using event ID, attendee index, and phone index
              const uniqueId = `${event.id}-${attendeeIndex}-${i}`.replace(/[^a-zA-Z0-9-]/g, '-');
              extractedContacts.push({
                name,
                email: `calendar-${uniqueId}@temp.com`,
                phoneNumber,
                notes: `Auto-synced from calendar event: ${summary}`,
                source: 'google_calendar',
                eventId: event.id,
                eventSummary: summary,
              });
            }
          } else {
            // No phone number found, create contact with attendee's real email
            extractedContacts.push({
              name,
              email: attendee.email,
              phoneNumber: null,
              notes: `Auto-synced from calendar event: ${summary}`,
              source: 'google_calendar',
              eventId: event.id,
              eventSummary: summary,
            });
          }
        }
      } else if (phoneNumbers.length > 0) {
        // No attendees but has phone numbers - use event ID for uniqueness
        for (let i = 0; i < phoneNumbers.length; i++) {
          const phoneNumber = phoneNumbers[i];
          // Create unique temp email using event ID and phone index
          const uniqueId = `${event.id}-${i}`.replace(/[^a-zA-Z0-9-]/g, '-');
          
          // Parse contact name from event summary
          // Format: LastName PetName PhoneNumber Groomer
          // Extract just the last name (first word) for the contact
          const summaryWords = summary.trim().split(/\s+/);
          const contactName = summaryWords.length > 0 ? summaryWords[0] : summary;
          
          extractedContacts.push({
            name: contactName,
            email: `calendar-${uniqueId}@temp.com`,
            phoneNumber,
            notes: `Auto-synced from calendar event: ${summary}`,
            source: 'google_calendar',
            eventId: event.id,
            eventSummary: summary,
          });
        }
      }
    }

    return extractedContacts;
  } catch (error) {
    console.error('Error syncing contacts from calendar:', error);
    throw error;
  }
}
