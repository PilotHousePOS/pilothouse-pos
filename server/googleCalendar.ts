import { google } from 'googleapis';

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
