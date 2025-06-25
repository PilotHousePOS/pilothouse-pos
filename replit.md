# Animal House Pet Store

## Project Overview
A mobile-friendly web application for "Animal House" pet store featuring pet browsing, appointment booking, supply purchasing, inventory management, customer accounts with admin functionality, and Animal House branding. The app has a dark, bold design with pricing: grooming from $20 (baths) to $35 (full service), no vet care or training services, and highlighting exotic reptiles as a specialty.

## Recent Changes
- **June 25, 2025**: Complete authentication system rebuild
  - Replaced unreliable server sessions with JWT token authentication
  - Fixed persistent login redirect issues that prevented customer access
  - JWT tokens now stored in secure cookies for proper persistence
  - All protected routes updated to use new authentication middleware
  - Backend authentication fully functional with proper token generation/verification

## User Preferences
- Dark, bold design aesthetic with strong contrast
- No free services - grooming starts at $20 for baths, $35 for full service
- Remove vet care and training services completely
- Add exotic reptiles as specialty instead of training
- Customer login should redirect to full-access customer homepage, not welcome page
- Authentication must work reliably without session persistence issues

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