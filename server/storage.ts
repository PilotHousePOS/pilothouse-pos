import {
  users,
  pets,
  supplies,
  cartItems,
  orders,
  orderItems,
  appointments,
  customerPets,
  groomingSettings,
  groomers,
  groomerAvailability,
  passwordResetTokens,
  wishlistItems,
  contacts,
  appointmentHistory,
  dailyAppointmentLimits,
  weeklyAppointmentLimits,
  type User,
  type UpsertUser,
  type Pet,
  type InsertPet,
  type Supply,
  type InsertSupply,
  type CartItem,
  type InsertCartItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, not, ilike, lt, isNull, count, sql } from "drizzle-orm";
import { phoneNumbersMatch } from "./phoneUtils";
import { SUPPLY_FILTERS, type FilterType } from "./filterConfig";

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
  }): Promise<{ items: Supply[]; total: number }>;
  getSupply(id: number): Promise<Supply | undefined>;
  createSupply(supply: InsertSupply): Promise<Supply>;
  updateSupply(id: number, supply: Partial<InsertSupply>): Promise<Supply>;
  deleteSupply(id: number): Promise<void>;

  // Cart operations
  getCartItems(userId: string): Promise<CartItem[]>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: number, quantity: number): Promise<CartItem>;
  removeFromCart(id: number): Promise<void>;
  clearCart(userId: string): Promise<void>;

  // Order operations
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  getOrders(userId?: string): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderWithItems(id: number): Promise<{ order: Order; items: OrderItem[] } | undefined>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  deleteOrder(id: number): Promise<void>;

  // Appointment operations
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  getAppointments(userId?: string): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentsByPhoneNumber(phoneNumber: string): Promise<Appointment[]>;
  updateAppointmentStatus(id: number, status: string): Promise<Appointment>;
  updateAppointmentIsHere(id: number, isHere: boolean): Promise<Appointment>;
  updateAppointmentIsPaid(id: number, isPaid: boolean): Promise<Appointment>;
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
  setGroomerAvailability(availability: InsertGroomerAvailability): Promise<GroomerAvailability>;
  updateGroomerAvailability(id: number, availability: Partial<InsertGroomerAvailability>): Promise<GroomerAvailability>;
  deleteGroomerAvailability(id: number): Promise<void>;

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
            ilike(supplies.description, `%${query}%`)
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
  }): Promise<{ items: Supply[]; total: number }> {
    const { limit, offset, category, search, filterType } = params;

    // Build WHERE conditions based on filters
    let whereConditions: any[] = [eq(supplies.isActive, true)];
    
    // Trim search to handle whitespace consistently
    const trimmedSearch = search?.trim() || '';

    if (filterType) {
      // Use centralized filter configuration
      const config = SUPPLY_FILTERS[filterType];
      
      // Build inclusion conditions for brands and keywords
      const brandConditions = config.includeBrands.map(brand => eq(supplies.brand, brand));
      const keywordConditions = config.includeKeywords.flatMap(keyword => [
        ilike(supplies.name, `%${keyword}%`),
        ilike(supplies.description, `%${keyword}%`)
      ]);
      
      // Build exclusion conditions (handle NULL fields with OR isNull)
      const excludeBrandConditions = config.excludeBrands.map(brand => 
        or(isNull(supplies.brand), not(eq(supplies.brand, brand)))
      );
      const excludeKeywordConditions = config.excludeKeywords.flatMap(keyword => [
        or(isNull(supplies.name), not(ilike(supplies.name, `%${keyword}%`))),
        or(isNull(supplies.description), not(ilike(supplies.description, `%${keyword}%`)))
      ]);
      
      // Apply filter: include matching items but exclude conflicting ones
      whereConditions.push(or(...brandConditions, ...keywordConditions));
      whereConditions.push(...excludeBrandConditions);
      whereConditions.push(...excludeKeywordConditions);
    }
    
    // Apply search filter (works alongside filterType or standalone)
    if (trimmedSearch) {
      whereConditions.push(
        or(
          ilike(supplies.name, `%${trimmedSearch}%`),
          ilike(supplies.brand, `%${trimmedSearch}%`),
          ilike(supplies.description, `%${trimmedSearch}%`)
        )
      );
    }
    
    // Apply category filter whenever category is provided
    if (category) {
      whereConditions.push(eq(supplies.category, category));
    }

    // Get total count with filters
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(supplies)
      .where(and(...whereConditions));

    // Get paginated items with filters
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

  async createSupply(supply: InsertSupply): Promise<Supply> {
    const [newSupply] = await db.insert(supplies).values(supply).returning();
    return newSupply;
  }

  async updateSupply(id: number, supply: Partial<InsertSupply>): Promise<Supply> {
    const [updatedSupply] = await db
      .update(supplies)
      .set({ ...supply, updatedAt: new Date() })
      .where(eq(supplies.id, id))
      .returning();
    return updatedSupply;
  }

  async deleteSupply(id: number): Promise<void> {
    await db.delete(supplies).where(eq(supplies.id, id));
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

  async getOrderWithItems(id: number): Promise<{ order: Order; items: any[]; customerName?: string } | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    // Get customer information
    const [customer] = await db.select().from(users).where(eq(users.id, order.userId));
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer';
    
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
    
    return { order, items: enrichedItems, customerName };
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
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

  // Appointment operations
  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values(appointment).returning();
    return newAppointment;
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
    const result = await db.delete(users).where(eq(users.id, id));
    if (!result.rowCount || result.rowCount === 0) {
      throw new Error('User not found');
    }
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
    return await db
      .select({
        id: groomers.id,
        name: groomers.name,
        email: groomers.email,
        phone: groomers.phone,
        specialties: groomers.specialties,
        isActive: groomers.isActive,
        createdAt: groomers.createdAt,
        updatedAt: groomers.updatedAt,
      })
      .from(groomers)
      .innerJoin(groomerAvailability, eq(groomers.id, groomerAvailability.groomerId))
      .where(and(
        eq(groomers.isActive, true),
        eq(groomerAvailability.dayOfWeek, dayOfWeek),
        eq(groomerAvailability.isAvailable, true)
      ))
      .orderBy(groomers.name);
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
  async upsertUser(user: any): Promise<void> {
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
      await db.update(supplies).set(supply).where(eq(supplies.id, supply.id));
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
                imageUrl: sql`EXCLUDED.image_url`,
                imageUrls: sql`EXCLUDED.image_urls`,
                stockQuantity: sql`EXCLUDED.stock_quantity`,
                isActive: sql`EXCLUDED.is_active`,
                weight: sql`EXCLUDED.weight`,
                size: sql`EXCLUDED.size`,
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
}

export const storage = new DatabaseStorage();
