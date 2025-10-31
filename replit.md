# Animal House Pet Store

## Overview
A mobile-friendly web application for "Animal House" pet store, focusing on pet browsing, grooming appointment booking, and pet supply purchasing. The application includes inventory management, customer accounts, and administrative functionalities. It features a dark, bold design and specializes in grooming services (bath and full service), pet adoption, and exotic reptile specialties, explicitly excluding vet care or training services. The business vision is to provide a streamlined, branded online presence, enhancing service accessibility and product sales for "Animal House."

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

## System Architecture
The application is a full-stack web application with a clear separation of concerns, built with React, Vite, TypeScript, Tailwind CSS, shadcn/ui for the frontend, and Express.js with TypeScript for the backend, utilizing PostgreSQL with Drizzle ORM.

**UI/UX Decisions:**
- Dark, bold design with strong contrast and mobile responsiveness.
- Full-screen modals for mobile forms.
- Amazon-style image enlargement with carousels and swipe gestures.
- Themed headers for Aquatics (blue) and Exotic Reptiles (green) pages.
- Prominent warning banners for breed restrictions.
- Toast notifications for user feedback.
- Universal back button at top-left corner on secondary pages, using `safeGoBack` to prevent navigation to auth pages.

**Technical Implementations & Feature Specifications:**
- **Pet & Supply Management:** Multi-image support with Amazon-style enlargement and mobile swipe gestures.
- **Appointment System:** 
    - 15-minute intervals with admin approval workflow and automated email notifications
    - "My Appointments" page for customers
    - Google Calendar appointment sync with destructive imports and intelligent parsing
    - **Collapsible UI**: Pending appointments visible by default; Approved and Denied appointments behind expandable buttons
    - Role-based access: Groomers see only approved appointments (read-only), admins see all
- **Order & Notification System:** Admin email/push notifications for new orders/appointments. Customer email/SMS/web push for order status. Order History page with detailed modals.
- **Authentication & Authorization:** 
    - JWT tokens in secure cookies with comprehensive password reset
    - User settings and admin user management
    - Three-tier role system: Customer (default), Groomer (`isGroomer`), Admin (`isAdmin`)
    - Groomer role: Read-only access to approved appointments (confirmed/completed status)
    - Admin role: Full access to all appointments and user management
- **Wishlist System:** Dedicated page for saving items, add/remove functionality, and quick "Add to Cart."
- **Google Calendar & Contact Management:**
    - Connected Google Calendar via Replit integration for workspace-level event and contact management.
    - Unified calendar view displaying database appointments and Google Calendar events side-by-side with color coding.
    - Hybrid contact system: manual database (CRUD, phone numbers, email validation) merged with Google Calendar contacts (extracted from event attendees).
    - Automatic phone number extraction from Google Calendar event descriptions and syncing with duplicate prevention.
    - User-contact auto-linking system based on normalized phone numbers.
    - Contact management UI with add/edit/delete, real-time search (name, email, phone), pagination, and smart phone number display.
    - Event creation from contacts interface with multi-contact selection.
- **Groomer Management System:** Dedicated admin tab for CRUD operations on groomers (name, email, phone, specialties, active status). Includes active/inactive toggle, search, and real-time updates.
- **Content Management:** Dedicated pages for Aquatics and Exotic Reptiles, filtering content by species.
- **Admin Order Management:** Displays actual product/pet names and customer names in order details.

**System Design Choices:**
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui.
- **Backend**: Express.js, TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: JWT tokens stored in secure cookies.
- **State Management**: TanStack Query.
- **Routing**: Wouter.
- **Development Practices**: Strict TypeScript, proper HTTP status codes, environment-aware configurations.

## External Dependencies
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Email Service**: SendGrid
- **SMS Service**: Twilio
- **Calendar Integration**: Google Calendar
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Component Library**: shadcn/ui
- **Server-Side Framework**: Express.js
- **Query Library**: TanStack Query
- **Client-Side Router**: Wouter