# Animal House Pet Store

## Project Overview
A mobile-friendly web application for "Animal House" pet store featuring pet browsing, grooming appointment booking, supply purchasing, inventory management, customer accounts with admin functionality, and Animal House branding. The app has a dark, bold design focusing on grooming services (bath and full service), pet adoption, and exotic reptile specialty - no vet care or training services offered.

## Recent Changes
- **July 1, 2025**: Implemented groomer selection system with 15-minute appointment intervals
  - Added groomer management database tables (groomers, groomer_availability)
  - Built comprehensive groomer API endpoints for admin management and customer booking
  - Integrated groomer selection dropdown in booking form based on selected date
  - Implemented 15-minute appointment intervals replacing configurable durations
  - Added groomer availability scheduling by day of week
  - Created sample groomers (Sarah Johnson, Mike Thompson) with Tuesday availability
- **July 1, 2025**: Fixed critical mobile dialog scrolling issue in admin panel
  - Implemented dual modal system: custom full-screen modals for mobile, standard dialogs for desktop
  - Mobile forms now use native scrolling without viewport conflicts
  - Fixed issue where Add Pet button was unreachable after image uploads on mobile
  - Ensured all admin forms (Add/Edit Pet, Add/Edit Supply) work properly on mobile devices
- **June 30, 2025**: Implemented comprehensive customer notification system
  - Added email notifications for order status updates (In Progress, Ready)
  - Integrated SMS notifications via Twilio for real-time updates
  - Built web push notification system with service worker
  - Created notification service that triggers on admin status changes
  - Professional email templates with Animal House branding
- **June 30, 2025**: Enhanced booking form with owner information requirements
  - Added required owner fields: first name, last name, and phone number
  - Updated database schema to store owner contact information with appointments
  - Removed price display from booking confirmation button for cleaner customer experience
  - Maintained form validation to ensure all owner information is provided before booking
- **June 25, 2025**: Resolved mobile authentication and caching issues
  - Added comprehensive cache-busting headers to prevent mobile browser caching
  - Updated HTML meta tags to force fresh content loading on mobile devices
  - Fixed authentication display to show current user name and admin status in header
  - Implemented server-side cache prevention headers for mobile compatibility
  - Authentication working correctly: Falen Spears account shows admin privileges
- **June 25, 2025**: Resolved critical type mismatches and authentication system stability
  - Fixed type conflicts between JWT User type and database schema types by creating separate JWTUser type
  - Systematically resolved admin page errors and user authentication checks throughout application
  - Updated authentication middleware to properly handle null-safety and type casting
  - Fixed TypeScript compilation errors in all route handlers (supplies, cart, orders, appointments)
  - Implemented proper type handling for Express route handlers to resolve type conflicts
  - Application now fully functional with authentication, admin panel, and inventory management working correctly
- **June 25, 2025**: Fixed admin dashboard layout and overlapping issues
  - Resolved tab overlapping problem with responsive design improvements
  - Added horizontal scrolling for tab navigation on mobile devices
  - Improved stats card layout with proper spacing and minimum heights
  - Fixed CardDescription import error in admin panel
  - Enhanced mobile responsiveness with adaptive text labels
- **June 25, 2025**: Fixed admin panel access and authentication display
  - Resolved admin page loading issues by removing problematic redirect loops
  - Updated authentication system to fetch fresh user data from database
  - Added admin status display in profile page and bottom navigation
  - Fixed syntax errors in navigation component that prevented app loading
  - Confirmed admin privileges working for Falen Spears account
- **June 25, 2025**: Added comprehensive admin user management system
  - Added isAdmin field to user database schema with proper migrations
  - Built complete admin panel with user management tab
  - Created secure API endpoints for fetching users and updating admin status
  - Implemented proper admin access controls with authentication checks
  - Added toggle switches for easy admin privilege management
- **June 25, 2025**: Simplified authentication system implementation
  - Implemented localStorage-based token authentication
  - Fixed redirect loop issues that prevented app loading
  - Created clear landing page → auth → authenticated home flow
  - Added proper logout functionality that clears tokens and redirects
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
- Mobile authentication consistency: Same account should show identical admin access across devices

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