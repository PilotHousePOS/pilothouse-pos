import {
  users,
  pets,
  supplies,
  cartItems,
  orders,
  orderItems,
  appointments,
  customerPets,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

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
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
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
    return await db.select().from(pets).where(eq(pets.isAvailable, true)).orderBy(desc(pets.createdAt));
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
    return await db.select().from(supplies).where(eq(supplies.isActive, true)).orderBy(desc(supplies.createdAt));
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
}

export const storage = new DatabaseStorage();
