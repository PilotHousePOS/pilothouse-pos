import { db } from '../server/db';
import { scheduleEntries } from '../shared/schema';

const scheduleData = {
  A: {
    Kelly: {
      Monday: '1-6',
      Tuesday: '12-6',
      Wednesday: '1-6',
      Thursday: '8:30-2',
      Friday: '7:30-1',
      Saturday: '7:30-1',
      Sunday: 'Off'
    },
    Faleh: {
      Monday: '8:30-5',
      Tuesday: '8-4',
      Wednesday: '8:30-5',
      Thursday: 'Off',
      Friday: '1-5',
      Saturday: 'Off',
      Sunday: '1-6'
    },
    Heather: {
      Monday: 'Off',
      Tuesday: '10-6',
      Wednesday: '11-6',
      Thursday: '10-6',
      Friday: '10-6',
      Saturday: '1-4',
      Sunday: 'Off'
    },
    Tyler: {
      Monday: '10-6',
      Tuesday: '10-6',
      Wednesday: 'Off',
      Thursday: '10-6',
      Friday: '10-6',
      Saturday: '10-6',
      Sunday: '1-6'
    },
    Ash: {
      Monday: 'Off',
      Tuesday: '9:00am',
      Wednesday: '9:00am',
      Thursday: '9:00am',
      Friday: '9:00am',
      Saturday: '12-5',
      Sunday: 'Off'
    }
  },
  B: {
    Kelly: {
      Monday: '1-6',
      Tuesday: '12-6',
      Wednesday: '1-6',
      Thursday: '8-2',
      Friday: '7:30-1',
      Saturday: '7:30-1',
      Sunday: '8:30am'
    },
    Faleh: {
      Monday: '8:30-5',
      Tuesday: '8-4',
      Wednesday: '8:30-5',
      Thursday: 'Off',
      Friday: '8:30-5',
      Saturday: 'Off',
      Sunday: '1-6'
    },
    Heather: {
      Monday: 'Off',
      Tuesday: '10-6',
      Wednesday: '7-6',
      Thursday: '10-6',
      Friday: '10-6',
      Saturday: '1-4',
      Sunday: 'Off'
    },
    Tyler: {
      Monday: '10-6',
      Tuesday: '10-6',
      Wednesday: 'Off',
      Thursday: '10-6',
      Friday: '10-6',
      Saturday: '10-6',
      Sunday: '1-6'
    },
    Ash: {
      Monday: '8-5',
      Tuesday: '9:00am',
      Wednesday: '9:00am',
      Thursday: '9:00am',
      Friday: '9:00am',
      Saturday: '12-5',
      Sunday: '1-6'
    }
  },
  C: {
    Kelly: {
      Monday: '1-6',
      Tuesday: '12-6',
      Wednesday: '1-6',
      Thursday: '8:30-2',
      Friday: '8:30-2',
      Saturday: '7:30-1',
      Sunday: 'Off'
    },
    Faleh: {
      Monday: '8:30-5',
      Tuesday: '8-4',
      Wednesday: '8:30-5',
      Thursday: 'Off',
      Friday: '8:30-5',
      Saturday: '8:30-5',
      Sunday: 'Off'
    },
    Heather: {
      Monday: 'Off',
      Tuesday: 'Off',
      Wednesday: '7:30-6',
      Thursday: '7:30-6',
      Friday: '7:30-6',
      Saturday: '1-4',
      Sunday: '1-6'
    },
    Tyler: {
      Monday: '10-6',
      Tuesday: '10-6',
      Wednesday: 'Off',
      Thursday: '10-6',
      Friday: '10-6',
      Saturday: '10-6',
      Sunday: 'Off'
    },
    Ash: {
      Monday: 'Off',
      Tuesday: '9:00am',
      Wednesday: '9:00am',
      Thursday: '9:00am',
      Friday: '9:00am',
      Saturday: '12-5',
      Sunday: 'Off'
    }
  }
};

async function populateSchedule() {
  try {
    console.log('Starting schedule population...');
    
    // Clear existing schedule entries
    await db.delete(scheduleEntries);
    console.log('Cleared existing schedule entries');
    
    const entries: any[] = [];
    let displayOrder = 0;
    
    // Convert the schedule data to database entries
    for (const [section, employees] of Object.entries(scheduleData)) {
      for (const [employeeName, schedule] of Object.entries(employees)) {
        for (const [dayOfWeek, timeSlot] of Object.entries(schedule)) {
          entries.push({
            section,
            employeeName,
            dayOfWeek,
            timeSlot,
            displayOrder: displayOrder++
          });
        }
      }
    }
    
    // Insert all entries
    await db.insert(scheduleEntries).values(entries);
    console.log(`Successfully inserted ${entries.length} schedule entries`);
    
    // Display summary
    console.log('\nSchedule Summary:');
    console.log('Section A:', Object.keys(scheduleData.A).join(', '));
    console.log('Section B:', Object.keys(scheduleData.B).join(', '));
    console.log('Section C:', Object.keys(scheduleData.C).join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('Error populating schedule:', error);
    process.exit(1);
  }
}

populateSchedule();
