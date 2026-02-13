import {
  users,
  pets,
  brandCatalog,
  supplies,
  cartItems,
  orders,
  orderItems,
  refunds,
  refundReportSettings,
  appointments,
  appointmentPets,
  customerPets,
  groomingSettings,
  groomers,
  groomerAvailability,
  groomerBlockedDays,
  passwordResetTokens,
  wishlistItems,
  contacts,
  smsLogs,
  appointmentHistory,
  dailyAppointmentLimits,
  weeklyAppointmentLimits,
  supplyImportStaging,
  boardingRecords,
  scheduleEntries,
  groomingScheduleEntries,
  orderPhotos,
  extractedOrderItems,
  loyaltySettings,
  type User,
  type UpsertUser,
  type Pet,
  type InsertPet,
  type BrandCatalogEntry,
  type InsertBrandCatalogEntry,
  type Supply,
  type InsertSupply,
  type CartItem,
  type InsertCartItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type Refund,
  type InsertRefund,
  type RefundReportSetting,
  type InsertRefundReportSetting,
  type Appointment,
  type InsertAppointment,
  type CustomerPet,
  type InsertCustomerPet,
  type GroomingSetting,
  type InsertGroomingSetting,
  type Groomer,
  type InsertGroomer,
  type GroomerAvailability,
  type InsertGroomerAvailability,
  type GroomerBlockedDay,
  type InsertGroomerBlockedDay,
  type PasswordResetToken,
  type WishlistItem,
  type InsertWishlistItem,
  type Contact,
  type InsertContact,
  type AppointmentHistory,
  type InsertAppointmentHistory,
  type DailyAppointmentLimit,
  type InsertDailyAppointmentLimit,
  type WeeklyAppointmentLimit,
  type InsertWeeklyAppointmentLimit,
  specialDateSettings,
  specialDateAllowedTimes,
  type SpecialDateSetting,
  type InsertSpecialDateSetting,
  type SpecialDateAllowedTime,
  type InsertSpecialDateAllowedTime,
  type SupplyImportStaging,
  type BoardingRecord,
  type InsertBoardingRecord,
  type ScheduleEntry,
  type InsertScheduleEntry,
  type GroomingScheduleEntry,
  type InsertGroomingScheduleEntry,
  type OrderPhoto,
  type InsertOrderPhoto,
  type ExtractedOrderItem,
  type InsertExtractedOrderItem,
  pushSubscriptions,
  astroCustomers,
  astroFrequentBuyerProgress,
  astroPurchaseSyncLog,
  type AstroCustomer,
  type AutomatedMessage,
  type InsertAutomatedMessage,
  type AutomatedMessageLog,
  type InsertAstroCustomer,
  type AstroFrequentBuyerProgress,
  type InsertAstroFrequentBuyerProgress,
  type AstroPurchaseSyncLog,
  type InsertAstroPurchaseSyncLog,
  legalPages,
  type LegalPage,
  type InsertLegalPage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, not, ilike, lt, lte, isNull, count, sql, inArray, ne, notInArray } from "drizzle-orm";
