import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  decimal,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  isAdmin: boolean("is_admin").default(false),
  isGroomer: boolean("is_groomer").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Pet animals for sale
export const pets = pgTable("pets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  species: varchar("species", { length: 100 }).notNull(), // mammals, bird, fish, reptile
  breed: varchar("breed", { length: 255 }), // Optional - may not have breed info from AI detection
  age: varchar("age", { length: 50 }), // Optional - may not have age info from AI detection
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  imageUrl: varchar("image_url", { length: 500 }),
  imageUrls: text("image_urls").array(), // Multiple images support
  isAvailable: boolean("is_available").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pet supplies inventory
export const supplies = pgTable("supplies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // food, toys, beds, leashes, healthcare, accessories, aquatics, reptiles, birdSupplies, dogCages, smallAnimalSupplies
  brand: varchar("brand", { length: 255 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  imageUrl: varchar("image_url", { length: 500 }),
  imageUrls: text("image_urls").array(), // Multiple images support
  stockQuantity: integer("stock_quantity").default(0),
  isActive: boolean("is_active").default(true),
  weight: varchar("weight", { length: 50 }),
  size: varchar("size", { length: 50 }),
  filterType: varchar("filter_type", { length: 20 }), // 'aquatic', 'reptile', or null for general
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shopping cart items
export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  supplyId: integer("supply_id").references(() => supplies.id),
  petId: integer("pet_id").references(() => pets.id),
  quantity: integer("quantity").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"), // pending, confirmed, shipped, delivered, cancelled
  shippingAddress: text("shipping_address"),
  orderDate: timestamp("order_date").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Order items
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  supplyId: integer("supply_id").references(() => supplies.id),
  petId: integer("pet_id").references(() => pets.id),
  quantity: integer("quantity").default(1),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

// Appointments
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  groomerId: integer("groomer_id").references(() => groomers.id, { onDelete: "set null" }),
  serviceType: varchar("service_type", { length: 100 }).notNull(), // grooming (kept for backward compatibility)
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: varchar("appointment_time", { length: 20 }).notNull(),
  petName: varchar("pet_name", { length: 255 }).notNull(), // Primary pet name (kept for backward compatibility)
  petType: varchar("pet_type", { length: 100 }).notNull(), // Primary pet type (kept for backward compatibility)
  specialNotes: text("special_notes"),
  ownerFirstName: varchar("owner_first_name", { length: 255 }),
  ownerLastName: varchar("owner_last_name", { length: 255 }).notNull(),
  ownerPhoneNumber: varchar("owner_phone_number", { length: 20 }).notNull(),
  status: varchar("status", { length: 50 }).default("scheduled"), // scheduled, confirmed, completed, cancelled
  isApproved: boolean("is_approved").default(false), // pending admin approval
  isHere: boolean("is_here").default(false), // customer has arrived
  isPaid: boolean("is_paid").default(false), // customer has paid
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  pricingMode: varchar("pricing_mode", { length: 20 }).default("individual"), // individual (sum of pet prices) or override (total price overrides individual)
  source: varchar("source", { length: 50 }).default("manual"), // manual or google_calendar
  googleEventId: varchar("google_event_id", { length: 255 }), // Google Calendar event ID
  groomerTag: varchar("groomer_tag", { length: 100 }), // Groomer name/tag from calendar event
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Appointment pets (many-to-many: one appointment can have multiple pets, each with their own service)
export const appointmentPets = pgTable("appointment_pets", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  petName: varchar("pet_name", { length: 255 }).notNull(),
  petType: varchar("pet_type", { length: 100 }).notNull(), // Dog or Cat
  serviceType: varchar("service_type", { length: 100 }).notNull(), // "Bath Only" or "Full Grooming"
  groomerId: integer("groomer_id").references(() => groomers.id, { onDelete: "set null" }), // Per-pet groomer assignment (overrides appointment-level)
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Customer pets (pets owned by users)
export const customerPets = pgTable("customer_pets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  species: varchar("species", { length: 100 }).notNull(),
  breed: varchar("breed", { length: 255 }),
  age: varchar("age", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Wishlist items
export const wishlistItems = pgTable("wishlist_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  supplyId: integer("supply_id").references(() => supplies.id),
  petId: integer("pet_id").references(() => pets.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Grooming settings for admin control
export const groomingSettings = pgTable("grooming_settings", {
  id: serial("id").primaryKey(),
  setting: varchar("setting", { length: 100 }).notNull().unique(), // 'available_days', 'start_time', 'end_time', 'max_appointments_per_day'
  value: text("value").notNull(), // JSON string for complex values
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Weekly appointment limits (by day of week)
export const weeklyAppointmentLimits = pgTable("weekly_appointment_limits", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull().unique(), // 1=Monday, 2=Tuesday, ..., 6=Saturday (0=Sunday not used)
  maxBathAppointments: integer("max_bath_appointments").notNull().default(5),
  maxGroomAppointments: integer("max_groom_appointments").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Keep old table for backward compatibility during migration
export const dailyAppointmentLimits = pgTable("daily_appointment_limits", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  maxBathAppointments: integer("max_bath_appointments").notNull().default(5),
  maxGroomAppointments: integer("max_groom_appointments").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Special date settings (holidays/special days with custom time slots)
export const specialDateSettings = pgTable("special_date_settings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Thanksgiving", "Christmas Eve"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Allowed times for special dates (normalized child table)
export const specialDateAllowedTimes = pgTable("special_date_allowed_times", {
  id: serial("id").primaryKey(),
  specialDateId: integer("special_date_id").notNull().references(() => specialDateSettings.id, { onDelete: "cascade" }),
  allowedTime: varchar("allowed_time", { length: 20 }).notNull(), // e.g., "7:00 AM", stored as 12-hour format for UI consistency
  createdAt: timestamp("created_at").defaultNow(),
});

// Groomers
export const groomers = pgTable("groomers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  specialties: text("specialties"), // e.g., "full grooming, bath only"
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Groomer availability by day
export const groomerAvailability = pgTable("groomer_availability", {
  id: serial("id").primaryKey(),
  groomerId: integer("groomer_id").notNull().references(() => groomers.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  isAvailable: boolean("is_available").default(true),
  startTime: varchar("start_time", { length: 10 }), // e.g., "09:00"
  endTime: varchar("end_time", { length: 10 }), // e.g., "13:30"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Manual contacts for admin
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }), // Optional - use phone as placeholder if not provided
  phoneNumber: varchar("phone_number", { length: 20 }),
  petNames: text("pet_names").array(), // Array of pet names from appointments
  notes: text("notes"),
  animalType: varchar("animal_type", { length: 100 }), // dog, cat, bird, reptile, etc.
  breed: varchar("breed", { length: 255 }), // specific breed (especially for dogs)
  linkedUserId: varchar("linked_user_id").references(() => users.id),
  source: varchar("source", { length: 50 }).default("manual"), // manual, google_calendar
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Appointment history - preserves completed appointments for contact records
export const appointmentHistory = pgTable("appointment_history", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  // Denormalized contact info for display (preserved even if contact changes)
  ownerPhoneNumber: varchar("owner_phone_number", { length: 20 }),
  ownerEmail: varchar("owner_email", { length: 255 }),
  ownerFirstName: varchar("owner_first_name", { length: 255 }),
  ownerLastName: varchar("owner_last_name", { length: 255 }),
  // Appointment details
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: varchar("appointment_time", { length: 20 }),
  petName: varchar("pet_name", { length: 255 }),
  petType: varchar("pet_type", { length: 100 }), // dog, cat, bird, reptile, etc.
  breed: varchar("breed", { length: 255 }),
  serviceType: varchar("service_type", { length: 50 }), // "Bath Only" or "Full Grooming"
  groomerName: varchar("groomer_name", { length: 255 }),
  status: varchar("status", { length: 50 }), // confirmed, completed, cancelled, rejected
  source: varchar("source", { length: 50 }), // manual, google_calendar
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(), // When the history record was created
}, (table) => ({
  contactIdIdx: index("appointment_history_contact_id_idx").on(table.contactId),
  appointmentDateIdx: index("appointment_history_date_idx").on(table.appointmentDate),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  cartItems: many(cartItems),
  orders: many(orders),
  appointments: many(appointments),
  customerPets: many(customerPets),
  wishlistItems: many(wishlistItems),
}));

export const petsRelations = relations(pets, ({ many }) => ({
  cartItems: many(cartItems),
  orderItems: many(orderItems),
}));

export const suppliesRelations = relations(supplies, ({ many }) => ({
  cartItems: many(cartItems),
  orderItems: many(orderItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, { fields: [cartItems.userId], references: [users.id] }),
  supply: one(supplies, { fields: [cartItems.supplyId], references: [supplies.id] }),
  pet: one(pets, { fields: [cartItems.petId], references: [pets.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  supply: one(supplies, { fields: [orderItems.supplyId], references: [supplies.id] }),
  pet: one(pets, { fields: [orderItems.petId], references: [pets.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  user: one(users, { fields: [appointments.userId], references: [users.id] }),
  groomer: one(groomers, { fields: [appointments.groomerId], references: [groomers.id] }),
}));

export const groomersRelations = relations(groomers, ({ many }) => ({
  appointments: many(appointments),
  availability: many(groomerAvailability),
}));

export const groomerAvailabilityRelations = relations(groomerAvailability, ({ one }) => ({
  groomer: one(groomers, { fields: [groomerAvailability.groomerId], references: [groomers.id] }),
}));

export const customerPetsRelations = relations(customerPets, ({ one }) => ({
  user: one(users, { fields: [customerPets.userId], references: [users.id] }),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  user: one(users, { fields: [wishlistItems.userId], references: [users.id] }),
  supply: one(supplies, { fields: [wishlistItems.supplyId], references: [supplies.id] }),
  pet: one(pets, { fields: [wishlistItems.petId], references: [pets.id] }),
}));

// Insert schemas
export const insertPetSchema = createInsertSchema(pets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSupplySchema = createInsertSchema(supplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderDate: true,
  updatedAt: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  ownerFirstName: z.string().optional(),
});

export const insertAppointmentPetSchema = createInsertSchema(appointmentPets).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerPetSchema = createInsertSchema(customerPets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGroomingSettingsSchema = createInsertSchema(groomingSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertGroomerSchema = createInsertSchema(groomers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGroomerAvailabilitySchema = createInsertSchema(groomerAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertWishlistItemSchema = createInsertSchema(wishlistItems).omit({
  id: true,
  createdAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWeeklyAppointmentLimitSchema = createInsertSchema(weeklyAppointmentLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDailyAppointmentLimitSchema = createInsertSchema(dailyAppointmentLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSpecialDateSettingSchema = createInsertSchema(specialDateSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSpecialDateAllowedTimeSchema = createInsertSchema(specialDateAllowedTimes).omit({
  id: true,
  createdAt: true,
});

export const insertAppointmentHistorySchema = createInsertSchema(appointmentHistory).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type Pet = typeof pets.$inferSelect;
export type InsertPet = z.infer<typeof insertPetSchema>;
export type Supply = typeof supplies.$inferSelect;
export type InsertSupply = z.infer<typeof insertSupplySchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type AppointmentPet = typeof appointmentPets.$inferSelect;
export type InsertAppointmentPet = z.infer<typeof insertAppointmentPetSchema>;
export type CustomerPet = typeof customerPets.$inferSelect;
export type InsertCustomerPet = z.infer<typeof insertCustomerPetSchema>;
export type GroomingSetting = typeof groomingSettings.$inferSelect;
export type InsertGroomingSetting = z.infer<typeof insertGroomingSettingsSchema>;
export type Groomer = typeof groomers.$inferSelect;
export type InsertGroomer = z.infer<typeof insertGroomerSchema>;
export type GroomerAvailability = typeof groomerAvailability.$inferSelect;
export type InsertGroomerAvailability = z.infer<typeof insertGroomerAvailabilitySchema>;
export type WishlistItem = typeof wishlistItems.$inferSelect;
export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type WeeklyAppointmentLimit = typeof weeklyAppointmentLimits.$inferSelect;
export type InsertWeeklyAppointmentLimit = z.infer<typeof insertWeeklyAppointmentLimitSchema>;
export type DailyAppointmentLimit = typeof dailyAppointmentLimits.$inferSelect;
export type InsertDailyAppointmentLimit = z.infer<typeof insertDailyAppointmentLimitSchema>;
export type SpecialDateSetting = typeof specialDateSettings.$inferSelect;
export type InsertSpecialDateSetting = z.infer<typeof insertSpecialDateSettingSchema>;
export type SpecialDateAllowedTime = typeof specialDateAllowedTimes.$inferSelect;
export type InsertSpecialDateAllowedTime = z.infer<typeof insertSpecialDateAllowedTimeSchema>;
export type AppointmentHistory = typeof appointmentHistory.$inferSelect;
export type InsertAppointmentHistory = z.infer<typeof insertAppointmentHistorySchema>;

// Pet Boarding/Babysitting records
export const boardingRecords = pgTable("boarding_records", {
  id: serial("id").primaryKey(),
  
  // Customer information
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
  
  // Animal information
  animalType: varchar("animal_type", { length: 100 }).notNull(), // dog, cat, bird, rabbit, etc.
  animalName: varchar("animal_name", { length: 255 }).notNull(),
  
  // Dates
  estimatedDropOffDate: date("estimated_drop_off_date").notNull(),
  actualDropOffDate: date("actual_drop_off_date"),
  estimatedPickUpDate: date("estimated_pick_up_date").notNull(),
  actualPickUpDate: date("actual_pick_up_date"),
  
  // Pricing
  dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }).notNull(), // Price per day
  
  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, completed, cancelled
  
  // Additional notes
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Staging table for supply imports with duplicate detection
export const supplyImportStaging = pgTable("supply_import_staging", {
  id: serial("id").primaryKey(),
  importSessionId: varchar("import_session_id", { length: 255 }).notNull(), // Group imports together
  
  // Supply data fields
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  brand: varchar("brand", { length: 255 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  stockQuantity: integer("stock_quantity").default(0),
  size: varchar("size", { length: 50 }),
  weight: varchar("weight", { length: 50 }),
  sku: varchar("sku", { length: 100 }), // Optional SKU field for better identification
  
  // Duplicate detection fields
  compositeKey: varchar("composite_key", { length: 500 }).notNull(), // name+brand+size normalized
  normalizedSku: varchar("normalized_sku", { length: 100 }), // Normalized SKU (uppercase, trimmed)
  dataChecksum: varchar("data_checksum", { length: 64 }).notNull(), // SHA-256 of all fields
  
  // Status and matching
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, approved, rejected, duplicate, update
  matchedSupplyId: integer("matched_supply_id").references(() => supplies.id), // If duplicate/update, which supply it matches
  conflictReason: text("conflict_reason"), // Why it's marked as duplicate/conflict
  
  // Metadata
  rowNumber: integer("row_number"), // Original row number in Excel file
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Index for fast duplicate detection
  index("staging_composite_key_idx").on(table.importSessionId, table.compositeKey),
  index("staging_sku_idx").on(table.normalizedSku),
]);

// Employee Schedule
export const scheduleEntries = pgTable("schedule_entries", {
  id: serial("id").primaryKey(),
  section: varchar("section", { length: 10 }).notNull(), // A, B, C, etc.
  employeeName: varchar("employee_name", { length: 255 }).notNull(),
  dayOfWeek: varchar("day_of_week", { length: 20 }).notNull(), // Monday, Tuesday, etc.
  timeSlot: varchar("time_slot", { length: 100 }).notNull(), // e.g., "1-6", "12-6", "OFF", "9:30am-5"
  displayOrder: integer("display_order").default(0), // For ordering employees within a section
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Grooming Schedule
export const groomingScheduleEntries = pgTable("grooming_schedule_entries", {
  id: serial("id").primaryKey(),
  section: varchar("section", { length: 10 }).notNull(), // A, B, C, etc.
  groomerName: varchar("groomer_name", { length: 255 }).notNull(),
  dayOfWeek: varchar("day_of_week", { length: 20 }).notNull(), // Monday, Tuesday, etc.
  timeSlot: varchar("time_slot", { length: 100 }).notNull(), // e.g., "8-5", "9:30am-1pm", "OFF"
  displayOrder: integer("display_order").default(0), // For ordering groomers within a section
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Boarding schemas
export const insertBoardingRecordSchema = createInsertSchema(boardingRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BoardingRecord = typeof boardingRecords.$inferSelect;
export type InsertBoardingRecord = z.infer<typeof insertBoardingRecordSchema>;

export const insertSupplyImportStagingSchema = createInsertSchema(supplyImportStaging).omit({
  id: true,
  createdAt: true,
});

export type SupplyImportStaging = typeof supplyImportStaging.$inferSelect;
export type InsertSupplyImportStaging = z.infer<typeof insertSupplyImportStagingSchema>;

// Schedule schemas
export const insertScheduleEntrySchema = createInsertSchema(scheduleEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ScheduleEntry = typeof scheduleEntries.$inferSelect;
export type InsertScheduleEntry = z.infer<typeof insertScheduleEntrySchema>;

// Grooming Schedule schemas
export const insertGroomingScheduleEntrySchema = createInsertSchema(groomingScheduleEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type GroomingScheduleEntry = typeof groomingScheduleEntries.$inferSelect;
export type InsertGroomingScheduleEntry = z.infer<typeof insertGroomingScheduleEntrySchema>;

// Order Photo Uploads - AI-powered order extraction from photos
export const orderPhotos = pgTable("order_photos", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 255 }), // Optional user-defined name/label for the order
  imageUrl: varchar("image_url", { length: 500 }).notNull(),
  priceMultiplier: decimal("price_multiplier", { precision: 5, scale: 2 }).notNull().default("1.00"), // Markup multiplier (e.g., 1.5 = 50% markup)
  status: varchar("status", { length: 50 }).default("processing"), // processing, completed, error
  aiResponse: text("ai_response"), // Raw AI response for debugging
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrderPhotoSchema = createInsertSchema(orderPhotos)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    priceMultiplier: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(val => val)
  });

// Extracted items from order photos
export const extractedOrderItems = pgTable("extracted_order_items", {
  id: serial("id").primaryKey(),
  orderPhotoId: integer("order_photo_id").notNull().references(() => orderPhotos.id, { onDelete: "cascade" }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // Original price from photo
  markedUpPrice: decimal("marked_up_price", { precision: 10, scale: 2 }).notNull(), // Price after markup
  category: varchar("category", { length: 100 }), // Auto-suggested category
  brand: varchar("brand", { length: 255 }), // Auto-extracted brand
  notes: text("notes"), // Any special notes about the item
  addedToInventory: boolean("added_to_inventory").default(false), // Whether it's been added to supplies
  supplyId: integer("supply_id").references(() => supplies.id), // If added to inventory, reference to the supply
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type OrderPhoto = typeof orderPhotos.$inferSelect;
export type InsertOrderPhoto = z.infer<typeof insertOrderPhotoSchema>;

export const insertExtractedOrderItemSchema = createInsertSchema(extractedOrderItems)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(val => val),
    markedUpPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(val => val)
  });

export type ExtractedOrderItem = typeof extractedOrderItems.$inferSelect;
export type InsertExtractedOrderItem = z.infer<typeof insertExtractedOrderItemSchema>;

// Astro Loyalty Integration - Links local customers to Astro loyalty accounts
export const astroCustomers = pgTable("astro_customers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  astroCustomerId: varchar("astro_customer_id", { length: 255 }).notNull().unique(), // Astro's customer ID
  email: varchar("email", { length: 255 }).notNull(), // Email used in Astro (required by Astro)
  phoneNumber: varchar("phone_number", { length: 20 }), // Phone number in Astro
  loyaltyPoints: integer("loyalty_points").default(0), // Current loyalty points balance
  lastSyncedAt: timestamp("last_synced_at"), // Last time we synced with Astro API
  syncStatus: varchar("sync_status", { length: 50 }).default("pending"), // pending, synced, error
  syncError: text("sync_error"), // Error message if sync failed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAstroCustomerSchema = createInsertSchema(astroCustomers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AstroCustomer = typeof astroCustomers.$inferSelect;
export type InsertAstroCustomer = z.infer<typeof insertAstroCustomerSchema>;

// Astro Frequent Buyer Programs - Tracks progress on "buy X get 1 free" programs
export const astroFrequentBuyerProgress = pgTable("astro_frequent_buyer_progress", {
  id: serial("id").primaryKey(),
  astroCustomerId: integer("astro_customer_id").notNull().references(() => astroCustomers.id, { onDelete: "cascade" }),
  programId: varchar("program_id", { length: 255 }).notNull(), // Astro's program ID (e.g., brand-specific)
  programName: varchar("program_name", { length: 255 }).notNull(), // "Blue Buffalo 12+1", "Hill's 12+1", etc.
  productName: varchar("product_name", { length: 255 }), // Specific product in the program
  currentPunches: integer("current_punches").default(0), // How many purchases toward next free item
  requiredPunches: integer("required_punches").notNull(), // Total needed for free item (usually 12)
  freeItemsEarned: integer("free_items_earned").default(0), // Total free items earned in this program
  lastPurchaseDate: timestamp("last_purchase_date"), // Most recent purchase in this program
  expiresAt: timestamp("expires_at"), // When the current progress expires (if applicable)
  lastSyncedAt: timestamp("last_synced_at"), // Last sync with Astro
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAstroFrequentBuyerProgressSchema = createInsertSchema(astroFrequentBuyerProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AstroFrequentBuyerProgress = typeof astroFrequentBuyerProgress.$inferSelect;
export type InsertAstroFrequentBuyerProgress = z.infer<typeof insertAstroFrequentBuyerProgressSchema>;

// Astro Purchase Sync Log - Tracks which purchases have been synced to Astro
export const astroPurchaseSyncLog = pgTable("astro_purchase_sync_log", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  astroCustomerId: integer("astro_customer_id").notNull().references(() => astroCustomers.id, { onDelete: "cascade" }),
  supplyId: integer("supply_id").references(() => supplies.id), // Which product was synced
  quantity: integer("quantity").notNull(),
  syncedAt: timestamp("synced_at").defaultNow(),
  syncStatus: varchar("sync_status", { length: 50 }).default("success"), // success, failed, pending
  astroTransactionId: varchar("astro_transaction_id", { length: 255 }), // Astro's transaction ID
  syncError: text("sync_error"), // Error message if sync failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAstroPurchaseSyncLogSchema = createInsertSchema(astroPurchaseSyncLog).omit({
  id: true,
  createdAt: true,
});

export type AstroPurchaseSyncLog = typeof astroPurchaseSyncLog.$inferSelect;
export type InsertAstroPurchaseSyncLog = z.infer<typeof insertAstroPurchaseSyncLogSchema>;
