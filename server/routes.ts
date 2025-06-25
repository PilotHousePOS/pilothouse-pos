import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateToken, verifyToken, authMiddleware, setAuthCookie, type AuthRequest } from "./auth";
import {
  insertPetSchema,
  insertSupplySchema,
  insertCartItemSchema,
  insertOrderSchema,
  insertAppointmentSchema,
  insertCustomerPetSchema,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {

  // Customer signup
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create new user
      const newUser = await storage.createUser({
        email,
        password, // In production, hash this password
        firstName,
        lastName,
      });

      // Generate JWT token
      const token = generateToken(newUser);
      setAuthCookie(res, token);
      
      console.log('User created, token generated:', newUser.id);
      const { password: _, ...userWithoutPassword } = newUser;
      res.json({ ...userWithoutPassword, token });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Signup failed" });
    }
  });

  // Customer login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // In production, verify hashed password
      if (user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate JWT token
      const token = generateToken(user);
      setAuthCookie(res, token);
      
      console.log('User logged in, token generated:', user.id);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, token });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ message: "Logged out successfully" });
  });

  // Auth routes
  app.get('/api/auth/user', async (req, res) => {
    try {
      // Check both cookies and Authorization header
      const cookieToken = req.cookies?.auth_token;
      const authHeader = req.headers.authorization;
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      const token = headerToken || cookieToken;
      
      console.log('Auth check - cookies:', req.cookies);
      console.log('Auth check - authorization header:', authHeader);
      console.log('Auth check - token found:', !!token);
      
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = verifyToken(token);
      console.log('Auth check - user verified:', !!user);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Get fresh user data from database to ensure admin status is current
      const freshUser = await storage.getUser(user.id);
      if (!freshUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = freshUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Pet routes with fallback data
  app.get("/api/pets", async (req, res) => {
    try {
      const { species } = req.query;
      const pets = species 
        ? await storage.getPetsBySpecies(species as string)
        : await storage.getAllPets();
      res.json(pets);
    } catch (error) {
      console.error("Error fetching pets:", error);
      // Return fallback data on error
      res.json([
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
      ]);
    }
  });

  app.get("/api/pets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pet = await storage.getPet(id);
      if (!pet) {
        return res.status(404).json({ message: "Pet not found" });
      }
      res.json(pet);
    } catch (error) {
      console.error("Error fetching pet:", error);
      res.status(500).json({ message: "Failed to fetch pet" });
    }
  });

  app.post("/api/pets", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const petData = insertPetSchema.parse(req.body);
      const pet = await storage.createPet(petData);
      res.json(pet);
    } catch (error) {
      console.error("Error creating pet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pet data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create pet" });
    }
  });

  app.put("/api/pets/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const petData = insertPetSchema.partial().parse(req.body);
      const pet = await storage.updatePet(id, petData);
      res.json(pet);
    } catch (error) {
      console.error("Error updating pet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pet data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update pet" });
    }
  });

  app.delete("/api/pets/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deletePet(id);
      res.json({ message: "Pet deleted successfully" });
    } catch (error) {
      console.error("Error deleting pet:", error);
      res.status(500).json({ message: "Failed to delete pet" });
    }
  });

  // Supply routes with fallback data
  app.get("/api/supplies", async (req, res) => {
    try {
      const { category, search } = req.query;
      let supplies;
      
      if (search) {
        supplies = await storage.searchSupplies(search as string);
      } else if (category) {
        supplies = await storage.getSuppliesByCategory(category as string);
      } else {
        supplies = await storage.getAllSupplies();
      }
      
      res.json(supplies);
    } catch (error) {
      console.error("Error fetching supplies:", error);
      // Return fallback data on error
      res.json([
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
      ]);
    }
  });

  app.get("/api/supplies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const supply = await storage.getSupply(id);
      if (!supply) {
        return res.status(404).json({ message: "Supply not found" });
      }
      res.json(supply);
    } catch (error) {
      console.error("Error fetching supply:", error);
      res.status(500).json({ message: "Failed to fetch supply" });
    }
  });

  app.post("/api/supplies", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const supplyData = insertSupplySchema.parse(req.body);
      const supply = await storage.createSupply(supplyData);
      res.json(supply);
    } catch (error) {
      console.error("Error creating supply:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid supply data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create supply" });
    }
  });

  app.put("/api/supplies/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const supplyData = insertSupplySchema.partial().parse(req.body);
      const supply = await storage.updateSupply(id, supplyData);
      res.json(supply);
    } catch (error) {
      console.error("Error updating supply:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid supply data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update supply" });
    }
  });

  app.delete("/api/supplies/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User ID not found" });
      }
      const user = await storage.getUser(req.user.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteSupply(id);
      res.json({ message: "Supply deleted successfully" });
    } catch (error) {
      console.error("Error deleting supply:", error);
      res.status(500).json({ message: "Failed to delete supply" });
    }
  });

  // Cart routes
  app.get("/api/cart", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const cartItemData = insertCartItemSchema.parse({ ...req.body, userId });
      const cartItem = await storage.addToCart(cartItemData);
      res.json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid cart item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  app.put("/api/cart/:id", authMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { quantity } = req.body;
      const cartItem = await storage.updateCartItem(id, quantity);
      res.json(cartItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", authMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.removeFromCart(id);
      res.json({ message: "Item removed from cart" });
    } catch (error) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Order routes
  app.get("/api/orders", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      const orders = user?.isAdmin 
        ? await storage.getOrders()
        : await storage.getOrders(userId);
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.put("/api/orders/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { status } = req.body;
      const order = await storage.updateOrderStatus(id, status);
      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const { orderData, items } = req.body;
      
      const orderSchema = insertOrderSchema.extend({
        items: z.array(z.object({
          supplyId: z.number().optional(),
          petId: z.number().optional(),
          quantity: z.number(),
          price: z.string(),
        })),
      });
      
      const validatedData = orderSchema.parse({ ...orderData, userId, items });
      const order = await storage.createOrder(
        { ...validatedData, userId },
        validatedData.items.map(item => ({ ...item, orderId: 0 }))
      );
      
      // Clear cart after successful order
      await storage.clearCart(userId);
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      const appointments = user?.isAdmin 
        ? await storage.getAppointments()
        : await storage.getAppointments(userId);
      
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  app.put("/api/appointments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { status } = req.body;
      const appointment = await storage.updateAppointmentStatus(id, status);
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  app.post("/api/appointments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const appointmentData = insertAppointmentSchema.parse({ ...req.body, userId });
      const appointment = await storage.createAppointment(appointmentData);
      res.json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid appointment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  app.put("/api/appointments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { status } = req.body;
      const appointment = await storage.updateAppointmentStatus(id, status);
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // Customer pet routes
  app.get("/api/customer-pets", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const pets = await storage.getCustomerPets(userId);
      res.json(pets);
    } catch (error) {
      console.error("Error fetching customer pets:", error);
      res.status(500).json({ message: "Failed to fetch customer pets" });
    }
  });

  app.post("/api/customer-pets", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const petData = insertCustomerPetSchema.parse({ ...req.body, userId });
      const pet = await storage.createCustomerPet(petData);
      res.json(pet);
    } catch (error) {
      console.error("Error creating customer pet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid pet data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create customer pet" });
    }
  });

  // Admin user management routes
  app.get("/api/admin/users", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const users = await storage.getAllUsers();
      // Remove password field from response
      const safeUsers = users.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:userId/admin", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const { isAdmin } = req.body;

      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }

      const updatedUser = await storage.updateUserAdmin(userId, isAdmin);
      const { password, ...safeUser } = updatedUser;
      
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating user admin status:", error);
      res.status(500).json({ message: "Failed to update user admin status" });
    }
  });

  // Grooming settings routes
  app.get("/api/admin/grooming-settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const settings = await storage.getGroomingSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching grooming settings:", error);
      res.status(500).json({ message: "Failed to fetch grooming settings" });
    }
  });

  app.put("/api/admin/grooming-settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { setting, value } = req.body;
      
      if (!setting || !value) {
        return res.status(400).json({ message: "Setting and value are required" });
      }

      const updatedSetting = await storage.upsertGroomingSetting({ setting, value });
      res.json(updatedSetting);
    } catch (error) {
      console.error("Error updating grooming setting:", error);
      res.status(500).json({ message: "Failed to update grooming setting" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