import { phoneNumbersMatch } from "./phoneUtils";
import { SUPPLY_FILTERS, type FilterType } from "./filterConfig";
import { 
  createCompositeKey, 
  calculateDataChecksum, 
  findDuplicateMatch,
  normalizeSku 
} from "./duplicateDetection";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { email: string; password: string; firstName: string; lastName: string }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserAdmin(id: string, isAdmin: boolean): Promise<User>;
  updateUserGroomer(id: string, isGroomer: boolean): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // Pet operations
  getAllPets(): Promise<Pet[]>;
  getPetsBySpecies(species: string): Promise<Pet[]>;
  getPet(id: number): Promise<Pet | undefined>;
  createPet(pet: InsertPet): Promise<Pet>;
  updatePet(id: number, pet: Partial<InsertPet>): Promise<Pet>;
  deletePet(id: number): Promise<void>;
  hasPetReferences(id: number): Promise<boolean>;

  // Brand Catalog operations
  getAllBrandCatalogEntries(): Promise<BrandCatalogEntry[]>;
  getBrandCatalogEntry(id: number): Promise<BrandCatalogEntry | undefined>;
  getBrandCatalogByBrand(brand: string): Promise<BrandCatalogEntry[]>;
  lookupAbbreviation(brand: string, abbreviation: string): Promise<BrandCatalogEntry | undefined>;
  createBrandCatalogEntry(entry: InsertBrandCatalogEntry): Promise<BrandCatalogEntry>;
  updateBrandCatalogEntry(id: number, entry: Partial<InsertBrandCatalogEntry>): Promise<BrandCatalogEntry>;
  deleteBrandCatalogEntry(id: number): Promise<void>;

  // Supply operations
  getAllSupplies(): Promise<Supply[]>;
  getSuppliesByCategory(category: string): Promise<Supply[]>;
  getReptileSupplies(): Promise<Supply[]>;
  searchSupplies(query: string): Promise<Supply[]>;
  getPaginatedSupplies(params: { 
    limit: number; 
    offset: number; 
    category?: string; 
    search?: string; 
    filterType?: FilterType;
    petFoodAnimalType?: string;
    treatAnimalType?: string;
    animalType?: string;
    foodType?: string;
    toyType?: string;
    healthcareType?: string;
  }): Promise<{ items: Supply[]; total: number }>;
  getSupply(id: number): Promise<Supply | undefined>;
  getSuppliesByIds(ids: number[]): Promise<Supply[]>;
  getRelatedSupplies(excludeId: number, category: string, brand: string | null, limit?: number, productName?: string): Promise<Supply[]>;
  createSupply(supply: InsertSupply): Promise<Supply>;
  updateSupply(id: number, supply: Partial<InsertSupply>): Promise<Supply>;
  deleteSupply(id: number): Promise<void>;
  autoCategorizeAllSupplies(): Promise<{
    aquatic: number;
    reptile: number;
    general: number;
    total: number;
  }>;

  fixKongReptiles(): Promise<{ count: number }>;

  autoCategorizeProductCategories(): Promise<{
    food: number;
    toys: number;
    beds: number;
    leashes: number;
    healthcare: number;
    accessories: number;
    smallanimal: number;
    aquatics: number;
    reptiles: number;
    birdSupplies: number;
    dogCages: number;
    smallAnimalSupplies: number;
    dogTreats: number;
    catTreats: number;
    unchanged: number;
    total: number;
  }>;

  // Cleanup categories - normalize names, fix mismatches, split food categories
  cleanupCategories(): Promise<{
    clothingToAccessories: number;
    collarsToCollarsLeashes: number;
    foodSplitToDogFood: number;
    foodSplitToCatFood: number;
    kennelToDogCages: number;
    smallAnimalSuppliesToSmallAnimal: number;
    catToyToToys: number;
    filterTypeSynced: number;
    beefhideFixed: number;
    groomingToHealthcare: number;
    total: number;
  }>;

  getSuppliesWithoutImages(limit: number, offset: number, brand?: string, category?: string, search?: string): Promise<Supply[]>;
  getSuppliesByFilter(limit: number, offset: number, brand?: string, category?: string, search?: string): Promise<Supply[]>;
  getSupplyImageStats(): Promise<{
    totalProducts: number;
    withImages: number;
    withoutImages: number;
    byBrand: { brand: string; total: number; withImages: number; withoutImages: number }[];
    byCategory: { category: string; total: number; withImages: number; withoutImages: number }[];
  }>;
  getSuppliesByBrandOrCategory(params: {
    brand?: string;
    category?: string;
    limit: number;
    offset: number;
  }): Promise<Supply[]>;

  // Cart operations
  getCartItems(userId: string): Promise<CartItem[]>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: number, quantity: number): Promise<CartItem>;
  removeFromCart(id: number): Promise<void>;
  clearCart(userId: string): Promise<void>;
  getAbandonedCarts(hoursOld: number): Promise<Array<{userId: string; email: string; firstName: string; items: CartItem[]; oldestItemAt: Date}>>;
  updateAbandonedCartEmailSent(userId: string): Promise<void>;

  // Order operations
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  getOrders(userId?: string): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderWithItems(id: number): Promise<{ order: Order; items: OrderItem[] } | undefined>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  updateOrderApprovalStatus(id: number, approvalStatus: string): Promise<Order>;
  applyOrderDiscount(id: number, discountAmount: string, discountReason: string): Promise<Order>;
  updateOrderStripePayment(id: number, data: { stripeCheckoutSessionId?: string; stripePaymentIntentId?: string; stripePaymentUrl?: string; paymentStatus?: string; paidAt?: Date }): Promise<Order>;
  getOrderByStripeCheckoutSession(sessionId: string): Promise<Order | undefined>;
  getOrderByStripePaymentIntent(paymentIntentId: string): Promise<Order | undefined>;
  hideOrderFromAdmin(id: number): Promise<Order>;
  deleteOrder(id: number): Promise<void>;

  // Appointment operations
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  createAppointmentPets(appointmentId: number, pets: Array<{petName: string; petType: string; serviceType: string; price: string; specialNotes?: string; groomerId?: number | null}>): Promise<void>;
  getAppointmentPets(appointmentId: number): Promise<any[]>;
  getAppointmentPetsByAppointmentIds(appointmentIds: number[]): Promise<Map<number, any[]>>;
  deleteAppointmentPets(appointmentId: number): Promise<void>;
  getAppointments(userId?: string): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentsByPhoneNumber(phoneNumber: string): Promise<Appointment[]>;
  updateAppointmentStatus(id: number, status: string): Promise<Appointment>;
  updateAppointmentIsHere(id: number, isHere: boolean): Promise<Appointment>;
  updateAppointmentIsPaid(id: number, isPaid: boolean): Promise<Appointment>;
  updateAppointmentGroomingCompleted(id: number, groomingCompleted: boolean): Promise<Appointment>;
  updateAppointmentDetails(id: number, updates: { 
    ownerFirstName?: string; 
    ownerLastName?: string; 
    ownerPhoneNumber?: string; 
    petName?: string; 
    petType?: string; 
    specialNotes?: string; 
    price?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    groomerId?: number | null;
    serviceType?: string;
  }): Promise<Appointment>;
  clearAllAppointments(): Promise<void>;
  bulkCreateAppointments(appointments: InsertAppointment[]): Promise<Appointment[]>;
  
  // Appointment history operations
  saveAppointmentToHistory(appointment: Appointment, options?: { groomerName?: string }): Promise<AppointmentHistory>;
  getAppointmentHistoryByContactId(contactId: number): Promise<AppointmentHistory[]>;

  // Customer pet operations
  getCustomerPets(userId: string): Promise<CustomerPet[]>;
  createCustomerPet(pet: InsertCustomerPet): Promise<CustomerPet>;
  updateCustomerPet(id: number, pet: Partial<InsertCustomerPet>): Promise<CustomerPet>;
  deleteCustomerPet(id: number): Promise<void>;

  // Grooming settings operations
  getGroomingSettings(): Promise<GroomingSetting[]>;
  getGroomingSetting(setting: string): Promise<GroomingSetting | undefined>;
  upsertGroomingSetting(setting: InsertGroomingSetting): Promise<GroomingSetting>;

  // Groomer operations
  getAllGroomers(): Promise<Groomer[]>;
  getActiveGroomers(): Promise<Groomer[]>;
  getGroomer(id: number): Promise<Groomer | undefined>;
  createGroomer(groomer: InsertGroomer): Promise<Groomer>;
  updateGroomer(id: number, groomer: Partial<InsertGroomer>): Promise<Groomer>;
  deleteGroomer(id: number): Promise<void>;

  // Groomer availability operations
  getGroomerAvailability(groomerId: number): Promise<GroomerAvailability[]>;
  getAvailableGroomersForDay(dayOfWeek: number): Promise<Groomer[]>;
  getAvailableGroomersForDate(date: string): Promise<Groomer[]>;
  setGroomerAvailability(availability: InsertGroomerAvailability): Promise<GroomerAvailability>;
  updateGroomerAvailability(id: number, availability: Partial<InsertGroomerAvailability>): Promise<GroomerAvailability>;
  deleteGroomerAvailability(id: number): Promise<void>;

  // Groomer blocked days operations (sick days, vacation, etc.)
  getGroomerBlockedDays(groomerId: number): Promise<GroomerBlockedDay[]>;
  getAllGroomerBlockedDays(): Promise<GroomerBlockedDay[]>;
  getGroomerBlockedDaysForDate(date: string): Promise<GroomerBlockedDay[]>;
  createGroomerBlockedDay(blockedDay: InsertGroomerBlockedDay): Promise<GroomerBlockedDay>;
  deleteGroomerBlockedDay(id: number): Promise<void>;

  // Password reset token operations
  createPasswordResetToken(token: string, userId: string, expiresAt: Date): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markTokenAsUsed(token: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;

  // Wishlist operations
  getWishlistItems(userId: string): Promise<WishlistItem[]>;
  addToWishlist(wishlistItem: InsertWishlistItem): Promise<WishlistItem>;
  removeFromWishlist(id: number, userId: string): Promise<boolean>;

  // Contact operations
  getAllContacts(): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  getContactByPhoneNumber(phoneNumber: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;
  linkContactToUser(contactId: number, userId: string): Promise<void>;
  findUnlinkedContactsByPhoneNumber(phoneNumber: string): Promise<Contact[]>;
  updateContactSmsOptOut(contactId: number, optOut: boolean): Promise<Contact>;

  // SMS log operations
  createSmsLog(log: { contactId?: number; phoneNumber: string; message: string; status: string; errorMessage?: string; twilioSid?: string; appointmentId?: number }): Promise<any>;
  getSmsLogs(limit?: number): Promise<any[]>;
  getFailedSmsLogs(): Promise<any[]>;

  // Daily appointment limit operations (deprecated, use weekly limits)
  getDailyAppointmentLimit(date: string): Promise<DailyAppointmentLimit | undefined>;
  getAllDailyAppointmentLimits(): Promise<DailyAppointmentLimit[]>;
  upsertDailyAppointmentLimit(limit: InsertDailyAppointmentLimit): Promise<DailyAppointmentLimit>;
  deleteDailyAppointmentLimit(id: number): Promise<void>;

  // Weekly appointment limit operations (day of week based)
  getWeeklyAppointmentLimit(dayOfWeek: number): Promise<WeeklyAppointmentLimit | undefined>;
  getAllWeeklyAppointmentLimits(): Promise<WeeklyAppointmentLimit[]>;
  upsertWeeklyAppointmentLimit(limit: InsertWeeklyAppointmentLimit): Promise<WeeklyAppointmentLimit>;
  deleteWeeklyAppointmentLimit(id: number): Promise<void>;
  
  // Atomic capacity check - prevents race conditions by counting in the same transaction as creation
  acquireBookingLock(dateStr: string): Promise<void>;
  releaseBookingLock(dateStr: string): Promise<void>;
  checkAndReserveCapacity(
    dateStr: string, 
    dayOfWeek: number,
    requestedBaths: number,
    requestedGrooms: number
  ): Promise<{ withinCapacity: boolean; bathCount: number; groomCount: number; bathLimit: number; groomLimit: number; reason?: string }>;

  // Special date settings operations
  getSpecialDateSetting(date: string): Promise<SpecialDateSetting | undefined>;
  getAllSpecialDateSettings(): Promise<SpecialDateSetting[]>;
  createSpecialDateSetting(setting: InsertSpecialDateSetting): Promise<SpecialDateSetting>;
  updateSpecialDateSetting(id: number, setting: Partial<InsertSpecialDateSetting>): Promise<SpecialDateSetting>;
  deleteSpecialDateSetting(id: number): Promise<void>;
  getSpecialDateAllowedTimes(specialDateId: number): Promise<SpecialDateAllowedTime[]>;
  addSpecialDateAllowedTime(allowedTime: InsertSpecialDateAllowedTime): Promise<SpecialDateAllowedTime>;
  deleteSpecialDateAllowedTime(id: number): Promise<void>;
  getSpecialDateWithTimes(date: string): Promise<{ setting: SpecialDateSetting; times: SpecialDateAllowedTime[] } | null>;

  // Supply import staging operations
  stageSupplyImports(sessionId: string, supplies: any[]): Promise<{ sessionId: string; staged: number; duplicates: number; updates: number }>;
  getStagedImports(sessionId: string): Promise<any[]>;
  approveStagedImports(sessionId: string): Promise<{ created: number; updated: number }>;
  rejectStagedImports(sessionId: string): Promise<void>;
  clearOldStagingData(daysOld: number): Promise<void>;

  // Boarding operations
  getAllBoardingRecords(): Promise<BoardingRecord[]>;
  getBoardingRecord(id: number): Promise<BoardingRecord | undefined>;
  createBoardingRecord(record: InsertBoardingRecord): Promise<BoardingRecord>;
  updateBoardingRecord(id: number, record: Partial<InsertBoardingRecord>): Promise<BoardingRecord>;
  checkInBoardingRecord(id: number): Promise<BoardingRecord>;
  checkOutBoardingRecord(id: number): Promise<BoardingRecord>;
  deleteBoardingRecord(id: number): Promise<void>;
  
  // Schedule operations
  getAllScheduleEntries(): Promise<ScheduleEntry[]>;
  batchUpdateScheduleEntries(entries: InsertScheduleEntry[]): Promise<ScheduleEntry[]>;
  updateScheduleEntry(id: number, entry: Partial<InsertScheduleEntry>): Promise<ScheduleEntry>;
  deleteScheduleEntry(id: number): Promise<void>;

  // Order Photo operations
  getAllOrderPhotos(userId?: string): Promise<OrderPhoto[]>;
  getOrderPhoto(id: number): Promise<OrderPhoto | undefined>;
  createOrderPhoto(photo: InsertOrderPhoto): Promise<OrderPhoto>;
  updateOrderPhoto(id: number, photo: Partial<InsertOrderPhoto>): Promise<OrderPhoto>;
  deleteOrderPhoto(id: number): Promise<void>;

  // Extracted Order Item operations
  getExtractedOrderItems(orderPhotoId: number): Promise<ExtractedOrderItem[]>;
  getExtractedOrderItem(id: number): Promise<ExtractedOrderItem | undefined>;
  createExtractedOrderItem(item: InsertExtractedOrderItem): Promise<ExtractedOrderItem>;
  updateExtractedOrderItem(id: number, item: Partial<InsertExtractedOrderItem>): Promise<ExtractedOrderItem>;
  deleteExtractedOrderItem(id: number): Promise<void>;
  bulkCreateExtractedOrderItems(items: InsertExtractedOrderItem[]): Promise<ExtractedOrderItem[]>;

  // Astro Loyalty operations
  getAstroCustomerByUserId(userId: string): Promise<AstroCustomer | undefined>;
  getAstroCustomerByAstroId(astroCustomerId: string): Promise<AstroCustomer | undefined>;
  createAstroCustomer(customer: InsertAstroCustomer): Promise<AstroCustomer>;
  updateAstroCustomer(id: number, customer: Partial<InsertAstroCustomer>): Promise<AstroCustomer>;
  getAllAstroCustomers(): Promise<AstroCustomer[]>;
  
  getFrequentBuyerProgressByCustomer(astroCustomerId: number): Promise<AstroFrequentBuyerProgress[]>;
  upsertFrequentBuyerProgress(progress: InsertAstroFrequentBuyerProgress): Promise<AstroFrequentBuyerProgress>;
  
  getPurchaseSyncLogByOrder(orderId: number): Promise<AstroPurchaseSyncLog[]>;
  createPurchaseSyncLog(log: InsertAstroPurchaseSyncLog): Promise<AstroPurchaseSyncLog>;

  // Loyalty program operations
  getLoyaltySettings(): Promise<{ spendingThreshold: string; rewardAmount: string; isActive: boolean }>;
  updateLoyaltySettings(settings: { spendingThreshold?: string; rewardAmount?: string; isActive?: boolean }): Promise<{ spendingThreshold: string; rewardAmount: string; isActive: boolean }>;
  getUserLoyaltyStatus(userId: string): Promise<{ totalSpent: string; loyaltyCredits: string; progressToNextReward: number; spendingThreshold: string; rewardAmount: string }>;
  applyLoyaltyCredit(userId: string, amount: number): Promise<{ success: boolean; remainingCredits: string }>;
  updateUserLoyalty(userId: string, data: { loyaltyCredits?: string; totalSpent?: string }): Promise<User>;
  addToUserTotalSpent(userId: string, amount: number): Promise<{ newCreditsEarned: boolean; creditsAmount: string }>;
  updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; stripeDefaultPaymentMethod?: string }): Promise<User>;

  // Legal pages operations
  getLegalPage(slug: string): Promise<LegalPage | undefined>;
  upsertLegalPage(data: { slug: string; title: string; content: string; lastUpdatedBy?: string }): Promise<LegalPage>;
  getAllLegalPages(): Promise<LegalPage[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error('Database error in getUser:', error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(ilike(users.email, email));
      return user;
    } catch (error) {
      console.error('Database error in getUserByEmail:', error);
      return undefined;
    }
  }

  async createUser(userData: { email: string; password: string; firstName: string; lastName: string }): Promise<User> {
    try {
      const userId = Math.random().toString(36).substring(2, 15);
      const [user] = await db
        .insert(users)
        .values({
          id: userId,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: null,
          password: userData.password,
        })
        .returning();
      return user;
    } catch (error) {
      console.error('Database error in createUser:', error);
      throw new Error('Failed to create user');
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Pet operations
  async getAllPets(): Promise<Pet[]> {
    try {
      return await db.select().from(pets).where(eq(pets.isAvailable, true)).orderBy(desc(pets.createdAt));
    } catch (error) {
      console.error('Database error in getAllPets:', error);
      // Return demo data when database fails
      return [
        {
          id: 1,
          name: "Bella",
          species: "dog",
          breed: "Golden Retriever", 
          age: "2 years",
          price: "800",
          description: "Friendly and energetic golden retriever",
          imageUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          name: "Max",
          species: "cat",
          breed: "Maine Coon",
          age: "3 years", 
          price: "600",
          description: "Gentle giant with beautiful fur",
          imageUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 3,
          name: "Charlie",
          species: "reptile",
          breed: "Bearded Dragon",
          age: "1 year",
          price: "150",
          description: "Our specialty exotic reptile - calm and friendly",
          imageUrl: "https://images.unsplash.com/photo-1516814765986-4d2b2a7b6ec8?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
    }
  }

  async getPetsBySpecies(species: string): Promise<Pet[]> {
    return await db
      .select()
      .from(pets)
      .where(and(ilike(pets.species, species), eq(pets.isAvailable, true)))
      .orderBy(desc(pets.createdAt));
  }

  async getPet(id: number): Promise<Pet | undefined> {
    const [pet] = await db.select().from(pets).where(eq(pets.id, id));
    return pet;
  }

  async createPet(pet: InsertPet): Promise<Pet> {
    const [newPet] = await db.insert(pets).values(pet).returning();
    return newPet;
  }

  async updatePet(id: number, pet: Partial<InsertPet>): Promise<Pet> {
    const [updatedPet] = await db
      .update(pets)
      .set({ ...pet, updatedAt: new Date() })
      .where(eq(pets.id, id))
      .returning();
    return updatedPet;
  }

  async deletePet(id: number): Promise<void> {
    await db.delete(pets).where(eq(pets.id, id));
  }

  async hasPetReferences(id: number): Promise<boolean> {
    // Check if pet is referenced in: cartItems, orderItems, wishlistItems, extractedOrderItems
    const [cartCount] = await db
      .select({ count: count() })
      .from(cartItems)
      .where(eq(cartItems.petId, id));
    
    if (cartCount.count > 0) return true;
    
    const [orderCount] = await db
      .select({ count: count() })
      .from(orderItems)
      .where(eq(orderItems.petId, id));
    
    if (orderCount.count > 0) return true;
    
    const [wishlistCount] = await db
      .select({ count: count() })
      .from(wishlistItems)
      .where(eq(wishlistItems.petId, id));
    
    if (wishlistCount.count > 0) return true;
    
    const [extractedCount] = await db
      .select({ count: count() })
      .from(extractedOrderItems)
      .where(eq(extractedOrderItems.petId, id));
    
    if (extractedCount.count > 0) return true;
    
    return false;
  }

  // Brand Catalog operations
  async getAllBrandCatalogEntries(): Promise<BrandCatalogEntry[]> {
    return await db.select().from(brandCatalog).orderBy(brandCatalog.brand, brandCatalog.productLine);
  }

  async getBrandCatalogEntry(id: number): Promise<BrandCatalogEntry | undefined> {
    const [entry] = await db.select().from(brandCatalog).where(eq(brandCatalog.id, id));
    return entry;
  }

  async getBrandCatalogByBrand(brand: string): Promise<BrandCatalogEntry[]> {
    return await db
      .select()
      .from(brandCatalog)
      .where(ilike(brandCatalog.brand, brand))
      .orderBy(brandCatalog.productLine);
  }

  async lookupAbbreviation(brand: string, abbreviation: string): Promise<BrandCatalogEntry | undefined> {
    // Case-insensitive lookup for brand + abbreviation match
    const [entry] = await db
      .select()
      .from(brandCatalog)
      .where(
        and(
          ilike(brandCatalog.brand, brand),
          ilike(brandCatalog.abbreviation, abbreviation)
        )
      )
      .limit(1);
    return entry;
  }

  async createBrandCatalogEntry(entry: InsertBrandCatalogEntry): Promise<BrandCatalogEntry> {
    const [newEntry] = await db.insert(brandCatalog).values(entry).returning();
    return newEntry;
  }

  async updateBrandCatalogEntry(id: number, entry: Partial<InsertBrandCatalogEntry>): Promise<BrandCatalogEntry> {
    const [updatedEntry] = await db
      .update(brandCatalog)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(brandCatalog.id, id))
      .returning();
    return updatedEntry;
  }

  async deleteBrandCatalogEntry(id: number): Promise<void> {
    await db.delete(brandCatalog).where(eq(brandCatalog.id, id));
  }

  // Supply operations
  async getAllSupplies(): Promise<Supply[]> {
    try {
      return await db.select().from(supplies).orderBy(desc(supplies.createdAt));
    } catch (error) {
      console.error('Database error in getAllSupplies:', error);
      // Return demo data when database fails
      return [
        {
          id: 1,
          name: "Premium Dog Food",
          brand: "Royal Canin",
          category: "food",
          price: "49.99",
          description: "High-quality nutrition for adult dogs",
          imageUrl: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          stockQuantity: 25,
          isActive: true,
          weight: null,
          size: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          name: "Cat Litter",
          brand: "Fresh Step", 
          category: "hygiene",
          price: "12.99",
          description: "Odor control cat litter",
          imageUrl: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          stockQuantity: 15,
          isActive: true,
          weight: null,
          size: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 3,
          name: "Reptile Heat Lamp",
          brand: "Zoo Med",
          category: "equipment", 
          price: "29.99",
          description: "Essential heating for reptile habitats",
          imageUrl: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200",
          stockQuantity: 8,
          isActive: true,
          weight: null,
          size: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
    }
  }

  async getSuppliesByCategory(category: string): Promise<Supply[]> {
    return await db
      .select()
      .from(supplies)
      .where(and(eq(supplies.category, category), eq(supplies.isActive, true)))
      .orderBy(desc(supplies.createdAt));
  }

  async getReptileSupplies(): Promise<Supply[]> {
    // Get supplies for reptiles based on brand or keywords in name/description
    const reptileBrands = ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare'];
    const reptileKeywords = [
      'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon',
      'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
      'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti'
    ];
    
    // Aquatic brands and keywords to EXCLUDE from reptile supplies
    const aquaticBrands = ['Tetra', 'Aqueon', 'GloFish', 'Marina', 'API', 'Fluval', 'SeaChem', 'Hikari'];
    const aquaticKeywords = ['fish', 'aquarium', 'aquatic', 'glo fish', 'betta'];
    
    // Build OR conditions for brands and keywords
    const brandConditions = reptileBrands.map(brand => eq(supplies.brand, brand));
    const keywordConditions = reptileKeywords.flatMap(keyword => [
      ilike(supplies.name, `%${keyword}%`),
      ilike(supplies.description, `%${keyword}%`)
    ]);
    
    // Build exclusion conditions for aquatic products (handle NULL fields with OR isNull)
    const aquaticBrandExclusions = aquaticBrands.map(brand => 
      or(isNull(supplies.brand), not(eq(supplies.brand, brand)))
    );
    const aquaticKeywordExclusions = aquaticKeywords.flatMap(keyword => [
      or(isNull(supplies.name), not(ilike(supplies.name, `%${keyword}%`))),
      or(isNull(supplies.description), not(ilike(supplies.description, `%${keyword}%`)))
    ]);
    
    return await db
      .select()
      .from(supplies)
      .where(
        and(
          eq(supplies.isActive, true),
          or(...brandConditions, ...keywordConditions),
          ...aquaticBrandExclusions,
          ...aquaticKeywordExclusions
        )
      )
      .orderBy(desc(supplies.createdAt));
  }

  async searchSupplies(query: string): Promise<Supply[]> {
    return await db
      .select()
      .from(supplies)
      .where(
        and(
          eq(supplies.isActive, true),
          or(
            ilike(supplies.name, `%${query}%`),
            ilike(supplies.brand, `%${query}%`),
            ilike(supplies.description, `%${query}%`),
            ilike(supplies.sku, `%${query}%`)
          )
        )
      )
      .orderBy(desc(supplies.createdAt));
  }

  async getPaginatedSupplies(params: {
    limit: number;
    offset: number;
    category?: string;
    search?: string;
    filterType?: FilterType;
    animalType?: string;
    foodType?: string;
    toyType?: string;
    healthcareType?: string;
    aquaticType?: string;
    reptileType?: string;
    birdType?: string;
    smallAnimalProductType?: string;
    petFoodAnimalType?: string;
    treatAnimalType?: string;
  }): Promise<{ items: Supply[]; total: number }> {
    const { limit, offset, category, search, filterType, animalType, foodType, toyType, healthcareType, aquaticType, reptileType, birdType, smallAnimalProductType, petFoodAnimalType, treatAnimalType } = params;

    // Build WHERE conditions based on filters
    let whereConditions: any[] = [eq(supplies.isActive, true)];
    
    // Trim search to handle whitespace consistently
    const trimmedSearch = search?.trim() || '';

    if (filterType) {
      // Use the pre-calculated filter_type column (set by auto-categorization)
      // This is much more reliable than runtime filtering
      whereConditions.push(eq(supplies.filterType, filterType));
    }
    
    // Apply category filter whenever category is provided
    // Handle consolidated categories (petFood → dogFood + catFood + smallAnimalFood, treats → dogTreats + catTreats + smallAnimalTreats)
    if (category) {
      if (category === 'petFood') {
        // Consolidated Pet Food category - query dog, cat, and small animal food
        if (petFoodAnimalType === 'dog') {
          whereConditions.push(eq(supplies.category, 'dogFood'));
        } else if (petFoodAnimalType === 'cat') {
          whereConditions.push(eq(supplies.category, 'catFood'));
        } else if (petFoodAnimalType === 'smallAnimal') {
          whereConditions.push(eq(supplies.category, 'smallAnimalFood'));
        } else {
          // No animal type filter - show all pet food (dog, cat, and small animal)
          whereConditions.push(or(
            eq(supplies.category, 'dogFood'),
            eq(supplies.category, 'catFood'),
            eq(supplies.category, 'smallAnimalFood')
          ));
        }
      } else if (category === 'treats') {
        // Consolidated Treats category - query dog, cat, and small animal treats
        if (treatAnimalType === 'dog') {
          whereConditions.push(eq(supplies.category, 'dogTreats'));
        } else if (treatAnimalType === 'cat') {
          whereConditions.push(eq(supplies.category, 'catTreats'));
        } else if (treatAnimalType === 'smallAnimal') {
          whereConditions.push(eq(supplies.category, 'smallAnimalTreats'));
        } else {
          // No animal type filter - show all treats (dog, cat, and small animal)
          whereConditions.push(or(
            eq(supplies.category, 'dogTreats'),
            eq(supplies.category, 'catTreats'),
            eq(supplies.category, 'smallAnimalTreats')
          ));
        }
      } else {
        // Standard category filter
        whereConditions.push(eq(supplies.category, category));
      }
    }

    // Define animal type keywords for filtering
    const animalKeywords: Record<string, { include: string[], exclude: string[] }> = {
      'hamster': {
        include: ['hamster'],
        exclude: []
      },
      'guinea-pig': {
        include: ['guinea pig', 'cavy'],
        exclude: []
      },
      'rabbit': {
        include: ['rabbit', 'bunny'],
        exclude: []
      },
      'ferret': {
        include: ['ferret'],
        exclude: []
      },
      'mouse-rat': {
        include: ['mouse', 'rat', 'mice'],
        exclude: []
      },
      'gerbil': {
        include: ['gerbil'],
        exclude: []
      },
      'chinchilla': {
        include: ['chinchilla'],
        exclude: []
      }
    };

    // Define food type keywords and brands for filtering with exclusions
    const foodKeywords: Record<string, { include: string[], exclude: string[], brands: string[] }> = {
      'dog-food': {
        include: ['dog', 'puppy', 'canine', 'k9', 'large breed', 'small breed', 'adult dog', 'senior dog'],
        exclude: ['cat', 'kitten', 'bird', 'fish food', 'betta', 'goldfish', 'guinea pig', 'hamster', 'rabbit'],
        brands: ['victor', 'purina', 'blue buffalo', 'pedigree', 'iams', 'eukanuba', 'royal canin', 'hills', 'wellness', 'nutro', 'taste of the wild', 'orijen', 'acana', 'fromm', 'merrick', 'canidae', 'diamond naturals', 'rachael ray nutrish', 'solid gold', 'earthborn holistic']
      },
      'cat-food': {
        include: ['cat', 'kitten', 'feline'],
        exclude: ['dog', 'puppy', 'bird', 'fish food', 'betta', 'goldfish', 'guinea pig', 'hamster', 'rabbit'],
        brands: ['fancy feast', 'friskies', 'meow mix', 'sheba', 'whiskas', 'iams', 'royal canin', 'hills', 'wellness', 'blue buffalo', 'purina', 'nutro']
      },
      'bird-food': {
        include: ['bird', 'parakeet', 'parrot', 'finch', 'canary', 'cockatiel', 'avian', 'millet'],
        exclude: ['dog', 'cat', 'puppy', 'kitten', 'fish food', 'betta', 'goldfish'],
        brands: ['kaytee', 'zupreem', 'higgins', 'lafeber', 'vitakraft', 'brown\'s', 'volkman']
      },
      'fish-food': {
        include: ['fish food', 'betta', 'goldfish', 'tropical fish', 'aquatic', 'koi', 'flake', 'pellet', 'tetra', 'guppy', 'cichlid', 'catfish'],
        exclude: ['dog food', 'puppy food', 'cat food', 'kitten food', 'chicken', 'beef', 'lamb', 'turkey'],
        brands: ['tetra', 'hikari', 'omega one', 'api', 'aqueon', 'northfin', 'new life spectrum', 'sera', 'wardley']
      },
      'small-animal-food': {
        include: ['guinea pig', 'hamster', 'rabbit', 'bunny', 'ferret', 'gerbil', 'chinchilla', 'cavy', 'mouse', 'rat', 'timothy hay', 'alfalfa'],
        exclude: ['dog', 'puppy', 'cat', 'kitten', 'bird'],
        brands: ['oxbow', 'kaytee', 'vitakraft', 'supreme', 'burgess', 'living world']
      }
    };

    // Define toy type keywords for filtering with exclusions
    // IMPORTANT: Include brand names in keyword list since brand field is often empty
    // Products have brand in name like "Kong Airdog" not "Kong Dog Toy"
    const toyKeywords: Record<string, { include: string[], exclude: string[], brands?: string[] }> = {
      'dog-toys': {
        // Include common dog toy brands and keywords - brand names check product NAME not brand field
        include: ['kong', 'nylabone', 'benebone', 'chuckit', 'west paw', 'mammoth', 'outward hound', 'tuffy', 'multipet', 'spot', 'rascals', 'bionic', 'jw', 'starmark', 'zanies', 'dog', 'puppy', 'canine', 'chew', 'fetch', 'tug', 'rope', 'ball', 'squeaker', 'plush'],
        exclude: ['cat toy', 'kitten', 'catnip', 'bird toy', 'hamster', 'guinea pig', 'rabbit', 'parakeet', 'parrot', 'feather wand'],
        brands: []
      },
      'cat-toys': {
        // Include cat-specific brands and keywords
        include: ['cat', 'kitten', 'feline', 'catnip', 'mouse toy', 'feather', 'wand', 'laser', 'teaser', 'scratcher', 'petstages', 'jackson galaxy', 'yeowww', 'bergan', 'catit'],
        exclude: ['dog toy', 'puppy toy', 'airdog', 'bird toy', 'hamster', 'guinea pig', 'rabbit'],
        brands: []
      },
      'bird-toys': {
        include: ['bird', 'parakeet', 'parrot', 'perch', 'avian', 'swing', 'ladder', 'cockatiel', 'budgie', 'finch', 'birdlife', 'prevue', 'jw bird'],
        exclude: ['dog', 'puppy', 'cat', 'kitten', 'airdog'],
        brands: []
      },
      'small-animal-toys': {
        include: ['guinea pig', 'hamster', 'rabbit', 'bunny', 'ferret', 'gerbil', 'chinchilla', 'small animal', 'kaytee', 'oxbow', 'living world', 'vitakraft', 'runabout', 'run-about', 'chewbular', 'comfort wheel', 'hamsteroids', 'crinkle tunnel', 'flex tunnel', 'combo toy', 'hay ball'],
        exclude: ['dog', 'puppy', 'cat', 'kitten', 'bird seed', 'bird food', 'airdog'],
        brands: []
      }
    };

    // Define healthcare type keywords for filtering with exclusions
    const healthcareKeywords: Record<string, { include: string[], exclude: string[], brands?: string[] }> = {
      'flea-tick': {
        include: ['flea', 'tick', 'pest', 'insect', 'parasite', 'flea collar'],
        exclude: [],
        brands: ['frontline', 'advantage', 'seresto', 'bayer', 'capstar']
      },
      'dental': {
        include: ['dental', 'teeth', 'tooth', 'breath', 'tartar', 'plaque', 'oral', 'toothbrush', 'toothpaste'],
        exclude: [],
        brands: ['tropiclean', 'virbac', 'petsmile']
      },
      'supplements': {
        include: ['supplement', 'vitamin', 'probiotic', 'joint', 'hip', 'glucosamine', 'omega', 'nutrient', 'multivitamin'],
        exclude: ['shampoo', 'conditioner', 'brush', 'ear cleaner', 'ear wash', 'ear wipe', 'ear care', 'ear therapy', 'earmite'],
        brands: ['cosequin', 'dasuquin', 'nutramax', 'grizzly']
      },
      'grooming': {
        include: ['shampoo', 'conditioner', 'brush', 'comb', 'nail', 'clipper', 'trimmer', 'grooming', 'bath', 'deshedding', 'ear cleaner', 'ear wash', 'ear wipe', 'ear care', 'ear therapy', 'earcare', 'earmite', 'cologne', 'deodorizer', 'spritz', 'slicker', 'rake', 'dematter', 'shedding', 'scissors'],
        exclude: ['food', 'treat', 'toy'],
        brands: ['furminator', 'chris christensen', 'isle of dogs', 'safari', 'biogroom', 'tropiclean']
      },
      'first-aid': {
        include: ['first aid', 'bandage', 'ointment', 'cream', 'wound', 'antiseptic', 'antibiotic', 'healing', 'gauze'],
        exclude: ['shampoo', 'conditioner'],
        brands: []
      }
    };

    // Define aquatic type keywords for filtering with exclusions
    const aquaticKeywords: Record<string, { include: string[], exclude: string[], brands?: string[] }> = {
      'fish-food': {
        include: ['food', 'flake', 'pellet', 'wafer', 'algae', 'brine shrimp', 'bloodworm', 'freeze dried', 'frozen', 'feeder'],
        exclude: ['filter', 'pump', 'heater', 'thermometer', 'decoration', 'plant', 'gravel', 'substrate', 'net', 'tank'],
        brands: ['hikari', 'omega one', 'ocean nutrition', 'tetra', 'api', 'fluval', 'aqueon', 'sera', 'new life spectrum']
      },
      'medicine': {
        include: ['medicine', 'treatment', 'remedy', 'medication', 'cure', 'ich', 'fungus', 'bacteria', 'parasite', 'stress coat', 'conditioner', 'dechlorinator', 'prime', 'safe', 'stability'],
        exclude: ['food', 'flake', 'pellet', 'filter', 'pump', 'decoration'],
        brands: ['seachem', 'api', 'hikari', 'tetra', 'kordon', 'microbe-lift']
      },
      'supplies': {
        include: ['filter', 'pump', 'heater', 'thermometer', 'air stone', 'airline', 'tubing', 'net', 'gravel', 'substrate', 'decoration', 'plant', 'light', 'hood', 'stand', 'tank', 'aquarium', 'siphon', 'vacuum', 'scraper', 'magnet cleaner'],
        exclude: ['food', 'flake', 'pellet', 'medicine', 'treatment'],
        brands: ['marineland', 'fluval', 'aqueon', 'tetra', 'penn plax', 'hydor', 'eheim']
      }
    };

    // Define reptile type keywords for filtering
    const reptileKeywords: Record<string, { include: string[], exclude: string[], brands?: string[] }> = {
      'reptile-food': {
        include: ['food', 'diet', 'feeder', 'cricket', 'mealworm', 'superworm', 'dubia', 'roach', 'waxworm', 'calcium', 'vitamin', 'supplement', 'pellet', 'canned', 'freeze dried', 'frozen'],
        exclude: ['tank', 'terrarium', 'heat', 'light', 'substrate', 'bedding', 'hide', 'decoration', 'thermometer', 'hygrometer'],
        brands: ['zoo med', 'exo terra', 'repashy', 'fluker', 'zilla', 'josh frogs', 'timberline']
      },
      'reptile-supplies': {
        include: ['tank', 'terrarium', 'vivarium', 'enclosure', 'heat', 'lamp', 'bulb', 'uvb', 'uva', 'light', 'substrate', 'bedding', 'hide', 'cave', 'decoration', 'branch', 'vine', 'moss', 'thermometer', 'hygrometer', 'thermostat', 'mister', 'fogger', 'dripper', 'water dish', 'food dish'],
        exclude: ['food', 'diet', 'feeder', 'cricket', 'mealworm', 'calcium', 'vitamin'],
        brands: ['zoo med', 'exo terra', 'zilla', 'fluker', 'repti', 'arcadia', 'zoo med']
      }
    };

    // Define bird type keywords for filtering
    const birdKeywords: Record<string, { include: string[], exclude: string[], brands?: string[] }> = {
      'bird-food': {
        include: ['food', 'seed', 'pellet', 'diet', 'millet', 'fruit', 'vegetable', 'treat', 'nutri-berries', 'avi-cakes', 'mix', 'blend'],
        exclude: ['cage', 'perch', 'toy', 'swing', 'ladder', 'bath', 'feeder', 'waterer', 'cuttlebone', 'mineral block'],
        brands: ['zupreem', 'harrison', 'lafeber', 'kaytee', 'higgins', 'roudybush', 'tropican', 'volkman', 'browns', 'fm browns']
      },
      'bird-supplies': {
        include: ['cage', 'perch', 'toy', 'swing', 'ladder', 'bath', 'feeder', 'waterer', 'cuttlebone', 'mineral block', 'vitamin', 'supplement', 'litter', 'liner', 'cover', 'stand', 'play gym', 'travel carrier'],
        exclude: ['food', 'seed', 'pellet', 'diet', 'millet', 'treat', 'nutri-berries'],
        brands: ['prevue', 'ware', 'jw', 'penn plax', 'living world', 'you & me']
      }
    };

    // Define small animal product type keywords for filtering
    const smallAnimalProductKeywords: Record<string, { include: string[], exclude: string[], brands?: string[] }> = {
      'small-animal-food': {
        include: ['food', 'hay', 'pellet', 'diet', 'timothy', 'alfalfa', 'orchard', 'oat', 'treat', 'veggie', 'fruit', 'seed mix', 'fortidiet'],
        exclude: ['cage', 'habitat', 'bedding', 'litter', 'wheel', 'ball', 'toy', 'bottle', 'feeder', 'hideout', 'tunnel', 'harness', 'leash', 'carrier', 'brush', 'clipper', 'comb', 'shampoo', 'nest', 'hammock', 'house', 'igloo', 'tube', 'ramp', 'basket'],
        brands: []
      },
      'small-animal-supplies': {
        include: ['cage', 'habitat', 'bedding', 'litter', 'wheel', 'ball', 'toy', 'bottle', 'feeder', 'waterer', 'hideout', 'tunnel', 'tube', 'house', 'igloo', 'hammock', 'nest', 'carrier', 'harness', 'leash', 'brush', 'nail clipper'],
        exclude: ['food', 'hay', 'pellet', 'diet', 'timothy', 'treat'],
        brands: ['kaytee', 'ware', 'oxbow', 'living world', 'prevue', 'midwest', 'super pet', 'small pet select']
      }
    };

    // Helper function to filter items by keywords with inclusion and exclusion logic
    // Uses word boundary matching to avoid false matches (e.g., "cat" won't match "catfish")
    const filterByKeywords = (items: Supply[], filterType: string, keywords: Record<string, { include: string[], exclude: string[], brands?: string[] }>): Supply[] => {
      const filterConfig = keywords[filterType];
      if (!filterConfig) return items;
      
      // Helper to check if keyword matches with word boundaries
      const matchesKeyword = (text: string, keyword: string): boolean => {
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        
        // For multi-word phrases, use simple includes
        if (keyword.includes(' ')) {
          return lowerText.includes(lowerKeyword);
        }
        
        // For single words, check word boundaries to avoid substring matches
        const regex = new RegExp(`\\b${lowerKeyword}\\b`, 'i');
        return regex.test(lowerText);
      };
      
      return items.filter(item => {
        const textToSearch = `${item.name || ''} ${item.description || ''}`.trim();
        const brandText = (item.brand || '').toLowerCase().trim();
        
        // Check if any exclusion keyword is present - if yes, exclude this item
        if (filterConfig.exclude.length > 0) {
          const hasExclusion = filterConfig.exclude.some(keyword => 
            matchesKeyword(textToSearch, keyword)
          );
          if (hasExclusion) return false;
        }
        
        // Check if brand matches (if brands are defined for this filter)
        if (filterConfig.brands && filterConfig.brands.length > 0 && brandText) {
          const brandMatches = filterConfig.brands.some(brand => 
            brandText.includes(brand.toLowerCase())
          );
          if (brandMatches) return true;
        }
        
        // Check if any inclusion keyword is present
        return filterConfig.include.some(keyword => 
          matchesKeyword(textToSearch, keyword)
        );
      });
    };

    // Helper function to filter items by animal type keywords
    const filterByAnimalType = (items: Supply[], animalType: string): Supply[] => {
      return filterByKeywords(items, animalType, animalKeywords);
    };

    // If we have a search query, use full-text search + fuzzy search for typo tolerance
    if (trimmedSearch) {
      // Import fuzzy search at runtime to avoid circular dependencies
      const { fuzzySearchFilter } = await import('./fuzzySearch');
      
      // Use PostgreSQL full-text search for initial filtering (uses GIN index)
      // This dramatically reduces the dataset before JavaScript fuzzy search
      // Remove special characters that break tsquery (& | ! ( ) : * etc.)
      const sanitizedSearch = trimmedSearch.replace(/[&|!():*'"<>\\]/g, ' ').trim();
      const searchTerms = sanitizedSearch.split(/\s+/).filter(t => t.length > 0);
      const tsQuery = searchTerms.map(term => term + ':*').join(' & ');
      
      // Use full-text search with the GIN index for faster searching
      let allItems: Supply[];
      if (searchTerms.length > 0 && searchTerms.some(t => t.length >= 2)) {
        // Use full-text search for better performance
        // Build ILIKE conditions for each search term (matches if ALL terms found anywhere)
        // This works even when search_vector is empty (e.g., fresh production deploy)
        const termConditions = searchTerms.map(term => {
          const termPattern = `%${term}%`;
          return sql`(name ILIKE ${termPattern} OR brand ILIKE ${termPattern} OR description ILIKE ${termPattern} OR sku ILIKE ${termPattern})`;
        });
        
        // Use ILIKE conditions for search (search_vector column was removed)
        const ftsCondition = sql`(${sql.join(termConditions, sql` AND `)})`;
        
        whereConditions.push(ftsCondition);
        
        allItems = await db
          .select()
          .from(supplies)
          .where(and(...whereConditions))
          .orderBy(desc(supplies.createdAt));
      } else {
        // Fall back to standard query for very short searches
        allItems = await db
          .select()
          .from(supplies)
          .where(and(...whereConditions))
          .orderBy(desc(supplies.createdAt));
      }
      
      // Apply specialty filters FIRST, before fuzzy search
      if (animalType) {
        allItems = filterByAnimalType(allItems, animalType);
      }
      if (foodType) {
        allItems = filterByKeywords(allItems, foodType, foodKeywords);
      }
      if (toyType) {
        allItems = filterByKeywords(allItems, toyType, toyKeywords);
      }
      if (healthcareType) {
        allItems = filterByKeywords(allItems, healthcareType, healthcareKeywords);
      }
      if (aquaticType) {
        allItems = filterByKeywords(allItems, aquaticType, aquaticKeywords);
      }
      if (reptileType) {
        allItems = filterByKeywords(allItems, reptileType, reptileKeywords);
      }
      if (birdType) {
        allItems = filterByKeywords(allItems, birdType, birdKeywords);
      }
      if (smallAnimalProductType) {
        allItems = filterByKeywords(allItems, smallAnimalProductType, smallAnimalProductKeywords);
      }
      
      // Then apply fuzzy search filtering with typo tolerance
      // Name is first in array - gets highest priority for sorting
      const filteredItems = fuzzySearchFilter(
        allItems,
        trimmedSearch,
        (item) => [item.name || '', item.brand || '', item.description || '', item.sku || '', item.upc || ''],
        75 // 75% similarity threshold to filter out false positives like "Eliminator" matching "Furminator"
      );
      
      // Get total count
      const total = filteredItems.length;
      
      // Apply pagination manually after fuzzy filtering
      const items = filteredItems.slice(offset, offset + limit);
      
      return { items, total };
    }

    // If we have any specialty filter but no search, fetch and filter
    if (animalType || foodType || toyType || healthcareType || aquaticType || reptileType || birdType || smallAnimalProductType) {
      // Fetch all items matching category/filterType first
      let allItems = await db
        .select()
        .from(supplies)
        .where(and(...whereConditions))
        .orderBy(desc(supplies.createdAt));
      
      // Apply filters in sequence
      if (animalType) {
        allItems = filterByAnimalType(allItems, animalType);
      }
      if (foodType) {
        allItems = filterByKeywords(allItems, foodType, foodKeywords);
      }
      if (toyType) {
        allItems = filterByKeywords(allItems, toyType, toyKeywords);
      }
      if (healthcareType) {
        allItems = filterByKeywords(allItems, healthcareType, healthcareKeywords);
      }
      if (aquaticType) {
        allItems = filterByKeywords(allItems, aquaticType, aquaticKeywords);
      }
      if (reptileType) {
        allItems = filterByKeywords(allItems, reptileType, reptileKeywords);
      }
      if (birdType) {
        allItems = filterByKeywords(allItems, birdType, birdKeywords);
      }
      if (smallAnimalProductType) {
        allItems = filterByKeywords(allItems, smallAnimalProductType, smallAnimalProductKeywords);
      }
      
      const total = allItems.length;
      const items = allItems.slice(offset, offset + limit);
      return { items, total };
    }

    // No search query - use standard SQL pagination
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(supplies)
      .where(and(...whereConditions));

    const items = await db
      .select()
      .from(supplies)
      .where(and(...whereConditions))
      .orderBy(desc(supplies.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  }

  async getSupply(id: number): Promise<Supply | undefined> {
    const [supply] = await db.select().from(supplies).where(eq(supplies.id, id));
    return supply;
  }

  async getSuppliesByIds(ids: number[]): Promise<Supply[]> {
    if (ids.length === 0) return [];
    return await db.select().from(supplies).where(inArray(supplies.id, ids));
  }

  async getRelatedSupplies(excludeId: number, category: string, brand: string | null, limit: number = 6, productName?: string): Promise<Supply[]> {
    // Smart product recommendations based on category-specific pairings
    const conditions = [
      ne(supplies.id, excludeId),
      eq(supplies.isActive, true),
    ];
    
    // Define smart product pairings - prioritize CROSS-CATEGORY complementary items
    // IMPORTANT: Avoid generic keywords that match unrelated products (e.g., 'filter' matches undergravel filters)
    const smartPairings: Record<string, string[]> = {
      // AQUATIC AMPHIBIAN FOOD (frog, tadpole, newt) → decorations, docks, calcium, lighting
      'frog food': ['turtle dock', 'turtle island', 'basking dock', 'floating dock', 'decoration', 'plant', 'driftwood', 'moss ball', 'calcium', 'repti calcium', 'water conditioner', 'reptisafe'],
      'frog & tadpole': ['turtle dock', 'turtle island', 'basking dock', 'floating dock', 'decoration', 'plant', 'driftwood', 'moss ball', 'calcium', 'repti calcium', 'water conditioner', 'reptisafe'],
      'tadpole': ['turtle dock', 'turtle island', 'basking dock', 'floating dock', 'decoration', 'plant', 'driftwood', 'moss ball', 'water conditioner', 'reptisafe'],
      'newt': ['turtle dock', 'turtle island', 'basking dock', 'floating dock', 'decoration', 'plant', 'driftwood', 'moss ball', 'calcium', 'water conditioner'],
      
      // AQUATIC TURTLE FOOD → docks, basking platforms, calcium, UVB, decorations
      'turtle food': ['turtle dock', 'turtle island', 'basking dock', 'floating dock', 'decoration', 'plant', 'calcium', 'repti calcium', 'uvb', 'basking bulb', 'heat lamp', 'thermometer', 'water conditioner', 'reptisafe'],
      'aquatic turtle': ['turtle dock', 'turtle island', 'basking dock', 'floating dock', 'decoration', 'plant', 'calcium', 'uvb', 'basking bulb', 'heat lamp', 'thermometer', 'water conditioner'],
      
      // FISH FOOD → decorations, plants, ornaments (NOT filters - that's equipment)
      'fish food': ['decoration', 'plant', 'gravel', 'ornament', 'driftwood', 'air stone', 'thermometer', 'background'],
      'betta': ['betta plant', 'betta leaf', 'decoration', 'plant', 'gravel', 'thermometer', 'water conditioner'],
      'goldfish': ['decoration', 'plant', 'gravel', 'ornament', 'air stone', 'thermometer'],
      'tropical flakes': ['decoration', 'plant', 'gravel', 'ornament', 'thermometer', 'air stone'],
      'cichlid': ['decoration', 'rock', 'cave', 'gravel', 'sand', 'background'],
      
      // REPTILE FOOD products → decorations, hides, heating, bedding, calcium (NOT more food)
      'reptile food': ['decoration', 'hide', 'bedding', 'substrate', 'heat lamp', 'thermometer', 'calcium', 'vitamin', 'uvb'],
      'gecko food': ['hide', 'humid hide', 'decoration', 'bedding', 'heat', 'thermometer', 'calcium', 'vitamin', 'uvb', 'coconut'],
      'crested gecko': ['hide', 'humid hide', 'decoration', 'vine', 'plant', 'coconut', 'calcium', 'vitamin', 'misting'],
      'bearded dragon': ['basking bulb', 'decoration', 'hammock', 'hide', 'bedding', 'heat lamp', 'uvb', 'calcium', 'vitamin', 'reptile carpet'],
      'snake food': ['hide', 'bedding', 'aspen', 'water bowl', 'decoration', 'heat mat', 'thermometer'],
      'cricket': ['calcium', 'vitamin', 'cricket keeper', 'gut load', 'water gel'],
      'mealworm': ['calcium', 'vitamin', 'mealworm keeper', 'dish'],
      
      // Reptile equipment → recommend complementary items
      'tank': ['heat lamp', 'heating', 'thermometer', 'bedding', 'substrate', 'decoration', 'plant', 'hide', 'light', 'screen'],
      'terrarium': ['heat lamp', 'heating', 'thermometer', 'bedding', 'substrate', 'decoration', 'plant', 'hide', 'light', 'screen'],
      'habitat': ['heat lamp', 'heating', 'thermometer', 'bedding', 'substrate', 'decoration', 'plant', 'hide'],
      'heat lamp': ['thermometer', 'thermostat', 'dome', 'fixture', 'bulb', 'lamp stand', 'clamp'],
      'heating': ['thermometer', 'thermostat', 'temperature', 'heat mat'],
      'bulb': ['dome', 'fixture', 'lamp', 'clamp', 'thermometer'],
      'fixture': ['bulb', 'lamp', 'thermometer'],
      'hide': ['bedding', 'substrate', 'decoration', 'plant', 'water bowl'],
      'bedding': ['hide', 'decoration', 'water bowl', 'substrate'],
      
      // Aquarium equipment → recommend complementary items
      'aquarium': ['heater', 'thermometer', 'gravel', 'decoration', 'plant', 'air pump', 'light', 'background'],
      'filter': ['filter media', 'cartridge', 'carbon', 'sponge', 'air pump'],
      'decoration': ['plant', 'gravel', 'ornament', 'driftwood', 'moss', 'background'],
      
      // Dog/Cat food - pair with treats and accessories
      'dog food': ['dog treat', 'dog chew', 'bowl', 'container'],
      'cat food': ['cat treat', 'bowl', 'container'],
      'puppy': ['puppy treat', 'training', 'bowl', 'crate'],
      'kitten': ['kitten treat', 'bowl', 'toy'],
    };
    
    const nameLower = (productName || '').toLowerCase();
    let smartKeywords: string[] = [];
    
    // Find matching keywords for smart pairing
    for (const [trigger, pairings] of Object.entries(smartPairings)) {
      if (nameLower.includes(trigger)) {
        smartKeywords = [...smartKeywords, ...pairings];
      }
    }
    
    let results: Supply[] = [];
    
    // Try smart keyword matching first
    if (smartKeywords.length > 0) {
      const uniqueKeywords = [...new Set(smartKeywords)];
      const allSupplies = await db.select().from(supplies).where(and(...conditions));
      
      // Detect if this is a food product (we want cross-category for food)
      const isFoodProduct = nameLower.includes('food') || category === 'food';
      const isAquaticFood = isFoodProduct && (nameLower.includes('frog') || nameLower.includes('tadpole') || 
                            nameLower.includes('turtle') || nameLower.includes('fish') || nameLower.includes('betta') ||
                            nameLower.includes('goldfish') || nameLower.includes('newt') || nameLower.includes('aquatic'));
      
      // Score each supply by how many keywords match
      const scored = allSupplies.map(s => {
        const sName = (s.name || '').toLowerCase();
        const sDesc = (s.description || '').toLowerCase();
        let score = 0;
        
        for (const kw of uniqueKeywords) {
          if (sName.includes(kw) || sDesc.includes(kw)) {
            score += 1;
          }
        }
        
        // For food products: PENALIZE same-category food items, prefer accessories/decorations
        if (isFoodProduct) {
          // Heavily penalize recommending more food items
          if (s.category === 'food' || sName.includes('food')) {
            score -= 5;
          }
          
          // For aquatic food: STRONGLY PENALIZE filters, pumps, and equipment
          if (isAquaticFood) {
            if (sName.includes('filter') || sName.includes('undergravel') || sName.includes('cartridge') || 
                sName.includes('carbon') || sName.includes('pump') || sName.includes('powerhead')) {
              score -= 10; // Strong penalty for filter equipment
            }
            // Bonus for relevant aquatic accessories
            if (sName.includes('dock') || sName.includes('island') || sName.includes('basking') || 
                sName.includes('platform') || sName.includes('calcium') || sName.includes('reptisafe') ||
                sName.includes('water conditioner') || sName.includes('decoration') || sName.includes('plant')) {
              score += 3;
            }
          }
          
          // General decorations/accessories bonus
          if (sName.includes('decoration') || sName.includes('ornament') || sName.includes('hide') || 
              sName.includes('gravel') || sName.includes('driftwood') || sName.includes('moss')) {
            score += 1;
          }
        } else {
          // For non-food: small bonus for same category
          if (s.category === category) score += 0.3;
        }
        
        // Small bonus for same brand (good for upselling complementary items)
        if (brand && s.brand === brand) score += 0.2;
        return { supply: s, score };
      });
      
      // Get top scoring matches
      results = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.supply);
    }
    
    // If not enough smart matches, fall back to brand/category matching
    if (results.length < limit) {
      const remaining = limit - results.length;
      const excludeIds = [excludeId, ...results.map(r => r.id)];
      
      if (brand) {
        const brandMatches = await db
          .select()
          .from(supplies)
          .where(and(
            ...conditions,
            eq(supplies.brand, brand),
            notInArray(supplies.id, excludeIds)
          ))
          .limit(remaining);
        
        results = [...results, ...brandMatches];
      }
      
      // Still need more? Get same category
      if (results.length < limit) {
        const stillRemaining = limit - results.length;
        const allExcludeIds = [excludeId, ...results.map(r => r.id)];
        const categoryMatches = await db
          .select()
          .from(supplies)
          .where(and(
            ...conditions,
            eq(supplies.category, category),
            notInArray(supplies.id, allExcludeIds)
          ))
          .limit(stillRemaining);
        
        results = [...results, ...categoryMatches];
      }
    }
    
    return results;
  }

  async getSuppliesWithoutImages(
    limit: number, 
    offset: number, 
    brand?: string, 
    category?: string, 
    search?: string
  ): Promise<Supply[]> {
    const allSupplies = await db.select().from(supplies);
    
    // When searching by name, search ALL products (so admins can find any product)
    // When browsing by brand/category only, filter to products without images
    const hasSearchQuery = search && search.trim();
    
    let filteredSupplies: Supply[];
    
    if (hasSearchQuery) {
      // Search ALL products when a search term is provided
      const searchLower = search.toLowerCase().trim();
      filteredSupplies = allSupplies.filter(s =>
        s.name?.toLowerCase().includes(searchLower) ||
        s.description?.toLowerCase().includes(searchLower) ||
        s.brand?.toLowerCase().includes(searchLower)
      );
    } else {
      // Filter to products without images when just browsing
      filteredSupplies = allSupplies.filter(s => {
        if (!s.imageUrl || s.imageUrl === '') return true;
        if (s.imageUrl.startsWith('/uploads/')) return true; // Broken local uploads
        if (s.imageUrl === '/placeholder-supply.jpg') return true; // Placeholder images
        return false;
      });
    }
    
    // Apply brand filter
    if (brand) {
      filteredSupplies = filteredSupplies.filter(s => {
        // Handle "Unknown" brand (null or empty in database)
        if (brand.toLowerCase() === 'unknown') {
          return !s.brand || s.brand === '';
        }
        return s.brand?.toLowerCase() === brand.toLowerCase();
      });
    }
    
    // Apply category filter
    if (category) {
      filteredSupplies = filteredSupplies.filter(s => 
        s.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    return filteredSupplies.slice(offset, offset + limit);
  }

  async getSuppliesByFilter(
    limit: number, 
    offset: number, 
    brand?: string, 
    category?: string, 
    search?: string
  ): Promise<Supply[]> {
    const allSupplies = await db.select().from(supplies);
    
    let filteredSupplies = allSupplies;
    
    // Apply search filter
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      filteredSupplies = filteredSupplies.filter(s =>
        s.name?.toLowerCase().includes(searchLower) ||
        s.description?.toLowerCase().includes(searchLower) ||
        s.brand?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply brand filter
    if (brand) {
      filteredSupplies = filteredSupplies.filter(s => {
        if (brand.toLowerCase() === 'unknown') {
          return !s.brand || s.brand === '';
        }
        return s.brand?.toLowerCase() === brand.toLowerCase();
      });
    }
    
    // Apply category filter
    if (category) {
      filteredSupplies = filteredSupplies.filter(s => 
        s.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    return filteredSupplies.slice(offset, offset + limit);
  }

  async getSupplyImageStats() {
    const allSupplies = await db.select().from(supplies);
    
    const totalProducts = allSupplies.length;
    // Count valid images (not empty, not broken /uploads/ links, not placeholders)
    const withImages = allSupplies.filter(s => {
      if (!s.imageUrl || s.imageUrl === '') return false;
      if (s.imageUrl.startsWith('/uploads/')) return false; // Broken local uploads
      if (s.imageUrl === '/placeholder-supply.jpg') return false; // Placeholder images
      return true;
    }).length;
    const withoutImages = totalProducts - withImages;

    const brandStats = new Map<string, { total: number; withImages: number }>();
    const categoryStats = new Map<string, { total: number; withImages: number }>();

    allSupplies.forEach(supply => {
      const brand = supply.brand || 'Unknown';
      const category = supply.category || 'Unknown';
      
      if (!brandStats.has(brand)) {
        brandStats.set(brand, { total: 0, withImages: 0 });
      }
      if (!categoryStats.has(category)) {
        categoryStats.set(category, { total: 0, withImages: 0 });
      }

      const brandData = brandStats.get(brand)!;
      const categoryData = categoryStats.get(category)!;

      brandData.total++;
      categoryData.total++;

      // Only count as "with images" if URL exists and is NOT broken or a placeholder
      const hasValidImage = supply.imageUrl && 
                           supply.imageUrl !== '' && 
                           !supply.imageUrl.startsWith('/uploads/') &&
                           supply.imageUrl !== '/placeholder-supply.jpg';
      
      if (hasValidImage) {
        brandData.withImages++;
        categoryData.withImages++;
      }
    });

    const byBrand = Array.from(brandStats.entries())
      .map(([brand, stats]) => ({
        brand,
        total: stats.total,
        withImages: stats.withImages,
        withoutImages: stats.total - stats.withImages
      }))
      .sort((a, b) => b.withoutImages - a.withoutImages);

    const byCategory = Array.from(categoryStats.entries())
      .map(([category, stats]) => ({
        category,
        total: stats.total,
        withImages: stats.withImages,
        withoutImages: stats.total - stats.withImages
      }))
      .sort((a, b) => b.withoutImages - a.withoutImages);

    return {
      totalProducts,
      withImages,
      withoutImages,
      byBrand,
      byCategory
    };
  }

  async getSuppliesByBrandOrCategory(params: {
    brand?: string;
    category?: string;
    limit: number;
    offset: number;
  }): Promise<Supply[]> {
    const conditions = [];
    
    if (params.brand) {
      conditions.push(eq(supplies.brand, params.brand));
    }
    
    if (params.category) {
      conditions.push(eq(supplies.category, params.category));
    }

    if (conditions.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(supplies)
      .where(and(...conditions))
      .limit(params.limit)
      .offset(params.offset)
      .orderBy(supplies.id);
  }

  async createSupply(supply: InsertSupply): Promise<Supply> {
    // Keep UPC and SKU fields in sync - they should always have the same value
    const syncedSupply = { ...supply };
    if (syncedSupply.upc && !syncedSupply.sku) {
      syncedSupply.sku = syncedSupply.upc;
    } else if (syncedSupply.sku && !syncedSupply.upc) {
      syncedSupply.upc = syncedSupply.sku;
    }
    const [newSupply] = await db.insert(supplies).values(syncedSupply).returning();
    return newSupply;
  }

  async updateSupply(id: number, supply: Partial<InsertSupply>): Promise<Supply> {
    // Keep UPC and SKU fields in sync - they should always have the same value
    const syncedSupply = { ...supply };
    if (syncedSupply.upc !== undefined && syncedSupply.sku === undefined) {
      syncedSupply.sku = syncedSupply.upc;
    } else if (syncedSupply.sku !== undefined && syncedSupply.upc === undefined) {
      syncedSupply.upc = syncedSupply.sku;
    } else if (syncedSupply.upc !== undefined && syncedSupply.sku !== undefined && syncedSupply.upc !== syncedSupply.sku) {
      // If both provided but different, prefer UPC
      syncedSupply.sku = syncedSupply.upc;
    }
    
    const [updatedSupply] = await db
      .update(supplies)
      .set({ ...syncedSupply, updatedAt: new Date() })
      .where(eq(supplies.id, id))
      .returning();
    return updatedSupply;
  }

  async deleteSupply(id: number): Promise<void> {
    // Check if supply is referenced in any order items
    const orderItemsWithSupply = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.supplyId, id))
      .limit(1);

    if (orderItemsWithSupply.length > 0) {
      throw new Error("Cannot delete supply that has been ordered. Consider marking it as inactive instead.");
    }

    // Delete any cart items referencing this supply first
    await db.delete(cartItems).where(eq(cartItems.supplyId, id));
    
    // Now delete the supply
    await db.delete(supplies).where(eq(supplies.id, id));
  }

  async fixKongReptiles(): Promise<{ count: number }> {
    // Direct SQL fix to clear Kong toys from reptile category
    const result = await db
      .update(supplies)
      .set({ filterType: null })
      .where(
        and(
          ilike(supplies.brand, '%kong%'),
          eq(supplies.filterType, 'reptile')
        )
      )
      .returning({ id: supplies.id });
    
    return { count: result.length };
  }

  async autoCategorizeAllSupplies(): Promise<{
    aquatic: number;
    reptile: number;
    general: number;
    total: number;
  }> {
    const { categorizeProducts } = await import('./productCategorization');
    
    // Load all supplies
    const allSupplies = await db.select({
      id: supplies.id,
      name: supplies.name,
      brand: supplies.brand,
      description: supplies.description
    }).from(supplies).where(eq(supplies.isActive, true));

    const BATCH_SIZE = 500;
    let aquaticCount = 0;
    let reptileCount = 0;
    let generalCount = 0;

    // Process in batches to avoid memory issues
    for (let i = 0; i < allSupplies.length; i += BATCH_SIZE) {
      const batch = allSupplies.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allSupplies.length / BATCH_SIZE);
      
      // Categorize the batch
      const categorized = categorizeProducts(batch);
      
      // Count batch results for logging
      const batchAquatic = categorized.filter(r => r.filterType === 'aquatic').length;
      const batchReptile = categorized.filter(r => r.filterType === 'reptile').length;
      const batchGeneral = categorized.filter(r => r.filterType === null).length;

      // Prepare bulk update using transaction
      // CRITICAL: Explicitly set filterType even when NULL to clear old values
      await db.transaction(async (tx) => {
        for (const result of categorized) {
          // Always update filterType to ensure old 'reptile'/'aquatic' values are cleared
          await tx.update(supplies)
            .set({ 
              filterType: result.filterType // Explicitly set to null when filterType is null
            })
            .where(eq(supplies.id, result.id));

          // Count categories
          if (result.filterType === 'aquatic') aquaticCount++;
          else if (result.filterType === 'reptile') reptileCount++;
          else generalCount++;
        }
      });

      console.log(`Batch ${batchNum}/${totalBatches}: Aquatic=${batchAquatic}, Reptile=${batchReptile}, General=${batchGeneral}`);
    }

    return {
      aquatic: aquaticCount,
      reptile: reptileCount,
      general: generalCount,
      total: allSupplies.length
    };
  }

  async autoCategorizeProductCategories(): Promise<{
    food: number;
    toys: number;
    beds: number;
    leashes: number;
    healthcare: number;
    accessories: number;
    smallanimal: number;
    aquatics: number;
    reptiles: number;
    birdSupplies: number;
    dogCages: number;
    smallAnimalSupplies: number;
    dogTreats: number;
    catTreats: number;
    preserved: number;
    unchanged: number;
    total: number;
  }> {
    const { determineCategory } = await import('./productCategory');
    
    // Load all supplies
    const allSupplies = await db.select().from(supplies).where(eq(supplies.isActive, true));

    const BATCH_SIZE = 500;
    const stats = {
      food: 0,
      toys: 0,
      beds: 0,
      leashesAndCollars: 0,
      healthcare: 0,
      accessories: 0,
      smallanimal: 0,
      aquatics: 0,
      reptiles: 0,
      birdSupplies: 0,
      dogCages: 0,
      smallAnimalSupplies: 0,
      dogTreats: 0,
      catTreats: 0,
      preserved: 0,  // Count of products with existing categories preserved
      unchanged: 0,
      total: 0
    };

    // Valid categories from Excel file - these should be preserved
    const validExcelCategories = new Set([
      'leashesAndCollars', 'aquatics', 'accessories', 'reptiles', 'dogFood', 'catFood',
      'toys', 'dogTreats', 'smallanimal', 'birdSupplies', 'healthcare',
      'catTreats', 'dogCages', 'beds'
    ]);

    // Process in batches to avoid memory issues
    for (let i = 0; i < allSupplies.length; i += BATCH_SIZE) {
      const batch = allSupplies.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allSupplies.length / BATCH_SIZE);
      
      // Prepare bulk update using transaction
      await db.transaction(async (tx) => {
        for (const supply of batch) {
          stats.total++;
          
          // PRIORITY 0: Preserve existing valid categories from Excel file
          // Excel is the source of truth - don't override categories that already exist
          if (supply.category && validExcelCategories.has(supply.category)) {
            stats.preserved++;
            continue;
          }
          
          let suggestedCategory = null;
          
          // PRIORITY 1: If filterType is set to specialty section, use specialty category
          if (supply.filterType === 'smallanimal') {
            suggestedCategory = 'smallanimal';
          } else if (supply.filterType === 'aquatic') {
            suggestedCategory = 'aquatics';
          } else if (supply.filterType === 'reptile') {
            suggestedCategory = 'reptiles';
          } else {
            // PRIORITY 2: Use standard category determination for new products
            suggestedCategory = determineCategory(supply);
          }
          
          if (suggestedCategory) {
            await tx.update(supplies)
              .set({ category: suggestedCategory })
              .where(eq(supplies.id, supply.id));

            // Count categories
            if (stats[suggestedCategory as keyof typeof stats] !== undefined) {
              (stats[suggestedCategory as keyof typeof stats] as number)++;
            }
          } else {
            stats.unchanged++;
          }
        }
      });

      console.log(`Batch ${batchNum}/${totalBatches}: Processed ${batch.length} products`);
    }

    console.log(`Category Auto-Categorization Complete:`, stats);
    return stats;
  }

  // Cleanup categories - normalize names, fix mismatches, split food categories
  async cleanupCategories(): Promise<{
    clothingToAccessories: number;
    collarsToCollarsLeashes: number;
    foodSplitToDogFood: number;
    foodSplitToCatFood: number;
    kennelToDogCages: number;
    smallAnimalSuppliesToSmallAnimal: number;
    catToyToToys: number;
    filterTypeSynced: number;
    beefhideFixed: number;
    total: number;
  }> {
    const stats = {
      clothingToAccessories: 0,
      collarsToCollarsLeashes: 0,
      foodSplitToDogFood: 0,
      foodSplitToCatFood: 0,
      kennelToDogCages: 0,
      smallAnimalSuppliesToSmallAnimal: 0,
      catToyToToys: 0,
      filterTypeSynced: 0,
      beefhideFixed: 0,
      groomingToHealthcare: 0,
      total: 0,
    };

    console.log("Starting category cleanup...");

    // 1. Fix clothing items in wrong categories (dogTreats, leashes) → accessories
    const clothingKeywords = ['sweater', 'hoodie', 'polo', 'tank top', 'tanktop', 'sweatshirt', 'pj ', 'pajama', 'robe'];
    const allSupplies = await db.select().from(supplies).where(eq(supplies.isActive, true));
    
    for (const supply of allSupplies) {
      const nameLower = supply.name.toLowerCase();
      const isClothing = clothingKeywords.some(kw => nameLower.includes(kw));
      
      if (isClothing && supply.category !== 'accessories') {
        await db.update(supplies).set({ category: 'accessories' }).where(eq(supplies.id, supply.id));
        stats.clothingToAccessories++;
      }
    }
    console.log(`Clothing to accessories: ${stats.clothingToAccessories}`);

    // 2. Fix 'cat toy' category → 'toys'
    const catToyResult = await db.update(supplies)
      .set({ category: 'toys' })
      .where(eq(supplies.category, 'cat toy'))
      .returning();
    stats.catToyToToys = catToyResult.length;
    console.log(`Cat toy to toys: ${stats.catToyToToys}`);

    // 3. Merge 'kennel' → 'dogCages'
    const kennelResult = await db.update(supplies)
      .set({ category: 'dogCages' })
      .where(eq(supplies.category, 'kennel'))
      .returning();
    stats.kennelToDogCages = kennelResult.length;
    console.log(`Kennel to dogCages: ${stats.kennelToDogCages}`);

    // 4. Merge 'smallAnimalSupplies' → 'smallanimal'
    const smallAnimalResult = await db.update(supplies)
      .set({ category: 'smallanimal' })
      .where(eq(supplies.category, 'smallAnimalSupplies'))
      .returning();
    stats.smallAnimalSuppliesToSmallAnimal = smallAnimalResult.length;
    console.log(`SmallAnimalSupplies to smallanimal: ${stats.smallAnimalSuppliesToSmallAnimal}`);

    // 5. Split 'food' category into 'dogFood' and 'catFood'
    const foodItems = await db.select().from(supplies).where(eq(supplies.category, 'food'));
    for (const item of foodItems) {
      const nameLower = item.name.toLowerCase();
      // Check for cat keywords
      const isCatFood = nameLower.includes(' cat ') || nameLower.includes(' cat') || 
                        nameLower.includes('cat ') || nameLower.includes('kitten') || 
                        nameLower.includes('feline');
      
      if (isCatFood) {
        await db.update(supplies).set({ category: 'catFood' }).where(eq(supplies.id, item.id));
        stats.foodSplitToCatFood++;
      } else {
        await db.update(supplies).set({ category: 'dogFood' }).where(eq(supplies.id, item.id));
        stats.foodSplitToDogFood++;
      }
    }
    console.log(`Food split - dogFood: ${stats.foodSplitToDogFood}, catFood: ${stats.foodSplitToCatFood}`);

    // 6. Fix beefhide chews in reptiles → dogTreats
    const beefhideResult = await db.update(supplies)
      .set({ category: 'dogTreats', filterType: null })
      .where(
        and(
          eq(supplies.category, 'reptiles'),
          sql`LOWER(${supplies.name}) LIKE '%beefhide%'`
        )
      )
      .returning();
    stats.beefhideFixed = beefhideResult.length;
    console.log(`Beefhide fixed: ${stats.beefhideFixed}`);

    // 7. Sync filter_type with category
    // category='reptiles' should have filter_type='reptile'
    const reptileSyncResult = await db.update(supplies)
      .set({ filterType: 'reptile' })
      .where(
        and(
          eq(supplies.category, 'reptiles'),
          sql`(${supplies.filterType} IS NULL OR ${supplies.filterType} != 'reptile')`
        )
      )
      .returning();
    stats.filterTypeSynced += reptileSyncResult.length;

    // category='aquatics' should have filter_type='aquatic'
    const aquaticSyncResult = await db.update(supplies)
      .set({ filterType: 'aquatic' })
      .where(
        and(
          eq(supplies.category, 'aquatics'),
          sql`(${supplies.filterType} IS NULL OR ${supplies.filterType} != 'aquatic')`
        )
      )
      .returning();
    stats.filterTypeSynced += aquaticSyncResult.length;

    // category='smallanimal' should have filter_type='smallanimal'
    const smallAnimalSyncResult = await db.update(supplies)
      .set({ filterType: 'smallanimal' })
      .where(
        and(
          eq(supplies.category, 'smallanimal'),
          sql`(${supplies.filterType} IS NULL OR ${supplies.filterType} != 'smallanimal')`
        )
      )
      .returning();
    stats.filterTypeSynced += smallAnimalSyncResult.length;

    console.log(`Filter type synced: ${stats.filterTypeSynced}`);

    // 8. Move grooming products (shampoos, conditioners, sprays, etc.) to healthcare
    // Grooming brands: TropiClean, Skout's Honor, Four Paws (Magic Coat), Nature's Miracle grooming,
    // Earthbath, PetAg (Fresh'n'Clean), Wee-Away, Bio Groom, Beautifur, Ethical Pet colognes
    console.log("Moving grooming products to healthcare...");
    
    // Grooming keyword patterns
    const groomingKeywords = [
      'shampoo', 'shamp', 'conditioner', 'cologne', 'deodor', 'spritz',
      'itch relief', 'hot spot', 'skunk', 'oxymed', 'lavish', 'whitening',
      'coat spray', 'freshing spray', 'hypoallergenic', 'oatmeal', 'tearless',
      '2in1', 'shed control', 'tangle', 'waterless', 'grooming wipes', 'paw spray'
    ];
    
    // Get all supplies in accessories category that match grooming patterns
    const accessoriesSupplies = await db.select().from(supplies)
      .where(eq(supplies.category, 'accessories'));
    
    for (const supply of accessoriesSupplies) {
      const nameLower = supply.name.toLowerCase();
      const isGrooming = groomingKeywords.some(kw => nameLower.includes(kw));
      
      if (isGrooming) {
        await db.update(supplies)
          .set({ category: 'healthcare' })
          .where(eq(supplies.id, supply.id));
        stats.groomingToHealthcare++;
      }
    }
    console.log(`Grooming products moved to healthcare: ${stats.groomingToHealthcare}`);

    // 9. Clear incorrect filter_type for non-specialty categories
    // Penn-Plax makes both aquatic AND general pet products - clear filter_type for non-aquatic categories
    console.log("Clearing incorrect filter_type assignments...");
    let filterTypeCleared = 0;
    
    // Penn-Plax bird supplies incorrectly marked as aquatic
    const birdAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'birdSupplies'),
        eq(supplies.filterType, 'aquatic')
      ))
      .returning();
    filterTypeCleared += birdAquaticFix.length;
    
    // Penn-Plax accessories incorrectly marked as aquatic (cat/dog items)
    const accessoriesAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'accessories'),
        eq(supplies.filterType, 'aquatic'),
        eq(supplies.brand, 'Penn-Plax')
      ))
      .returning();
    filterTypeCleared += accessoriesAquaticFix.length;
    
    // Penn-Plax healthcare incorrectly marked as aquatic
    const healthcareAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'healthcare'),
        eq(supplies.filterType, 'aquatic'),
        eq(supplies.brand, 'Penn-Plax')
      ))
      .returning();
    filterTypeCleared += healthcareAquaticFix.length;
    
    // Penn-Plax toys incorrectly marked as aquatic
    const toysAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'toys'),
        eq(supplies.filterType, 'aquatic'),
        eq(supplies.brand, 'Penn-Plax')
      ))
      .returning();
    filterTypeCleared += toysAquaticFix.length;
    
    // Mammoth snake toys incorrectly marked as reptile (dog toys with "snake" in name)
    const mammothReptileFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'toys'),
        eq(supplies.filterType, 'reptile'),
        eq(supplies.brand, 'Mammoth')
      ))
      .returning();
    filterTypeCleared += mammothReptileFix.length;
    
    // dogCages incorrectly marked as aquatic
    const dogCagesAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'dogCages'),
        eq(supplies.filterType, 'aquatic')
      ))
      .returning();
    filterTypeCleared += dogCagesAquaticFix.length;
    
    // catTreats incorrectly marked as aquatic
    const catTreatsAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'catTreats'),
        eq(supplies.filterType, 'aquatic')
      ))
      .returning();
    filterTypeCleared += catTreatsAquaticFix.length;
    
    // dogFood incorrectly marked as smallanimal (e.g., "Rabbit" in name)
    const dogFoodSmallAnimalFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'dogFood'),
        eq(supplies.filterType, 'smallanimal')
      ))
      .returning();
    filterTypeCleared += dogFoodSmallAnimalFix.length;
    
    // Bird supplies incorrectly marked as smallanimal (Kaytee makes both)
    const birdSmallAnimalFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'birdSupplies'),
        eq(supplies.filterType, 'smallanimal')
      ))
      .returning();
    filterTypeCleared += birdSmallAnimalFix.length;
    
    // Pet beds incorrectly marked as smallanimal (Squishmallow beds are for cats/dogs)
    const bedsSmallAnimalFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'beds'),
        eq(supplies.filterType, 'smallanimal')
      ))
      .returning();
    filterTypeCleared += bedsSmallAnimalFix.length;
    
    // Li'l Pals plush toys incorrectly marked as smallanimal (dog toys)
    const lilPalsSmallAnimalFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'toys'),
        eq(supplies.filterType, 'smallanimal'),
        eq(supplies.brand, "Li'l Pals")
      ))
      .returning();
    filterTypeCleared += lilPalsSmallAnimalFix.length;
    
    // Turbo toys incorrectly marked as aquatic (cat toys)
    const turboAquaticFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'toys'),
        eq(supplies.filterType, 'aquatic'),
        eq(supplies.brand, 'Turbo')
      ))
      .returning();
    filterTypeCleared += turboAquaticFix.length;
    
    // Healthcare products with smallanimal filter_type (ferret shampoos, small animal meds)
    // Healthcare is not a specialty category, so filter_type should be NULL
    const healthcareSmallAnimalFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'healthcare'),
        eq(supplies.filterType, 'smallanimal')
      ))
      .returning();
    filterTypeCleared += healthcareSmallAnimalFix.length;
    
    // Accessories with smallanimal filter_type (cage crocks, water bottles)
    const accessoriesSmallAnimalFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'accessories'),
        eq(supplies.filterType, 'smallanimal')
      ))
      .returning();
    filterTypeCleared += accessoriesSmallAnimalFix.length;
    
    // Accessories with reptile filter_type (dual-use bowls)
    const accessoriesReptileFix = await db.update(supplies)
      .set({ filterType: null })
      .where(and(
        eq(supplies.category, 'accessories'),
        eq(supplies.filterType, 'reptile')
      ))
      .returning();
    filterTypeCleared += accessoriesReptileFix.length;
    
    console.log(`Filter type cleared for non-specialty items: ${filterTypeCleared}`);

    stats.total = stats.clothingToAccessories + stats.collarsToCollarsLeashes + 
                  stats.foodSplitToDogFood + stats.foodSplitToCatFood + 
                  stats.kennelToDogCages + stats.smallAnimalSuppliesToSmallAnimal + 
                  stats.catToyToToys + stats.filterTypeSynced + stats.beefhideFixed +
                  stats.groomingToHealthcare + filterTypeCleared;

    console.log(`Category cleanup complete. Total fixes: ${stats.total}`);
    return stats;
  }

  // Cart operations
  async getCartItems(userId: string): Promise<CartItem[]> {
    return await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    // Check if item already exists in cart
    const existing = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.userId, cartItem.userId),
          cartItem.supplyId ? eq(cartItems.supplyId, cartItem.supplyId) : eq(cartItems.petId, cartItem.petId || 0)
        )
      );

    if (existing.length > 0) {
      // Update quantity
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: (existing[0]?.quantity || 0) + (cartItem.quantity || 1) })
        .where(eq(cartItems.id, existing[0].id))
        .returning();
      return updated;
    } else {
      // Insert new item
      const [newItem] = await db.insert(cartItems).values(cartItem).returning();
      return newItem;
    }
  }

  async updateCartItem(id: number, quantity: number): Promise<CartItem> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, id))
      .returning();
    return updated;
  }

  async removeFromCart(id: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
    await db.update(users).set({ abandonedCartEmailSentAt: null }).where(eq(users.id, userId));
  }

  async getAbandonedCarts(hoursOld: number): Promise<Array<{userId: string; email: string; firstName: string; items: CartItem[]; oldestItemAt: Date}>> {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    
    const allCartItems = await db.select().from(cartItems);
    
    if (allCartItems.length === 0) return [];
    
    const userIds = [...new Set(allCartItems.map(item => item.userId))];
    const result: Array<{userId: string; email: string; firstName: string; items: CartItem[]; oldestItemAt: Date}> = [];
    
    for (const userId of userIds) {
      const userItems = allCartItems.filter(item => item.userId === userId);
      
      const newestItemAt = userItems.reduce((newest, item) => {
        const itemDate = new Date(item.createdAt!);
        return itemDate > newest ? itemDate : newest;
      }, new Date(0));
      
      if (newestItemAt > cutoff) continue;
      
      const user = await this.getUser(userId);
      if (!user || !user.email) continue;
      if (user.marketingEmailsOptIn === false) continue;
      if (user.abandonedCartEmailSentAt) {
        const sentAt = new Date(user.abandonedCartEmailSentAt);
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        if (sentAt > threeDaysAgo) continue;
      }
      
      const oldestItemAt = userItems.reduce((oldest, item) => {
        const itemDate = new Date(item.createdAt!);
        return itemDate < oldest ? itemDate : oldest;
      }, new Date());
      
      result.push({
        userId,
        email: user.email,
        firstName: user.firstName || 'Customer',
        items: userItems,
        oldestItemAt,
      });
    }
    
    return result;
  }

  async updateAbandonedCartEmailSent(userId: string): Promise<void> {
    await db.update(users).set({ abandonedCartEmailSentAt: new Date() }).where(eq(users.id, userId));
  }

  // Order operations
  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    
    // Insert order items
    for (const item of items) {
      await db.insert(orderItems).values({
        ...item,
        orderId: newOrder.id,
      });
    }
    
    return newOrder;
  }

  async getOrders(userId?: string): Promise<Order[]> {
    if (userId) {
      return await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.orderDate));
    } else {
      return await db.select().from(orders).orderBy(desc(orders.orderDate));
    }
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderWithItems(id: number): Promise<{ order: Order; items: any[]; customerName?: string; customerEmail?: string; customerPhone?: string } | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    // Get customer information
    const [customer] = await db.select().from(users).where(eq(users.id, order.userId));
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer';
    const customerEmail = order.customerEmail || customer?.email || '';
    const customerPhone = order.customerPhone || customer?.phoneNumber || '';
    
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    
    // Enrich items with supply and pet names
    const enrichedItems = await Promise.all(items.map(async (item) => {
      let itemName = 'Unknown Item';
      
      if (item.supplyId) {
        const [supply] = await db.select().from(supplies).where(eq(supplies.id, item.supplyId));
        itemName = supply?.name || `Supply #${item.supplyId}`;
      } else if (item.petId) {
        const [pet] = await db.select().from(pets).where(eq(pets.id, item.petId));
        itemName = pet?.name || `Pet #${item.petId}`;
      }
      
      return {
        ...item,
        itemName,
      };
    }));
    
    return { order, items: enrichedItems, customerName, customerEmail, customerPhone };
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }
  
  async updateOrderApprovalStatus(id: number, approvalStatus: string): Promise<Order> {
    const updateData: any = { approvalStatus, updatedAt: new Date() };
    
    // Set timestamps based on approval status
    if (approvalStatus === 'approved') {
      updateData.approvedAt = new Date();
    } else if (approvalStatus === 'ready_for_pickup') {
      updateData.readyAt = new Date();
    } else if (approvalStatus === 'picked_up') {
      updateData.pickedUpAt = new Date();
      // Also mark the main status as completed for customer-facing display
      updateData.status = 'completed';
    }
    
    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async applyOrderDiscount(id: number, discountAmount: string, discountReason: string): Promise<Order> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new Error("Order not found");

    const discount = parseFloat(discountAmount);
    const subtotal = parseFloat(order.subtotal || "0");
    const taxAmount = parseFloat(order.taxAmount || "0");
    const convenienceFee = parseFloat(order.convenienceFee || "0");
    const loyaltyCredits = parseFloat(order.loyaltyCreditsApplied || "0");
    const newTotal = Math.max(0, subtotal + taxAmount + convenienceFee - loyaltyCredits - discount);

    const [updated] = await db
      .update(orders)
      .set({
        discountAmount: discount.toFixed(2),
        discountReason,
        totalAmount: newTotal.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async updateOrderStripePayment(id: number, data: { stripeCheckoutSessionId?: string; stripePaymentIntentId?: string; stripePaymentUrl?: string; paymentStatus?: string; paidAt?: Date }): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async getOrderByStripeCheckoutSession(sessionId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.stripeCheckoutSessionId, sessionId))
      .limit(1);
    return order;
  }

  async getOrderByStripePaymentIntent(paymentIntentId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    return order;
  }

  async hideOrderFromAdmin(id: number): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ hiddenFromAdmin: true, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async deleteOrder(id: number): Promise<void> {
    // Delete order items first
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    // Then delete the order
    const result = await db.delete(orders).where(eq(orders.id, id));
    if (!result.rowCount || result.rowCount === 0) {
      throw new Error('Order not found');
    }
  }

  // Search orders by customer name
  async searchOrders(searchQuery: string): Promise<Order[]> {
    const searchPattern = `%${searchQuery.toLowerCase()}%`;
    return await db.select().from(orders)
      .where(sql`LOWER(${orders.customerName}) LIKE ${searchPattern}`)
      .orderBy(desc(orders.orderDate));
  }

  // Get all orders with items for admin (excludes hidden orders)
  async getAllOrdersWithItems(): Promise<any[]> {
    const allOrders = await db.select().from(orders)
      .where(sql`${orders.hiddenFromAdmin} IS NOT TRUE`)
      .orderBy(desc(orders.orderDate));
    
    const ordersWithItems = await Promise.all(allOrders.map(async (order) => {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [customer] = await db.select().from(users).where(eq(users.id, order.userId));
      
      const enrichedItems = await Promise.all(items.map(async (item) => {
        let itemName = item.productName || 'Unknown Item';
        let category = item.category || 'uncategorized';
        
        if (!item.productName && item.supplyId) {
          const [supply] = await db.select().from(supplies).where(eq(supplies.id, item.supplyId));
          itemName = supply?.name || `Supply #${item.supplyId}`;
          category = supply?.category || 'uncategorized';
        } else if (!item.productName && item.petId) {
          const [pet] = await db.select().from(pets).where(eq(pets.id, item.petId));
          itemName = pet?.name || `Pet #${item.petId}`;
          category = 'pets';
        }
        
        return { ...item, itemName, category };
      }));
      
      return {
        ...order,
        customerName: order.customerName || (customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer'),
        customerEmail: order.customerEmail || customer?.email || null,
        customerPhone: order.customerPhone || customer?.phoneNumber || null,
        items: enrichedItems,
      };
    }));
    
    return ordersWithItems;
  }

  // Refund operations
  async createRefund(refund: InsertRefund): Promise<Refund> {
    const [newRefund] = await db.insert(refunds).values(refund).returning();
    return newRefund;
  }

  async getRefunds(): Promise<Refund[]> {
    return await db.select().from(refunds).orderBy(desc(refunds.createdAt));
  }

  async getRefundsByOrderId(orderId: number): Promise<Refund[]> {
    return await db.select().from(refunds).where(eq(refunds.orderId, orderId)).orderBy(desc(refunds.createdAt));
  }

  async getRefundsByDateRange(startDate: Date, endDate: Date): Promise<Refund[]> {
    return await db.select().from(refunds)
      .where(and(
        gte(refunds.createdAt, startDate),
        lte(refunds.createdAt, endDate)
      ))
      .orderBy(desc(refunds.createdAt));
  }

  async updateOrderItemRefund(orderItemId: number, refundedQuantity: number, refundedAmount: string): Promise<void> {
    await db.update(orderItems)
      .set({ refundedQuantity, refundedAmount })
      .where(eq(orderItems.id, orderItemId));
  }

  // Refund report settings
  async getRefundReportEmails(): Promise<RefundReportSetting[]> {
    return await db.select().from(refundReportSettings).where(eq(refundReportSettings.isActive, true));
  }

  async addRefundReportEmail(email: string): Promise<RefundReportSetting> {
    const [setting] = await db.insert(refundReportSettings).values({ email, isActive: true }).returning();
    return setting;
  }

  async removeRefundReportEmail(id: number): Promise<void> {
    await db.delete(refundReportSettings).where(eq(refundReportSettings.id, id));
  }

  // Appointment operations
  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values(appointment).returning();
    return newAppointment;
  }

  async createAppointmentPets(
    appointmentId: number, 
    pets: Array<{petName: string; petType: string; serviceType: string; price: string; specialNotes?: string; groomerId?: number | null}>
  ): Promise<void> {
    const petRecords = pets.map(pet => ({
      appointmentId,
      petName: pet.petName,
      petType: pet.petType,
      serviceType: pet.serviceType,
      price: pet.price,
      specialNotes: pet.specialNotes,
      groomerId: pet.groomerId,
    }));
    await db.insert(appointmentPets).values(petRecords);
  }

  async getAppointmentPets(appointmentId: number): Promise<any[]> {
    return await db
      .select()
      .from(appointmentPets)
      .where(eq(appointmentPets.appointmentId, appointmentId));
  }

  async getAppointmentPetsByAppointmentIds(appointmentIds: number[]): Promise<Map<number, any[]>> {
    if (appointmentIds.length === 0) {
      return new Map();
    }
    
    // Fetch all pets for the given appointment IDs in a single query with groomer info
    const allPets = await db
      .select({
        id: appointmentPets.id,
        appointmentId: appointmentPets.appointmentId,
        petName: appointmentPets.petName,
        petType: appointmentPets.petType,
        serviceType: appointmentPets.serviceType,
        price: appointmentPets.price,
        specialNotes: appointmentPets.specialNotes,
        groomerId: appointmentPets.groomerId,
        groomerName: groomers.name,
        createdAt: appointmentPets.createdAt,
      })
      .from(appointmentPets)
      .leftJoin(groomers, eq(appointmentPets.groomerId, groomers.id))
      .where(inArray(appointmentPets.appointmentId, appointmentIds));
    
    // Group pets by appointment ID
    const petsByAppointmentId = new Map<number, any[]>();
    for (const pet of allPets) {
      const existing = petsByAppointmentId.get(pet.appointmentId) || [];
      existing.push(pet);
      petsByAppointmentId.set(pet.appointmentId, existing);
    }
    
    return petsByAppointmentId;
  }

  async deleteAppointmentPets(appointmentId: number): Promise<void> {
    await db.delete(appointmentPets).where(eq(appointmentPets.appointmentId, appointmentId));
  }

  async getAppointments(userId?: string): Promise<Appointment[]> {
    if (userId) {
      // Get the user to access their phone number
      const user = await this.getUser(userId);
      if (!user) {
        return [];
      }

      // If user has no phone number, return empty array
      if (!user.phoneNumber) {
        return [];
      }

      // Get all appointments
      const allAppointments = await db.select().from(appointments).orderBy(asc(appointments.appointmentDate));
      
      // Filter by matching phone number
      return allAppointments.filter(apt => {
        if (apt.ownerPhoneNumber) {
          return phoneNumbersMatch(user.phoneNumber!, apt.ownerPhoneNumber);
        }
        return false;
      });
    } else {
      return await db.select().from(appointments).orderBy(asc(appointments.appointmentDate));
    }
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async getAppointmentsByPhoneNumber(phoneNumber: string): Promise<Appointment[]> {
    // Normalize the phone number by removing all non-digit characters
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    // Get all appointments and filter by normalized phone number
    const allAppointments = await db.select().from(appointments);
    return allAppointments.filter(apt => {
      const aptPhone = apt.ownerPhoneNumber.replace(/\D/g, '');
      return aptPhone === normalizedPhone;
    }).sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime());
  }

  async updateAppointmentStatus(id: number, status: string): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ status, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async updateAppointmentIsHere(id: number, isHere: boolean): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ isHere, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async updateAppointmentIsPaid(id: number, isPaid: boolean): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ isPaid, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async updateAppointmentGroomingCompleted(id: number, groomingCompleted: boolean): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ groomingCompleted, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async clearAllAppointments(): Promise<void> {
    await db.delete(appointments);
  }

  async bulkCreateAppointments(appointmentList: InsertAppointment[]): Promise<Appointment[]> {
    if (appointmentList.length === 0) return [];
    const newAppointments = await db.insert(appointments).values(appointmentList).returning();
    return newAppointments;
  }

  // Appointment history operations
  async saveAppointmentToHistory(appointment: Appointment, options?: { groomerName?: string }): Promise<AppointmentHistory> {
    // Skip if no phone number (cannot link to contact)
    if (!appointment.ownerPhoneNumber) {
      console.log(`Skipping history for appointment ${appointment.id}: no phone number`);
      throw new Error('Cannot save appointment history: missing phone number');
    }

    // Find or create contact by phone number
    let contact = await this.getContactByPhoneNumber(appointment.ownerPhoneNumber);
    
    if (!contact) {
      // Create a new contact for this phone number
      const contactName = `${appointment.ownerFirstName || ''} ${appointment.ownerLastName || ''}`.trim() || 'Unknown';
      contact = await this.createContact({
        name: contactName,
        phoneNumber: appointment.ownerPhoneNumber,
        email: appointment.ownerEmail || null,
        petNames: appointment.petName ? [appointment.petName] : null,
        animalType: appointment.petType || null,
        breed: appointment.breed || null,
        source: appointment.source || 'manual',
        notes: null,
        linkedUserId: null,
      });
      console.log(`Created new contact ${contact.id} for appointment ${appointment.id}`);
    }

    // Get groomer name if not provided and groomerId exists
    let groomerName = options?.groomerName || 'Unknown';
    if (!options?.groomerName && appointment.groomerId) {
      const groomer = await this.getGroomer(appointment.groomerId);
      if (groomer) {
        groomerName = groomer.name;
      } else {
        console.log(`Warning: groomer ${appointment.groomerId} not found for appointment ${appointment.id}`);
      }
    }

    // Create appointment history record
    const historyData: InsertAppointmentHistory = {
      contactId: contact.id,
      ownerPhoneNumber: appointment.ownerPhoneNumber,
      ownerEmail: appointment.ownerEmail || null,
      ownerFirstName: appointment.ownerFirstName || null,
      ownerLastName: appointment.ownerLastName || null,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      petName: appointment.petName || null,
      petType: appointment.petType || null,
      breed: appointment.breed || null,
      serviceType: appointment.serviceType || appointment.service || null,
      groomerName: groomerName,
      status: appointment.status,
      source: appointment.source || null,
      notes: appointment.specialNotes || null,
    };

    const [savedHistory] = await db.insert(appointmentHistory).values(historyData).returning();
    console.log(`Saved appointment ${appointment.id} to history (history ID: ${savedHistory.id})`);
    return savedHistory;
  }

  async getAppointmentHistoryByContactId(contactId: number): Promise<AppointmentHistory[]> {
    const history = await db
      .select()
      .from(appointmentHistory)
      .where(eq(appointmentHistory.contactId, contactId))
      .orderBy(desc(appointmentHistory.appointmentDate));
    return history;
  }

  async getUnapprovedAppointments(): Promise<Appointment[]> {
    const allUnapproved = await db
      .select()
      .from(appointments)
      .where(eq(appointments.isApproved, false))
      .orderBy(desc(appointments.createdAt));
    
    // Filter out past dates (only show today and future appointments)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    
    return allUnapproved.filter(apt => {
      const aptDate = new Date(apt.appointmentDate);
      aptDate.setHours(0, 0, 0, 0); // Set to start of day for comparison
      return aptDate >= today;
    });
  }

  async approveAppointment(id: number): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ isApproved: true, status: 'confirmed', updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async rejectAppointment(id: number): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ isApproved: true, status: 'rejected', updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  async updateAppointmentDetails(id: number, updates: { 
    ownerFirstName?: string; 
    ownerLastName?: string; 
    ownerPhoneNumber?: string; 
    petName?: string; 
    petType?: string; 
    specialNotes?: string; 
    price?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    groomerId?: number | null;
    serviceType?: string;
  }): Promise<Appointment> {
    const updateData: any = { updatedAt: new Date() };
    
    if (updates.ownerFirstName !== undefined) updateData.ownerFirstName = updates.ownerFirstName;
    if (updates.ownerLastName !== undefined) updateData.ownerLastName = updates.ownerLastName;
    if (updates.ownerPhoneNumber !== undefined) updateData.ownerPhoneNumber = updates.ownerPhoneNumber;
    if (updates.petName !== undefined) updateData.petName = updates.petName;
    if (updates.petType !== undefined) updateData.petType = updates.petType;
    if (updates.specialNotes !== undefined) updateData.specialNotes = updates.specialNotes;
    if (updates.price !== undefined) updateData.price = updates.price;
    if (updates.appointmentDate !== undefined) updateData.appointmentDate = updates.appointmentDate;
    if (updates.appointmentTime !== undefined) updateData.appointmentTime = updates.appointmentTime;
    if (updates.groomerId !== undefined) updateData.groomerId = updates.groomerId;
    if (updates.serviceType !== undefined) updateData.serviceType = updates.serviceType;
    
    const [updated] = await db
      .update(appointments)
      .set(updateData)
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  // Customer pet operations
  async getCustomerPets(userId: string): Promise<CustomerPet[]> {
    return await db
      .select()
      .from(customerPets)
      .where(eq(customerPets.userId, userId))
      .orderBy(desc(customerPets.createdAt));
  }

  async createCustomerPet(pet: InsertCustomerPet): Promise<CustomerPet> {
    const [newPet] = await db.insert(customerPets).values(pet).returning();
    return newPet;
  }

  async updateCustomerPet(id: number, pet: Partial<InsertCustomerPet>): Promise<CustomerPet> {
    const [updated] = await db
      .update(customerPets)
      .set({ ...pet, updatedAt: new Date() })
      .where(eq(customerPets.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerPet(id: number): Promise<void> {
    await db.delete(customerPets).where(eq(customerPets.id, id));
  }

  async updateUserAdmin(id: string, isAdmin: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateUserGroomer(id: string, isGroomer: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isGroomer, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    const [existingUser] = await db.select().from(users).where(eq(users.id, id));
    if (!existingUser) {
      throw new Error('User not found');
    }

    await db.transaction(async (tx) => {
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await tx.delete(cartItems).where(eq(cartItems.userId, id));
      await tx.delete(wishlistItems).where(eq(wishlistItems.userId, id));
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
      await tx.delete(customerPets).where(eq(customerPets.userId, id));
      await tx.delete(appointmentPets).where(inArray(appointmentPets.appointmentId, 
        tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.userId, id))
      ));
      await tx.delete(appointments).where(eq(appointments.userId, id));

      const userOrderIds = tx.select({ id: orders.id }).from(orders).where(eq(orders.userId, id));
      await tx.delete(orderItems).where(inArray(orderItems.orderId, userOrderIds));

      await tx.update(refunds).set({ processedBy: null }).where(eq(refunds.processedBy, id));

      const userAstroIds = tx.select({ id: astroCustomers.id }).from(astroCustomers).where(eq(astroCustomers.userId, id));
      await tx.delete(astroPurchaseSyncLog).where(inArray(astroPurchaseSyncLog.astroCustomerId, userAstroIds));
      await tx.delete(astroFrequentBuyerProgress).where(inArray(astroFrequentBuyerProgress.astroCustomerId, userAstroIds));
      await tx.delete(astroCustomers).where(eq(astroCustomers.userId, id));

      await tx.delete(refunds).where(inArray(refunds.orderId, userOrderIds));
      await tx.delete(orders).where(eq(orders.userId, id));

      await tx.delete(extractedOrderItems).where(
        inArray(extractedOrderItems.orderPhotoId, 
          tx.select({ id: orderPhotos.id }).from(orderPhotos).where(eq(orderPhotos.userId, id))
        )
      );
      await tx.delete(orderPhotos).where(eq(orderPhotos.userId, id));

      await tx.update(contacts).set({ linkedUserId: null }).where(eq(contacts.linkedUserId, id));

      await tx.delete(users).where(eq(users.id, id));
    });
  }

  // Grooming settings operations
  async getGroomingSettings(): Promise<GroomingSetting[]> {
    return await db.select().from(groomingSettings);
  }

  async getGroomingSetting(setting: string): Promise<GroomingSetting | undefined> {
    const [result] = await db.select().from(groomingSettings).where(eq(groomingSettings.setting, setting));
    return result;
  }

  async upsertGroomingSetting(settingData: InsertGroomingSetting): Promise<GroomingSetting> {
    const [result] = await db
      .insert(groomingSettings)
      .values(settingData)
      .onConflictDoUpdate({
        target: groomingSettings.setting,
        set: {
          value: settingData.value,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Groomer operations
  async getAllGroomers(): Promise<Groomer[]> {
    return await db.select().from(groomers).orderBy(groomers.name);
  }

  async getActiveGroomers(): Promise<Groomer[]> {
    return await db.select().from(groomers).where(eq(groomers.isActive, true)).orderBy(groomers.name);
  }

  async getGroomer(id: number): Promise<Groomer | undefined> {
    const [groomer] = await db.select().from(groomers).where(eq(groomers.id, id));
    return groomer;
  }

  async createGroomer(groomerData: InsertGroomer): Promise<Groomer> {
    const [groomer] = await db.insert(groomers).values(groomerData).returning();
    return groomer;
  }

  async updateGroomer(id: number, groomerData: Partial<InsertGroomer>): Promise<Groomer> {
    const [groomer] = await db
      .update(groomers)
      .set({ ...groomerData, updatedAt: new Date() })
      .where(eq(groomers.id, id))
      .returning();
    return groomer;
  }

  async deleteGroomer(id: number): Promise<void> {
    await db.delete(groomers).where(eq(groomers.id, id));
  }

  // Groomer availability operations
  async getGroomerAvailability(groomerId: number): Promise<GroomerAvailability[]> {
    return await db
      .select()
      .from(groomerAvailability)
      .where(eq(groomerAvailability.groomerId, groomerId))
      .orderBy(groomerAvailability.dayOfWeek);
  }

  async getAvailableGroomersForDay(dayOfWeek: number): Promise<Groomer[]> {
    // All active groomers are available by default, filtered by their weekly off-days
    const allActiveGroomers = await db
      .select()
      .from(groomers)
      .where(eq(groomers.isActive, true))
      .orderBy(groomers.name);
    
    // Filter out groomers who have this day as an off-day
    return allActiveGroomers.filter(g => {
      if (!g.offDays || g.offDays.length === 0) return true;
      return !g.offDays.includes(dayOfWeek);
    });
  }

  async getAvailableGroomersForDate(date: string): Promise<Groomer[]> {
    // All active groomers are available by default, minus those blocked on this specific date or weekly off-day
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    
    const allActiveGroomers = await db
      .select()
      .from(groomers)
      .where(eq(groomers.isActive, true))
      .orderBy(groomers.name);
    
    // Filter out groomers who have this day as a weekly off-day
    const groomersNotOnOffDay = allActiveGroomers.filter(g => {
      if (!g.offDays || g.offDays.length === 0) return true;
      return !g.offDays.includes(dayOfWeek);
    });
    
    // Also filter out groomers blocked on this specific date
    const blockedDays = await this.getGroomerBlockedDaysForDate(date);
    const blockedGroomerIds = new Set(blockedDays.map(bd => bd.groomerId));
    
    return groomersNotOnOffDay.filter(g => !blockedGroomerIds.has(g.id));
  }

  async setGroomerAvailability(availabilityData: InsertGroomerAvailability): Promise<GroomerAvailability> {
    const [availability] = await db.insert(groomerAvailability).values(availabilityData).returning();
    return availability;
  }

  async updateGroomerAvailability(id: number, availabilityData: Partial<InsertGroomerAvailability>): Promise<GroomerAvailability> {
    const [availability] = await db
      .update(groomerAvailability)
      .set({ ...availabilityData, updatedAt: new Date() })
      .where(eq(groomerAvailability.id, id))
      .returning();
    return availability;
  }

  async deleteGroomerAvailability(id: number): Promise<void> {
    await db.delete(groomerAvailability).where(eq(groomerAvailability.id, id));
  }

  // Groomer blocked days operations (sick days, vacation, etc.)
  async getGroomerBlockedDays(groomerId: number): Promise<GroomerBlockedDay[]> {
    return await db
      .select()
      .from(groomerBlockedDays)
      .where(eq(groomerBlockedDays.groomerId, groomerId))
      .orderBy(groomerBlockedDays.date);
  }

  async getAllGroomerBlockedDays(): Promise<GroomerBlockedDay[]> {
    return await db
      .select()
      .from(groomerBlockedDays)
      .orderBy(groomerBlockedDays.date);
  }

  async getGroomerBlockedDaysForDate(date: string): Promise<GroomerBlockedDay[]> {
    return await db
      .select()
      .from(groomerBlockedDays)
      .where(eq(groomerBlockedDays.date, date));
  }

  async createGroomerBlockedDay(blockedDayData: InsertGroomerBlockedDay): Promise<GroomerBlockedDay> {
    const [blockedDay] = await db.insert(groomerBlockedDays).values(blockedDayData).returning();
    return blockedDay;
  }

  async deleteGroomerBlockedDay(id: number): Promise<void> {
    await db.delete(groomerBlockedDays).where(eq(groomerBlockedDays.id, id));
  }

  // Password reset token operations
  async createPasswordResetToken(token: string, userId: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [resetToken] = await db
      .insert(passwordResetTokens)
      .values({
        token,
        userId,
        expiresAt,
        used: false,
      })
      .returning();
    return resetToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async markTokenAsUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredTokens(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  // Wishlist operations
  async getWishlistItems(userId: string): Promise<WishlistItem[]> {
    return await db.select().from(wishlistItems).where(eq(wishlistItems.userId, userId));
  }

  async addToWishlist(wishlistItem: InsertWishlistItem): Promise<WishlistItem> {
    const [newItem] = await db.insert(wishlistItems).values(wishlistItem).returning();
    return newItem;
  }

  async removeFromWishlist(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(wishlistItems)
      .where(and(eq(wishlistItems.id, id), eq(wishlistItems.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // Contact operations
  async getAllContacts(): Promise<Contact[]> {
    return await db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact> {
    const [updatedContact] = await db
      .update(contacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return updatedContact;
  }

  async deleteContact(id: number): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async getContactByPhoneNumber(phoneNumber: string): Promise<Contact | undefined> {
    // Get all contacts with phone numbers and compare using normalization
    const { normalizePhoneNumber } = await import("./phoneUtils");
    const normalizedSearch = normalizePhoneNumber(phoneNumber);
    
    const allContacts = await db.select().from(contacts);
    return allContacts.find(c => 
      c.phoneNumber && normalizePhoneNumber(c.phoneNumber) === normalizedSearch
    );
  }

  async linkContactToUser(contactId: number, userId: string): Promise<void> {
    // Get the user's email to replace temp/placeholder email if needed
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get the contact to check if it has a temp/placeholder email
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    if (!contact) {
      throw new Error('Contact not found');
    }

    // If contact has a temp email (calendar-*@temp.com) or phone placeholder, replace with user's real email
    const updateData: any = { linkedUserId: userId };
    if (contact.email && 
        (contact.email.includes('@temp.com') || 
         (contact.phoneNumber && contact.email === contact.phoneNumber))) {
      updateData.email = user.email;
    }

    await db.update(contacts).set(updateData).where(eq(contacts.id, contactId));
  }

  async findUnlinkedContactsByPhoneNumber(phoneNumber: string): Promise<Contact[]> {
    // Get all unlinked contacts and compare using normalization
    const { normalizePhoneNumber } = await import("./phoneUtils");
    const normalizedSearch = normalizePhoneNumber(phoneNumber);
    
    const unlinkedContacts = await db
      .select()
      .from(contacts)
      .where(isNull(contacts.linkedUserId));
    
    return unlinkedContacts.filter(c =>
      c.phoneNumber && normalizePhoneNumber(c.phoneNumber) === normalizedSearch
    );
  }

  async updateContactSmsOptOut(contactId: number, optOut: boolean): Promise<Contact> {
    const [updated] = await db
      .update(contacts)
      .set({ smsOptOut: optOut, updatedAt: new Date() })
      .where(eq(contacts.id, contactId))
      .returning();
    return updated;
  }

  // SMS log operations
  async createSmsLog(log: { contactId?: number; phoneNumber: string; message: string; status: string; errorMessage?: string; twilioSid?: string; appointmentId?: number }): Promise<any> {
    const [newLog] = await db.insert(smsLogs).values({
      contactId: log.contactId || null,
      phoneNumber: log.phoneNumber,
      message: log.message,
      status: log.status,
      errorMessage: log.errorMessage || null,
      twilioSid: log.twilioSid || null,
      appointmentId: log.appointmentId || null,
    }).returning();
    return newLog;
  }

  async getSmsLogs(limit: number = 100): Promise<any[]> {
    return await db.select().from(smsLogs).orderBy(desc(smsLogs.sentAt)).limit(limit);
  }

  async getFailedSmsLogs(): Promise<any[]> {
    return await db.select().from(smsLogs).where(eq(smsLogs.status, 'failed')).orderBy(desc(smsLogs.sentAt));
  }

  // Daily appointment limit operations
  async getDailyAppointmentLimit(date: string): Promise<DailyAppointmentLimit | undefined> {
    const [limit] = await db.select().from(dailyAppointmentLimits).where(eq(dailyAppointmentLimits.date, date));
    return limit;
  }

  async getAllDailyAppointmentLimits(): Promise<DailyAppointmentLimit[]> {
    return await db.select().from(dailyAppointmentLimits).orderBy(dailyAppointmentLimits.date);
  }

  async upsertDailyAppointmentLimit(limitData: InsertDailyAppointmentLimit): Promise<DailyAppointmentLimit> {
    const [result] = await db
      .insert(dailyAppointmentLimits)
      .values(limitData)
      .onConflictDoUpdate({
        target: dailyAppointmentLimits.date,
        set: {
          maxBathAppointments: limitData.maxBathAppointments,
          maxGroomAppointments: limitData.maxGroomAppointments,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteDailyAppointmentLimit(id: number): Promise<void> {
    await db.delete(dailyAppointmentLimits).where(eq(dailyAppointmentLimits.id, id));
  }

  // Weekly appointment limit operations
  async getWeeklyAppointmentLimit(dayOfWeek: number): Promise<WeeklyAppointmentLimit | undefined> {
    const [limit] = await db.select().from(weeklyAppointmentLimits).where(eq(weeklyAppointmentLimits.dayOfWeek, dayOfWeek));
    return limit;
  }

  async getAllWeeklyAppointmentLimits(): Promise<WeeklyAppointmentLimit[]> {
    return await db.select().from(weeklyAppointmentLimits).orderBy(weeklyAppointmentLimits.dayOfWeek);
  }

  async upsertWeeklyAppointmentLimit(limitData: InsertWeeklyAppointmentLimit): Promise<WeeklyAppointmentLimit> {
    const [result] = await db
      .insert(weeklyAppointmentLimits)
      .values(limitData)
      .onConflictDoUpdate({
        target: weeklyAppointmentLimits.dayOfWeek,
        set: {
          maxBathAppointments: limitData.maxBathAppointments,
          maxGroomAppointments: limitData.maxGroomAppointments,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteWeeklyAppointmentLimit(id: number): Promise<void> {
    await db.delete(weeklyAppointmentLimits).where(eq(weeklyAppointmentLimits.id, id));
  }

  async acquireBookingLock(dateStr: string): Promise<void> {
    const [year, month, day] = dateStr.split('-').map(Number);
    const lockKey = year * 10000 + month * 100 + day;
    await db.execute(sql`SELECT pg_advisory_lock(${lockKey})`);
  }

  async releaseBookingLock(dateStr: string): Promise<void> {
    const [year, month, day] = dateStr.split('-').map(Number);
    const lockKey = year * 10000 + month * 100 + day;
    await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
  }

  async checkAndReserveCapacity(
    dateStr: string, 
    dayOfWeek: number,
    requestedBaths: number,
    requestedGrooms: number
  ): Promise<{ withinCapacity: boolean; bathCount: number; groomCount: number; bathLimit: number; groomLimit: number; reason?: string }> {
    const [limit] = await db.select().from(weeklyAppointmentLimits).where(eq(weeklyAppointmentLimits.dayOfWeek, dayOfWeek));
    
    if (!limit) {
      return {
        withinCapacity: false,
        bathCount: 0,
        groomCount: 0,
        bathLimit: 0,
        groomLimit: 0,
        reason: `No capacity limits configured for this day (day ${dayOfWeek}). Booking is blocked.`
      };
    }
    
    const countResult = await db.execute(sql`
      WITH date_appointments AS (
        SELECT a.id, a.service_type as legacy_service_type
        FROM appointments a
        WHERE DATE(a.appointment_date) = ${dateStr}::date
          AND a.status NOT IN ('cancelled', 'rejected')
      ),
      pet_counts AS (
        SELECT 
          COALESCE(SUM(CASE WHEN LOWER(ap.service_type) LIKE '%bath%' THEN 1 ELSE 0 END), 0) as bath_pets,
          COALESCE(SUM(CASE WHEN LOWER(ap.service_type) LIKE '%full%' OR (LOWER(ap.service_type) LIKE '%groom%' AND LOWER(ap.service_type) NOT LIKE '%bath%') THEN 1 ELSE 0 END), 0) as groom_pets
        FROM date_appointments da
        LEFT JOIN appointment_pets ap ON da.id = ap.appointment_id
        WHERE ap.id IS NOT NULL
      ),
      legacy_counts AS (
        SELECT 
          COALESCE(SUM(CASE WHEN LOWER(da.legacy_service_type) LIKE '%bath%' THEN 1 ELSE 0 END), 0) as bath_legacy,
          COALESCE(SUM(CASE WHEN LOWER(da.legacy_service_type) LIKE '%full%' OR (LOWER(da.legacy_service_type) LIKE '%groom%' AND LOWER(da.legacy_service_type) NOT LIKE '%bath%') THEN 1 ELSE 0 END), 0) as groom_legacy
        FROM date_appointments da
        LEFT JOIN appointment_pets ap ON da.id = ap.appointment_id
        WHERE ap.id IS NULL
      )
      SELECT 
        (SELECT bath_pets FROM pet_counts) + (SELECT bath_legacy FROM legacy_counts) as total_baths,
        (SELECT groom_pets FROM pet_counts) + (SELECT groom_legacy FROM legacy_counts) as total_grooms
    `);
    
    const row = countResult.rows[0] as any;
    const currentBaths = parseInt(row?.total_baths || '0', 10);
    const currentGrooms = parseInt(row?.total_grooms || '0', 10);
    
    console.log(`[ATOMIC CAPACITY CHECK] Date: ${dateStr}, Current: ${currentGrooms} grooms, ${currentBaths} baths. Requested: ${requestedGrooms} grooms, ${requestedBaths} baths. Limits: ${limit.maxGroomAppointments} grooms, ${limit.maxBathAppointments} baths`);
    
    if (currentBaths + requestedBaths > limit.maxBathAppointments) {
      return {
        withinCapacity: false,
        bathCount: currentBaths,
        groomCount: currentGrooms,
        bathLimit: limit.maxBathAppointments,
        groomLimit: limit.maxGroomAppointments,
        reason: `Bath capacity exceeded (limit: ${limit.maxBathAppointments}, current: ${currentBaths}, requested: ${requestedBaths})`
      };
    }
    
    if (currentGrooms + requestedGrooms > limit.maxGroomAppointments) {
      return {
        withinCapacity: false,
        bathCount: currentBaths,
        groomCount: currentGrooms,
        bathLimit: limit.maxBathAppointments,
        groomLimit: limit.maxGroomAppointments,
        reason: `Full groom capacity exceeded (limit: ${limit.maxGroomAppointments}, current: ${currentGrooms}, requested: ${requestedGrooms})`
      };
    }
    
    return {
      withinCapacity: true,
      bathCount: currentBaths,
      groomCount: currentGrooms,
      bathLimit: limit.maxBathAppointments,
      groomLimit: limit.maxGroomAppointments
    };
  }

  // Special date settings operations
  async getSpecialDateSetting(date: string): Promise<SpecialDateSetting | undefined> {
    const [setting] = await db.select().from(specialDateSettings).where(eq(specialDateSettings.date, date));
    return setting;
  }

  async getAllSpecialDateSettings(): Promise<SpecialDateSetting[]> {
    return await db.select().from(specialDateSettings).orderBy(specialDateSettings.date);
  }

  async createSpecialDateSetting(settingData: InsertSpecialDateSetting): Promise<SpecialDateSetting> {
    const [result] = await db.insert(specialDateSettings).values(settingData).returning();
    return result;
  }

  async updateSpecialDateSetting(id: number, settingData: Partial<InsertSpecialDateSetting>): Promise<SpecialDateSetting> {
    const [result] = await db
      .update(specialDateSettings)
      .set({ ...settingData, updatedAt: new Date() })
      .where(eq(specialDateSettings.id, id))
      .returning();
    return result;
  }

  async deleteSpecialDateSetting(id: number): Promise<void> {
    await db.delete(specialDateSettings).where(eq(specialDateSettings.id, id));
  }

  async getSpecialDateAllowedTimes(specialDateId: number): Promise<SpecialDateAllowedTime[]> {
    return await db.select().from(specialDateAllowedTimes).where(eq(specialDateAllowedTimes.specialDateId, specialDateId));
  }

  async addSpecialDateAllowedTime(allowedTimeData: InsertSpecialDateAllowedTime): Promise<SpecialDateAllowedTime> {
    const [result] = await db.insert(specialDateAllowedTimes).values(allowedTimeData).returning();
    return result;
  }

  async deleteSpecialDateAllowedTime(id: number): Promise<void> {
    await db.delete(specialDateAllowedTimes).where(eq(specialDateAllowedTimes.id, id));
  }

  async getSpecialDateWithTimes(date: string): Promise<{ setting: SpecialDateSetting; times: SpecialDateAllowedTime[] } | null> {
    const setting = await this.getSpecialDateSetting(date);
    if (!setting) return null;
    const times = await this.getSpecialDateAllowedTimes(setting.id);
    return { setting, times };
  }

  // Get all methods for database export
  async getAllOrderItems(): Promise<any[]> {
    return await db.select().from(orderItems);
  }

  async getAllWishlistItems(): Promise<any[]> {
    return await db.select().from(wishlistItems);
  }

  async getAllCustomerPets(): Promise<any[]> {
    return await db.select().from(customerPets);
  }

  async getAllGroomerAvailability(): Promise<any[]> {
    return await db.select().from(groomerAvailability);
  }

  async getAllWeeklyLimits(): Promise<any[]> {
    return await db.select().from(weeklyAppointmentLimits);
  }

  async getAllDailyLimits(): Promise<any[]> {
    return await db.select().from(dailyAppointmentLimits);
  }

  async getAllSpecialDateTimes(): Promise<any[]> {
    return await db.select().from(specialDateAllowedTimes);
  }

  // Upsert methods for database import
  async upsertUserForImport(user: any): Promise<void> {
    const existing = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (existing.length > 0) {
      await db.update(users).set(user).where(eq(users.id, user.id));
    } else {
      await db.insert(users).values(user);
    }
  }

  async upsertSupply(supply: any): Promise<void> {
    const existing = await db.select().from(supplies).where(eq(supplies.id, supply.id)).limit(1);
    if (existing.length > 0) {
      // Preserve existing Object Storage images if import has null/undefined imageUrl
      const updateData = { ...supply };
      if (updateData.imageUrl === null || updateData.imageUrl === undefined) {
        // Keep existing imageUrl if the new one is null
        if (existing[0].imageUrl) {
          delete updateData.imageUrl;
        }
      }
      if (updateData.imageUrls === null || updateData.imageUrls === undefined) {
        // Keep existing imageUrls if the new one is null
        if (existing[0].imageUrls) {
          delete updateData.imageUrls;
        }
      }
      await db.update(supplies).set(updateData).where(eq(supplies.id, supply.id));
    } else {
      await db.insert(supplies).values(supply);
    }
  }

  async bulkUpsertSupplies(suppliesData: any[]): Promise<{ imported: number; failed: number; errors: string[] }> {
    const CHUNK_SIZE = 500;
    let imported = 0;
    const errors: string[] = [];

    // Process in chunks
    for (let i = 0; i < suppliesData.length; i += CHUNK_SIZE) {
      const chunk = suppliesData.slice(i, i + CHUNK_SIZE);
      
      try {
        await db.transaction(async (tx) => {
          await tx.insert(supplies)
            .values(chunk)
            .onConflictDoUpdate({
              target: supplies.id,
              set: {
                name: sql`EXCLUDED.name`,
                category: sql`EXCLUDED.category`,
                brand: sql`EXCLUDED.brand`,
                price: sql`EXCLUDED.price`,
                description: sql`EXCLUDED.description`,
                // IMPORTANT: Preserve existing Object Storage images if import has null
                // Use COALESCE to keep existing image_url when EXCLUDED is null
                imageUrl: sql`COALESCE(EXCLUDED.image_url, supplies.image_url)`,
                imageUrls: sql`COALESCE(EXCLUDED.image_urls, supplies.image_urls)`,
                stockQuantity: sql`EXCLUDED.stock_quantity`,
                isActive: sql`EXCLUDED.is_active`,
                weight: sql`EXCLUDED.weight`,
                size: sql`EXCLUDED.size`,
                sku: sql`EXCLUDED.sku`,
                // ExaTouch POS fields
                color: sql`EXCLUDED.color`,
                style: sql`EXCLUDED.style`,
                mfgPart: sql`EXCLUDED.mfg_part`,
                vendor: sql`EXCLUDED.vendor`,
                // Extended product info - preserve existing values if import has null
                ingredients: sql`COALESCE(EXCLUDED.ingredients, supplies.ingredients)`,
                guaranteedAnalysis: sql`COALESCE(EXCLUDED.guaranteed_analysis, supplies.guaranteed_analysis)`,
                instructions: sql`COALESCE(EXCLUDED.instructions, supplies.instructions)`,
                features: sql`COALESCE(EXCLUDED.features, supplies.features)`,
                updatedAt: sql`EXCLUDED.updated_at`,
              },
            });
        });
        imported += chunk.length;
      } catch (error) {
        const chunkIds = chunk.map((s: any) => s.id).join(', ');
        const errorMsg = `Failed to import chunk (IDs: ${chunkIds}): ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      imported,
      failed: suppliesData.length - imported,
      errors
    };
  }

  async upsertPet(pet: any): Promise<void> {
    const existing = await db.select().from(pets).where(eq(pets.id, pet.id)).limit(1);
    if (existing.length > 0) {
      await db.update(pets).set(pet).where(eq(pets.id, pet.id));
    } else {
      await db.insert(pets).values(pet);
    }
  }

  async upsertGroomer(groomer: any): Promise<void> {
    const existing = await db.select().from(groomers).where(eq(groomers.id, groomer.id)).limit(1);
    if (existing.length > 0) {
      await db.update(groomers).set(groomer).where(eq(groomers.id, groomer.id));
    } else {
      await db.insert(groomers).values(groomer);
    }
  }

  async upsertContact(contact: any): Promise<void> {
    const existing = await db.select().from(contacts).where(eq(contacts.id, contact.id)).limit(1);
    if (existing.length > 0) {
      await db.update(contacts).set(contact).where(eq(contacts.id, contact.id));
    } else {
      await db.insert(contacts).values(contact);
    }
  }

  async upsertAppointment(appointment: any): Promise<void> {
    const existing = await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1);
    if (existing.length > 0) {
      await db.update(appointments).set(appointment).where(eq(appointments.id, appointment.id));
    } else {
      await db.insert(appointments).values(appointment);
    }
  }

  async upsertCustomerPet(customerPet: any): Promise<void> {
    const existing = await db.select().from(customerPets).where(eq(customerPets.id, customerPet.id)).limit(1);
    if (existing.length > 0) {
      await db.update(customerPets).set(customerPet).where(eq(customerPets.id, customerPet.id));
    } else {
      await db.insert(customerPets).values(customerPet);
    }
  }

  async upsertOrder(order: any): Promise<void> {
    const existing = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (existing.length > 0) {
      await db.update(orders).set(order).where(eq(orders.id, order.id));
    } else {
      await db.insert(orders).values(order);
    }
  }

  async upsertOrderItem(orderItem: any): Promise<void> {
    const existing = await db.select().from(orderItems).where(eq(orderItems.id, orderItem.id)).limit(1);
    if (existing.length > 0) {
      await db.update(orderItems).set(orderItem).where(eq(orderItems.id, orderItem.id));
    } else {
      await db.insert(orderItems).values(orderItem);
    }
  }

  async upsertWishlistItem(wishlistItem: any): Promise<void> {
    const existing = await db.select().from(wishlistItems).where(eq(wishlistItems.id, wishlistItem.id)).limit(1);
    if (existing.length > 0) {
      await db.update(wishlistItems).set(wishlistItem).where(eq(wishlistItems.id, wishlistItem.id));
    } else {
      await db.insert(wishlistItems).values(wishlistItem);
    }
  }

  async upsertGroomerAvailability(availability: any): Promise<void> {
    const existing = await db.select().from(groomerAvailability).where(eq(groomerAvailability.id, availability.id)).limit(1);
    if (existing.length > 0) {
      await db.update(groomerAvailability).set(availability).where(eq(groomerAvailability.id, availability.id));
    } else {
      await db.insert(groomerAvailability).values(availability);
    }
  }

  async upsertWeeklyLimit(limit: any): Promise<void> {
    const existing = await db.select().from(weeklyAppointmentLimits).where(eq(weeklyAppointmentLimits.id, limit.id)).limit(1);
    if (existing.length > 0) {
      await db.update(weeklyAppointmentLimits).set(limit).where(eq(weeklyAppointmentLimits.id, limit.id));
    } else {
      await db.insert(weeklyAppointmentLimits).values(limit);
    }
  }

  async upsertDailyLimit(limit: any): Promise<void> {
    const existing = await db.select().from(dailyAppointmentLimits).where(eq(dailyAppointmentLimits.id, limit.id)).limit(1);
    if (existing.length > 0) {
      await db.update(dailyAppointmentLimits).set(limit).where(eq(dailyAppointmentLimits.id, limit.id));
    } else {
      await db.insert(dailyAppointmentLimits).values(limit);
    }
  }

  async upsertSpecialDateSetting(setting: any): Promise<void> {
    const existing = await db.select().from(specialDateSettings).where(eq(specialDateSettings.id, setting.id)).limit(1);
    if (existing.length > 0) {
      await db.update(specialDateSettings).set(setting).where(eq(specialDateSettings.id, setting.id));
    } else {
      await db.insert(specialDateSettings).values(setting);
    }
  }

  async upsertSpecialDateAllowedTime(allowedTime: any): Promise<void> {
    const existing = await db.select().from(specialDateAllowedTimes).where(eq(specialDateAllowedTimes.id, allowedTime.id)).limit(1);
    if (existing.length > 0) {
      await db.update(specialDateAllowedTimes).set(allowedTime).where(eq(specialDateAllowedTimes.id, allowedTime.id));
    } else {
      await db.insert(specialDateAllowedTimes).values(allowedTime);
    }
  }

  // Supply import staging operations
  async stageSupplyImports(sessionId: string, suppliesData: any[]): Promise<{ sessionId: string; staged: number; duplicates: number; updates: number }> {
    // Get all existing supplies for duplicate detection
    const existingSupplies = await db.select().from(supplies);
    
    let staged = 0;
    let duplicates = 0;
    let updates = 0;
    
    // Process each supply in chunks of 100 to avoid overwhelming the database
    for (let i = 0; i < suppliesData.length; i += 100) {
      const chunk = suppliesData.slice(i, i + 100);
      const stagingRecords = [];
      
      for (const [index, supplyData] of chunk.entries()) {
        const rowNumber = i + index + 1;
        
        // Calculate composite key and checksum
        const compositeKey = createCompositeKey(supplyData.name, supplyData.brand, supplyData.size);
        const dataChecksum = calculateDataChecksum(supplyData);
        const normalizedSkuValue = normalizeSku(supplyData.sku);
        
        // Find duplicate match
        const match = findDuplicateMatch(
          {
            sku: supplyData.sku,
            name: supplyData.name,
            brand: supplyData.brand,
            size: supplyData.size,
            dataChecksum,
          },
          existingSupplies
        );
        
        // Determine status
        let status = 'pending';
        let conflictReason = null;
        let matchedSupplyId = null;
        
        if (match.matchType === 'exact') {
          status = 'duplicate';
          conflictReason = match.conflictReason;
          matchedSupplyId = match.matchedSupply?.id || null;
          duplicates++;
        } else if (match.matchType === 'update') {
          status = 'update';
          conflictReason = match.conflictReason;
          matchedSupplyId = match.matchedSupply?.id || null;
          updates++;
        } else {
          status = 'new';
          staged++;
        }
        
        // Create staging record
        stagingRecords.push({
          importSessionId: sessionId,
          name: supplyData.name,
          category: supplyData.category,
          brand: supplyData.brand || null,
          price: supplyData.price.toString(),
          description: supplyData.description || null,
          stockQuantity: supplyData.stockQuantity || 0,
          size: supplyData.size || null,
          weight: supplyData.weight || null,
          sku: supplyData.sku || null,
          compositeKey,
          normalizedSku: normalizedSkuValue,
          dataChecksum,
          status,
          matchedSupplyId,
          conflictReason,
          rowNumber,
        });
      }
      
      // Bulk insert staging records
      if (stagingRecords.length > 0) {
        await db.insert(supplyImportStaging).values(stagingRecords);
      }
    }
    
    return { sessionId, staged, duplicates, updates };
  }

  async getStagedImports(sessionId: string): Promise<any[]> {
    const stagedItems = await db
      .select()
      .from(supplyImportStaging)
      .where(eq(supplyImportStaging.importSessionId, sessionId))
      .orderBy(supplyImportStaging.rowNumber);
    
    return stagedItems;
  }

  async approveStagedImports(sessionId: string): Promise<{ created: number; updated: number }> {
    // Get all pending/new/update items for this session
    const stagedItems = await db
      .select()
      .from(supplyImportStaging)
      .where(
        and(
          eq(supplyImportStaging.importSessionId, sessionId),
          or(
            eq(supplyImportStaging.status, 'new'),
            eq(supplyImportStaging.status, 'update')
          )
        )
      );
    
    let created = 0;
    let updated = 0;
    
    // Wrap everything in a transaction for atomicity
    await db.transaction(async (tx) => {
      // Process in chunks of 100
      for (let i = 0; i < stagedItems.length; i += 100) {
        const chunk = stagedItems.slice(i, i + 100);
        
        for (const item of chunk) {
          if (item.status === 'new') {
            // Insert new supply
            await tx.insert(supplies).values({
              name: item.name,
              category: item.category,
              brand: item.brand,
              price: item.price,
              description: item.description,
              stockQuantity: item.stockQuantity,
              size: item.size,
              weight: item.weight,
              isActive: true,
            });
            created++;
          } else if (item.status === 'update' && item.matchedSupplyId) {
            // Update existing supply
            await tx.update(supplies).set({
              name: item.name,
              category: item.category,
              brand: item.brand,
              price: item.price,
              description: item.description,
              stockQuantity: item.stockQuantity,
              size: item.size,
              weight: item.weight,
              updatedAt: new Date(),
            }).where(eq(supplies.id, item.matchedSupplyId));
            updated++;
          }
        }
      }
      
      // Delete staged items only after all operations succeed
      await tx.delete(supplyImportStaging).where(eq(supplyImportStaging.importSessionId, sessionId));
    });
    
    return { created, updated };
  }

  async rejectStagedImports(sessionId: string): Promise<void> {
    await db.delete(supplyImportStaging).where(eq(supplyImportStaging.importSessionId, sessionId));
  }

  async clearOldStagingData(daysOld: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    await db.delete(supplyImportStaging).where(lt(supplyImportStaging.createdAt, cutoffDate));
  }

  // Boarding operations
  async getAllBoardingRecords(): Promise<BoardingRecord[]> {
    return await db.select().from(boardingRecords).orderBy(desc(boardingRecords.createdAt));
  }

  async getBoardingRecord(id: number): Promise<BoardingRecord | undefined> {
    const [record] = await db.select().from(boardingRecords).where(eq(boardingRecords.id, id));
    return record;
  }

  async createBoardingRecord(record: InsertBoardingRecord): Promise<BoardingRecord> {
    const [created] = await db.insert(boardingRecords).values(record).returning();
    return created;
  }

  async updateBoardingRecord(id: number, record: Partial<InsertBoardingRecord>): Promise<BoardingRecord> {
    const [updated] = await db
      .update(boardingRecords)
      .set({ ...record, updatedAt: new Date() })
      .where(eq(boardingRecords.id, id))
      .returning();
    return updated;
  }

  async checkInBoardingRecord(id: number): Promise<BoardingRecord> {
    const today = new Date().toISOString().split('T')[0];
    const [updated] = await db
      .update(boardingRecords)
      .set({ actualDropOffDate: today, updatedAt: new Date() })
      .where(eq(boardingRecords.id, id))
      .returning();
    return updated;
  }

  async checkOutBoardingRecord(id: number): Promise<BoardingRecord> {
    const today = new Date().toISOString().split('T')[0];
    const [updated] = await db
      .update(boardingRecords)
      .set({ 
        actualPickUpDate: today, 
        status: 'completed',
        updatedAt: new Date() 
      })
      .where(eq(boardingRecords.id, id))
      .returning();
    return updated;
  }

  async deleteBoardingRecord(id: number): Promise<void> {
    await db.delete(boardingRecords).where(eq(boardingRecords.id, id));
  }

  // Schedule operations
  async getAllScheduleEntries(): Promise<ScheduleEntry[]> {
    return await db.select().from(scheduleEntries)
      .orderBy(asc(scheduleEntries.section), asc(scheduleEntries.displayOrder), asc(scheduleEntries.employeeName));
  }

  async batchUpdateScheduleEntries(entries: InsertScheduleEntry[]): Promise<ScheduleEntry[]> {
    // Delete all existing entries first, then insert the new ones
    await db.delete(scheduleEntries);
    
    if (entries.length === 0) {
      return [];
    }
    
    const inserted = await db.insert(scheduleEntries).values(entries).returning();
    return inserted;
  }

  async updateScheduleEntry(id: number, entry: Partial<InsertScheduleEntry>): Promise<ScheduleEntry> {
    const [updated] = await db
      .update(scheduleEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(scheduleEntries.id, id))
      .returning();
    return updated;
  }

  async deleteScheduleEntry(id: number): Promise<void> {
    await db.delete(scheduleEntries).where(eq(scheduleEntries.id, id));
  }

  // Grooming Schedule operations
  async getAllGroomingScheduleEntries(): Promise<GroomingScheduleEntry[]> {
    return await db.select().from(groomingScheduleEntries)
      .orderBy(asc(groomingScheduleEntries.section), asc(groomingScheduleEntries.displayOrder), asc(groomingScheduleEntries.groomerName));
  }

  async batchUpdateGroomingScheduleEntries(entries: InsertGroomingScheduleEntry[]): Promise<GroomingScheduleEntry[]> {
    // Delete all existing entries first, then insert the new ones
    await db.delete(groomingScheduleEntries);
    
    if (entries.length === 0) {
      return [];
    }
    
    const inserted = await db.insert(groomingScheduleEntries).values(entries).returning();
    return inserted;
  }

  async updateGroomingScheduleEntry(id: number, entry: Partial<InsertGroomingScheduleEntry>): Promise<GroomingScheduleEntry> {
    const [updated] = await db
      .update(groomingScheduleEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(groomingScheduleEntries.id, id))
      .returning();
    return updated;
  }

  async deleteGroomingScheduleEntry(id: number): Promise<void> {
    await db.delete(groomingScheduleEntries).where(eq(groomingScheduleEntries.id, id));
  }

  // Order Photo operations
  async getAllOrderPhotos(userId?: string): Promise<any[]> {
    let photos: OrderPhoto[];
    if (userId) {
      photos = await db.select().from(orderPhotos)
        .where(eq(orderPhotos.userId, userId))
        .orderBy(desc(orderPhotos.createdAt));
    } else {
      photos = await db.select().from(orderPhotos).orderBy(desc(orderPhotos.createdAt));
    }
    
    // Add item count for each photo
    const photosWithCount = await Promise.all(
      photos.map(async (photo) => {
        const items = await db.select().from(extractedOrderItems)
          .where(eq(extractedOrderItems.orderPhotoId, photo.id));
        return {
          ...photo,
          itemCount: items.length
        };
      })
    );
    
    return photosWithCount;
  }

  async getOrderPhoto(id: number): Promise<OrderPhoto | undefined> {
    const [photo] = await db.select().from(orderPhotos).where(eq(orderPhotos.id, id));
    return photo;
  }

  async createOrderPhoto(photo: InsertOrderPhoto): Promise<OrderPhoto> {
    const [created] = await db.insert(orderPhotos).values(photo).returning();
    return created;
  }

  async updateOrderPhoto(id: number, photo: Partial<InsertOrderPhoto>): Promise<OrderPhoto> {
    const [updated] = await db
      .update(orderPhotos)
      .set({ ...photo, updatedAt: new Date() })
      .where(eq(orderPhotos.id, id))
      .returning();
    return updated;
  }

  async deleteOrderPhoto(id: number): Promise<void> {
    await db.delete(orderPhotos).where(eq(orderPhotos.id, id));
  }

  // Extracted Order Item operations
  async getExtractedOrderItems(orderPhotoId: number): Promise<ExtractedOrderItem[]> {
    return await db.select().from(extractedOrderItems)
      .where(eq(extractedOrderItems.orderPhotoId, orderPhotoId))
      .orderBy(asc(extractedOrderItems.id));
  }

  async getExtractedOrderItem(id: number): Promise<ExtractedOrderItem | undefined> {
    const [item] = await db.select().from(extractedOrderItems).where(eq(extractedOrderItems.id, id));
    return item;
  }

  async createExtractedOrderItem(item: InsertExtractedOrderItem): Promise<ExtractedOrderItem> {
    const [created] = await db.insert(extractedOrderItems).values(item).returning();
    return created;
  }

  async updateExtractedOrderItem(id: number, item: Partial<InsertExtractedOrderItem>): Promise<ExtractedOrderItem> {
    const [updated] = await db
      .update(extractedOrderItems)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(extractedOrderItems.id, id))
      .returning();
    return updated;
  }

  async deleteExtractedOrderItem(id: number): Promise<void> {
    await db.delete(extractedOrderItems).where(eq(extractedOrderItems.id, id));
  }

  async bulkCreateExtractedOrderItems(items: InsertExtractedOrderItem[]): Promise<ExtractedOrderItem[]> {
    if (items.length === 0) return [];
    const created = await db.insert(extractedOrderItems).values(items).returning();
    return created;
  }

  // Astro Loyalty operations
  async getAstroCustomerByUserId(userId: string): Promise<AstroCustomer | undefined> {
    const [customer] = await db.select().from(astroCustomers).where(eq(astroCustomers.userId, userId));
    return customer;
  }

  async getAstroCustomerByAstroId(astroCustomerId: string): Promise<AstroCustomer | undefined> {
    const [customer] = await db.select().from(astroCustomers).where(eq(astroCustomers.astroCustomerId, astroCustomerId));
    return customer;
  }

  async createAstroCustomer(customer: InsertAstroCustomer): Promise<AstroCustomer> {
    const [created] = await db.insert(astroCustomers).values(customer).returning();
    return created;
  }

  async updateAstroCustomer(id: number, customer: Partial<InsertAstroCustomer>): Promise<AstroCustomer> {
    const [updated] = await db
      .update(astroCustomers)
      .set({ ...customer, updatedAt: new Date() })
      .where(eq(astroCustomers.id, id))
      .returning();
    return updated;
  }

  async getAllAstroCustomers(): Promise<AstroCustomer[]> {
    return await db.select().from(astroCustomers).orderBy(asc(astroCustomers.createdAt));
  }

  async getFrequentBuyerProgressByCustomer(astroCustomerId: number): Promise<AstroFrequentBuyerProgress[]> {
    return await db.select().from(astroFrequentBuyerProgress)
      .where(eq(astroFrequentBuyerProgress.astroCustomerId, astroCustomerId))
      .orderBy(desc(astroFrequentBuyerProgress.lastPurchaseDate));
  }

  async upsertFrequentBuyerProgress(progress: InsertAstroFrequentBuyerProgress): Promise<AstroFrequentBuyerProgress> {
    // Check if progress exists for this customer and program
    const existing = await db.select().from(astroFrequentBuyerProgress)
      .where(
        and(
          eq(astroFrequentBuyerProgress.astroCustomerId, progress.astroCustomerId),
          eq(astroFrequentBuyerProgress.programId, progress.programId)
        )
      );

    if (existing.length > 0) {
      // Update existing progress
      const [updated] = await db
        .update(astroFrequentBuyerProgress)
        .set({ ...progress, updatedAt: new Date() })
        .where(eq(astroFrequentBuyerProgress.id, existing[0].id))
        .returning();
      return updated;
    } else {
      // Create new progress
      const [created] = await db.insert(astroFrequentBuyerProgress).values(progress).returning();
      return created;
    }
  }

  async getPurchaseSyncLogByOrder(orderId: number): Promise<AstroPurchaseSyncLog[]> {
    return await db.select().from(astroPurchaseSyncLog)
      .where(eq(astroPurchaseSyncLog.orderId, orderId))
      .orderBy(desc(astroPurchaseSyncLog.syncedAt));
  }

  async createPurchaseSyncLog(log: InsertAstroPurchaseSyncLog): Promise<AstroPurchaseSyncLog> {
    const [created] = await db.insert(astroPurchaseSyncLog).values(log).returning();
    return created;
  }

  // Automated Messages operations - TEMPORARILY DISABLED FOR PUBLISHING TEST
  async getAllAutomatedMessages(): Promise<AutomatedMessage[]> {
    return []; // Disabled - tables removed for publishing test
  }

  async getActiveAutomatedMessages(): Promise<AutomatedMessage[]> {
    return []; // Disabled
  }

  async getAutomatedMessageById(id: number): Promise<AutomatedMessage | undefined> {
    return undefined; // Disabled
  }

  async createAutomatedMessage(message: InsertAutomatedMessage): Promise<AutomatedMessage> {
    throw new Error("Automated messaging temporarily disabled");
  }

  async updateAutomatedMessage(id: number, message: Partial<InsertAutomatedMessage>): Promise<AutomatedMessage> {
    throw new Error("Automated messaging temporarily disabled");
  }

  async deleteAutomatedMessage(id: number): Promise<void> {
    // Disabled
  }

  async updateAutomatedMessageLastRun(id: number): Promise<void> {
    // Disabled
  }

  async createAutomatedMessageLog(log: { 
    automatedMessageId: number; 
    recipientId?: string; 
    recipientEmail?: string; 
    recipientPhone?: string; 
    appointmentId?: number;
    status: string;
    errorMessage?: string;
  }): Promise<AutomatedMessageLog> {
    throw new Error("Automated messaging temporarily disabled");
  }

  async getAutomatedMessageLogs(messageId: number): Promise<AutomatedMessageLog[]> {
    return []; // Disabled
  }

  // Loyalty program operations
  async getLoyaltySettings(): Promise<{ spendingThreshold: string; rewardAmount: string; isActive: boolean }> {
    try {
      const [settings] = await db.select().from(loyaltySettings).limit(1);
      if (settings) {
        return {
          spendingThreshold: settings.spendingThreshold,
          rewardAmount: settings.rewardAmount,
          isActive: settings.isActive ?? true
        };
      }
      // Create default settings if none exist
      const [newSettings] = await db.insert(loyaltySettings).values({
        spendingThreshold: "250",
        rewardAmount: "20",
        isActive: true
      }).returning();
      return {
        spendingThreshold: newSettings.spendingThreshold,
        rewardAmount: newSettings.rewardAmount,
        isActive: newSettings.isActive ?? true
      };
    } catch (error) {
      console.error('Error getting loyalty settings:', error);
      return { spendingThreshold: "250", rewardAmount: "20", isActive: true };
    }
  }

  async updateLoyaltySettings(settings: { spendingThreshold?: string; rewardAmount?: string; isActive?: boolean }): Promise<{ spendingThreshold: string; rewardAmount: string; isActive: boolean }> {
    try {
      const existing = await this.getLoyaltySettings();
      const [updated] = await db.update(loyaltySettings)
        .set({
          spendingThreshold: settings.spendingThreshold ?? existing.spendingThreshold,
          rewardAmount: settings.rewardAmount ?? existing.rewardAmount,
          isActive: settings.isActive ?? existing.isActive,
          updatedAt: new Date()
        })
        .returning();
      if (!updated) {
        // Insert if no rows updated
        const [newSettings] = await db.insert(loyaltySettings).values({
          spendingThreshold: settings.spendingThreshold ?? "250",
          rewardAmount: settings.rewardAmount ?? "20",
          isActive: settings.isActive ?? true
        }).returning();
        return {
          spendingThreshold: newSettings.spendingThreshold,
          rewardAmount: newSettings.rewardAmount,
          isActive: newSettings.isActive ?? true
        };
      }
      return {
        spendingThreshold: updated.spendingThreshold,
        rewardAmount: updated.rewardAmount,
        isActive: updated.isActive ?? true
      };
    } catch (error) {
      console.error('Error updating loyalty settings:', error);
      throw error;
    }
  }

  async getUserLoyaltyStatus(userId: string): Promise<{ totalSpent: string; loyaltyCredits: string; progressToNextReward: number; spendingThreshold: string; rewardAmount: string }> {
    try {
      const user = await this.getUser(userId);
      const settings = await this.getLoyaltySettings();
      
      const totalSpent = parseFloat(user?.totalSpent || "0");
      const threshold = parseFloat(settings.spendingThreshold);
      const progressToNextReward = Math.min(100, (totalSpent % threshold) / threshold * 100);
      
      return {
        totalSpent: user?.totalSpent || "0",
        loyaltyCredits: user?.loyaltyCredits || "0",
        progressToNextReward,
        spendingThreshold: settings.spendingThreshold,
        rewardAmount: settings.rewardAmount
      };
    } catch (error) {
      console.error('Error getting user loyalty status:', error);
      throw error;
    }
  }

  async applyLoyaltyCredit(userId: string, amount: number): Promise<{ success: boolean; remainingCredits: string }> {
    try {
      const user = await this.getUser(userId);
      if (!user) throw new Error("User not found");
      
      const currentCredits = parseFloat(user.loyaltyCredits || "0");
      if (amount > currentCredits) {
        throw new Error("Insufficient loyalty credits");
      }
      
      const newCredits = (currentCredits - amount).toFixed(2);
      const [updated] = await db.update(users)
        .set({ loyaltyCredits: newCredits, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      
      return { success: true, remainingCredits: updated.loyaltyCredits || "0" };
    } catch (error) {
      console.error('Error applying loyalty credit:', error);
      throw error;
    }
  }

  async updateUserLoyalty(userId: string, data: { loyaltyCredits?: string; totalSpent?: string }): Promise<User> {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (data.loyaltyCredits !== undefined) updateData.loyaltyCredits = data.loyaltyCredits;
      if (data.totalSpent !== undefined) updateData.totalSpent = data.totalSpent;
      
      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      
      return updated;
    } catch (error) {
      console.error('Error updating user loyalty:', error);
      throw error;
    }
  }

  async addToUserTotalSpent(userId: string, amount: number): Promise<{ newCreditsEarned: boolean; creditsAmount: string }> {
    try {
      const user = await this.getUser(userId);
      if (!user) throw new Error("User not found");
      
      const settings = await this.getLoyaltySettings();
      const threshold = parseFloat(settings.spendingThreshold);
      const reward = parseFloat(settings.rewardAmount);
      
      const oldTotal = parseFloat(user.totalSpent || "0");
      const newTotal = oldTotal + amount;
      
      // Check if user crossed a threshold
      const oldRewardCount = Math.floor(oldTotal / threshold);
      const newRewardCount = Math.floor(newTotal / threshold);
      const newCreditsEarned = newRewardCount > oldRewardCount;
      
      const currentCredits = parseFloat(user.loyaltyCredits || "0");
      const additionalCredits = (newRewardCount - oldRewardCount) * reward;
      const newCredits = currentCredits + additionalCredits;
      
      await db.update(users)
        .set({ 
          totalSpent: newTotal.toFixed(2), 
          loyaltyCredits: newCredits.toFixed(2),
          updatedAt: new Date() 
        })
        .where(eq(users.id, userId));
      
      return { 
        newCreditsEarned, 
        creditsAmount: additionalCredits > 0 ? additionalCredits.toFixed(2) : "0" 
      };
    } catch (error) {
      console.error('Error adding to user total spent:', error);
      throw error;
    }
  }

  async updateUserStripeInfo(userId: string, data: { stripeCustomerId?: string; stripeDefaultPaymentMethod?: string }): Promise<User> {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (data.stripeCustomerId !== undefined) updateData.stripeCustomerId = data.stripeCustomerId;
      if (data.stripeDefaultPaymentMethod !== undefined) updateData.stripeDefaultPaymentMethod = data.stripeDefaultPaymentMethod;
      
      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      
      return updated;
    } catch (error) {
      console.error('Error updating user Stripe info:', error);
      throw error;
    }
  }

  async getLegalPage(slug: string): Promise<LegalPage | undefined> {
    const [page] = await db.select().from(legalPages).where(eq(legalPages.slug, slug));
    return page;
  }

  async upsertLegalPage(data: { slug: string; title: string; content: string; lastUpdatedBy?: string }): Promise<LegalPage> {
    const existing = await this.getLegalPage(data.slug);
    if (existing) {
      const [updated] = await db.update(legalPages)
        .set({ title: data.title, content: data.content, lastUpdatedBy: data.lastUpdatedBy || null, updatedAt: new Date() })
        .where(eq(legalPages.slug, data.slug))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(legalPages)
        .values({ slug: data.slug, title: data.title, content: data.content, lastUpdatedBy: data.lastUpdatedBy || null })
        .returning();
      return created;
    }
  }

  async getAllLegalPages(): Promise<LegalPage[]> {
    return db.select().from(legalPages).orderBy(asc(legalPages.slug));
  }
}

export const storage = new DatabaseStorage();
