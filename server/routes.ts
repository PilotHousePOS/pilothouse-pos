import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
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
  // Auth middleware
  await setupAuth(app);

  // Simple demo login route
  app.post('/api/demo-login', async (req, res) => {
    try {
      console.log('Demo login request received');
      
      // Create demo user object
      const demoUser = {
        id: 'demo-user',
        email: 'demo@animalhouse.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
        isAdmin: true,
      };
      
      // Set session
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.status(500).json({ message: "Session error" });
        }
        
        (req.session as any).user = demoUser;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: "Session save failed" });
          }
          
          console.log('Session saved successfully, user:', demoUser);
          res.json(demoUser);
        });
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Demo login failed" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', async (req, res) => {
    try {
      console.log('Session check:', req.session);
      const sessionUser = (req.session as any)?.user;
      console.log('Session user:', sessionUser);
      if (!sessionUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      res.json(sessionUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Pet routes
  app.get("/api/pets", async (req, res) => {
    try {
      const { species } = req.query;
      const pets = species 
        ? await storage.getPetsBySpecies(species as string)
        : await storage.getAllPets();
      res.json(pets);
    } catch (error) {
      console.error("Error fetching pets:", error);
      res.status(500).json({ message: "Failed to fetch pets" });
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

  app.post("/api/pets", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
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

  app.put("/api/pets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
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

  app.delete("/api/pets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
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

  // Supply routes
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
      res.status(500).json({ message: "Failed to fetch supplies" });
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

  app.post("/api/supplies", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
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

  // Cart routes
  app.get("/api/cart", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.put("/api/cart/:id", isAuthenticated, async (req: any, res) => {
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

  app.delete("/api/cart/:id", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.post("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.get("/api/appointments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.post("/api/appointments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.put("/api/appointments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
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
  app.get("/api/customer-pets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const pets = await storage.getCustomerPets(userId);
      res.json(pets);
    } catch (error) {
      console.error("Error fetching customer pets:", error);
      res.status(500).json({ message: "Failed to fetch customer pets" });
    }
  });

  app.post("/api/customer-pets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  const httpServer = createServer(app);
  return httpServer;
}
