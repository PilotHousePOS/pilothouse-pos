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
  users,
} from "@shared/schema";
import { z } from "zod";
import { notificationService } from './notifications';
import { sendPasswordResetEmail } from './sendgrid';
import { getUpcomingEvents, getAllCalendarContacts, createCalendarEvent, getEventsForDate, getGoogleContacts } from './googleCalendar';
import { normalizePhoneNumber } from './phoneUtils';
import { db } from './db';
import { eq } from 'drizzle-orm';

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
      const { email, password, firstName, lastName, phoneNumber } = req.body;
      
      if (!email || !password || !firstName || !lastName || !phoneNumber) {
        return res.status(400).json({ message: "All fields including phone number are required" });
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

      // Phone number is now required - update user and link to any existing contacts
      const { phoneNumbersMatch } = await import("./phoneUtils");
      
      // Update user with phone number
      await db.update(users).set({ phoneNumber }).where(eq(users.id, newUser.id));
      
      // Find and link any existing contacts with matching phone number
      // This will also replace temp emails with user's real email
      const matchingContacts = await storage.findUnlinkedContactsByPhoneNumber(phoneNumber);
      
      for (const contact of matchingContacts) {
        await storage.linkContactToUser(contact.id, newUser.id);
        console.log(`Linked contact ${contact.id} to user ${newUser.id}, replaced temp email with ${email}`);
      }

      console.log(`Linked ${matchingContacts.length} contacts to new user ${newUser.id}`)

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

  // Supply routes with pagination
  app.get("/api/supplies", async (req, res) => {
    try {
      const { category, search, page = '0', limit = '24' } = req.query;
      
      // Parse pagination parameters with defaults
      const pageNum = Math.max(0, parseInt(page as string) || 0);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 24));
      const offset = pageNum * pageSize;

      // Determine filter type based on category parameter
      let filterType: 'reptile' | 'aquatic' | undefined;
      if (category === 'reptile-supplies') {
        filterType = 'reptile';
      } else if (category === 'aquatic-supplies') {
        filterType = 'aquatic';
      }
      
      // Use paginated query
      // Note: Don't pass category when filterType is set, as Aquatics/Reptiles use brand/keyword matching, not DB categories
      const { items, total } = await storage.getPaginatedSupplies({
        limit: pageSize,
        offset,
        category: filterType ? undefined : (category as string | undefined),
        search: search as string | undefined,
        filterType
      });

      // Return paginated response with metadata
      res.json({
        items,
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      });
    } catch (error) {
      console.error("Error fetching supplies:", error);
      res.status(500).json({ 
        message: "Failed to fetch supplies",
        items: [],
        total: 0,
        page: 0,
        pageSize: 24,
        totalPages: 0
      });
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

  app.delete("/api/admin/orders/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const orderId = parseInt(req.params.orderId);
      await storage.deleteOrder(orderId);
      
      res.json({ message: "Order deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting order:", error);
      if (error.message === 'Order not found') {
        return res.status(404).json({ message: "Order not found" });
      }
      res.status(500).json({ message: "Failed to delete order" });
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

  // Get order details with items
  app.get("/api/orders/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const orderId = parseInt(req.params.id);
      
      const orderWithItems = await storage.getOrderWithItems(orderId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Check if user owns this order or is admin
      const user = await storage.getUser(userId);
      if (orderWithItems.order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(orderWithItems);
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({ message: "Failed to fetch order details" });
    }
  });

  // Wishlist routes
  app.get("/api/wishlist", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const wishlistItems = await storage.getWishlistItems(userId);
      res.json(wishlistItems);
    } catch (error) {
      console.error("Error fetching wishlist:", error);
      res.status(500).json({ message: "Failed to fetch wishlist" });
    }
  });

  app.post("/api/wishlist", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { supplyId, petId } = req.body;
      
      if (!supplyId && !petId) {
        return res.status(400).json({ message: "Either supplyId or petId is required" });
      }
      
      const wishlistItem = await storage.addToWishlist({ userId, supplyId, petId });
      res.json(wishlistItem);
    } catch (error) {
      console.error("Error adding to wishlist:", error);
      res.status(500).json({ message: "Failed to add to wishlist" });
    }
  });

  app.delete("/api/wishlist/:id", authMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      
      const removed = await storage.removeFromWishlist(id, userId);
      
      if (!removed) {
        return res.status(404).json({ message: "Wishlist item not found or access denied" });
      }
      
      res.json({ message: "Item removed from wishlist" });
    } catch (error) {
      console.error("Error removing from wishlist:", error);
      res.status(500).json({ message: "Failed to remove from wishlist" });
    }
  });

  // Appointment routes
  app.get("/api/appointments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      // Both admins and groomers can see all appointments
      const appointments = (user?.isAdmin || user?.isGroomer)
        ? await storage.getAppointments()
        : await storage.getAppointments(userId);
      
      // Filter out old approved/completed/cancelled/rejected appointments (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const filteredAppointments = appointments.filter((apt: any) => {
        // Keep all scheduled appointments regardless of isApproved value
        if (apt.status === 'scheduled') {
          return true;
        }
        
        // For confirmed, completed, cancelled, or rejected appointments: only keep recent ones (within 30 days)
        if (apt.status === 'confirmed' || apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'rejected') {
          const appointmentDate = new Date(apt.appointmentDate);
          return appointmentDate >= thirtyDaysAgo;
        }
        
        // Keep all other appointments
        return true;
      });
      
      res.json(filteredAppointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // Get unapproved appointments (admin and groomer access)
  app.get("/api/admin/appointments/unapproved", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
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
          // Use sendgrid.ts (same as password reset - uses connector)
          const { sendAppointmentRejectionEmail } = await import('./sendgrid');
          const ownerName = appointment.ownerFirstName 
            ? `${appointment.ownerFirstName} ${appointment.ownerLastName}`
            : appointment.ownerLastName;
          
          await sendAppointmentRejectionEmail(
            customer.email,
            ownerName,
            appointment.petName,
            new Date(appointment.appointmentDate).toLocaleDateString(),
            appointment.appointmentTime
          );
          console.log(`Rejection email sent successfully to ${customer.email} for appointment #${id}`);
        } catch (emailError) {
          console.error(`Failed to send rejection email for appointment #${id}:`, emailError);
          // Don't fail the rejection if email fails
        }
      } else {
        console.warn(`No customer email found for appointment #${id} (userId: ${appointment.userId})`);
      }
      
      res.json(rejectedAppointment);
    } catch (error) {
      console.error("Error rejecting appointment:", error);
      res.status(500).json({ message: "Failed to reject appointment" });
    }
  });

  // Retry sending rejection email for an appointment (admin only)
  app.post("/api/admin/appointments/:id/resend-rejection-email", authMiddleware, async (req: any, res) => {
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

      // Get the user's email
      const customer = await storage.getUser(appointment.userId);
      if (!customer?.email) {
        return res.status(400).json({ message: "No customer email found for this appointment" });
      }

      // Use sendgrid.ts (same as password reset - uses connector)
      const { sendAppointmentRejectionEmail } = await import('./sendgrid');
      const ownerName = appointment.ownerFirstName 
        ? `${appointment.ownerFirstName} ${appointment.ownerLastName}`
        : appointment.ownerLastName;
      
      await sendAppointmentRejectionEmail(
        customer.email,
        ownerName,
        appointment.petName,
        new Date(appointment.appointmentDate).toLocaleDateString(),
        appointment.appointmentTime
      );
      
      console.log(`Rejection email resent successfully to ${customer.email} for appointment #${id}`);
      res.json({ message: "Rejection email sent successfully", email: customer.email });
    } catch (error) {
      console.error("Error resending rejection email:", error);
      res.status(500).json({ message: "Failed to send rejection email", error: (error as Error).message });
    }
  });

  // Delete an appointment (admin only)
  app.delete("/api/admin/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteAppointment(id);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ message: "Failed to delete appointment" });
    }
  });

  // Update appointment notes and price (admin and groomer)
  app.patch("/api/admin/appointments/:id/details", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { ownerFirstName, ownerLastName, ownerPhoneNumber, petName, petType, specialNotes, price, appointmentDate, appointmentTime, groomerId, serviceType } = req.body;
      console.log(`Updating appointment ${id} - Date: ${appointmentDate}, Time: ${appointmentTime}`);

      // Get the current appointment to get the old phone number
      const currentAppointment = await storage.getAppointment(id);
      if (!currentAppointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Validate price if provided
      if (price !== undefined) {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ message: "Price must be a valid positive number" });
        }
      }

      // Build update object with only provided fields
      const updates: { 
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
      } = {};
      
      if (ownerFirstName !== undefined) updates.ownerFirstName = ownerFirstName;
      if (ownerLastName !== undefined) updates.ownerLastName = ownerLastName;
      if (ownerPhoneNumber !== undefined) updates.ownerPhoneNumber = ownerPhoneNumber;
      if (petName !== undefined) updates.petName = petName;
      if (petType !== undefined) updates.petType = petType;
      if (specialNotes !== undefined) updates.specialNotes = specialNotes;
      if (price !== undefined) updates.price = price;
      if (appointmentDate !== undefined) updates.appointmentDate = appointmentDate;
      if (appointmentTime !== undefined) updates.appointmentTime = appointmentTime;
      if (groomerId !== undefined) updates.groomerId = groomerId;
      if (serviceType !== undefined) updates.serviceType = serviceType;

      const appointment = await storage.updateAppointmentDetails(id, updates);
      
      // Update corresponding contact if phone number fields were changed
      if (ownerFirstName !== undefined || ownerLastName !== undefined || ownerPhoneNumber !== undefined || petName !== undefined || petType !== undefined) {
        try {
          // Determine which phone number to use for finding the contact
          const oldPhone = currentAppointment.ownerPhoneNumber;
          const newPhone = ownerPhoneNumber || currentAppointment.ownerPhoneNumber;
          
          // Try to find contact by old phone number first
          const normalizedOldPhone = normalizePhoneNumber(oldPhone);
          const allContacts = await storage.getAllContacts();
          let contact = allContacts.find((c: any) => normalizePhoneNumber(c.phoneNumber || '') === normalizedOldPhone);
          
          if (contact) {
            // Update the contact with new information
            const contactUpdates: any = {};
            
            if (ownerFirstName !== undefined || ownerLastName !== undefined) {
              const firstName = ownerFirstName || currentAppointment.ownerFirstName;
              const lastName = ownerLastName || currentAppointment.ownerLastName;
              contactUpdates.name = `${firstName} ${lastName}`;
            }
            
            if (ownerPhoneNumber !== undefined) {
              contactUpdates.phoneNumber = ownerPhoneNumber;
            }
            
            if (petType !== undefined) {
              contactUpdates.animalType = petType;
            }
            
            // Collect all unique pet names from appointments with this phone number
            if (petName !== undefined || ownerPhoneNumber !== undefined) {
              const phoneToCheck = newPhone;
              const appointmentsForPhone = await storage.getAppointmentsByPhoneNumber(phoneToCheck);
              const uniquePetNames = [...new Set(appointmentsForPhone.map((apt: any) => apt.petName).filter(Boolean))];
              if (uniquePetNames.length > 0) {
                contactUpdates.petNames = uniquePetNames;
              }
            }
            
            if (Object.keys(contactUpdates).length > 0) {
              await storage.updateContact(contact.id, contactUpdates);
              console.log(`Updated contact ${contact.id} based on appointment ${id} changes`);
            }
          }
        } catch (contactError) {
          console.error("Error updating corresponding contact:", contactError);
          // Don't fail the appointment update if contact update fails
        }
      }
      
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment details:", error);
      res.status(500).json({ message: "Failed to update appointment details" });
    }
  });

  app.put("/api/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      // Get appointment details before updating for customer notification
      const oldAppointment = await storage.getAppointment(id);
      
      // Groomers can only edit already-approved appointments, not approve pending ones
      if (user?.isGroomer && !user?.isAdmin && oldAppointment?.status === 'scheduled') {
        return res.status(403).json({ message: "Only admins can approve pending appointments" });
      }
      
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

  app.patch("/api/appointments/:id/is-here", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { isHere } = req.body;
      
      if (typeof isHere !== 'boolean') {
        return res.status(400).json({ message: "isHere must be a boolean" });
      }

      const appointment = await storage.updateAppointmentIsHere(id, isHere);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment arrival status:", error);
      res.status(500).json({ message: "Failed to update appointment arrival status" });
    }
  });

  app.patch("/api/appointments/:id/is-paid", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { isPaid } = req.body;
      
      if (typeof isPaid !== 'boolean') {
        return res.status(400).json({ message: "isPaid must be a boolean" });
      }

      const appointment = await storage.updateAppointmentIsPaid(id, isPaid);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment payment status:", error);
      res.status(500).json({ message: "Failed to update appointment payment status" });
    }
  });

  app.post("/api/appointments", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Check if user is admin
      const user = await storage.getUser(userId);
      const isAdmin = user?.isAdmin;
      const isAdminOrGroomer = user?.isAdmin || user?.isGroomer;
      
      // Validate same-day booking restriction for customers (not admins/groomers)
      if (!isAdminOrGroomer) {
        const appointmentDate = new Date(req.body.appointmentDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        appointmentDate.setHours(0, 0, 0, 0);
        
        if (appointmentDate <= today) {
          return res.status(400).json({ 
            message: "Same-day appointments are not allowed. Please book for tomorrow or later." 
          });
        }
      }

      // Check special date settings first (overrides weekly limits)
      const appointmentDate = new Date(req.body.appointmentDate);
      const appointmentDateStr = appointmentDate.toISOString().split('T')[0];
      const specialDate = await storage.getSpecialDateWithTimes(appointmentDateStr);
      
      if (specialDate) {
        // This is a special date - only allowed times can be booked
        const requestedTime = req.body.appointmentTime;
        const allowedTimes = specialDate.times.map((t: any) => t.allowedTime);
        
        if (!allowedTimes.includes(requestedTime)) {
          return res.status(400).json({
            message: `This is a special date (${specialDate.setting.name}). Only the following times are available: ${allowedTimes.join(', ')}`
          });
        }
      }

      // Check weekly appointment limits for the selected day of week
      const dayOfWeek = appointmentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      
      // Get weekly limit for this day of week (1-6 for Monday-Saturday)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
        
        if (weeklyLimit) {
          // Count existing appointments for this date by service type
          // Include all appointments except cancelled/rejected ones
          const allAppointments = await storage.getAppointments();
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
            return aptDateStr === appointmentDateStr && 
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          
          const bathAppointments = appointmentsOnDate.filter((apt: any) => apt.serviceType === 'grooming-bath').length;
          const groomAppointments = appointmentsOnDate.filter((apt: any) => apt.serviceType === 'grooming-full').length;
          
          // Check if limit is exceeded
          const serviceType = req.body.serviceType;
          if (serviceType === 'grooming-bath' && bathAppointments >= weeklyLimit.maxBathAppointments) {
            return res.status(400).json({
              message: `Bath appointments are fully booked for this date (limit: ${weeklyLimit.maxBathAppointments}). Please select a different date.`
            });
          }
          
          if (serviceType === 'grooming-full' && groomAppointments >= weeklyLimit.maxGroomAppointments) {
            return res.status(400).json({
              message: `Full grooming appointments are fully booked for this date (limit: ${weeklyLimit.maxGroomAppointments}). Please select a different date.`
            });
          }
        }
      }
      
      // Admin-created appointments bypass approval, others require approval
      const appointmentData = insertAppointmentSchema.parse({ 
        ...req.body, 
        userId,
        isApproved: isAdmin ? true : false,
        status: isAdmin ? 'confirmed' : 'scheduled'
      });
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
    } catch (error: any) {
      console.error("Error updating user admin status:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to update user admin status" });
    }
  });

  app.post("/api/admin/users/:userId/groomer", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const { isGroomer } = req.body;

      if (typeof isGroomer !== 'boolean') {
        return res.status(400).json({ message: "isGroomer must be a boolean" });
      }

      const updatedUser = await storage.updateUserGroomer(userId, isGroomer);
      const { password, ...safeUser } = updatedUser;
      
      res.json(safeUser);
    } catch (error: any) {
      console.error("Error updating user groomer status:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to update user groomer status" });
    }
  });

  app.delete("/api/admin/users/:userId", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;

      // Prevent admin from deleting themselves
      if (req.user.id === userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(userId);
      
      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      if (error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(500).json({ message: "Failed to delete user" });
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

  // Daily appointment limit routes
  app.get("/api/admin/daily-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limits = await storage.getAllDailyAppointmentLimits();
      res.json(limits);
    } catch (error) {
      console.error("Error fetching daily limits:", error);
      res.status(500).json({ message: "Failed to fetch daily limits" });
    }
  });

  app.get("/api/admin/daily-limits/:date", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const limit = await storage.getDailyAppointmentLimit(req.params.date);
      res.json(limit || null);
    } catch (error) {
      console.error("Error fetching daily limit:", error);
      res.status(500).json({ message: "Failed to fetch daily limit" });
    }
  });

  app.post("/api/admin/daily-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { date, maxBathAppointments, maxGroomAppointments } = req.body;
      
      if (!date || maxBathAppointments === undefined || maxGroomAppointments === undefined) {
        return res.status(400).json({ message: "Date, maxBathAppointments, and maxGroomAppointments are required" });
      }

      const limit = await storage.upsertDailyAppointmentLimit({
        date,
        maxBathAppointments,
        maxGroomAppointments,
      });
      
      res.json(limit);
    } catch (error) {
      console.error("Error upserting daily limit:", error);
      res.status(500).json({ message: "Failed to update daily limit" });
    }
  });

  app.delete("/api/admin/daily-limits/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteDailyAppointmentLimit(parseInt(req.params.id));
      res.json({ message: "Daily limit deleted successfully" });
    } catch (error) {
      console.error("Error deleting daily limit:", error);
      res.status(500).json({ message: "Failed to delete daily limit" });
    }
  });

  // Weekly appointment limit routes (day of week based)
  app.get("/api/admin/weekly-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const limits = await storage.getAllWeeklyAppointmentLimits();
      res.json(limits);
    } catch (error) {
      console.error("Error fetching weekly limits:", error);
      res.status(500).json({ message: "Failed to fetch weekly limits" });
    }
  });

  app.get("/api/admin/weekly-limits/:dayOfWeek", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin && !req.user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const dayOfWeek = parseInt(req.params.dayOfWeek);
      if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week (must be 1-6 for Monday-Saturday)" });
      }

      const limit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
      res.json(limit || null);
    } catch (error) {
      console.error("Error fetching weekly limit:", error);
      res.status(500).json({ message: "Failed to fetch weekly limit" });
    }
  });

  app.post("/api/admin/weekly-limits", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { dayOfWeek, maxBathAppointments, maxGroomAppointments } = req.body;
      
      if (dayOfWeek === undefined || maxBathAppointments === undefined || maxGroomAppointments === undefined) {
        return res.status(400).json({ message: "dayOfWeek, maxBathAppointments, and maxGroomAppointments are required" });
      }

      if (dayOfWeek < 1 || dayOfWeek > 6) {
        return res.status(400).json({ message: "Invalid day of week (must be 1-6 for Monday-Saturday)" });
      }

      const limit = await storage.upsertWeeklyAppointmentLimit({
        dayOfWeek,
        maxBathAppointments,
        maxGroomAppointments,
      });
      
      res.json(limit);
    } catch (error) {
      console.error("Error upserting weekly limit:", error);
      res.status(500).json({ message: "Failed to update weekly limit" });
    }
  });

  app.delete("/api/admin/weekly-limits/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteWeeklyAppointmentLimit(parseInt(req.params.id));
      res.json({ message: "Weekly limit deleted successfully" });
    } catch (error) {
      console.error("Error deleting weekly limit:", error);
      res.status(500).json({ message: "Failed to delete weekly limit" });
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
      
      // Try to link groomer with existing user account by email or phone
      if (groomerData.email || groomerData.phone) {
        try {
          const allUsers = await storage.getAllUsers();
          let matchingUser = null;
          
          // Find user by email or phone
          if (groomerData.email) {
            matchingUser = allUsers.find((u: any) => 
              u.email?.toLowerCase() === groomerData.email.toLowerCase()
            );
          }
          
          if (!matchingUser && groomerData.phone) {
            const normalizedGroomerPhone = normalizePhoneNumber(groomerData.phone);
            matchingUser = allUsers.find((u: any) => 
              u.phone && normalizePhoneNumber(u.phone) === normalizedGroomerPhone
            );
          }
          
          // If matching user found, grant them groomer privileges
          if (matchingUser && !matchingUser.isGroomer) {
            await storage.updateUserGroomer(matchingUser.id, true);
            console.log(`Linked groomer ${groomer.id} to user account ${matchingUser.id} (${matchingUser.email})`);
          }
        } catch (linkError) {
          console.error("Error linking groomer to user account:", linkError);
          // Don't fail the groomer creation if linking fails
        }
      }
      
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

  // Google Calendar routes
  app.get("/api/admin/calendar/events", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const maxResults = req.query.maxResults ? parseInt(req.query.maxResults as string) : 10;
      const events = await getUpcomingEvents(maxResults);
      
      // Fetch all contacts to link with event attendees
      const allContacts = await storage.getAllContacts();
      
      // Enhance events with contact information
      const eventsWithContacts = events.map((event: any) => {
        // Find contacts that match event attendees
        const linkedContacts: any[] = [];
        if (event.attendees && Array.isArray(event.attendees)) {
          event.attendees.forEach((attendee: any) => {
            const matchingContact = allContacts.find((c: any) => 
              c.email?.toLowerCase() === attendee.email?.toLowerCase()
            );
            if (matchingContact) {
              linkedContacts.push({
                name: matchingContact.name,
                email: matchingContact.email,
                animalType: matchingContact.animalType,
                breed: matchingContact.breed,
              });
            }
          });
        }
        
        return {
          ...event,
          linkedContacts,
        };
      });
      
      res.json(eventsWithContacts);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar events", error: (error as Error).message });
    }
  });

  app.get("/api/admin/calendar/contacts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Note: The Google Calendar connector does not include People API scopes,
      // so we cannot fetch real Google Contacts. Instead, we extract contacts
      // from calendar event attendees which works with existing OAuth scopes.
      const contacts = await getAllCalendarContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching calendar contacts:", error);
      res.status(500).json({ message: "Failed to fetch calendar contacts", error: (error as Error).message });
    }
  });

  // Manual contacts CRUD operations
  app.get("/api/contacts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contacts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { name, email, phoneNumber, petNames, notes, animalType, breed } = req.body;
      const trimmedName = name?.trim();
      const trimmedEmail = email?.trim();
      const trimmedPhone = phoneNumber?.trim();
      
      if (!trimmedName) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (!trimmedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Use phone as placeholder for email if email is not provided
      const contactEmail = trimmedEmail && trimmedEmail.includes('@') ? trimmedEmail : trimmedPhone;

      const contact = await storage.createContact({ 
        name: trimmedName, 
        email: contactEmail, 
        phoneNumber: trimmedPhone,
        petNames: petNames || null,
        notes,
        animalType,
        breed 
      });
      res.json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.put("/api/contacts/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { name, email, phoneNumber, petNames, notes, animalType, breed } = req.body;
      const trimmedName = name?.trim();
      const trimmedEmail = email?.trim();
      const trimmedPhone = phoneNumber?.trim();
      
      if (trimmedName !== undefined && !trimmedName) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      if (trimmedPhone !== undefined && !trimmedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      // Use phone as placeholder for email if email is not provided or invalid
      let contactEmail = trimmedEmail;
      if (trimmedEmail !== undefined) {
        contactEmail = trimmedEmail && trimmedEmail.includes('@') ? trimmedEmail : trimmedPhone;
      }
      
      const contact = await storage.updateContact(id, { 
        name: trimmedName, 
        email: contactEmail, 
        phoneNumber: trimmedPhone,
        petNames: petNames !== undefined ? petNames : undefined,
        notes,
        animalType,
        breed 
      });
      res.json(contact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Get appointment history for a contact
  app.get("/api/contacts/:id/appointments", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      if (!contact.phoneNumber) {
        return res.json([]);
      }

      const appointments = await storage.getAppointmentsByPhoneNumber(contact.phoneNumber);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching contact appointments:", error);
      res.status(500).json({ message: "Failed to fetch contact appointments" });
    }
  });

  // Get appointment history for a contact (admin/groomer only)
  app.get("/api/contacts/:id/history", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const contactId = parseInt(req.params.id);
      const contact = await storage.getContact(contactId);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const history = await storage.getAppointmentHistoryByContactId(contactId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching contact appointment history:", error);
      res.status(500).json({ message: "Failed to fetch contact appointment history" });
    }
  });

  app.delete("/api/contacts/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteContact(id);
      res.json({ message: "Contact deleted successfully" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Create a new calendar event
  app.post("/api/admin/calendar/events", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { summary, description, startDateTime, endDateTime, attendees } = req.body;
      
      if (!summary || !startDateTime || !endDateTime) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Filter out attendees with invalid or missing emails
      const validAttendees = (attendees || []).filter((attendee: any) => {
        const email = attendee?.email?.trim();
        return email && email.includes('@');
      });

      const event = await createCalendarEvent({
        summary,
        description,
        startDateTime,
        endDateTime,
        attendees: validAttendees,
      });

      res.json(event);
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ message: "Failed to create calendar event", error: (error as Error).message });
    }
  });

  // Delete a calendar event
  app.delete("/api/admin/calendar/events/:eventId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { eventId } = req.params;
      
      if (!eventId) {
        return res.status(400).json({ message: "Event ID is required" });
      }

      const { deleteCalendarEvent } = await import('./googleCalendar');
      const result = await deleteCalendarEvent(eventId);

      res.json(result);
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ message: "Failed to delete calendar event", error: (error as Error).message });
    }
  });

  // Get calendar events for a specific date
  app.get("/api/admin/calendar/events/date", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or Groomer access required" });
      }

      const dateStr = req.query.date as string;
      if (!dateStr) {
        return res.status(400).json({ message: "Date parameter is required" });
      }

      const date = new Date(dateStr);
      const events = await getEventsForDate(date);
      
      // Fetch all contacts to link with event attendees
      const allContacts = await storage.getAllContacts();
      
      // Enhance events with contact information
      const eventsWithContacts = events.map((event: any) => {
        // Find contacts that match event attendees
        const linkedContacts: any[] = [];
        if (event.attendees && Array.isArray(event.attendees)) {
          event.attendees.forEach((attendee: any) => {
            const matchingContact = allContacts.find((c: any) => 
              c.email?.toLowerCase() === attendee.email?.toLowerCase()
            );
            if (matchingContact) {
              linkedContacts.push({
                name: matchingContact.name,
                email: matchingContact.email,
                animalType: matchingContact.animalType,
                breed: matchingContact.breed,
              });
            }
          });
        }
        
        return {
          ...event,
          linkedContacts,
        };
      });
      
      res.json(eventsWithContacts);
    } catch (error) {
      console.error("Error fetching events for date:", error);
      res.status(500).json({ message: "Failed to fetch events for date", error: (error as Error).message });
    }
  });

  // Sync contacts from Google Calendar events
  app.post("/api/admin/calendar/sync-contacts", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or Groomer access required" });
      }

      const { syncContactsFromCalendarEvents } = await import("./googleCalendar");
      const extractedContacts = await syncContactsFromCalendarEvents();
      
      const createdContacts = [];
      const { phoneNumbersMatch } = await import("./phoneUtils");

      for (const contactData of extractedContacts) {
        let existingContact = null;
        
        // Check if contact already exists by phone number (if available)
        if (contactData.phoneNumber) {
          existingContact = await storage.getContactByPhoneNumber(contactData.phoneNumber);
        }
        
        // If no phone match, check by email
        if (!existingContact && contactData.email) {
          const allContacts = await storage.getAllContacts();
          existingContact = allContacts.find((c: any) => 
            c.email?.toLowerCase() === contactData.email.toLowerCase() && 
            c.source === 'google_calendar'
          );
        }
        
        if (!existingContact) {
          const newContact = await storage.createContact({
            name: contactData.name,
            email: contactData.email,
            phoneNumber: contactData.phoneNumber || null,
            notes: contactData.notes,
            source: 'google_calendar',
          });
          createdContacts.push(newContact);
        }
      }

      res.json({ 
        message: `Synced ${createdContacts.length} new contacts from calendar`,
        contacts: createdContacts 
      });
    } catch (error) {
      console.error("Error syncing contacts from calendar:", error);
      res.status(500).json({ message: "Failed to sync contacts", error: (error as Error).message });
    }
  });

  // Clean up duplicate contacts (by normalized phone number)
  app.post("/api/admin/contacts/cleanup-duplicates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { normalizePhoneNumber } = await import("./phoneUtils");
      const allContacts = await storage.getAllContacts();
      
      // Group contacts by normalized phone number
      const phoneGroups = new Map<string, any[]>();
      
      for (const contact of allContacts) {
        if (!contact.phoneNumber) continue;
        
        const normalizedPhone = normalizePhoneNumber(contact.phoneNumber);
        if (!normalizedPhone || normalizedPhone.length < 10) continue;
        
        if (!phoneGroups.has(normalizedPhone)) {
          phoneGroups.set(normalizedPhone, []);
        }
        phoneGroups.get(normalizedPhone)!.push(contact);
      }
      
      // Find and delete duplicates (keep the oldest one)
      let deletedCount = 0;
      const duplicateGroups: any[] = [];
      
      for (const [phone, contacts] of Array.from(phoneGroups.entries())) {
        if (contacts.length > 1) {
          // Sort by creation date (oldest first)
          contacts.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          
          // Keep the first (oldest), delete the rest
          const toKeep = contacts[0];
          const toDelete = contacts.slice(1);
          
          duplicateGroups.push({
            phone,
            kept: { id: toKeep.id, name: toKeep.name, createdAt: toKeep.createdAt },
            deleted: toDelete.map((c: any) => ({ id: c.id, name: c.name, createdAt: c.createdAt }))
          });
          
          for (const contact of toDelete) {
            await storage.deleteContact(contact.id);
            deletedCount++;
          }
        }
      }
      
      res.json({ 
        message: `Cleaned up ${deletedCount} duplicate contacts`,
        deletedCount,
        duplicateGroups
      });
    } catch (error) {
      console.error("Error cleaning up duplicate contacts:", error);
      res.status(500).json({ message: "Failed to cleanup duplicates", error: (error as Error).message });
    }
  });

  // Sync appointments from Google Calendar (incremental sync)
  app.post("/api/admin/calendar/sync-appointments", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or Groomer access required" });
      }

      const { syncAppointmentsFromCalendarEvents } = await import("./googleCalendar");
      
      // First, clean up old Google Calendar appointments with "Not provided" phone numbers
      const allAppointments = await storage.getAppointments(); // Get all appointments (no userId filter)
      const appointmentsToDelete = allAppointments.filter((apt: any) => 
        apt.source === 'google_calendar' && 
        apt.ownerPhoneNumber === 'Not provided'
      );
      
      console.log(`Cleaning up ${appointmentsToDelete.length} old Google Calendar appointments with "Not provided" phone numbers`);
      for (const apt of appointmentsToDelete) {
        await storage.deleteAppointment(apt.id);
      }
      
      // Fetch calendar appointments
      console.log('Fetching Google Calendar events...');
      const calendarAppointments = await syncAppointmentsFromCalendarEvents();
      
      // Validate appointments data
      if (!Array.isArray(calendarAppointments)) {
        throw new Error('Invalid calendar data: expected array of appointments');
      }

      console.log(`Found ${calendarAppointments.length} calendar events`);

      // Get all existing appointments from Google Calendar (by googleEventId)
      const remainingAppointments = await storage.getAppointments(); // Get all appointments (no userId filter)
      const existingGoogleEventIds = new Set(
        remainingAppointments
          .filter((apt: any) => apt.googleEventId)
          .map((apt: any) => apt.googleEventId)
      );

      // Filter out appointments that already exist
      const newAppointments = calendarAppointments.filter((apt: any) => 
        !existingGoogleEventIds.has(apt.googleEventId)
      );

      console.log(`${newAppointments.length} new appointments to import, ${calendarAppointments.length - newAppointments.length} already exist`);

      // Prepare new appointments with user ID matched by phone number
      const { phoneNumbersMatch } = await import("./phoneUtils");
      const allUsers = await storage.getAllUsers();
      
      const appointmentsToCreate = await Promise.all(newAppointments.map(async (apt: any) => {
        // Try to find the user by matching phone number
        let matchedUser = allUsers.find((u: any) => 
          u.phoneNumber && phoneNumbersMatch(u.phoneNumber, apt.ownerPhoneNumber)
        );
        
        // If no user found by phone, assign to admin (the user performing the sync)
        // This ensures appointments can still be created even if customer isn't registered
        const assignedUserId = matchedUser?.id || user.id;
        
        return {
          ...apt,
          userId: assignedUserId,
        };
      }));

      // Validate that all required fields are present
      for (const apt of appointmentsToCreate) {
        if (!apt.userId || !apt.appointmentDate || !apt.appointmentTime || !apt.serviceType) {
          throw new Error(`Invalid appointment data: missing required fields in appointment: ${JSON.stringify(apt)}`);
        }
      }

      // Create new appointments
      let createdAppointments: any[] = [];
      if (appointmentsToCreate.length > 0) {
        createdAppointments = await storage.bulkCreateAppointments(appointmentsToCreate);
        console.log(`Created ${createdAppointments.length} new appointments from calendar`);
      }

      res.json({ 
        message: appointmentsToDelete.length > 0 
          ? `Cleaned up ${appointmentsToDelete.length} old appointments and imported ${createdAppointments.length} new appointments from Google Calendar`
          : `Successfully imported ${createdAppointments.length} new appointments from Google Calendar`,
        appointments: createdAppointments,
        newCount: createdAppointments.length,
        skippedCount: calendarAppointments.length - newAppointments.length,
        deletedCount: appointmentsToDelete.length,
      });
    } catch (error) {
      console.error("Error syncing appointments from calendar:", error);
      res.status(500).json({ 
        message: "Failed to sync appointments from calendar.", 
        error: (error as Error).message 
      });
    }
  });

  // Manual cleanup of past appointments (with optional status filter)
  app.post("/api/admin/appointments/cleanup-past", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { statuses } = req.body; // Optional array of statuses to filter
      
      console.log('Running manual cleanup: Clearing past appointments and resetting "Here" status', statuses ? `for statuses: ${statuses.join(', ')}` : 'for all statuses');
      
      const allAppointments = await storage.getAppointments();
      
      // Get today's date at start of day for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // First, reset isHere flag for ALL past appointments (regardless of status filter)
      const pastAppointmentsWithHere = allAppointments.filter((apt: any) => {
        if (!apt.isHere) return false;
        
        const appointmentDate = new Date(apt.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        return appointmentDate < today;
      });
      
      console.log(`Resetting "Here" status for ${pastAppointmentsWithHere.length} past appointments`);
      
      for (const appointment of pastAppointmentsWithHere) {
        await storage.updateAppointmentIsHere(appointment.id, false);
        console.log(`Reset "Here" status for appointment: ${appointment.id} from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      // Then, delete appointments that match the filter criteria
      const pastAppointments = allAppointments.filter((apt: any) => {
        // If statuses filter is provided, check if appointment matches
        if (statuses && Array.isArray(statuses) && statuses.length > 0) {
          if (!statuses.includes(apt.status)) return false;
        }
        
        const appointmentDate = new Date(apt.appointmentDate);
        appointmentDate.setHours(0, 0, 0, 0);
        
        return appointmentDate < today;
      });
      
      console.log(`Saving ${pastAppointments.length} past appointments to history before deletion`);
      
      let savedCount = 0;
      for (const appointment of pastAppointments) {
        try {
          // Save to history before deleting
          const history = await storage.saveAppointmentToHistory(appointment);
          console.log(`Saved appointment ${appointment.id} to history (history ID: ${history.id})`);
          savedCount++;
        } catch (error) {
          console.error(`Failed to save appointment ${appointment.id} to history:`, error);
          // Continue with deletion even if history save fails
        }
        
        await storage.deleteAppointment(appointment.id);
        console.log(`Deleted past appointment: ${appointment.id} (${appointment.status}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      res.json({ 
        message: `Successfully saved ${savedCount} and deleted ${pastAppointments.length} past appointments, reset ${pastAppointmentsWithHere.length} "Here" statuses`,
        deletedCount: pastAppointments.length,
        savedCount: savedCount,
        hereResetCount: pastAppointmentsWithHere.length
      });
    } catch (error) {
      console.error('Error cleaning up past appointments:', error);
      res.status(500).json({ 
        message: "Failed to cleanup past appointments", 
        error: (error as Error).message 
      });
    }
  });

  // Reset ALL isHere flags across all appointments (for fixing stale data)
  app.post("/api/admin/appointments/reset-all-here", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log('Running manual reset: Resetting ALL "Here" statuses across all appointments');
      
      const allAppointments = await storage.getAppointments();
      
      // Find all appointments with isHere = true
      const appointmentsWithHere = allAppointments.filter((apt: any) => apt.isHere === true);
      
      console.log(`Found ${appointmentsWithHere.length} appointments with "Here" status set to true`);
      
      // Reset all of them
      for (const appointment of appointmentsWithHere) {
        await storage.updateAppointmentIsHere(appointment.id, false);
        console.log(`Reset "Here" status for appointment: ${appointment.id} (${appointment.ownerLastName}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      res.json({ 
        message: `Successfully reset ${appointmentsWithHere.length} "Here" statuses`,
        resetCount: appointmentsWithHere.length
      });
    } catch (error) {
      console.error('Error resetting all "Here" statuses:', error);
      res.status(500).json({ 
        message: "Failed to reset all 'Here' statuses", 
        error: (error as Error).message 
      });
    }
  });

  // Reset ALL isPaid flags across all appointments (for fixing stale data)
  app.post("/api/admin/appointments/reset-all-paid", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log('Running manual reset: Resetting ALL "Paid" statuses across all appointments');
      
      const allAppointments = await storage.getAppointments();
      
      // Find all appointments with isPaid = true
      const appointmentsWithPaid = allAppointments.filter((apt: any) => apt.isPaid === true);
      
      console.log(`Found ${appointmentsWithPaid.length} appointments with "Paid" status set to true`);
      
      // Reset all of them
      for (const appointment of appointmentsWithPaid) {
        await storage.updateAppointmentIsPaid(appointment.id, false);
        console.log(`Reset "Paid" status for appointment: ${appointment.id} (${appointment.ownerLastName}) from ${new Date(appointment.appointmentDate).toLocaleDateString()}`);
      }
      
      res.json({ 
        message: `Successfully reset ${appointmentsWithPaid.length} "Paid" statuses`,
        resetCount: appointmentsWithPaid.length
      });
    } catch (error) {
      console.error('Error resetting all "Paid" statuses:', error);
      res.status(500).json({ 
        message: "Failed to reset all 'Paid' statuses", 
        error: (error as Error).message 
      });
    }
  });

  // Special date settings routes
  app.get("/api/admin/special-dates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const specialDates = await storage.getAllSpecialDateSettings();
      
      // Get allowed times for each special date
      const specialDatesWithTimes = await Promise.all(
        specialDates.map(async (setting) => {
          const times = await storage.getSpecialDateAllowedTimes(setting.id);
          return { ...setting, allowedTimes: times };
        })
      );

      res.json(specialDatesWithTimes);
    } catch (error) {
      console.error('Error fetching special dates:', error);
      res.status(500).json({ message: "Failed to fetch special dates" });
    }
  });

  app.post("/api/admin/special-dates", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { date, name, allowedTimes } = req.body;

      if (!date || !name || !allowedTimes || !Array.isArray(allowedTimes)) {
        return res.status(400).json({ message: "Date, name, and allowedTimes array are required" });
      }

      // Create the special date setting
      const setting = await storage.createSpecialDateSetting({ date, name });

      // Add allowed times
      const times = await Promise.all(
        allowedTimes.map((time: string) =>
          storage.addSpecialDateAllowedTime({
            specialDateId: setting.id,
            allowedTime: time,
          })
        )
      );

      res.json({ ...setting, allowedTimes: times });
    } catch (error) {
      console.error('Error creating special date:', error);
      res.status(500).json({ message: "Failed to create special date" });
    }
  });

  app.put("/api/admin/special-dates/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { date, name, allowedTimes } = req.body;

      // Update the special date setting
      const setting = await storage.updateSpecialDateSetting(parseInt(id), { date, name });

      // If allowedTimes is provided, update them
      if (allowedTimes && Array.isArray(allowedTimes)) {
        // Delete existing times
        const existingTimes = await storage.getSpecialDateAllowedTimes(setting.id);
        await Promise.all(
          existingTimes.map((time) => storage.deleteSpecialDateAllowedTime(time.id))
        );

        // Add new times
        const times = await Promise.all(
          allowedTimes.map((time: string) =>
            storage.addSpecialDateAllowedTime({
              specialDateId: setting.id,
              allowedTime: time,
            })
          )
        );

        return res.json({ ...setting, allowedTimes: times });
      }

      const times = await storage.getSpecialDateAllowedTimes(setting.id);
      res.json({ ...setting, allowedTimes: times });
    } catch (error) {
      console.error('Error updating special date:', error);
      res.status(500).json({ message: "Failed to update special date" });
    }
  });

  app.delete("/api/admin/special-dates/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      await storage.deleteSpecialDateSetting(parseInt(id));

      res.json({ message: "Special date deleted successfully" });
    } catch (error) {
      console.error('Error deleting special date:', error);
      res.status(500).json({ message: "Failed to delete special date" });
    }
  });

  // Get special date settings for a specific date (used by booking page)
  app.get("/api/special-dates/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const result = await storage.getSpecialDateWithTimes(date);
      
      if (!result) {
        return res.json(null);
      }

      res.json({ ...result.setting, allowedTimes: result.times });
    } catch (error) {
      console.error('Error fetching special date:', error);
      res.status(500).json({ message: "Failed to fetch special date" });
    }
  });

  // Export entire database to JSON (Admin only)
  app.get("/api/admin/database/export", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Starting database export...");

      // Export all data
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        data: {
          users: await storage.getAllUsers(),
          pets: await storage.getPets(),
          supplies: await storage.getSupplies({}, 0, 100000), // Get all supplies
          appointments: await storage.getAppointments(),
          orders: await storage.getOrders(),
          groomers: await storage.getAllGroomers(),
          contacts: await storage.getAllContacts(),
          specialDates: await storage.getAllSpecialDates(),
        }
      };

      console.log(`Exported ${exportData.data.users.length} users, ${exportData.data.supplies.items.length} supplies, ${exportData.data.appointments.length} appointments`);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="database-export-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting database:', error);
      res.status(500).json({ message: "Failed to export database" });
    }
  });

  // Import database from JSON (Admin only - DEVELOPMENT ONLY)
  app.post("/api/admin/database/import", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Safety check: only allow in development
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: "Database import is disabled in production for safety" });
      }

      const importData = req.body;
      
      if (!importData || !importData.version || !importData.data) {
        return res.status(400).json({ message: "Invalid import data format" });
      }

      console.log("Starting database import...");
      let stats = {
        users: 0,
        supplies: 0,
        pets: 0,
        appointments: 0,
        orders: 0,
        groomers: 0,
        contacts: 0,
      };

      // Import supplies (they don't have dependencies)
      if (importData.data.supplies?.items) {
        for (const supply of importData.data.supplies.items) {
          try {
            await storage.upsertSupply(supply);
            stats.supplies++;
          } catch (err) {
            console.error(`Failed to import supply ${supply.id}:`, err);
          }
        }
      }

      // Import pets
      if (importData.data.pets) {
        for (const pet of importData.data.pets) {
          try {
            await storage.upsertPet(pet);
            stats.pets++;
          } catch (err) {
            console.error(`Failed to import pet ${pet.id}:`, err);
          }
        }
      }

      // Import groomers
      if (importData.data.groomers) {
        for (const groomer of importData.data.groomers) {
          try {
            await storage.upsertGroomer(groomer);
            stats.groomers++;
          } catch (err) {
            console.error(`Failed to import groomer ${groomer.id}:`, err);
          }
        }
      }

      // Import contacts
      if (importData.data.contacts) {
        for (const contact of importData.data.contacts) {
          try {
            await storage.upsertContact(contact);
            stats.contacts++;
          } catch (err) {
            console.error(`Failed to import contact ${contact.id}:`, err);
          }
        }
      }

      // Import appointments
      if (importData.data.appointments) {
        for (const appointment of importData.data.appointments) {
          try {
            await storage.upsertAppointment(appointment);
            stats.appointments++;
          } catch (err) {
            console.error(`Failed to import appointment ${appointment.id}:`, err);
          }
        }
      }

      console.log("Import complete:", stats);

      res.json({ 
        message: "Database imported successfully",
        stats 
      });
    } catch (error) {
      console.error('Error importing database:', error);
      res.status(500).json({ message: "Failed to import database" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
