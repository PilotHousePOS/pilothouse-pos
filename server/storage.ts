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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, lt } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: { email: string; password: string; firstName: string; lastName: string }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserAdmin(id: string, isAdmin: boolean): Promise<User>;
  getAllUsers(): Promise<User[]>;

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
  searchSupplies(query: string): Promise<Supply[]>;
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
  updateOrderStatus(id: number, status: string): Promise<Order>;

  // Appointment operations
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  getAppointments(userId?: string): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  updateAppointmentStatus(id: number, status: string): Promise<Appointment>;

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
      const [user] = await db.select().from(users).where(eq(users.email, email));
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
      .where(and(eq(pets.species, species), eq(pets.isAvailable, true)))
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

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  // Appointment operations
  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values(appointment).returning();
    return newAppointment;
  }

  async getAppointments(userId?: string): Promise<Appointment[]> {
    if (userId) {
      return await db
        .select()
        .from(appointments)
        .where(eq(appointments.userId, userId))
        .orderBy(desc(appointments.appointmentDate));
    } else {
      return await db.select().from(appointments).orderBy(desc(appointments.appointmentDate));
    }
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async updateAppointmentStatus(id: number, status: string): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ status, updatedAt: new Date() })
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
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
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
}

export const storage = new DatabaseStorage();
