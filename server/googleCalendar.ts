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
        for (const attendee of event.attendees) {
          // Skip if attendee has no email
          if (!attendee.email) continue;

          // Get name from attendee or use email username
          let name = attendee.displayName || attendee.email.split('@')[0];
          
          // If we found phone numbers, create one contact per phone number
          if (phoneNumbers.length > 0) {
            for (const phoneNumber of phoneNumbers) {
              extractedContacts.push({
                name: `${name} ${phoneNumber}`,
                email: attendee.email,
                phoneNumber,
                notes: `Auto-synced from calendar event: ${summary}`,
                source: 'google_calendar',
                eventId: event.id,
                eventSummary: summary,
              });
            }
          } else {
            // No phone number found, create contact without phone
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
        // No attendees but has phone numbers - use summary as name
        for (const phoneNumber of phoneNumbers) {
          // Create unique temp email using timestamp + random string
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          extractedContacts.push({
            name: `${summary} ${phoneNumber}`,
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
