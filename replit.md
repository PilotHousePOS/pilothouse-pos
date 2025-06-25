# Animal House Pet Store

## Project Overview
A mobile-friendly web application for "Animal House" pet store featuring pet browsing, grooming appointment booking, supply purchasing, inventory management, customer accounts with admin functionality, and Animal House branding. The app has a dark, bold design focusing on grooming services (bath and full service), pet adoption, and exotic reptile specialty - no vet care or training services offered.

## Recent Changes
- **June 25, 2025**: Simplified authentication system implementation
  - Implemented localStorage-based token authentication
  - Fixed redirect loop issues that prevented app loading
  - Created clear landing page → auth → authenticated home flow
  - Added proper logout functionality that clears tokens and redirects
  - Removed complex server authentication queries for routing
  - Simple token presence check determines authentication state

## User Preferences
- Dark, bold design aesthetic with strong contrast
- No free services - but don't display prices in booking appointments
- Remove vet care and training services completely - only grooming services offered
- Add exotic reptiles as specialty instead of training
- Customer login should redirect to full-access customer homepage, not welcome page
- Authentication must work reliably without session persistence issues
- Booking restrictions: No appointments on Sundays, no appointments after 1:30 PM
- Grooming services: Only "Bath Only" and "Full Grooming" options

## Project Architecture
- **Frontend**: React with Vite, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT tokens with secure cookie storage (replaced session-based auth)
- **State Management**: TanStack Query for server state
- **Routing**: Wouter for client-side routing

## Technical Decisions
- JWT authentication chosen over sessions due to session ID inconsistency issues
- Cookie-based token storage for reliable persistence across requests
- All authentication routes return proper HTTP status codes and error messages
- Token verification includes proper error handling and debugging logs

## Current Status
- Database schema implemented with all necessary tables
- JWT authentication system fully functional on backend
- Login/signup generate proper tokens and set cookies
- Frontend authentication redirect mechanism implemented
- All Animal House branding and pricing requirements met