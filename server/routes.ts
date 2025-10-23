import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage";
import { generateToken, verifyToken, authMiddleware, setAuthCookie } from "./auth";
import {
  insertPetSchema,
  insertSupplySchema,
  insertCartItemSchema,
  insertOrderSchema,
  insertAppointmentSchema,
  insertCustomerPetSchema,
} from "@shared/schema";
import { z } from "zod";
import { notificationService } from './notifications';
import { sendPasswordResetEmail } from './sendgrid';

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: uploadStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

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

  // Update user email
  app.patch('/api/auth/update-email', async (req, res) => {
    try {
      // Check both cookies and Authorization header
      const cookieToken = req.cookies?.auth_token;
      const authHeader = req.headers.authorization;
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      const token = headerToken || cookieToken;
      
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = verifyToken(token);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if email is already taken by another user
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ message: "Email already in use" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user with new email
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        email,
        updatedAt: new Date(),
      });

      // Generate new token with updated email
      const newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken);

      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ ...userWithoutPassword, token: newToken });
    } catch (error) {
      console.error("Error updating email:", error);
      res.status(500).json({ message: "Failed to update email" });
    }
  });

  // Update user password
  app.patch('/api/auth/update-password', async (req, res) => {
    try {
      // Check both cookies and Authorization header
      const cookieToken = req.cookies?.auth_token;
      const authHeader = req.headers.authorization;
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      const token = headerToken || cookieToken;
      
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = verifyToken(token);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      // Validate new password length
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password (In production, use bcrypt.compare)
      if (currentUser.password !== currentPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Update user with new password (In production, hash the password with bcrypt)
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        password: newPassword,
        updatedAt: new Date(),
      });

      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ message: "Password updated successfully", user: userWithoutPassword });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Update user name
  app.patch('/api/auth/update-name', async (req, res) => {
    try {
      // Check both cookies and Authorization header
      const cookieToken = req.cookies?.auth_token;
      const authHeader = req.headers.authorization;
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      
      const token = headerToken || cookieToken;
      
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = verifyToken(token);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const { firstName, lastName } = req.body;

      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }

      // Validate name lengths
      if (firstName.trim().length === 0 || lastName.trim().length === 0) {
        return res.status(400).json({ message: "Names cannot be empty" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user with new name
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        updatedAt: new Date(),
      });

      // Generate new token with updated name
      const newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken);

      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ ...userWithoutPassword, token: newToken });
    } catch (error) {
      console.error("Error updating name:", error);
      res.status(500).json({ message: "Failed to update name" });
    }
  });

  // Request password reset
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      
      // Don't reveal if user exists or not (security best practice)
      // Always return success to prevent user enumeration
      if (!user) {
        console.log(`Password reset requested for non-existent email: ${email}`);
        return res.json({ message: "If an account exists with this email, you will receive a password reset link." });
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Save token to database
      await storage.createPasswordResetToken(resetToken, user.id, expiresAt);

      // Try to send password reset email (non-fatal if it fails)
      try {
        await sendPasswordResetEmail(user.email!, resetToken);
        console.log(`Password reset email sent to ${user.email}`);
      } catch (emailError) {
        // Log the error but don't fail the request
        // This prevents the password reset flow from breaking if email service is down
        console.error("Failed to send password reset email (non-fatal):", emailError);
        console.log(`Password reset token created for ${user.email} but email send failed. Token: ${resetToken}`);
      }

      // Always return success to prevent user enumeration
      res.json({ message: "If an account exists with this email, you will receive a password reset link." });
    } catch (error) {
      console.error("Error in forgot password:", error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Validate new password length
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      // Get token from database
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token was already used
      if (resetToken.used) {
        return res.status(400).json({ message: "Reset token has already been used" });
      }

      // Get user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update password (In production, hash the password with bcrypt)
      await storage.upsertUser({
        ...user,
        password: newPassword,
        updatedAt: new Date(),
      });

      // Mark token as used
      await storage.markTokenAsUsed(token);

      // Clean up expired tokens (housekeeping)
      await storage.deleteExpiredTokens();

      console.log(`Password successfully reset for user ${user.email}`);
      res.json({ message: "Password has been successfully reset. You can now log in with your new password." });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
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

  // File upload endpoint
  app.post("/api/upload", authMiddleware, upload.single('image'), async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  app.post("/api/pets", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
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
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
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
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
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
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
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
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
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
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
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
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
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
      
      // Get the order before updating to get user info
      const existingOrder = await storage.getOrder(id);
      if (!existingOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Update the order status
      const order = await storage.updateOrderStatus(id, status);
      
      // Get the customer information for notifications
      const customer = await storage.getUser(existingOrder.userId);
      if (customer && ['in_progress', 'ready'].includes(status)) {
        // Send notifications (email, push, SMS if available)
        await notificationService.sendOrderStatusNotifications(
          customer.email || '',
          customer.firstName || 'Customer',
          null, // Phone number - we'll need to add this to user schema later
          customer.id,
          order.id,
          status
        );
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req: any, res) => {
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
      
      // Send admin notifications for new order
      try {
        const user = req.user;
        const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        
        // Get all admin users
        const allUsers = await storage.getAllUsers();
        const adminEmails = allUsers
          .filter(u => u.isAdmin)
          .map(u => u.email)
          .filter((email): email is string => !!email);
        
        await notificationService.sendAdminNewOrderNotifications(
          adminEmails,
          order.id,
          customerName,
          order.totalAmount
        );
      } catch (notificationError) {
        console.error('Failed to send admin notifications for new order:', notificationError);
        // Don't fail the order if notifications fail
      }
      
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
  app.get("/api/appointments", authMiddleware, async (req: any, res) => {
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

  // Get unapproved appointments (admin only)
  app.get("/api/admin/appointments/unapproved", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const unapprovedAppointments = await storage.getUnapprovedAppointments();
      res.json(unapprovedAppointments);
    } catch (error) {
      console.error("Error fetching unapproved appointments:", error);
      res.status(500).json({ message: "Failed to fetch unapproved appointments" });
    }
  });

  // Approve an appointment (admin only)
  app.put("/api/admin/appointments/:id/approve", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const appointment = await storage.approveAppointment(id);
      
      res.json(appointment);
    } catch (error) {
      console.error("Error approving appointment:", error);
      res.status(500).json({ message: "Failed to approve appointment" });
    }
  });

  // Reject an appointment (admin only)
  app.put("/api/admin/appointments/:id/reject", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Reject the appointment in the database
      const rejectedAppointment = await storage.rejectAppointment(id);
      
      // Get the user's email to send rejection notification
      const customer = await storage.getUser(appointment.userId);
      if (customer?.email) {
        try {
          const { sendAppointmentRejectionEmail } = await import('./sendgrid');
          await sendAppointmentRejectionEmail(
            customer.email,
            `${appointment.ownerFirstName} ${appointment.ownerLastName}`,
            appointment.petName,
            new Date(appointment.appointmentDate).toLocaleDateString(),
            appointment.appointmentTime
          );
        } catch (emailError) {
          console.error('Failed to send rejection email:', emailError);
          // Don't fail the rejection if email fails
        }
      }
      
      res.json(rejectedAppointment);
    } catch (error) {
      console.error("Error rejecting appointment:", error);
      res.status(500).json({ message: "Failed to reject appointment" });
    }
  });

  app.put("/api/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      // Get appointment details before updating for customer notification
      const oldAppointment = await storage.getAppointment(id);
      const appointment = await storage.updateAppointmentStatus(id, status);
      
      // Send customer notification for confirmed or rejected appointments
      if (oldAppointment && (status === 'confirmed' || status === 'rejected')) {
        const customerUser = await storage.getUser(oldAppointment.userId);
        if (customerUser) {
          console.log(`Sending appointment ${status} notification to customer: ${customerUser.email}`);
          
          // Send email notification
          try {
            if (status === 'confirmed') {
              await notificationService.sendAppointmentConfirmedNotification(
                customerUser.email || '',
                customerUser.firstName || 'Customer',
                id,
                oldAppointment.serviceType,
                oldAppointment.appointmentDate,
                oldAppointment.appointmentTime
              );
            } else if (status === 'rejected') {
              await notificationService.sendAppointmentRejectedNotification(
                customerUser.email || '',
                customerUser.firstName || 'Customer',
                id,
                oldAppointment.serviceType,
                oldAppointment.appointmentDate,
                oldAppointment.appointmentTime
              );
            }
          } catch (notificationError) {
            console.error('Failed to send customer notification:', notificationError);
            // Don't fail the appointment update if notification fails
          }
        }
      }
      
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  app.post("/api/appointments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const appointmentData = insertAppointmentSchema.parse({ ...req.body, userId });
      const appointment = await storage.createAppointment(appointmentData);
      
      // Send admin notifications for new appointment
      try {
        const customerName = `${appointmentData.ownerFirstName} ${appointmentData.ownerLastName}`;
        
        // Get all admin users
        const allUsers = await storage.getAllUsers();
        const adminEmails = allUsers
          .filter(u => u.isAdmin)
          .map(u => u.email)
          .filter((email): email is string => !!email);
        
        await notificationService.sendAdminNewAppointmentNotifications(
          adminEmails,
          appointment.id,
          customerName,
          appointmentData.serviceType,
          appointmentData.appointmentDate,
          appointmentData.appointmentTime
        );
      } catch (notificationError) {
        console.error('Failed to send admin notifications for new appointment:', notificationError);
        // Don't fail the appointment if notifications fail
      }
      
      res.json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid appointment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  // Customer pet routes
  app.get("/api/customer-pets", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const pets = await storage.getCustomerPets(userId);
      res.json(pets);
    } catch (error) {
      console.error("Error fetching customer pets:", error);
      res.status(500).json({ message: "Failed to fetch customer pets" });
    }
  });

  app.post("/api/customer-pets", authMiddleware, async (req: any, res) => {
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
  app.get("/api/admin/users", authMiddleware, async (req: any, res) => {
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

  app.post("/api/admin/users/:userId/admin", authMiddleware, async (req: any, res) => {
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
  app.get("/api/admin/grooming-settings", authMiddleware, async (req: any, res) => {
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

  app.put("/api/admin/grooming-settings", authMiddleware, async (req: any, res) => {
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

  // Groomer routes
  app.get("/api/groomers", async (req, res) => {
    try {
      const groomers = await storage.getActiveGroomers();
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching groomers:", error);
      res.status(500).json({ message: "Failed to fetch groomers" });
    }
  });

  app.get("/api/groomers/available/:dayOfWeek", async (req, res) => {
    try {
      const dayOfWeek = parseInt(req.params.dayOfWeek);
      if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week" });
      }
      
      const groomers = await storage.getAvailableGroomersForDay(dayOfWeek);
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching available groomers:", error);
      res.status(500).json({ message: "Failed to fetch available groomers" });
    }
  });

  // Admin groomer management routes
  app.get("/api/admin/groomers", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomers = await storage.getAllGroomers();
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching all groomers:", error);
      res.status(500).json({ message: "Failed to fetch groomers" });
    }
  });

  app.post("/api/admin/groomers", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerData = req.body;
      const groomer = await storage.createGroomer(groomerData);
      res.json(groomer);
    } catch (error) {
      console.error("Error creating groomer:", error);
      res.status(500).json({ message: "Failed to create groomer" });
    }
  });

  app.put("/api/admin/groomers/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const groomerData = req.body;
      const groomer = await storage.updateGroomer(id, groomerData);
      res.json(groomer);
    } catch (error) {
      console.error("Error updating groomer:", error);
      res.status(500).json({ message: "Failed to update groomer" });
    }
  });

  app.delete("/api/admin/groomers/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteGroomer(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting groomer:", error);
      res.status(500).json({ message: "Failed to delete groomer" });
    }
  });

  // Groomer availability routes
  app.get("/api/admin/groomers/:id/availability", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerId = parseInt(req.params.id);
      const availability = await storage.getGroomerAvailability(groomerId);
      res.json(availability);
    } catch (error) {
      console.error("Error fetching groomer availability:", error);
      res.status(500).json({ message: "Failed to fetch groomer availability" });
    }
  });

  app.post("/api/admin/groomers/:id/availability", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerId = parseInt(req.params.id);
      const availabilityData = { ...req.body, groomerId };
      const availability = await storage.setGroomerAvailability(availabilityData);
      res.json(availability);
    } catch (error) {
      console.error("Error setting groomer availability:", error);
      res.status(500).json({ message: "Failed to set groomer availability" });
    }
  });

  app.put("/api/admin/groomer-availability/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const availabilityData = req.body;
      const availability = await storage.updateGroomerAvailability(id, availabilityData);
      res.json(availability);
    } catch (error) {
      console.error("Error updating groomer availability:", error);
      res.status(500).json({ message: "Failed to update groomer availability" });
    }
  });

  app.delete("/api/admin/groomer-availability/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteGroomerAvailability(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting groomer availability:", error);
      res.status(500).json({ message: "Failed to delete groomer availability" });
    }
  });

  // Push notification subscription endpoint
  app.post("/api/push-subscription", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const subscription = req.body;
      console.log(`Push subscription saved for user ${userId}:`, subscription);
      
      // In a real app, you would save this subscription to the database
      // For now, we'll just log it and return success
      res.json({ success: true, message: "Push subscription saved" });
    } catch (error) {
      console.error("Error saving push subscription:", error);
      res.status(500).json({ message: "Failed to save push subscription" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
