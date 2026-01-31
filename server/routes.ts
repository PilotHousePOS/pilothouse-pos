import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import ExcelJS from "exceljs";
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
  extractedOrderItems,
} from "@shared/schema";
import { z } from "zod";
import { notificationService } from './notifications';
import { sendPasswordResetEmail } from './sendgrid';
// Google Calendar integration removed - transition period complete
import { normalizePhoneNumber } from './phoneUtils';
import { db, resetPool } from './db';
import { eq } from 'drizzle-orm';
import { expandProductAbbreviations } from './abbreviationExpansion';
import { hashPassword, verifyPassword, isPasswordComplexEnough, getPasswordRequirementsMessage } from './passwordUtils';

// Retry helper for transient database errors
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isTransient = error?.code === '57P01' || 
                          error?.code === 'ECONNRESET' ||
                          error?.message?.includes('connection') ||
                          error?.message?.includes('terminating');
      if (isTransient && attempt < maxRetries) {
        console.log(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
        resetPool();
        await new Promise(r => setTimeout(r, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
import { extractOrderFromPhoto, apply99Pricing } from './orderPhotoProcessor';
import { categorizeProduct, detectLiveAnimal } from './productCategorization';

// Helper function to capitalize first letter of each word
function capitalizeWords(text: string | undefined | null): string | undefined | null {
  if (!text) return text;
  return text
    .split(' ')
    .map(word => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

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
    fileSize: 10 * 1024 * 1024 // 10MB limit for images and PDFs
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image files and PDFs are allowed'));
    }
  }
});

// Configure multer for Excel file uploads
const excelUpload = multer({ 
  storage: multer.memoryStorage(), // Store in memory for immediate processing
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for Excel files
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream' // Sometimes Excel files are detected as this
    ];
    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

export async function registerRoutes(app: Express, server?: Server): Promise<void> {

  // Prevent browser caching of API responses to avoid stale data
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  // Customer signup
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, firstName, lastName, phoneNumber } = req.body;
      
      if (!email || !password || !firstName || !lastName || !phoneNumber) {
        return res.status(400).json({ message: "All fields including phone number are required" });
      }

      // Validate password complexity
      const passwordValidation = isPasswordComplexEnough(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage()
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password before storing
      const hashedPassword = await hashPassword(password);

      // Create new user with hashed password
      const newUser = await storage.createUser({
        email,
        password: hashedPassword,
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

  // Test-only endpoint to create users (only in development)
  app.post('/api/test/create-user', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: "Test endpoints only available in development" });
    }

    try {
      const { email, password, firstName, lastName, phoneNumber, isAdmin, isGroomer } = req.body;
      
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "Email, password, firstName, and lastName are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // Return existing user instead of error
        console.log('Test user already exists, returning existing:', email);
        const { password: _, ...userWithoutPassword } = existingUser;
        return res.json(userWithoutPassword);
      }

      // Create new user
      const newUser = await storage.createUser({
        email,
        password,
        firstName,
        lastName,
        isAdmin: isAdmin || false,
        isGroomer: isGroomer || false,
      });

      // Update phone number if provided
      if (phoneNumber) {
        await db.update(users).set({ phoneNumber }).where(eq(users.id, newUser.id));
      }

      console.log('Test user created:', email, 'isAdmin:', isAdmin, 'isGroomer:', isGroomer);
      const { password: _, ...userWithoutPassword } = newUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Test user creation error:", error);
      res.status(500).json({ message: "Failed to create test user" });
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

      // Verify password using bcrypt (handles both hashed and legacy plain text)
      const passwordValid = await verifyPassword(password, user.password);
      if (!passwordValid) {
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
      
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = verifyToken(token);
      
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

      // Validate new password complexity
      const passwordValidation = isPasswordComplexEnough(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage()
        });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password using bcrypt
      const currentPasswordValid = await verifyPassword(currentPassword, currentUser.password);
      if (!currentPasswordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update user
      const hashedNewPassword = await hashPassword(newPassword);
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        password: hashedNewPassword,
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

  // Update phone number
  app.patch('/api/auth/update-phone', async (req, res) => {
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

      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Validate phone number format (at least 10 digits)
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        return res.status(400).json({ message: "Phone number must have at least 10 digits" });
      }

      // Get current user data
      const currentUser = await storage.getUser(user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user with new phone number
      const updatedUser = await storage.upsertUser({
        ...currentUser,
        phoneNumber: phoneNumber.trim(),
        updatedAt: new Date(),
      });

      // Generate new token
      const newToken = generateToken(updatedUser);
      setAuthCookie(res, newToken);

      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ ...userWithoutPassword, token: newToken });
    } catch (error) {
      console.error("Error updating phone number:", error);
      res.status(500).json({ message: "Failed to update phone number" });
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

      // Validate new password complexity
      const passwordValidation = isPasswordComplexEnough(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: passwordValidation.errors.join('. '),
          requirements: getPasswordRequirementsMessage()
        });
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

      // Hash and update password
      const hashedPassword = await hashPassword(newPassword);
      await storage.upsertUser({
        ...user,
        password: hashedPassword,
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

  // Pet routes with search and pagination
  app.get("/api/pets", async (req, res) => {
    try {
      const { species, search, page = '1', limit = '20' } = req.query;
      
      // Parse pagination parameters (page is 1-indexed from frontend)
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
      const offset = (pageNum - 1) * pageSize;
      
      let allPets = species 
        ? await storage.getPetsBySpecies(species as string)
        : await storage.getAllPets();
      
      // Apply search filter if provided (fuzzy search across name, species, breed, description)
      // Includes brand name expansion for abbreviated brand names
      if (search && typeof search === 'string' && search.trim()) {
        const { expandBrandNames } = await import('./brandNameExpansion');
        const brandVariations = expandBrandNames(search);
        
        allPets = allPets.filter(pet => {
          const searchableText = [
            pet.name || '',
            pet.species || '',
            pet.breed || '',
            pet.description || ''
          ].join(' ').toLowerCase();
          
          // Check if any brand variation matches
          return brandVariations.some(variation => 
            searchableText.includes(variation.toLowerCase())
          );
        });
      }
      
      // Calculate total count and pages
      const totalCount = allPets.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Apply pagination
      const paginatedPets = allPets.slice(offset, offset + pageSize);
      
      res.json({
        pets: paginatedPets,
        pagination: {
          currentPage: pageNum,
          totalPages,
          total: totalCount,
          pageSize
        }
      });
    } catch (error) {
      console.error("Error fetching pets:", error);
      // Return fallback data on error
      res.json({
        pets: [
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
        ],
        pagination: {
          currentPage: 0,
          totalPages: 1,
          totalCount: 3,
          pageSize: 20
        }
      });
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

  // File upload endpoint - now stores in Object Storage for persistence
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

      // Read the uploaded file and store it in Object Storage for persistence
      const fs = await import('fs');
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      
      const { ObjectStorageService } = await import('./objectStorageService');
      const { setObjectAclPolicy } = await import('./objectAcl');
      const objectStorageService = new ObjectStorageService();
      
      // Generate a unique filename
      const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = req.file.originalname.split('.').pop() || 'jpg';
      const objectFileName = `uploads/${uniqueId}.${extension}`;
      
      // Get the public bucket path and upload
      const publicPaths = objectStorageService.getPublicObjectSearchPaths();
      if (publicPaths.length === 0) {
        // Fallback to legacy local storage if Object Storage not configured
        const imageUrl = `/uploads/${req.file.filename}`;
        return res.json({ imageUrl });
      }
      
      const fullPath = `${publicPaths[0]}/${objectFileName}`;
      const { bucketName, objectName } = parseObjectPathForUpload(fullPath);
      
      const { Storage } = await import('@google-cloud/storage');
      const { objectStorageClient } = await import('./objectStorageService');
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(fileBuffer, {
        contentType: req.file.mimetype,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });
      
      // Set public ACL
      await setObjectAclPolicy(file, { visibility: 'public' });
      
      // Clean up local file
      fs.unlinkSync(filePath);
      
      const imageUrl = `/public-objects/${objectFileName}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });
  
  // Helper function for parsing object paths
  function parseObjectPathForUpload(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");
    return { bucketName, objectName };
  }

  // Object Storage endpoints for persistent file storage (survives redeployments)
  // Get presigned upload URL for object storage
  app.post("/api/objects/upload", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  // Serve public objects from object storage
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error serving public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve private objects from object storage (publicly accessible, no ACL check)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      const { ObjectNotFoundError } = await import('./objectStorageService');
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Update pet image after object storage upload
  app.put("/api/pets/:id/image", authMiddleware, async (req: any, res) => {
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
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: "imageUrl is required" });
      }

      // Normalize the object path if it's a GCS URL
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(imageUrl);

      const pet = await storage.updatePet(id, { imageUrl: normalizedPath });
      res.json(pet);
    } catch (error) {
      console.error("Error updating pet image:", error);
      res.status(500).json({ message: "Failed to update pet image" });
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

  // Export inventory to Excel for POS setup
  app.get("/api/export/inventory", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all supplies and pets
      const allSupplies = await storage.getAllSupplies();
      const allPets = await storage.getAllPets();

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Animal House Pet Store';
      workbook.created = new Date();

      // Supplies Sheet
      const suppliesSheet = workbook.addWorksheet('Supplies');
      suppliesSheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Name', key: 'name', width: 50 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Stock', key: 'stock', width: 8 },
        { header: 'Description', key: 'description', width: 60 },
        { header: 'Specialty Section', key: 'specialtySection', width: 15 },
        { header: 'Product Type', key: 'productType', width: 15 },
      ];

      // Style header row
      suppliesSheet.getRow(1).font = { bold: true };
      suppliesSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      suppliesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add supplies data
      allSupplies.forEach(supply => {
        suppliesSheet.addRow({
          id: supply.id,
          name: supply.name,
          brand: supply.brand || '',
          category: supply.category || '',
          price: supply.price ? `$${supply.price}` : '',
          stock: supply.stock || 0,
          description: supply.description || '',
          specialtySection: supply.specialtySection || '',
          productType: supply.productType || '',
        });
      });

      // Pets Sheet
      const petsSheet = workbook.addWorksheet('Pets');
      petsSheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Species', key: 'species', width: 15 },
        { header: 'Breed', key: 'breed', width: 25 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Available', key: 'isAvailable', width: 10 },
        { header: 'Description', key: 'description', width: 60 },
      ];

      // Style header row
      petsSheet.getRow(1).font = { bold: true };
      petsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' }
      };
      petsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add pets data
      allPets.forEach(pet => {
        petsSheet.addRow({
          id: pet.id,
          name: pet.name,
          species: pet.species || '',
          breed: pet.breed || '',
          price: pet.price ? `$${pet.price}` : '',
          isAvailable: pet.isAvailable ? 'Yes' : 'No',
          description: pet.description || '',
        });
      });

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AnimalHouse_Inventory_${dateStr}.xlsx`;

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error("Error exporting inventory:", error);
      res.status(500).json({ message: "Failed to export inventory" });
    }
  });

  // Export unmatched supplies (no UPC) to CSV
  app.get("/api/export/unmatched-supplies", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all supplies without UPC
      const allSupplies = await storage.getAllSupplies();
      const unmatchedSupplies = allSupplies.filter(s => !s.upc || s.upc.trim() === '');

      // Sort by brand, then name
      unmatchedSupplies.sort((a, b) => {
        const brandA = (a.brand || '').toLowerCase();
        const brandB = (b.brand || '').toLowerCase();
        if (brandA !== brandB) return brandA.localeCompare(brandB);
        return (a.name || '').localeCompare(b.name || '');
      });

      // Create CSV content
      const escapeCSV = (str: string) => {
        if (!str) return '';
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = ['ID', 'Name', 'Brand', 'Category', 'Price', 'UPC_Enter_Here', 'Description'];
      const rows = unmatchedSupplies.map(supply => [
        supply.id.toString(),
        escapeCSV(supply.name || ''),
        escapeCSV(supply.brand || ''),
        escapeCSV(supply.category || ''),
        supply.price ? `$${supply.price}` : '',
        '',
        escapeCSV(supply.description || ''),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `Unmatched_Supplies_Need_UPC_${dateStr}.csv`;

      // Set response headers for CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);

    } catch (error) {
      console.error("Error exporting unmatched supplies:", error);
      res.status(500).json({ message: "Failed to export unmatched supplies" });
    }
  });

  // Export inventory to Exatouch POS format
  app.get("/api/export/exatouch", authMiddleware, async (req: any, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all supplies (live animals handled separately in POS)
      const allSupplies = await storage.getAllSupplies();

      // Create workbook with Exatouch format
      const workbook = new ExcelJS.Workbook();
      const itemsSheet = workbook.addWorksheet('Items');

      // Set up columns based on Exatouch template (60 columns)
      itemsSheet.columns = [
        { header: 'Active', key: 'active', width: 8 },
        { header: 'Description', key: 'description', width: 50 },
        { header: 'DescLong', key: 'descLong', width: 60 },
        { header: 'DescButton', key: 'descButton', width: 20 },
        { header: 'DescReceipt', key: 'descReceipt', width: 30 },
        { header: 'DescRemote', key: 'descRemote', width: 30 },
        { header: 'DescSticky', key: 'descSticky', width: 30 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'PricePrompt', key: 'pricePrompt', width: 10 },
        { header: 'PriceSuggest', key: 'priceSuggest', width: 12 },
        { header: 'CostIndex', key: 'costIndex', width: 10 },
        { header: 'CostAvg', key: 'costAvg', width: 10 },
        { header: 'CostRecent', key: 'costRecent', width: 10 },
        { header: 'CostLow', key: 'costLow', width: 10 },
        { header: 'CostEntered', key: 'costEntered', width: 12 },
        { header: 'StockType', key: 'stockType', width: 10 },
        { header: 'QtyOnHand', key: 'qtyOnHand', width: 10 },
        { header: 'MinQty', key: 'minQty', width: 8 },
        { header: 'QtyReorder', key: 'qtyReorder', width: 10 },
        { header: 'LimitQty', key: 'limitQty', width: 10 },
        { header: 'DynamicEnabled', key: 'dynamicEnabled', width: 15 },
        { header: 'DynamicQty', key: 'dynamicQty', width: 12 },
        { header: 'OrderMin', key: 'orderMin', width: 10 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'AltSKU', key: 'altSku', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'SubCategory', key: 'subCategory', width: 20 },
        { header: 'Mfg', key: 'mfg', width: 20 },
        { header: 'MfgPart', key: 'mfgPart', width: 15 },
        { header: 'Color', key: 'color', width: 12 },
        { header: 'Size', key: 'size', width: 12 },
        { header: 'Style', key: 'style', width: 12 },
        { header: 'PackSize', key: 'packSize', width: 10 },
        { header: 'PackUnit', key: 'packUnit', width: 10 },
        { header: 'SBF', key: 'sbf', width: 10 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'ChargeUnit', key: 'chargeUnit', width: 12 },
        { header: 'CustomField1', key: 'customField1', width: 15 },
        { header: 'CustomField2', key: 'customField2', width: 15 },
        { header: 'CustomField3', key: 'customField3', width: 15 },
        { header: 'CustomField4', key: 'customField4', width: 15 },
        { header: 'EBTFood', key: 'ebtFood', width: 10 },
        { header: 'EBTCash', key: 'ebtCash', width: 10 },
        { header: 'CheckAge', key: 'checkAge', width: 10 },
        { header: 'Refundable', key: 'refundable', width: 12 },
        { header: 'TaxableA', key: 'taxableA', width: 10 },
        { header: 'TaxableB', key: 'taxableB', width: 10 },
        { header: 'TaxableC', key: 'taxableC', width: 10 },
        { header: 'TaxableD', key: 'taxableD', width: 10 },
        { header: 'TaxIncluded', key: 'taxIncluded', width: 12 },
        { header: 'OverridePrice', key: 'overridePrice', width: 14 },
        { header: 'OverrideQty', key: 'overrideQty', width: 12 },
        { header: 'ExcludeDisc', key: 'excludeDisc', width: 12 },
        { header: 'ExcludePromo', key: 'excludePromo', width: 14 },
        { header: 'Vendor', key: 'vendor', width: 15 },
        { header: 'VendorBuyQty', key: 'vendorBuyQty', width: 14 },
        { header: 'VendorSRP', key: 'vendorSrp', width: 12 },
        { header: 'VendorCost', key: 'vendorCost', width: 12 },
        { header: 'VendorPart', key: 'vendorPart', width: 12 },
        { header: 'VendorLeadTime', key: 'vendorLeadTime', width: 15 },
      ];

      // Style header
      itemsSheet.getRow(1).font = { bold: true };
      itemsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      itemsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Helper function to format category names (camelCase to Title Case)
      const formatCategory = (category: string): string => {
        if (!category) return '';
        // Split camelCase into words and capitalize first letter of each
        return category
          .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capitals
          .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      // Add supplies
      allSupplies.forEach(supply => {
        const priceNum = supply.price ? parseFloat(supply.price.replace(/[^\d.]/g, '')) : '';
        
        itemsSheet.addRow({
          active: 'True',
          description: supply.name || '',
          descLong: supply.description || supply.name || '',
          descButton: (supply.name || '').substring(0, 20),
          descReceipt: supply.name || '',
          descRemote: supply.name || '',
          descSticky: supply.name || '',
          price: priceNum,
          pricePrompt: '',
          priceSuggest: '',
          costIndex: 0,
          costAvg: '',
          costRecent: '',
          costLow: '',
          costEntered: '',
          stockType: 2,
          qtyOnHand: supply.stock || 0,
          minQty: 1,
          qtyReorder: 5,
          limitQty: '',
          dynamicEnabled: 'False',
          dynamicQty: '',
          orderMin: '',
          sku: supply.sku || supply.id.toString(),
          altSku: supply.sku ? supply.id.toString() : '',
          category: formatCategory(supply.category || ''),
          subCategory: formatCategory(supply.productType || ''),
          mfg: supply.brand || '',
          mfgPart: supply.mfgPart || '',
          color: supply.color || '',
          size: supply.size || '',
          style: supply.style || '',
          packSize: '',
          packUnit: '',
          sbf: '',
          unit: 'ea',
          chargeUnit: 'ea',
          customField1: supply.specialtySection || '',
          customField2: '',
          customField3: '',
          customField4: '',
          ebtFood: 'False',
          ebtCash: 'False',
          checkAge: '',
          refundable: 'True',
          taxableA: 'True',
          taxableB: 'False',
          taxableC: 'False',
          taxableD: 'False',
          taxIncluded: 'False',
          overridePrice: 'False',
          overrideQty: 'False',
          excludeDisc: 'False',
          excludePromo: 'False',
          vendor: supply.vendor || '',
          vendorBuyQty: '',
          vendorSrp: '',
          vendorCost: '',
          vendorPart: '',
          vendorLeadTime: '',
        });
      });

      // Note: Live animals excluded from ExaTouch export - handled separately in POS

      // Generate filename with date
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AnimalHouse_Exatouch_Import_${dateStr}.xlsx`;

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error("Error exporting Exatouch inventory:", error);
      res.status(500).json({ message: "Failed to export Exatouch inventory" });
    }
  });

  // Supply routes with pagination
  app.get("/api/supplies", async (req, res) => {
    try {
      const { category, search, page = '0', limit = '24', animalType, foodType, toyType, healthcareType, aquaticType, reptileType, birdType, smallAnimalProductType, petFoodAnimalType, treatAnimalType, filterType: filterTypeParam } = req.query;
      
      // Parse pagination parameters with defaults
      const pageNum = Math.max(0, parseInt(page as string) || 0);
      const pageSize = Math.min(20000, Math.max(1, parseInt(limit as string) || 24));
      const offset = pageNum * pageSize;

      // Determine filter type based on query param or category parameter
      let filterType: 'reptile' | 'aquatic' | undefined = filterTypeParam as 'reptile' | 'aquatic' | undefined;
      let actualCategory: string | undefined = category as string | undefined;
      
      if (category === 'reptile-supplies') {
        filterType = 'reptile';
        actualCategory = undefined; // Don't filter by category for specialty landing pages
      } else if (category === 'aquatic-supplies') {
        filterType = 'aquatic';
        actualCategory = undefined; // Don't filter by category for specialty landing pages
      }
      
      // Use paginated query
      // Note: When filterType is set via query param (not via category mapping), we DO want to preserve the category filter
      const { items, total } = await storage.getPaginatedSupplies({
        limit: pageSize,
        offset,
        category: actualCategory,
        search: search as string | undefined,
        filterType,
        animalType: animalType as string | undefined,
        foodType: foodType as string | undefined,
        toyType: toyType as string | undefined,
        healthcareType: healthcareType as string | undefined,
        aquaticType: aquaticType as string | undefined,
        reptileType: reptileType as string | undefined,
        birdType: birdType as string | undefined,
        smallAnimalProductType: smallAnimalProductType as string | undefined,
        petFoodAnimalType: petFoodAnimalType as string | undefined,
        treatAnimalType: treatAnimalType as string | undefined
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
      
      // Get related products (same category/brand, excluding current item)
      let relatedProducts: any[] = [];
      try {
        relatedProducts = await storage.getRelatedSupplies(id, supply.category, supply.brand, 6, supply.name);
      } catch (e) {
        console.error("Error fetching related products:", e);
      }
      
      res.json({ ...supply, relatedProducts });
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
      
      // Note: Abbreviation expansion removed from regular edits
      // Only run expansion during bulk import/invoice processing
      // to prevent unwanted autocorrection of manually entered names
      
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

  // Order Approval Management Routes (Admin)
  app.get("/api/admin/pending-orders", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const allOrders = await storage.getOrders();
      const pendingOrders = allOrders.filter(o => 
        o.approvalStatus === 'pending_approval' || 
        o.approvalStatus === 'approved' ||
        o.approvalStatus === 'ready_for_pickup'
      );
      
      // Get order items for each order
      const ordersWithItems = await Promise.all(
        pendingOrders.map(async (order) => {
          const orderWithItems = await storage.getOrderWithItems(order.id);
          return orderWithItems;
        })
      );
      
      res.json(ordersWithItems.filter(Boolean));
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      res.status(500).json({ message: "Failed to fetch pending orders" });
    }
  });
  
  app.post("/api/admin/orders/:id/approve", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Update order approval status
      await storage.updateOrderApprovalStatus(orderId, 'approved');
      
      // Send email notification
      const order = orderWithItems.order;
      const customerEmail = orderWithItems.customerEmail || order.customerEmail;
      if (customerEmail) {
        try {
          const { sendEmail } = await import('./sendgridIntegration');
          const itemsList = orderWithItems.items.map((item: any) => 
            `• ${item.itemName || 'Item'} x${item.quantity} - $${item.price}`
          ).join('\n');
          
          await sendEmail({
            to: customerEmail,
            subject: 'Your Animal House Order Has Been Approved!',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">🐾 Animal House Pet Store</h1>
                </div>
                <div style="padding: 20px; background-color: #f9fafb;">
                  <h2 style="color: #16a34a;">Order Approved!</h2>
                  <p>Hi ${orderWithItems.customerName || 'Valued Customer'},</p>
                  <p>Great news! Your order <strong>#${order.id}</strong> has been approved and is now being prepared.</p>
                  
                  <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
                    <h3 style="margin-top: 0;">Order Details:</h3>
                    <pre style="white-space: pre-wrap; font-family: Arial;">${itemsList}</pre>
                    <p style="font-weight: bold; font-size: 18px; color: #dc2626;">Total: $${order.totalAmount}</p>
                  </div>
                  
                  <p>We'll notify you when your order is ready for pickup!</p>
                  <p>Thank you for shopping with us!</p>
                </div>
                <div style="background-color: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
                  <p>Animal House Pet Store</p>
                </div>
              </div>
            `
          });
        } catch (emailError) {
          console.error("Failed to send approval email:", emailError);
        }
      }
      
      res.json({ success: true, message: "Order approved and customer notified" });
    } catch (error) {
      console.error("Error approving order:", error);
      res.status(500).json({ message: "Failed to approve order" });
    }
  });
  
  app.post("/api/admin/orders/:id/ready", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      const orderWithItems = await storage.getOrderWithItems(orderId);
      
      if (!orderWithItems) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Update order status to ready
      await storage.updateOrderApprovalStatus(orderId, 'ready_for_pickup');
      
      // Send email notification
      const order = orderWithItems.order;
      const customerEmail = orderWithItems.customerEmail || order.customerEmail;
      if (customerEmail) {
        try {
          const { sendEmail } = await import('./sendgridIntegration');
          
          await sendEmail({
            to: customerEmail,
            subject: 'Your Animal House Order Is Ready for Pickup!',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
                  <h1 style="margin: 0;">🐾 Animal House Pet Store</h1>
                </div>
                <div style="padding: 20px; background-color: #f9fafb;">
                  <h2 style="color: #16a34a;">Your Order is Ready!</h2>
                  <p>Hi ${orderWithItems.customerName || 'Valued Customer'},</p>
                  <p>Your order <strong>#${order.id}</strong> is now ready for pickup!</p>
                  
                  <div style="background: #16a34a; color: white; border-radius: 8px; padding: 20px; margin: 15px 0; text-align: center;">
                    <h3 style="margin: 0;">Come pick up your order anytime during store hours</h3>
                    <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">Order Total: $${order.totalAmount}</p>
                  </div>
                  
                  <p>Thank you for shopping with Animal House Pet Store!</p>
                </div>
                <div style="background-color: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
                  <p>Animal House Pet Store</p>
                </div>
              </div>
            `
          });
        } catch (emailError) {
          console.error("Failed to send ready email:", emailError);
        }
      }
      
      res.json({ success: true, message: "Order marked ready and customer notified" });
    } catch (error) {
      console.error("Error marking order ready:", error);
      res.status(500).json({ message: "Failed to mark order ready" });
    }
  });
  
  app.post("/api/admin/orders/:id/picked-up", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      await storage.updateOrderApprovalStatus(orderId, 'picked_up');
      
      res.json({ success: true, message: "Order marked as picked up" });
    } catch (error) {
      console.error("Error marking order picked up:", error);
      res.status(500).json({ message: "Failed to mark order picked up" });
    }
  });

  // Hide completed order from admin view (customer history persists)
  app.post("/api/admin/orders/:id/hide", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      await storage.hideOrderFromAdmin(orderId);
      
      res.json({ success: true, message: "Order hidden from admin view" });
    } catch (error) {
      console.error("Error hiding order:", error);
      res.status(500).json({ message: "Failed to hide order" });
    }
  });

  // Update order items (for editing before approval)
  app.put("/api/admin/orders/:id/items", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.id);
      const { items } = req.body;
      
      // Delete existing order items
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      
      // Insert updated items and calculate new total
      let newTotal = 0;
      for (const item of items) {
        if (item.quantity > 0) {
          await db.insert(orderItems).values({
            orderId,
            supplyId: item.supplyId || null,
            petId: item.petId || null,
            quantity: item.quantity,
            price: item.price,
            productName: item.productName || item.itemName,
            category: item.category || 'uncategorized',
          });
          newTotal += parseFloat(item.price) * item.quantity;
        }
      }
      
      // Get tax rate and recalculate totals
      const orderData = await storage.getOrder(orderId);
      const taxRate = orderData?.taxRate ? parseFloat(orderData.taxRate) : 10.99;
      const taxAmount = (newTotal * taxRate / 100);
      const totalWithTax = newTotal + taxAmount;
      
      // Update order total
      await db.update(orders)
        .set({ 
          subtotal: newTotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalWithTax.toFixed(2),
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId));
      
      res.json({ success: true, message: "Order items updated" });
    } catch (error) {
      console.error("Error updating order items:", error);
      res.status(500).json({ message: "Failed to update order items" });
    }
  });

  // Get all orders with items for admin
  app.get("/api/admin/orders-with-items", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orders = await storage.getAllOrdersWithItems();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders with items:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Search orders by customer name
  app.get("/api/admin/orders/search", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      const orders = await storage.searchOrders(q);
      res.json(orders);
    } catch (error) {
      console.error("Error searching orders:", error);
      res.status(500).json({ message: "Failed to search orders" });
    }
  });

  // Refund routes
  app.get("/api/admin/refunds", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { startDate, endDate } = req.query;
      
      if (startDate && endDate) {
        const refunds = await storage.getRefundsByDateRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
        res.json(refunds);
      } else {
        const refunds = await storage.getRefunds();
        res.json(refunds);
      }
    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  app.post("/api/admin/refunds", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { orderId, orderItemId, quantity, amount, reason, notes, refundType } = req.body;
      
      if (!orderId || !amount) {
        return res.status(400).json({ message: "Order ID and amount are required" });
      }
      
      const refund = await storage.createRefund({
        orderId,
        orderItemId,
        quantity,
        amount,
        reason: reason || 'Customer request',
        notes,
        refundType: refundType || 'partial',
        processedBy: userId,
      });
      
      // Update order item refund tracking if item-level refund
      if (orderItemId && quantity) {
        await storage.updateOrderItemRefund(orderItemId, quantity, amount);
      }
      
      res.json(refund);
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ message: "Failed to create refund" });
    }
  });

  app.get("/api/admin/refunds/order/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const orderId = parseInt(req.params.orderId);
      const refunds = await storage.getRefundsByOrderId(orderId);
      res.json(refunds);
    } catch (error) {
      console.error("Error fetching order refunds:", error);
      res.status(500).json({ message: "Failed to fetch refunds" });
    }
  });

  // Refund report email settings
  app.get("/api/admin/refund-report-emails", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const emails = await storage.getRefundReportEmails();
      res.json(emails);
    } catch (error) {
      console.error("Error fetching refund report emails:", error);
      res.status(500).json({ message: "Failed to fetch emails" });
    }
  });

  app.post("/api/admin/refund-report-emails", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      const setting = await storage.addRefundReportEmail(email);
      res.json(setting);
    } catch (error) {
      console.error("Error adding refund report email:", error);
      res.status(500).json({ message: "Failed to add email" });
    }
  });

  app.delete("/api/admin/refund-report-emails/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }
      
      const id = parseInt(req.params.id);
      await storage.removeRefundReportEmail(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing refund report email:", error);
      res.status(500).json({ message: "Failed to remove email" });
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
      
      // Enrich appointments with pets data using bulk query to avoid N+1
      const appointmentIds = filteredAppointments.map((apt: any) => apt.id);
      const petsByAppointmentId = await storage.getAppointmentPetsByAppointmentIds(appointmentIds);
      
      // Get all contacts for looking up notes by phone number
      const allContacts = await storage.getAllContacts();
      const contactsByPhone = new Map<string, any>();
      for (const contact of allContacts) {
        if (contact.phoneNumber) {
          const normalizedPhone = contact.phoneNumber.replace(/\D/g, '');
          contactsByPhone.set(normalizedPhone, contact);
        }
      }
      
      const appointmentsWithPets = filteredAppointments.map((apt: any) => {
        let pets = petsByAppointmentId.get(apt.id);
        
        // Backfill pets array from main appointment record for legacy single-pet appointments
        if (!pets || pets.length === 0) {
          if (apt.petName && apt.petType) {
            pets = [{
              appointmentId: apt.id,
              petName: apt.petName,
              petType: apt.petType,
              serviceType: apt.serviceType,
              price: apt.price,
              specialNotes: apt.specialNotes
            }];
          } else {
            pets = [];
          }
        }
        
        // Look up contact notes by phone number
        let contactNotes = null;
        if (apt.ownerPhoneNumber) {
          const normalizedPhone = apt.ownerPhoneNumber.replace(/\D/g, '');
          const contact = contactsByPhone.get(normalizedPhone);
          if (contact?.notes) {
            contactNotes = contact.notes;
          }
        }
        
        return {
          ...apt,
          pets,
          contactNotes
        };
      });
      
      res.json(appointmentsWithPets);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // Get available appointment slots for a date range (public endpoint for calendar display)
  app.get("/api/appointments/available-slots", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate query parameters are required" });
      }
      
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      // Get all weekly limits
      const weeklyLimits = await storage.getAllWeeklyAppointmentLimits();
      const limitsByDay = new Map<number, { bathLimit: number; groomLimit: number }>();
      for (const limit of weeklyLimits) {
        limitsByDay.set(limit.dayOfWeek, {
          bathLimit: limit.maxBathAppointments,
          groomLimit: limit.maxGroomAppointments
        });
      }
      
      // Get all appointments that consume capacity (not cancelled or rejected)
      const allAppointments = await storage.getAppointments();
      const activeAppointments = allAppointments.filter((apt: any) => 
        apt.status !== 'cancelled' && apt.status !== 'rejected' && apt.appointmentDate
      );
      
      // Count booked slots per date
      const bookedByDate = new Map<string, { bathCount: number; groomCount: number }>();
      
      for (const apt of activeAppointments) {
        // Handle both string and Date types for appointmentDate
        const aptDateRaw = apt.appointmentDate;
        const dateStr = typeof aptDateRaw === 'string' 
          ? aptDateRaw.split('T')[0] 
          : aptDateRaw.toISOString().split('T')[0];
        const aptDate = new Date(dateStr);
        
        if (aptDate >= start && aptDate <= end) {
          // Get pets for this appointment to count services
          const pets = await storage.getAppointmentPets(apt.id);
          let bathCount = 0;
          let groomCount = 0;
          
          for (const pet of pets) {
            // Use substring matching like the rest of the capacity logic
            const serviceType = (pet.serviceType || '').toLowerCase();
            if (serviceType.includes('bath')) {
              bathCount++;
            } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
              groomCount++;
            }
          }
          
          const existing = bookedByDate.get(dateStr) || { bathCount: 0, groomCount: 0 };
          bookedByDate.set(dateStr, {
            bathCount: existing.bathCount + bathCount,
            groomCount: existing.groomCount + groomCount
          });
        }
      }
      
      // Build response with available slots for each date
      const availableSlots: Record<string, { bathAvailable: number; groomAvailable: number; totalAvailable: number; isOpen: boolean }> = {};
      
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay();
        
        const limits = limitsByDay.get(dayOfWeek);
        const booked = bookedByDate.get(dateStr) || { bathCount: 0, groomCount: 0 };
        
        if (limits) {
          const bathAvailable = Math.max(0, limits.bathLimit - booked.bathCount);
          const groomAvailable = Math.max(0, limits.groomLimit - booked.groomCount);
          
          availableSlots[dateStr] = {
            bathAvailable,
            groomAvailable,
            totalAvailable: bathAvailable + groomAvailable,
            isOpen: bathAvailable > 0 || groomAvailable > 0
          };
        } else {
          // No limits set for this day = closed
          availableSlots[dateStr] = {
            bathAvailable: 0,
            groomAvailable: 0,
            totalAvailable: 0,
            isOpen: false
          };
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      res.json(availableSlots);
    } catch (error) {
      console.error("Error fetching available slots:", error);
      res.status(500).json({ message: "Failed to fetch available slots" });
    }
  });

  // Get single appointment with pets (for editing)
  app.get("/api/appointments/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const appointmentId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Check access: admin/groomer can see all, customer can only see their own
      if (!user?.isAdmin && !user?.isGroomer && appointment.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Fetch appointment_pets
      const pets = await storage.getAppointmentPets(appointmentId);
      
      // Return appointment with pets array
      res.json({
        ...appointment,
        pets: pets.length > 0 ? pets : undefined
      });
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ message: "Failed to fetch appointment" });
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
      
      // Get appointment to check capacity before approving
      const appointmentToApprove = await storage.getAppointment(id);
      if (!appointmentToApprove) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // CAPACITY CHECK: Ensure we don't exceed limits when approving
      const { getLocalDayOfWeek } = await import('./scheduler');
      const appointmentDate = new Date(appointmentToApprove.appointmentDate);
      // Use stored date for matching (consistent with SQL atomic check)
      const appointmentDateStr = appointmentDate.toISOString().split('T')[0];
      const dayOfWeek = getLocalDayOfWeek(appointmentDate);
      
      // Get appointment pets to count service types
      const appointmentPets = await storage.getAppointmentPets(id);
      
      // Check weekly limits for Monday-Saturday (1-6)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
        
        if (weeklyLimit) {
          // Count existing appointments on this date (excluding cancelled/rejected and THIS appointment)
          const allAppointments = await storage.getAppointments();
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
            return aptDateStr === appointmentDateStr && 
                   apt.id !== id && // Exclude the appointment being approved
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          
          // Count existing dogs by service type
          let bathDogs = 0;
          let groomDogs = 0;
          
          for (const apt of appointmentsOnDate) {
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              for (const p of aptPets) {
                const serviceType = (p.serviceType || '').toLowerCase();
                if (serviceType.includes('bath')) {
                  bathDogs++;
                } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                  groomDogs++;
                }
              }
            } else {
              const serviceType = (apt.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                bathDogs++;
              } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                groomDogs++;
              }
            }
          }
          
          // Count pets in the appointment being approved
          let requestedBaths = 0;
          let requestedGrooms = 0;
          
          if (appointmentPets && appointmentPets.length > 0) {
            for (const p of appointmentPets) {
              const serviceType = (p.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                requestedBaths++;
              } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                requestedGrooms++;
              }
            }
          } else {
            const serviceType = (appointmentToApprove.serviceType || '').toLowerCase();
            if (serviceType.includes('bath')) {
              requestedBaths++;
            } else if (serviceType.includes('full') || serviceType.includes('groom')) {
              requestedGrooms++;
            }
          }
          
          // HARD LIMIT: Cannot approve if it would exceed capacity
          if (bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            return res.status(400).json({
              message: `Cannot approve: Bath grooming capacity is full for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked). Please reject this appointment or move it to a different date.`
            });
          }
          
          if (groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            return res.status(400).json({
              message: `Cannot approve: Full grooming capacity is full for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked). Please reject this appointment or move it to a different date.`
            });
          }
        }
      }

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

  // Update appointment details with multi-pet support (admin and groomer)
  app.patch("/api/admin/appointments/:id/details", authMiddleware, async (req: any, res) => {
    console.log(`[EDIT DEBUG] ===== PATCH /api/admin/appointments/${req.params.id}/details CALLED =====`);
    console.log(`[EDIT DEBUG] Request body keys: ${Object.keys(req.body).join(', ')}`);
    try {
      const user = await storage.getUser(req.user?.id);
      console.log(`[EDIT DEBUG] User: ${user?.email}, isAdmin: ${user?.isAdmin}, isGroomer: ${user?.isGroomer}`);
      if (!user?.isAdmin && !user?.isGroomer) {
        console.log(`[EDIT DEBUG] Access denied - not admin or groomer`);
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { ownerFirstName, ownerLastName, ownerPhoneNumber, pets, pricingMode, price, appointmentDate, appointmentTime } = req.body;
      console.log(`[EDIT DEBUG] Editing appointment ${id}, appointmentDate: ${appointmentDate}`);

      // VALIDATION: Ensure pets array has at least one pet if provided
      if (pets !== undefined) {
        if (!Array.isArray(pets) || pets.length === 0) {
          return res.status(400).json({ message: "At least one pet is required" });
        }
        
        // Validate each pet has required fields
        for (const pet of pets) {
          if (!pet.petName || !pet.petType || !pet.serviceType) {
            return res.status(400).json({ message: "Each pet must have name, type, and service" });
          }
        }
      }

      console.log(`Updating appointment ${id} - Pets: ${pets?.length || 0}, Pricing Mode: ${pricingMode}`);

      // Get the current appointment
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

      // ONLY CHECK CAPACITY when date or services are ACTUALLY changing
      // If just editing owner info, notes, price, time - skip capacity check
      const { serviceType } = req.body; // Get serviceType from request body for inline edits
      
      // Check if date is actually changing (not just present in request)
      const currentDateStr = new Date(currentAppointment.appointmentDate).toISOString().split('T')[0];
      const newDateStr = appointmentDate ? new Date(appointmentDate).toISOString().split('T')[0] : currentDateStr;
      const isDateChanging = newDateStr !== currentDateStr;
      
      // Check if services are actually changing (compare old vs new)
      let isServiceChanging = serviceType !== undefined; // Inline edit always means service change
      if (pets !== undefined && !isServiceChanging) {
        // Full edit dialog - check if services actually changed
        const existingPets = await storage.getAppointmentPets(id);
        if (existingPets && existingPets.length > 0) {
          // Compare service types - only count as change if different
          const oldServices = existingPets.map((p: any) => (p.serviceType || '').toLowerCase()).sort().join(',');
          const newServices = pets.map((p: any) => (p.serviceType || '').toLowerCase()).sort().join(',');
          isServiceChanging = oldServices !== newServices || existingPets.length !== pets.length;
        } else {
          // Legacy single-pet - compare with appointment's serviceType
          const oldService = (currentAppointment.serviceType || '').toLowerCase();
          const newService = pets.length > 0 ? (pets[0].serviceType || '').toLowerCase() : '';
          isServiceChanging = oldService !== newService || pets.length !== 1;
        }
      }
      
      const needsCapacityCheck = isDateChanging || isServiceChanging;
      
      console.log(`[EDIT DEBUG] needsCapacityCheck=${needsCapacityCheck} (dateChanging=${isDateChanging}, serviceChanging=${isServiceChanging})`);
      
      // Use new date if provided, otherwise use current
      const dateToCheck = appointmentDate ? new Date(appointmentDate) : new Date(currentAppointment.appointmentDate);
      // Use stored date for matching (consistent with SQL atomic check)
      const { getLocalDayOfWeek } = await import('./scheduler');
      const appointmentDateStr = dateToCheck.toISOString().split('T')[0];
      const dayOfWeek = getLocalDayOfWeek(dateToCheck);
      
      // Get the pets/services that will be in this appointment after the update
      let finalPets;
      if (pets !== undefined) {
        // Using new pets array from full edit dialog
        finalPets = pets;
      } else if (serviceType !== undefined) {
        // Inline edit: serviceType changed directly without pets array
        // Use the new serviceType for capacity check
        finalPets = [{
          serviceType: serviceType,
          petName: currentAppointment.petName,
          petType: currentAppointment.petType
        }];
      } else {
        // No service change - use existing pets/service
        const existingPets = await storage.getAppointmentPets(id);
        if (existingPets && existingPets.length > 0) {
          finalPets = existingPets;
        } else {
          // Legacy single-pet appointment
          finalPets = [{
            serviceType: currentAppointment.serviceType
          }];
        }
      }
      
      // Only check capacity if date or services are changing
      // Skip capacity check for edits that don't affect capacity (owner info, notes, price, time, groomer)
      if (needsCapacityCheck && dayOfWeek >= 1 && dayOfWeek <= 6) {
        console.log(`[EDIT DEBUG] ===== CAPACITY CHECK =====`);
        console.log(`[EDIT DEBUG] dayOfWeek=${dayOfWeek}, dateStr=${appointmentDateStr}, appointmentId=${id}`);
        console.log(`[EDIT DEBUG] finalPets count: ${finalPets?.length}, services: ${finalPets?.map((p: any) => p.serviceType).join(', ')}`);
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
        console.log(`[EDIT DEBUG] Weekly limit for day ${dayOfWeek}:`, JSON.stringify(weeklyLimit));
        
        if (weeklyLimit) {
          // Count existing appointments on the target date (excluding this one and cancelled/rejected)
          const allAppointments = await storage.getAppointments();
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            // Use stored date for matching (consistent with SQL atomic check)
            const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
            return aptDateStr === appointmentDateStr && 
                   apt.id !== id && // Exclude current appointment being updated
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          console.log(`[EDIT DEBUG] Appointments on ${appointmentDateStr} (excluding id=${id}): ${appointmentsOnDate.length}`);
          
          // Count existing dogs by service type with substring matching
          let bathDogs = 0;
          let groomDogs = 0;
          
          for (const apt of appointmentsOnDate) {
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              for (const p of aptPets) {
                const svcType = (p.serviceType || '').toLowerCase();
                if (svcType.includes('bath')) {
                  bathDogs++;
                } else if (svcType.includes('full') || svcType.includes('groom')) {
                  groomDogs++;
                }
              }
            } else {
              // Legacy single-pet with substring matching
              const svcType = (apt.serviceType || '').toLowerCase();
              if (svcType.includes('bath')) {
                bathDogs++;
              } else if (svcType.includes('full') || svcType.includes('groom')) {
                groomDogs++;
              }
            }
          }
          
          // Count dogs in the updated appointment with substring matching
          let requestedBaths = 0;
          let requestedGrooms = 0;
          for (const p of finalPets) {
            const svcType = (p.serviceType || '').toLowerCase();
            if (svcType.includes('bath')) {
              requestedBaths++;
            } else if (svcType.includes('full') || svcType.includes('groom')) {
              requestedGrooms++;
            }
          }
          
          // Log final counts before capacity check
          console.log(`[EDIT DEBUG] Capacity counts - bathDogs=${bathDogs}, groomDogs=${groomDogs}, requestedBaths=${requestedBaths}, requestedGrooms=${requestedGrooms}`);
          console.log(`[EDIT DEBUG] Limits - maxBath=${weeklyLimit.maxBathAppointments}, maxGroom=${weeklyLimit.maxGroomAppointments}`);
          
          // Check if update would exceed capacity
          if (bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            console.log(`[EDIT DEBUG] *** CAPACITY BLOCKED - BATH: ${bathDogs + requestedBaths} > ${weeklyLimit.maxBathAppointments} ***`);
            return res.status(400).json({
              message: `Cannot update: Bath grooming capacity would be exceeded for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked by other appointments). Please select a different date or reduce the number of bath services.`
            });
          }
          
          if (groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            console.log(`[EDIT DEBUG] *** CAPACITY BLOCKED - GROOM: ${groomDogs + requestedGrooms} > ${weeklyLimit.maxGroomAppointments} ***`);
            return res.status(400).json({
              message: `Cannot update: Full grooming capacity would be exceeded for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked by other appointments). Please select a different date or reduce the number of full groom services.`
            });
          }
          
          console.log(`[EDIT DEBUG] Capacity check PASSED`);
        }
      }

      // Build appointment-level update object
      const updates: any = {};
      if (ownerFirstName !== undefined) updates.ownerFirstName = ownerFirstName;
      if (ownerLastName !== undefined) updates.ownerLastName = ownerLastName;
      if (ownerPhoneNumber !== undefined) updates.ownerPhoneNumber = ownerPhoneNumber;
      if (price !== undefined) updates.price = price;
      if (pricingMode !== undefined) updates.pricingMode = pricingMode;
      if (appointmentDate !== undefined) updates.appointmentDate = appointmentDate;
      if (appointmentTime !== undefined) updates.appointmentTime = appointmentTime;
      
      // If pets array is provided, update first pet in appointment table for backward compatibility
      if (pets && pets.length > 0) {
        const firstPet = pets[0];
        updates.petName = firstPet.petName;
        updates.petType = firstPet.petType;
        updates.serviceType = firstPet.serviceType;
        updates.specialNotes = firstPet.specialNotes;
        updates.groomerId = firstPet.groomerId || null;
      }

      // TRANSACTION: Update appointment and pets atomically with retry for connection issues
      const appointment = await withRetry(async () => {
        return await db.transaction(async (tx) => {
          // Update appointment
          const updatedAppointment = await storage.updateAppointmentDetails(id, updates);
          
          // Update appointment_pets if pets array provided
          if (pets && Array.isArray(pets)) {
            // Delete existing appointment_pets
            await storage.deleteAppointmentPets(id);
            
            // Create new appointment_pets records
            const petsWithPrice = pets.map((pet: any) => ({
              petName: pet.petName,
              petType: pet.petType,
              serviceType: pet.serviceType,
              specialNotes: pet.specialNotes || '',
              price: pet.price ? pet.price.toString() : '0',
              groomerId: pet.groomerId || null,
            }));
            
            await storage.createAppointmentPets(id, petsWithPrice);
          }
          
          return updatedAppointment;
        });
      });
      
      // Update corresponding contact (outside transaction to avoid blocking)
      if (ownerFirstName !== undefined || ownerLastName !== undefined || ownerPhoneNumber !== undefined || pets) {
        try {
          const oldPhone = currentAppointment.ownerPhoneNumber;
          const newPhone = ownerPhoneNumber || currentAppointment.ownerPhoneNumber;
          
          const normalizedOldPhone = normalizePhoneNumber(oldPhone);
          const allContacts = await storage.getAllContacts();
          let contact = allContacts.find((c: any) => normalizePhoneNumber(c.phoneNumber || '') === normalizedOldPhone);
          
          if (contact) {
            const contactUpdates: any = {};
            
            if (ownerFirstName !== undefined || ownerLastName !== undefined) {
              const firstName = ownerFirstName || currentAppointment.ownerFirstName;
              const lastName = ownerLastName || currentAppointment.ownerLastName;
              contactUpdates.name = `${firstName} ${lastName}`;
            }
            
            if (ownerPhoneNumber !== undefined) {
              contactUpdates.phoneNumber = ownerPhoneNumber;
            }
            
            // Update pet names from pets array
            if (pets && pets.length > 0) {
              const petNames = pets.map((p: any) => p.petName).filter(Boolean);
              if (petNames.length > 0) {
                contactUpdates.petNames = petNames;
              }
              // Use first pet's type
              if (pets[0].petType) {
                contactUpdates.animalType = pets[0].petType;
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
      
      console.log(`[EDIT DEBUG] ===== APPOINTMENT ${id} UPDATED SUCCESSFULLY =====`);
      res.json(appointment);
    } catch (error: any) {
      console.error(`[EDIT DEBUG] ===== ERROR UPDATING APPOINTMENT =====`);
      console.error(`[EDIT DEBUG] Error type: ${error?.constructor?.name}`);
      console.error(`[EDIT DEBUG] Error message: ${error?.message}`);
      console.error(`[EDIT DEBUG] Error stack: ${error?.stack}`);
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
      
      if (!oldAppointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Groomers can only edit already-approved appointments, not approve pending ones
      if (user?.isGroomer && !user?.isAdmin && oldAppointment?.status === 'scheduled') {
        return res.status(403).json({ message: "Only admins can approve pending appointments" });
      }
      
      // CAPACITY CHECK: When changing status to 'confirmed', check capacity limits
      if (status === 'confirmed' && oldAppointment.status !== 'confirmed') {
        const { getLocalDayOfWeek } = await import('./scheduler');
        const appointmentDate = new Date(oldAppointment.appointmentDate);
        // Use stored date for matching (consistent with SQL atomic check)
        const appointmentDateStr = appointmentDate.toISOString().split('T')[0];
        const dayOfWeek = getLocalDayOfWeek(appointmentDate);
        
        // Get appointment pets to count service types
        const appointmentPets = await storage.getAppointmentPets(id);
        
        // Check weekly limits for Monday-Saturday (1-6)
        if (dayOfWeek >= 1 && dayOfWeek <= 6) {
          const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
          
          if (weeklyLimit) {
            // Count existing appointments on this date (excluding cancelled/rejected and THIS appointment)
            const allAppointments = await storage.getAppointments();
            const appointmentsOnDate = allAppointments.filter((apt: any) => {
              // Use stored date for matching (consistent with SQL atomic check)
              const aptDateStr = new Date(apt.appointmentDate).toISOString().split('T')[0];
              return aptDateStr === appointmentDateStr && 
                     apt.id !== id && // Exclude the appointment being confirmed
                     apt.status !== 'cancelled' && 
                     apt.status !== 'rejected';
            });
            
            // Count existing dogs by service type
            let bathDogs = 0;
            let groomDogs = 0;
            
            for (const apt of appointmentsOnDate) {
              const aptPets = await storage.getAppointmentPets(apt.id);
              if (aptPets && aptPets.length > 0) {
                for (const p of aptPets) {
                  const serviceType = (p.serviceType || '').toLowerCase();
                  if (serviceType.includes('bath')) {
                    bathDogs++;
                  } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                    groomDogs++;
                  }
                }
              } else {
                const serviceType = (apt.serviceType || '').toLowerCase();
                if (serviceType.includes('bath')) {
                  bathDogs++;
                } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                  groomDogs++;
                }
              }
            }
            
            // Count pets in the appointment being confirmed
            let requestedBaths = 0;
            let requestedGrooms = 0;
            
            if (appointmentPets && appointmentPets.length > 0) {
              for (const p of appointmentPets) {
                const serviceType = (p.serviceType || '').toLowerCase();
                if (serviceType.includes('bath')) {
                  requestedBaths++;
                } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                  requestedGrooms++;
                }
              }
            } else {
              const serviceType = (oldAppointment.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                requestedBaths++;
              } else if (serviceType.includes('full') || serviceType.includes('groom')) {
                requestedGrooms++;
              }
            }
            
            // HARD LIMIT: Cannot confirm if it would exceed capacity
            if (bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
              return res.status(400).json({
                message: `Cannot confirm: Bath grooming capacity is full for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked). Please reject this appointment or move it to a different date.`
              });
            }
            
            if (groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
              return res.status(400).json({
                message: `Cannot confirm: Full grooming capacity is full for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked). Please reject this appointment or move it to a different date.`
              });
            }
          }
        }
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

  // Update appointment grooming completed status and send SMS notification
  app.patch("/api/appointments/:id/grooming-completed", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { groomingCompleted, customMessage } = req.body;
      
      if (typeof groomingCompleted !== 'boolean') {
        return res.status(400).json({ message: "groomingCompleted must be a boolean" });
      }

      const appointment = await storage.updateAppointmentGroomingCompleted(id, groomingCompleted);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Send SMS notification when grooming is marked as completed
      if (groomingCompleted && appointment.ownerPhoneNumber) {
        try {
          // Use custom message if provided, otherwise use default
          const smsMessage = customMessage || "Your Fur Baby is ready for pick-up please give us a call to let us know you're on your way. The Animal House 318-323-6090.";
          
          const smsSent = await notificationService.sendCustomSMS(
            appointment.ownerPhoneNumber,
            smsMessage
          );
          
          if (smsSent) {
            console.log(`Grooming completed SMS sent for appointment ${id}`);
          }
        } catch (smsError) {
          console.error('Failed to send grooming completed SMS:', smsError);
          // Don't fail the request if SMS fails
        }
      }

      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment grooming completed status:", error);
      res.status(500).json({ message: "Failed to update appointment grooming completed status" });
    }
  });

  // Send "Pet Ready" SMS notification for grooming appointment
  app.post("/api/appointments/:id/notify-ready", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Get the phone number from the appointment
      const phoneNumber = appointment.ownerPhoneNumber;
      if (!phoneNumber) {
        return res.status(400).json({ message: "No phone number found for this appointment" });
      }

      // Get customer first name
      const firstName = appointment.ownerFirstName || 'Customer';
      
      // Get pet name(s)
      const appointmentPets = await storage.getAppointmentPets(id);
      let petNames: string;
      if (appointmentPets && appointmentPets.length > 0) {
        petNames = appointmentPets.map(p => p.petName).join(' and ');
      } else {
        petNames = appointment.petName || 'your pet';
      }

      // Send the SMS notification
      const success = await notificationService.sendPetReadyNotification(
        phoneNumber,
        firstName,
        petNames
      );

      if (success) {
        res.json({ message: `Pet ready notification sent to ${phoneNumber}` });
      } else {
        res.status(400).json({ 
          message: "SMS service not configured. Please set up Twilio credentials.",
          setupRequired: true
        });
      }
    } catch (error) {
      console.error("Error sending pet ready notification:", error);
      res.status(500).json({ message: "Failed to send pet ready notification" });
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
        
        // LIMIT: Only 1 appointment per customer per day
        const userAppointments = await storage.getAppointments();
        const requestedDateStr = req.body.appointmentDate; // "YYYY-MM-DD" format
        const sameDayAppointments = userAppointments.filter((apt: any) => {
          if (apt.userId !== userId) return false;
          if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
          
          // Compare date strings directly (both in YYYY-MM-DD format)
          const aptDateStr = typeof apt.appointmentDate === 'string' 
            ? apt.appointmentDate.split('T')[0] 
            : new Date(apt.appointmentDate).toISOString().split('T')[0];
          return aptDateStr === requestedDateStr;
        });
        
        if (sameDayAppointments.length > 0) {
          return res.status(400).json({ 
            message: `You already have an appointment booked for this date. Only one appointment per day is allowed.` 
          });
        }
      }

      // Use timezone-aware date functions to prevent UTC/CST mismatch bugs
      const { getLocalDateString, getLocalDayOfWeek } = await import('./scheduler');
      
      // CRITICAL FIX: The frontend sends a date string like "2025-12-11" which represents
      // the user's selected date in their local timezone (CST). We must NOT let JavaScript
      // reinterpret this as UTC midnight (which would shift it back one day when converted to CST).
      // Instead, parse the date string directly and use those components.
      const rawDateStr = req.body.appointmentDate; // "YYYY-MM-DD" format from frontend
      let appointmentDateStr: string;
      let dayOfWeek: number;
      
      // Parse the date string directly to get the intended date components
      if (typeof rawDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
        // Date string format - use it directly as the date
        appointmentDateStr = rawDateStr;
        // Parse year, month, day from string
        const [year, month, day] = rawDateStr.split('-').map(Number);
        // Create date in local timezone (noon to avoid any edge cases)
        const localDate = new Date(year, month - 1, day, 12, 0, 0);
        dayOfWeek = localDate.getDay(); // 0=Sunday, 1=Monday, etc.
        console.log(`[DATE PARSING] Raw: ${rawDateStr}, Parsed local date: ${localDate.toDateString()}, Day of week: ${dayOfWeek}`);
      } else {
        // Fallback for other date formats - use timezone conversion
        const appointmentDate = new Date(rawDateStr);
        appointmentDateStr = getLocalDateString(appointmentDate);
        dayOfWeek = getLocalDayOfWeek(appointmentDate);
        console.log(`[DATE PARSING] Fallback - Raw: ${rawDateStr}, Converted: ${appointmentDateStr}, Day of week: ${dayOfWeek}`);
      }
      
      // Check special date settings first (overrides weekly limits)
      const appointmentDate = new Date(rawDateStr);
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

      // Support both old single-pet format and new multi-pet format
      const petsArray = req.body.pets || [{ 
        petName: req.body.petName, 
        petType: req.body.petType, 
        serviceType: req.body.serviceType,
        specialNotes: req.body.specialNotes 
      }];

      // Check weekly appointment limits for the selected day of week
      // dayOfWeek was already calculated above using the raw date string
      console.log(`[CAPACITY CHECK] Date: ${appointmentDateStr}, Day of week: ${dayOfWeek}, isAdmin: ${isAdmin}`);
      
      // SAFEGUARD #1: Block Sunday bookings (day 0) - no grooming on Sundays
      if (dayOfWeek === 0) {
        return res.status(400).json({
          message: "Sorry, grooming appointments are not available on Sundays. Please select a different day."
        });
      }
      
      // Get weekly limit for this day of week (1-6 for Monday-Saturday)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
        
        console.log(`[CAPACITY CHECK] Weekly limit for day ${dayOfWeek}:`, weeklyLimit ? `bath=${weeklyLimit.maxBathAppointments}, groom=${weeklyLimit.maxGroomAppointments}` : 'NOT SET');
        
        // SAFEGUARD #2: Require weekly limits to be configured - prevents bypassing capacity
        if (!weeklyLimit) {
          console.error(`[CAPACITY CHECK] BLOCKED - No weekly limit configured for day ${dayOfWeek}`);
          return res.status(400).json({
            message: `Booking is not available for this day. Please contact the store or select a different date.`
          });
        }
        
        // Weekly limit exists - proceed with capacity check
        if (weeklyLimit) {
          // Count existing appointments for this date by service type
          // Include all appointments except cancelled/rejected ones
          // IMPORTANT: Only match the stored date (not timezone-converted) to match SQL atomic check behavior
          const allAppointments = await storage.getAppointments();
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            const aptDate = new Date(apt.appointmentDate);
            // Only use the stored date, not timezone-converted - matches SQL: DATE(a.appointment_date) = ${dateStr}::date
            const storedDateStr = aptDate.toISOString().split('T')[0];
            return storedDateStr === appointmentDateStr && 
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          
          // Count total dogs/pets by service type (not appointments)
          let bathDogs = 0;
          let groomDogs = 0;
          
          for (const apt of appointmentsOnDate) {
            // Get appointment pets to count service types accurately
            const aptPets = await storage.getAppointmentPets(apt.id);
            if (aptPets && aptPets.length > 0) {
              // Multi-pet appointment - count each pet's service type with substring matching
              for (const p of aptPets) {
                const serviceType = (p.serviceType || '').toLowerCase();
                // Bath check first, then groom excludes bath to avoid any overlap
                if (serviceType.includes('bath')) {
                  bathDogs++;
                } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
                  groomDogs++;
                }
              }
            } else {
              // Legacy single-pet appointment - use appointment's serviceType with substring matching
              const serviceType = (apt.serviceType || '').toLowerCase();
              // Bath check first, then groom excludes bath to avoid any overlap
              if (serviceType.includes('bath')) {
                bathDogs++;
              } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
                groomDogs++;
              }
            }
          }
          
          // Count requested pets by service type with substring matching
          let requestedBaths = 0;
          let requestedGrooms = 0;
          for (const p of petsArray) {
            const serviceType = (p.serviceType || '').toLowerCase();
            if (serviceType.includes('bath')) {
              requestedBaths++;
            } else if (serviceType.includes('full') || serviceType.includes('groom')) {
              requestedGrooms++;
            }
          }
          
          console.log(`[CAPACITY CHECK] Existing: ${groomDogs} grooms, ${bathDogs} baths. Requested: ${requestedGrooms} grooms, ${requestedBaths} baths. Limits: ${weeklyLimit.maxGroomAppointments} grooms, ${weeklyLimit.maxBathAppointments} baths`);
          console.log(`[CAPACITY CHECK] Would total: ${groomDogs + requestedGrooms} grooms (limit ${weeklyLimit.maxGroomAppointments}), ${bathDogs + requestedBaths} baths (limit ${weeklyLimit.maxBathAppointments})`);
          
          // HARD LIMIT: Cannot be bypassed by anyone, including admins
          // This ensures grooming capacity is never exceeded
          if (bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            return res.status(400).json({
              message: `Bath grooming capacity is fully booked for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked). Please select a different date.`
            });
          }
          
          if (groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            return res.status(400).json({
              message: `Full grooming capacity is fully booked for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked). Please select a different date.`
            });
          }
        }
      }
      
      // For multi-pet appointments, use first pet's info in main record for backward compatibility
      const firstPet = petsArray[0];
      const petNamesStr = petsArray.map((p: any) => p.petName).join(', ');
      
      // SAFEGUARD #3: Final atomic capacity check right before creating - prevents race conditions
      // This is a database-level double-check using raw SQL for maximum reliability
      let requestedBathsFinal = 0;
      let requestedGroomsFinal = 0;
      for (const p of petsArray) {
        const serviceType = (p.serviceType || '').toLowerCase();
        if (serviceType.includes('bath')) {
          requestedBathsFinal++;
        } else if (serviceType.includes('full') || serviceType.includes('groom')) {
          requestedGroomsFinal++;
        }
      }
      
      const atomicCheck = await storage.checkAndReserveCapacity(
        appointmentDateStr,
        dayOfWeek,
        requestedBathsFinal,
        requestedGroomsFinal
      );
      
      if (!atomicCheck.withinCapacity) {
        console.error(`[FINAL CAPACITY CHECK] BLOCKED - ${atomicCheck.reason}`);
        return res.status(400).json({
          message: `This date is fully booked. ${atomicCheck.reason} Please select a different date.`
        });
      }
      
      console.log(`[FINAL CAPACITY CHECK] PASSED - proceeding with appointment creation`);
      
      // All appointments are auto-approved with capacity safeguards in place
      const appointmentData = insertAppointmentSchema.parse({ 
        ...req.body,
        // Use first pet's data for backward compatibility
        petName: firstPet.petName,
        petType: firstPet.petType,
        serviceType: firstPet.serviceType,
        specialNotes: firstPet.specialNotes,
        userId,
        isApproved: true,
        status: 'confirmed'
      });
      const appointment = await storage.createAppointment(appointmentData);
      
      // Create appointment_pets records for all pets
      if (req.body.pets && req.body.pets.length > 0) {
        const SERVICES = [
          { id: 'grooming-full', price: 35 },
          { id: 'grooming-bath', price: 20 },
        ];
        
        const petsWithPrice = petsArray.map((pet: any) => {
          const service = SERVICES.find(s => s.id === pet.serviceType);
          // Use per-pet groomerId if specified, otherwise fall back to appointment-level groomerId
          const groomerId = pet.groomerId || req.body.groomerId;
          return {
            petName: pet.petName,
            petType: pet.petType,
            serviceType: pet.serviceType,
            specialNotes: pet.specialNotes,
            price: service ? service.price.toString() : '0',
            groomerId: groomerId || null,
          };
        });
        
        await storage.createAppointmentPets(appointment.id, petsWithPrice);
      }
      
      // Send admin notifications for new appointment
      try {
        const customerName = `${appointmentData.ownerFirstName} ${appointmentData.ownerLastName}`;
        const serviceInfo = petsArray.length > 1 
          ? `${petsArray.length} pets: ${petNamesStr}`
          : appointmentData.serviceType;
        
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
          serviceInfo,
          appointmentData.appointmentDate,
          appointmentData.appointmentTime
        );
      } catch (notificationError) {
        console.error('Failed to send admin notifications for new appointment:', notificationError);
        // Don't fail the appointment if notifications fail
      }
      
      // Calculate remaining slots after booking
      let remainingSlots = null;
      try {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
        if (weeklyLimit) {
          // Re-count existing appointments after this booking (all non-cancelled/rejected consume capacity)
          const updatedAppointments = await storage.getAppointments();
          const activeForDate = updatedAppointments.filter((apt: any) => {
            if (!apt.appointmentDate) return false;
            if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
            // Handle both string and Date types
            const aptDateStr = typeof apt.appointmentDate === 'string' 
              ? apt.appointmentDate.split('T')[0] 
              : apt.appointmentDate.toISOString().split('T')[0];
            return aptDateStr === rawDateStr;
          });
          
          let bathCount = 0;
          let groomCount = 0;
          for (const apt of activeForDate) {
            const pets = await storage.getAppointmentPets(apt.id);
            for (const pet of pets) {
              // Use substring matching like the rest of the capacity logic
              const serviceType = (pet.serviceType || '').toLowerCase();
              if (serviceType.includes('bath')) {
                bathCount++;
              } else if (serviceType.includes('full') || (serviceType.includes('groom') && !serviceType.includes('bath'))) {
                groomCount++;
              }
            }
          }
          
          remainingSlots = {
            bathAvailable: Math.max(0, weeklyLimit.maxBathAppointments - bathCount),
            groomAvailable: Math.max(0, weeklyLimit.maxGroomAppointments - groomCount),
            totalAvailable: Math.max(0, weeklyLimit.maxBathAppointments - bathCount) + Math.max(0, weeklyLimit.maxGroomAppointments - groomCount)
          };
        }
      } catch (slotsError) {
        console.error('Failed to calculate remaining slots:', slotsError);
      }
      
      res.json({ ...appointment, remainingSlots });
    } catch (error) {
      console.error("Error creating appointment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid appointment data", errors: error.errors });
      }
      // Return more specific error message for debugging production issues
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("Appointment creation failed with:", errorMessage);
      res.status(500).json({ message: `Failed to create appointment: ${errorMessage}` });
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

  // Boarding/Babysitting routes
  app.get("/api/admin/boarding", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const records = await storage.getAllBoardingRecords();
      res.json(records);
    } catch (error) {
      console.error("Error fetching boarding records:", error);
      res.status(500).json({ message: "Failed to fetch boarding records" });
    }
  });

  app.get("/api/admin/boarding/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const record = await storage.getBoardingRecord(parseInt(req.params.id));
      if (!record) {
        return res.status(404).json({ message: "Boarding record not found" });
      }
      res.json(record);
    } catch (error) {
      console.error("Error fetching boarding record:", error);
      res.status(500).json({ message: "Failed to fetch boarding record" });
    }
  });

  app.post("/api/admin/boarding", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const record = await storage.createBoardingRecord(req.body);
      res.json(record);
    } catch (error) {
      console.error("Error creating boarding record:", error);
      res.status(500).json({ message: "Failed to create boarding record" });
    }
  });

  app.put("/api/admin/boarding/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const record = await storage.updateBoardingRecord(parseInt(req.params.id), req.body);
      res.json(record);
    } catch (error) {
      console.error("Error updating boarding record:", error);
      res.status(500).json({ message: "Failed to update boarding record" });
    }
  });

  app.patch("/api/admin/boarding/:id/check-in", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const record = await storage.checkInBoardingRecord(parseInt(req.params.id));
      res.json(record);
    } catch (error) {
      console.error("Error checking in boarding record:", error);
      res.status(500).json({ message: "Failed to check in boarding record" });
    }
  });

  app.patch("/api/admin/boarding/:id/check-out", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const record = await storage.checkOutBoardingRecord(parseInt(req.params.id));
      res.json(record);
    } catch (error) {
      console.error("Error checking out boarding record:", error);
      res.status(500).json({ message: "Failed to check out boarding record" });
    }
  });

  app.delete("/api/admin/boarding/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.deleteBoardingRecord(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting boarding record:", error);
      res.status(500).json({ message: "Failed to delete boarding record" });
    }
  });

  // Schedule routes
  app.get("/api/admin/schedule", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const scheduleEntries = await storage.getAllScheduleEntries();
      res.json(scheduleEntries);
    } catch (error) {
      console.error("Error fetching schedule entries:", error);
      res.status(500).json({ message: "Failed to fetch schedule entries" });
    }
  });

  app.post("/api/admin/schedule/batch", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { entries } = req.body;
      const result = await storage.batchUpdateScheduleEntries(entries);
      res.json(result);
    } catch (error) {
      console.error("Error batch updating schedule entries:", error);
      res.status(500).json({ message: "Failed to batch update schedule entries" });
    }
  });

  app.patch("/api/admin/schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const updated = await storage.updateScheduleEntry(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating schedule entry:", error);
      res.status(500).json({ message: "Failed to update schedule entry" });
    }
  });

  app.delete("/api/admin/schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.deleteScheduleEntry(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule entry:", error);
      res.status(500).json({ message: "Failed to delete schedule entry" });
    }
  });

  // Grooming schedule routes
  app.get("/api/admin/grooming-schedule", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const groomingScheduleEntries = await storage.getAllGroomingScheduleEntries();
      res.json(groomingScheduleEntries);
    } catch (error) {
      console.error("Error fetching grooming schedule entries:", error);
      res.status(500).json({ message: "Failed to fetch grooming schedule entries" });
    }
  });

  app.post("/api/admin/grooming-schedule/batch", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { entries } = req.body;
      const result = await storage.batchUpdateGroomingScheduleEntries(entries);
      res.json(result);
    } catch (error) {
      console.error("Error batch updating grooming schedule entries:", error);
      res.status(500).json({ message: "Failed to batch update grooming schedule entries" });
    }
  });

  app.patch("/api/admin/grooming-schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const updated = await storage.updateGroomingScheduleEntry(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating grooming schedule entry:", error);
      res.status(500).json({ message: "Failed to update grooming schedule entry" });
    }
  });

  app.delete("/api/admin/grooming-schedule/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.deleteGroomingScheduleEntry(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting grooming schedule entry:", error);
      res.status(500).json({ message: "Failed to delete grooming schedule entry" });
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

  // Admin Email Center - Send emails to users
  app.post("/api/admin/email/send", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { recipients, subject, message, sendToAll, roleFilter } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      // Get SendGrid client
      const { getUncachableSendGridClient } = await import('./sendgridIntegration');
      const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

      let targetUsers: any[] = [];

      if (sendToAll) {
        // Get all users with email addresses
        targetUsers = await storage.getAllUsers();
        targetUsers = targetUsers.filter((u: any) => {
          if (!u.email || u.email.startsWith('temp_')) return false;
          
          // Apply role filter if specified
          if (roleFilter && roleFilter !== 'all') {
            switch (roleFilter) {
              case 'customers':
                return !u.isAdmin && !u.isGroomer;
              case 'groomers':
                return u.isGroomer;
              case 'admins':
                return u.isAdmin;
              default:
                return true;
            }
          }
          return true;
        });
      } else if (recipients && Array.isArray(recipients) && recipients.length > 0) {
        // Get specific users by ID
        for (const userId of recipients) {
          const user = await storage.getUser(userId);
          if (user && user.email && !user.email.startsWith('temp_')) {
            targetUsers.push(user);
          }
        }
      } else {
        return res.status(400).json({ message: "No recipients specified" });
      }

      if (targetUsers.length === 0) {
        return res.status(400).json({ message: "No valid recipients found" });
      }

      // Send emails
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const user of targetUsers) {
        try {
          await sgMail.send({
            to: user.email,
            from: fromEmail,
            subject: subject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px; text-align: center;">
                  <h1 style="color: #f59e0b; margin: 0;">Animal House Pet Store</h1>
                </div>
                <div style="padding: 30px; background: #ffffff;">
                  <p style="color: #374151;">Hello ${user.firstName || 'Valued Customer'},</p>
                  <div style="color: #374151; line-height: 1.6;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </div>
                <div style="background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 12px;">
                  <p>Animal House Pet Store</p>
                  <p>If you have any questions, please contact us.</p>
                </div>
              </div>
            `,
          });
          successCount++;
        } catch (emailError: any) {
          failedCount++;
          errors.push(`Failed to send to ${user.email}: ${emailError.message}`);
          console.error(`Failed to send email to ${user.email}:`, emailError);
        }
      }

      res.json({
        message: `Emails sent: ${successCount} successful, ${failedCount} failed`,
        stats: {
          total: targetUsers.length,
          success: successCount,
          failed: failedCount,
          errors: errors.slice(0, 5) // Return first 5 errors
        }
      });
    } catch (error: any) {
      console.error("Error sending bulk emails:", error);
      res.status(500).json({ message: error.message || "Failed to send emails" });
    }
  });

  // Get all users for email/SMS recipient selection
  app.get("/api/admin/email/recipients", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await storage.getAllUsers();
      
      // Filter out users without valid emails and return data with role info
      const recipients = allUsers
        .filter((u: any) => u.email && !u.email.startsWith('temp_'))
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          phoneNumber: u.phoneNumber || null,
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          isAdmin: u.isAdmin || false,
          isGroomer: u.isGroomer || false
        }));

      res.json(recipients);
    } catch (error) {
      console.error("Error fetching email recipients:", error);
      res.status(500).json({ message: "Failed to fetch recipients" });
    }
  });

  // Admin SMS Center - Send text messages to users
  app.post("/api/admin/sms/send", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { recipients, message, sendToAll, roleFilter } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Check Twilio configuration
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        return res.status(400).json({ 
          message: "SMS service not configured. Please set up Twilio credentials.",
          setupRequired: true
        });
      }

      let targetUsers: any[] = [];

      if (sendToAll) {
        // Get all users with phone numbers
        targetUsers = await storage.getAllUsers();
        targetUsers = targetUsers.filter((u: any) => {
          if (!u.phoneNumber) return false;
          
          // Apply role filter if specified
          if (roleFilter && roleFilter !== 'all') {
            switch (roleFilter) {
              case 'customers':
                return !u.isAdmin && !u.isGroomer;
              case 'groomers':
                return u.isGroomer;
              case 'admins':
                return u.isAdmin;
              default:
                return true;
            }
          }
          return true;
        });
      } else if (recipients && Array.isArray(recipients) && recipients.length > 0) {
        // Get specific users by ID
        for (const userId of recipients) {
          const user = await storage.getUser(userId);
          if (user && user.phoneNumber) {
            targetUsers.push(user);
          }
        }
      } else {
        return res.status(400).json({ message: "No recipients specified" });
      }

      if (targetUsers.length === 0) {
        return res.status(400).json({ message: "No valid recipients with phone numbers found" });
      }

      // Send SMS messages
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const user of targetUsers) {
        try {
          await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: user.phoneNumber,
          });
          successCount++;
        } catch (smsError: any) {
          failedCount++;
          errors.push(`Failed to send to ${user.phoneNumber}: ${smsError.message}`);
          console.error(`Failed to send SMS to ${user.phoneNumber}:`, smsError);
        }
      }

      res.json({
        message: `Text messages sent: ${successCount} successful, ${failedCount} failed`,
        stats: {
          total: targetUsers.length,
          success: successCount,
          failed: failedCount,
          errors: errors.slice(0, 5)
        }
      });
    } catch (error: any) {
      console.error("Error sending bulk SMS:", error);
      res.status(500).json({ message: error.message || "Failed to send text messages" });
    }
  });

  // Automated Messages routes
  app.get("/api/admin/automated-messages", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const messages = await storage.getAllAutomatedMessages();
      res.json(messages);
    } catch (error) {
      console.error("Error fetching automated messages:", error);
      res.status(500).json({ message: "Failed to fetch automated messages" });
    }
  });

  app.post("/api/admin/automated-messages", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const message = await storage.createAutomatedMessage(req.body);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating automated message:", error);
      res.status(500).json({ message: "Failed to create automated message" });
    }
  });

  app.put("/api/admin/automated-messages/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      const message = await storage.updateAutomatedMessage(id, req.body);
      res.json(message);
    } catch (error) {
      console.error("Error updating automated message:", error);
      res.status(500).json({ message: "Failed to update automated message" });
    }
  });

  app.delete("/api/admin/automated-messages/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      await storage.deleteAutomatedMessage(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting automated message:", error);
      res.status(500).json({ message: "Failed to delete automated message" });
    }
  });

  app.patch("/api/admin/automated-messages/:id/toggle", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const id = parseInt(req.params.id);
      const { isActive } = req.body;
      const message = await storage.updateAutomatedMessage(id, { isActive });
      res.json(message);
    } catch (error) {
      console.error("Error toggling automated message:", error);
      res.status(500).json({ message: "Failed to toggle automated message" });
    }
  });

  // Daily Sales Report Settings routes
  app.get("/api/admin/daily-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const settings = await storage.getGroomingSettings();
      const enabledSetting = settings.find((s: any) => s.setting === 'daily_report_enabled');
      const emailsSetting = settings.find((s: any) => s.setting === 'daily_report_emails');
      const timeSetting = settings.find((s: any) => s.setting === 'daily_report_time');

      res.json({
        enabled: enabledSetting?.value === 'true',
        emails: emailsSetting?.value || '',
        time: timeSetting?.value || '21:00'
      });
    } catch (error) {
      console.error("Error fetching daily report settings:", error);
      res.status(500).json({ message: "Failed to fetch daily report settings" });
    }
  });

  app.post("/api/admin/daily-report-settings", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { enabled, emails, time } = req.body;

      // Save settings using grooming_settings table
      await storage.upsertGroomingSetting({ setting: 'daily_report_enabled', value: enabled ? 'true' : 'false' });
      await storage.upsertGroomingSetting({ setting: 'daily_report_emails', value: emails || '' });
      await storage.upsertGroomingSetting({ setting: 'daily_report_time', value: time || '21:00' });

      res.json({ success: true, message: "Daily report settings saved" });
    } catch (error) {
      console.error("Error saving daily report settings:", error);
      res.status(500).json({ message: "Failed to save daily report settings" });
    }
  });

  app.post("/api/admin/daily-report-settings/test", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { emails } = req.body;
      
      if (!emails || !emails.trim()) {
        return res.status(400).json({ message: "Email address is required" });
      }

      // Import and call the sendDailySalesReport function
      const { sendDailySalesReport } = await import('./dailySalesReport');
      await sendDailySalesReport(emails.split(',').map((e: string) => e.trim()).filter((e: string) => e));

      res.json({ success: true, message: "Test report sent successfully" });
    } catch (error: any) {
      console.error("Error sending test daily report:", error);
      res.status(500).json({ message: error.message || "Failed to send test report" });
    }
  });

  // Send refund report email
  app.post("/api/admin/send-refund-report", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { email, startDate, endDate } = req.body;
      
      if (!email || !email.trim()) {
        return res.status(400).json({ message: "Email address is required" });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Date range is required" });
      }

      // Fetch refunds from database - never trust client-provided refund data
      const refunds = await storage.getRefundsByDateRange(startDate, endDate);

      if (!refunds || refunds.length === 0) {
        return res.status(400).json({ message: "No refunds found for the selected date range" });
      }

      // Calculate totals from database data
      const totalRefunded = refunds.reduce((sum: number, r: any) => sum + parseFloat(r.refundAmount || 0), 0);

      // Build email content
      const refundRows = refunds.map((r: any) => 
        `<tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">#${r.orderId}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(r.refundDate).toLocaleDateString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${r.reason || 'N/A'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #d97706;">-$${parseFloat(r.refundAmount).toFixed(2)}</td>
        </tr>`
      ).join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e3a8a;">Animal House Pet Store - Refund Report</h2>
          <p style="color: #666;">Date Range: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</p>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 18px; color: #92400e;">
              <strong>Total Refunded: -$${totalRefunded.toFixed(2)}</strong>
            </p>
            <p style="margin: 5px 0 0; color: #78350f; font-size: 14px;">
              ${refunds.length} refund${refunds.length !== 1 ? 's' : ''} processed
            </p>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 10px; text-align: left;">Order</th>
                <th style="padding: 10px; text-align: left;">Date</th>
                <th style="padding: 10px; text-align: left;">Reason</th>
                <th style="padding: 10px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${refundRows}
            </tbody>
            <tfoot>
              <tr style="background-color: #fef3c7;">
                <td colspan="3" style="padding: 10px; font-weight: bold;">Total Refunded</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; color: #d97706;">-$${totalRefunded.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This report is for ExaTouch POS reconciliation purposes.<br>
            Generated on ${new Date().toLocaleString()}
          </p>
        </div>
      `;

      // Send email using sendGrid
      const { sendEmail } = await import('./notifications');
      await sendEmail({
        to: email,
        subject: `Refund Report: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
        html: emailHtml
      });

      res.json({ success: true, message: "Refund report sent successfully" });
    } catch (error: any) {
      console.error("Error sending refund report:", error);
      res.status(500).json({ message: error.message || "Failed to send refund report" });
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

  // Tax rate endpoint (public for cart checkout) - ExaTouch POS format
  app.get("/api/settings/tax-rate", async (_req, res) => {
    try {
      const settings = await storage.getGroomingSettings();
      const cityTax = settings.find(s => s.setting === 'tax_city')?.value || '0';
      const countyTax = settings.find(s => s.setting === 'tax_county')?.value || '0';
      const stateTax = settings.find(s => s.setting === 'tax_state')?.value || '5.0000';
      const federalTax = settings.find(s => s.setting === 'tax_federal')?.value || '5.9900';
      const showOnReceipt = settings.find(s => s.setting === 'tax_show_on_receipt')?.value !== 'false';
      const defaultForItems = settings.find(s => s.setting === 'tax_default_for_items')?.value !== 'false';
      const defaultForServices = settings.find(s => s.setting === 'tax_default_for_services')?.value !== 'false';
      
      // Calculate combined tax rate
      const taxRate = parseFloat(cityTax) + parseFloat(countyTax) + parseFloat(stateTax) + parseFloat(federalTax);
      
      res.json({ 
        taxRate,
        cityTax: parseFloat(cityTax),
        countyTax: parseFloat(countyTax),
        stateTax: parseFloat(stateTax),
        federalTax: parseFloat(federalTax),
        showOnReceipt,
        defaultForItems,
        defaultForServices
      });
    } catch (error) {
      console.error("Error fetching tax rate:", error);
      res.json({ taxRate: 10.99, cityTax: 0, countyTax: 0, stateTax: 5.0, federalTax: 5.99, showOnReceipt: true, defaultForItems: true, defaultForServices: true });
    }
  });

  // Set tax rate (Admin only) - ExaTouch POS format
  app.put("/api/admin/settings/tax-rate", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { cityTax, countyTax, stateTax, federalTax, showOnReceipt, defaultForItems, defaultForServices } = req.body;
      
      // Validate tax values
      const taxes = [cityTax, countyTax, stateTax, federalTax];
      for (const tax of taxes) {
        if (typeof tax !== 'number' || tax < 0 || tax > 100) {
          return res.status(400).json({ message: "Tax rates must be numbers between 0 and 100" });
        }
      }

      // Save individual tax rates
      await storage.upsertGroomingSetting({ setting: 'tax_city', value: cityTax.toFixed(4) });
      await storage.upsertGroomingSetting({ setting: 'tax_county', value: countyTax.toFixed(4) });
      await storage.upsertGroomingSetting({ setting: 'tax_state', value: stateTax.toFixed(4) });
      await storage.upsertGroomingSetting({ setting: 'tax_federal', value: federalTax.toFixed(4) });
      await storage.upsertGroomingSetting({ setting: 'tax_show_on_receipt', value: showOnReceipt ? 'true' : 'false' });
      await storage.upsertGroomingSetting({ setting: 'tax_default_for_items', value: defaultForItems ? 'true' : 'false' });
      await storage.upsertGroomingSetting({ setting: 'tax_default_for_services', value: defaultForServices ? 'true' : 'false' });
      
      // Calculate combined rate for backwards compatibility
      const taxRate = cityTax + countyTax + stateTax + federalTax;
      await storage.upsertGroomingSetting({ setting: 'tax_rate', value: taxRate.toString() });
      
      res.json({ success: true, taxRate, cityTax, countyTax, stateTax, federalTax, showOnReceipt, defaultForItems, defaultForServices });
    } catch (error) {
      console.error("Error setting tax rate:", error);
      res.status(500).json({ message: "Failed to set tax rate" });
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

  app.get("/api/groomers/available-for-date/:date", async (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      const groomers = await storage.getAvailableGroomersForDate(date);
      res.json(groomers);
    } catch (error) {
      console.error("Error fetching available groomers for date:", error);
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
      
      // Automatically add default availability for new groomer (Mon-Sat, 8am-1:30pm)
      try {
        for (let dayOfWeek = 1; dayOfWeek <= 6; dayOfWeek++) {
          await storage.setGroomerAvailability({
            groomerId: groomer.id,
            dayOfWeek,
            isAvailable: true,
            startTime: '08:00',
            endTime: '13:30',
          });
        }
      } catch (availError) {
        console.error("Error setting default groomer availability:", availError);
        // Don't fail groomer creation if availability setup fails
      }
      
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

  // Groomer blocked days routes (sick days, vacation, etc.)
  app.get("/api/admin/groomer-blocked-days", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const blockedDays = await storage.getAllGroomerBlockedDays();
      res.json(blockedDays);
    } catch (error) {
      console.error("Error fetching groomer blocked days:", error);
      res.status(500).json({ message: "Failed to fetch groomer blocked days" });
    }
  });

  app.get("/api/admin/groomers/:id/blocked-days", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const groomerId = parseInt(req.params.id);
      const blockedDays = await storage.getGroomerBlockedDays(groomerId);
      res.json(blockedDays);
    } catch (error) {
      console.error("Error fetching groomer blocked days:", error);
      res.status(500).json({ message: "Failed to fetch groomer blocked days" });
    }
  });

  app.post("/api/admin/groomer-blocked-days", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const blockedDayData = req.body;
      const blockedDay = await storage.createGroomerBlockedDay(blockedDayData);
      res.json(blockedDay);
    } catch (error) {
      console.error("Error creating groomer blocked day:", error);
      res.status(500).json({ message: "Failed to create groomer blocked day" });
    }
  });

  app.delete("/api/admin/groomer-blocked-days/:id", authMiddleware, async (req: any, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteGroomerBlockedDay(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting groomer blocked day:", error);
      res.status(500).json({ message: "Failed to delete groomer blocked day" });
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

  // Google Calendar integration removed - transition period complete

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

      // Capitalize first letter of each word in name and pet names
      const capitalizedName = capitalizeWords(trimmedName);
      // petNames can come as array or string from frontend, convert to array for database
      let capitalizedPetNames: string[] | null = null;
      if (petNames) {
        if (Array.isArray(petNames)) {
          // Frontend sends as array - capitalize each name
          const filteredNames = petNames.filter(name => name && typeof name === 'string' && name.trim());
          capitalizedPetNames = filteredNames.length > 0 
            ? filteredNames.map(name => capitalizeWords(name.trim()) as string)
            : null;
        } else if (typeof petNames === 'string') {
          // Fallback for string format - trim and capitalize
          const trimmed = petNames.trim();
          capitalizedPetNames = trimmed ? [capitalizeWords(trimmed) as string] : null;
        }
      }

      const contact = await storage.createContact({ 
        name: capitalizedName as string, 
        email: contactEmail, 
        phoneNumber: trimmedPhone,
        petNames: capitalizedPetNames,
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
      
      // Capitalize first letter of each word in name and pet names
      const capitalizedName = trimmedName ? capitalizeWords(trimmedName) : undefined;
      // petNames can come as array or string from frontend, convert to array for database
      let capitalizedPetNames: string[] | null | undefined = undefined;
      if (petNames !== undefined) {
        if (petNames === null || (Array.isArray(petNames) && petNames.length === 0)) {
          capitalizedPetNames = null;
        } else if (Array.isArray(petNames)) {
          // Frontend sends as array - capitalize each name
          const filteredNames = petNames.filter(name => name && typeof name === 'string' && name.trim());
          capitalizedPetNames = filteredNames.length > 0 
            ? filteredNames.map(name => capitalizeWords(name.trim()) as string)
            : null;
        } else if (typeof petNames === 'string') {
          // Fallback for string format - trim and capitalize
          const trimmed = petNames.trim();
          capitalizedPetNames = trimmed ? [capitalizeWords(trimmed) as string] : null;
        }
      }
      
      const contact = await storage.updateContact(id, { 
        name: capitalizedName as string | undefined, 
        email: contactEmail, 
        phoneNumber: trimmedPhone,
        petNames: capitalizedPetNames,
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

  // SMS Opt-Out Management
  app.patch("/api/contacts/:id/sms-opt-out", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const contactId = parseInt(req.params.id);
      const { optOut } = req.body;
      
      if (typeof optOut !== 'boolean') {
        return res.status(400).json({ message: "optOut must be a boolean" });
      }

      const contact = await storage.updateContactSmsOptOut(contactId, optOut);
      res.json(contact);
    } catch (error) {
      console.error("Error updating SMS opt-out:", error);
      res.status(500).json({ message: "Failed to update SMS opt-out status" });
    }
  });

  // Get SMS logs
  app.get("/api/admin/sms-logs", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getSmsLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching SMS logs:", error);
      res.status(500).json({ message: "Failed to fetch SMS logs" });
    }
  });

  // Get failed SMS logs only
  app.get("/api/admin/sms-logs/failed", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const logs = await storage.getFailedSmsLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching failed SMS logs:", error);
      res.status(500).json({ message: "Failed to fetch failed SMS logs" });
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

  // Download unmatched invoice items CSV (Admin only)
  app.get("/api/admin/unmatched-invoice-items", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const filePath = path.join(process.cwd(), 'attached_assets', 'unmatched_invoice_items.csv');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Unmatched invoice items file not found" });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="unmatched_invoice_items.csv"');
      res.sendFile(filePath);
    } catch (error) {
      console.error('Error downloading unmatched invoice items:', error);
      res.status(500).json({ message: "Failed to download file" });
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

      // Export all data in dependency order (parents before children)
      const allSupplies = await storage.getAllSupplies();
      const allOrders = await storage.getOrders();
      const allAppointments = await storage.getAppointments();
      const allGroomers = await storage.getAllGroomers();
      const allSpecialDateSettings = await storage.getAllSpecialDateSettings();
      
      // Get dependent data
      const orderItemsData = await storage.getAllOrderItems();
      const wishlistData = await storage.getAllWishlistItems();
      const customerPetsData = await storage.getAllCustomerPets();
      const groomerAvailabilityData = await storage.getAllGroomerAvailability();
      const weeklyLimitsData = await storage.getAllWeeklyLimits();
      const dailyLimitsData = await storage.getAllDailyLimits();
      const specialDateTimesData = await storage.getAllSpecialDateTimes();

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        data: {
          // Independent tables first
          users: await storage.getAllUsers(),
          groomers: allGroomers,
          pets: await storage.getAllPets(),
          supplies: allSupplies,
          contacts: await storage.getAllContacts(),
          
          // Dependent tables
          customerPets: customerPetsData,
          appointments: allAppointments,
          orders: allOrders,
          orderItems: orderItemsData,
          wishlistItems: wishlistData,
          groomerAvailability: groomerAvailabilityData,
          weeklyAppointmentLimits: weeklyLimitsData,
          dailyAppointmentLimits: dailyLimitsData,
          specialDateSettings: allSpecialDateSettings,
          specialDateAllowedTimes: specialDateTimesData,
        }
      };

      console.log(`Exported: ${exportData.data.users.length} users, ${exportData.data.supplies.length} supplies, ${exportData.data.appointments.length} appointments, ${exportData.data.orders.length} orders`);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="database-export-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting database:', error);
      res.status(500).json({ message: "Failed to export database" });
    }
  });

  // Import inventory from Excel file (Admin only)
  app.post("/api/admin/inventory/import", authMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const updateExisting = req.body.updateExisting === 'true';
      const fullSync = req.body.fullSync === 'true'; // Delete items not in import file
      
      // Parse Excel file from buffer using exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      
      // Convert worksheet to JSON format
      const data: any[] = [];
      const headers: any = {};
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // First row is headers
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value?.toString() || '';
          });
        } else {
          // Data rows
          const rowData: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          data.push(rowData);
        }
      });

      console.log(`Processing ${data.length} rows from Excel file...`);
      console.log(`Mode: ${updateExisting ? 'Update Existing' : 'Add New Only'}${fullSync ? ' + Full Sync (delete missing)' : ''}`);

      // Get existing supplies if updating
      let existingSuppliesMap = new Map();
      if (updateExisting) {
        const existingSupplies = await storage.getAllSupplies();
        existingSupplies.forEach((supply: any) => {
          existingSuppliesMap.set(supply.name.toLowerCase().trim(), supply);
        });
      } else {
        const existingSupplies = await storage.getAllSupplies();
        existingSupplies.forEach((supply: any) => {
          existingSuppliesMap.set(supply.name.toLowerCase().trim(), supply);
        });
      }

      let stats = {
        added: 0,
        updated: 0,
        skipped: 0,
        deleted: 0,
        errors: [] as string[]
      };
      
      // Track names from import file for full sync deletion
      const importedNames = new Set<string>();

      for (let i = 0; i < data.length; i++) {
        const row: any = data[i];

        try {
          // Skip header row
          if (row.Description === 'Description') {
            continue;
          }

          // Skip inactive items - default to active if TRUE column is missing
          // Only skip if explicitly set to false or FALSE string
          const isActive = row.TRUE === undefined || row.TRUE === true || String(row.TRUE).toLowerCase() === 'true';
          if (!isActive) {
            stats.skipped++;
            continue;
          }

          // Extract data from Excel columns
          const name = (row.Description || '').toString().trim();
          const category = (row['Category '] || row.Category || 'accessories').toString().trim().toLowerCase();
          const brand = (row.Mfg || row.Vendor || '').toString().trim();
          const price = parseFloat(row.Price || '0');
          const stockQuantity = parseInt(row.QtyOnHand || '0', 10) || 0;
          const size = (row.Size || '').toString().trim();
          const description = (row.DescLong || row.Description || '').toString().trim();
          const sku = (row.SKU || '').toString().trim() || null;

          // Skip if no name or price
          if (!name || name === '' || price <= 0) {
            stats.skipped++;
            continue;
          }
          
          // Track this name for full sync deletion
          importedNames.add(name.toLowerCase().trim());

          // Preserve Excel category as-is, only normalize known variants
          // The Excel file is the authoritative source for categories
          let normalizedCategory = category;
          
          // Normalize known category name variants
          const categoryMap: Record<string, string> = {
            'cat toy': 'toys',
            'dog toy': 'toys',
            'kennel': 'dogCages',
            'smallanimalsupplies': 'smallanimal',
            'health': 'healthcare',
            'treats': 'dogTreats',
            'doghouse': 'dogCages',
          };
          
          // Check if category needs normalization
          const lowerCategory = category.toLowerCase();
          if (categoryMap[lowerCategory]) {
            normalizedCategory = categoryMap[lowerCategory];
          } else {
            // Keep the Excel category as-is (leashes, aquatics, reptiles, etc.)
            normalizedCategory = category;
          }

          // Generate image URL (placeholder)
          const imageUrl = '/placeholder-supply.jpg';

          const existingSupply = existingSuppliesMap.get(name.toLowerCase().trim());

          if (existingSupply && updateExisting) {
            // Update existing supply
            await storage.updateSupply(existingSupply.id, {
              name,
              description,
              price,
              category: normalizedCategory,
              imageUrl: existingSupply.imageUrl || imageUrl,
              stockQuantity,
              brand,
              size,
              sku
            });
            stats.updated++;
          } else if (!existingSupply) {
            // Add new supply
            await storage.createSupply({
              name,
              description,
              price,
              category: normalizedCategory,
              imageUrl,
              stockQuantity,
              brand,
              size,
              sku
            });
            stats.added++;
          } else {
            // Skip if exists and not updating
            stats.skipped++;
          }
        } catch (error: any) {
          console.error(`Error processing row ${i}:`, error);
          stats.errors.push(`Row ${i}: ${error.message}`);
          if (stats.errors.length > 10) break; // Stop if too many errors
        }
      }

      // Full sync: Delete items that exist in database but not in import file
      if (fullSync && importedNames.size > 0) {
        const allExistingSupplies = await storage.getAllSupplies();
        for (const supply of allExistingSupplies) {
          const supplyNameLower = supply.name.toLowerCase().trim();
          if (!importedNames.has(supplyNameLower)) {
            try {
              await storage.deleteSupply(supply.id);
              stats.deleted++;
              console.log(`Deleted supply not in import: ${supply.name}`);
            } catch (err: any) {
              stats.errors.push(`Failed to delete ${supply.name}: ${err.message}`);
            }
          }
        }
      }

      console.log(`Import complete: ${stats.added} added, ${stats.updated} updated, ${stats.deleted} deleted, ${stats.skipped} skipped, ${stats.errors.length} errors`);

      res.json({
        success: true,
        stats,
        message: `Import complete: ${stats.added} added, ${stats.updated} updated${fullSync ? `, ${stats.deleted} deleted` : ''}, ${stats.skipped} skipped`
      });
    } catch (error: any) {
      console.error('Excel import error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to import Excel file",
        error: error.message 
      });
    }
  });

  // STAGING WORKFLOW: Stage Excel import with duplicate detection
  app.post("/api/admin/inventory/stage-import", authMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Generate unique session ID for this import
      const sessionId = `import_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Parse Excel file from buffer using exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      
      // Convert worksheet to JSON format
      const data: any[] = [];
      const headers: any = {};
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // First row is headers
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value?.toString() || '';
          });
        } else {
          // Data rows
          const rowData: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          if (Object.keys(rowData).length > 0) {
            data.push(rowData);
          }
        }
      });

      console.log(`Staging ${data.length} rows from Excel file...`);

      // Process and stage the supplies
      const suppliesData = data.map((row: any) => {
        const name = row['Description']?.toString().trim() || '';
        const category = row['Category']?.toString().toLowerCase().trim() || '';
        const price = parseFloat(row['Unit Price']?.toString().replace(/[^0-9.-]+/g, '') || '0');
        const description = row['Description']?.toString().trim() || '';
        const stockQuantity = parseInt(row['Quantity']?.toString() || '0');
        const brand = row['Brand']?.toString().trim() || null;
        const size = row['Size']?.toString().trim() || null;
        const sku = row['SKU']?.toString().trim() || null;

        return {
          name,
          category,
          brand,
          price,
          description,
          stockQuantity,
          size,
          sku
        };
      }).filter((supply: any) => supply.name && supply.price > 0);

      // Stage the imports with duplicate detection
      const result = await storage.stageSupplyImports(sessionId, suppliesData);

      console.log(`Staging complete: ${result.staged} new, ${result.updates} updates, ${result.duplicates} duplicates`);

      res.json({
        success: true,
        sessionId: result.sessionId,
        stats: {
          total: suppliesData.length,
          new: result.staged,
          updates: result.updates,
          duplicates: result.duplicates
        },
        message: `Import staged: ${result.staged} new items, ${result.updates} updates, ${result.duplicates} exact duplicates`
      });
    } catch (error: any) {
      console.error('Excel staging error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to stage Excel file",
        error: error.message 
      });
    }
  });

  // Get staged imports for preview
  app.get("/api/admin/inventory/staged/:sessionId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { sessionId } = req.params;
      const stagedItems = await storage.getStagedImports(sessionId);

      res.json({
        success: true,
        sessionId,
        items: stagedItems,
        summary: {
          total: stagedItems.length,
          new: stagedItems.filter(i => i.status === 'new').length,
          updates: stagedItems.filter(i => i.status === 'update').length,
          duplicates: stagedItems.filter(i => i.status === 'duplicate').length
        }
      });
    } catch (error: any) {
      console.error('Get staged imports error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to get staged imports",
        error: error.message 
      });
    }
  });

  // Approve staged imports and apply to production
  app.post("/api/admin/inventory/approve/:sessionId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { sessionId } = req.params;
      const result = await storage.approveStagedImports(sessionId);

      res.json({
        success: true,
        message: `Import approved: ${result.created} created, ${result.updated} updated`,
        stats: result
      });
    } catch (error: any) {
      console.error('Approve staged imports error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to approve imports",
        error: error.message 
      });
    }
  });

  // Reject staged imports
  app.delete("/api/admin/inventory/reject/:sessionId", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { sessionId } = req.params;
      await storage.rejectStagedImports(sessionId);

      res.json({
        success: true,
        message: "Staged imports rejected and deleted"
      });
    } catch (error: any) {
      console.error('Reject staged imports error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to reject imports",
        error: error.message 
      });
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
      
      // Validate import data format
      if (!importData || !importData.version || !importData.data) {
        return res.status(400).json({ message: "Invalid import data format - missing version or data" });
      }

      console.log("Starting database import...");
      console.log("Import data version:", importData.version);
      console.log("Source environment:", importData.environment);

      let stats = {
        users: 0,
        supplies: 0,
        pets: 0,
        groomers: 0,
        contacts: 0,
        customerPets: 0,
        appointments: 0,
        orders: 0,
        orderItems: 0,
        wishlistItems: 0,
        groomerAvailability: 0,
        weeklyLimits: 0,
        dailyLimits: 0,
        specialDateSettings: 0,
        specialDateAllowedTimes: 0,
      };

      // Import in dependency order: parents before children
      
      // 0. Users first (many tables reference userId)
      if (importData.data.users) {
        for (const user of importData.data.users) {
          try {
            await storage.upsertUserForImport(user);
            stats.users++;
          } catch (err) {
            console.error(`Failed to import user ${user.id}:`, err);
          }
        }
      }
      
      // 1. Independent tables (no foreign keys to users)
      if (importData.data.supplies) {
        for (const supply of importData.data.supplies) {
          try {
            await storage.upsertSupply(supply);
            stats.supplies++;
          } catch (err) {
            console.error(`Failed to import supply ${supply.id}:`, err);
          }
        }
      }

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

      // 2. Tables with foreign keys to above tables
      if (importData.data.customerPets) {
        for (const customerPet of importData.data.customerPets) {
          try {
            await storage.upsertCustomerPet(customerPet);
            stats.customerPets++;
          } catch (err) {
            console.error(`Failed to import customer pet ${customerPet.id}:`, err);
          }
        }
      }

      if (importData.data.groomerAvailability) {
        for (const availability of importData.data.groomerAvailability) {
          try {
            await storage.upsertGroomerAvailability(availability);
            stats.groomerAvailability++;
          } catch (err) {
            console.error(`Failed to import groomer availability ${availability.id}:`, err);
          }
        }
      }

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

      if (importData.data.orders) {
        for (const order of importData.data.orders) {
          try {
            await storage.upsertOrder(order);
            stats.orders++;
          } catch (err) {
            console.error(`Failed to import order ${order.id}:`, err);
          }
        }
      }

      // 3. Child tables (depend on orders)
      if (importData.data.orderItems) {
        for (const orderItem of importData.data.orderItems) {
          try {
            await storage.upsertOrderItem(orderItem);
            stats.orderItems++;
          } catch (err) {
            console.error(`Failed to import order item ${orderItem.id}:`, err);
          }
        }
      }

      if (importData.data.wishlistItems) {
        for (const wishlistItem of importData.data.wishlistItems) {
          try {
            await storage.upsertWishlistItem(wishlistItem);
            stats.wishlistItems++;
          } catch (err) {
            console.error(`Failed to import wishlist item ${wishlistItem.id}:`, err);
          }
        }
      }

      // 4. Settings tables
      if (importData.data.weeklyAppointmentLimits) {
        for (const limit of importData.data.weeklyAppointmentLimits) {
          try {
            await storage.upsertWeeklyLimit(limit);
            stats.weeklyLimits++;
          } catch (err) {
            console.error(`Failed to import weekly limit ${limit.id}:`, err);
          }
        }
      }

      if (importData.data.dailyAppointmentLimits) {
        for (const limit of importData.data.dailyAppointmentLimits) {
          try {
            await storage.upsertDailyLimit(limit);
            stats.dailyLimits++;
          } catch (err) {
            console.error(`Failed to import daily limit ${limit.id}:`, err);
          }
        }
      }

      if (importData.data.specialDateSettings) {
        for (const setting of importData.data.specialDateSettings) {
          try {
            await storage.upsertSpecialDateSetting(setting);
            stats.specialDateSettings++;
          } catch (err) {
            console.error(`Failed to import special date setting ${setting.id}:`, err);
          }
        }
      }

      if (importData.data.specialDateAllowedTimes) {
        for (const allowedTime of importData.data.specialDateAllowedTimes) {
          try {
            await storage.upsertSpecialDateAllowedTime(allowedTime);
            stats.specialDateAllowedTimes++;
          } catch (err) {
            console.error(`Failed to import special date allowed time ${allowedTime.id}:`, err);
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
      res.status(500).json({ message: "Failed to import database", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Export ONLY supplies to JSON (Admin only - Safe for production)
  app.get("/api/admin/supplies/export", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Starting supplies-only export...");

      const allSupplies = await storage.getAllSupplies();

      const exportData = {
        version: "1.0",
        type: "supplies-only",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        data: {
          supplies: allSupplies
        }
      };

      console.log(`Exported: ${exportData.data.supplies.length} supplies`);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="supplies-export-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting supplies:', error);
      res.status(500).json({ message: "Failed to export supplies" });
    }
  });

  // Create backup file on server (Admin only)
  app.post("/api/admin/supplies/backup", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const fs = await import('fs');
      const path = await import('path');
      
      console.log("Creating supplies backup...");
      const allSupplies = await storage.getAllSupplies();

      const backupData = {
        version: "1.0",
        type: "supplies-only",
        exportDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        totalProducts: allSupplies.length,
        data: {
          supplies: allSupplies
        }
      };

      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `rollback-inventory-${dateStr}.json`;
      const filepath = path.join(backupDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
      
      console.log(`Backup created: ${filename} with ${allSupplies.length} products`);

      res.json({ 
        message: "Backup created successfully",
        filename,
        totalProducts: allSupplies.length,
        path: filepath
      });
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({ message: "Failed to create backup" });
    }
  });

  // Import ONLY supplies from JSON (Admin only - SAFE FOR PRODUCTION)
  app.post("/api/admin/supplies/import", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const importData = req.body;
      
      // Validate import data format
      if (!importData || !importData.version || !importData.data) {
        return res.status(400).json({ message: "Invalid import data format - missing version or data" });
      }

      // Ensure this is a supplies-only export
      if (importData.type !== "supplies-only") {
        return res.status(400).json({ message: "This endpoint only accepts supplies-only export files. Use the full database import for complete exports." });
      }

      // Validate supplies array exists and is an array
      if (!importData.data.supplies || !Array.isArray(importData.data.supplies)) {
        return res.status(400).json({ message: "Invalid import data format - supplies must be an array" });
      }

      const fullSync = importData.fullSync === true; // Delete items not in import
      
      console.log("Starting supplies-only import...");
      console.log("Import data version:", importData.version);
      console.log("Source environment:", importData.environment);
      console.log(`Processing ${importData.data.supplies.length} supplies...`);
      console.log(`Full Sync mode: ${fullSync ? 'YES - will delete missing items' : 'NO'}`);

      // Sanitize all supplies data first (convert timestamp strings to Date objects)
      const sanitizedSupplies = importData.data.supplies.map((supply: any) => ({
        ...supply,
        createdAt: supply.createdAt ? new Date(supply.createdAt) : undefined,
        updatedAt: supply.updatedAt ? new Date(supply.updatedAt) : undefined
      }));

      // Use bulk upsert for performance
      const result = await storage.bulkUpsertSupplies(sanitizedSupplies);
      
      // Full sync: Delete items not in import file
      let deletedCount = 0;
      const deleteErrors: string[] = [];
      
      if (fullSync) {
        // Create set of IDs from import file
        const importedIds = new Set(sanitizedSupplies.map((s: any) => s.id));
        
        // Get all existing supplies
        const existingSupplies = await storage.getAllSupplies();
        
        // Delete supplies that are not in the import
        for (const supply of existingSupplies) {
          if (!importedIds.has(supply.id)) {
            try {
              await storage.deleteSupply(supply.id);
              deletedCount++;
              console.log(`Deleted supply not in import: ${supply.name} (ID: ${supply.id})`);
            } catch (err: any) {
              deleteErrors.push(`Failed to delete ${supply.name}: ${err.message}`);
            }
          }
        }
        console.log(`Full sync: deleted ${deletedCount} supplies not in import`);
      }

      console.log(`Supplies import complete: ${result.imported} imported, ${result.failed} failed, ${deletedCount} deleted, ${result.errors.length} errors`);

      res.json({ 
        message: result.errors.length === 0 && deleteErrors.length === 0
          ? `Supplies import completed successfully${fullSync ? ` (${deletedCount} deleted)` : ''}`
          : `Supplies import completed with ${result.errors.length + deleteErrors.length} error(s)`,
        stats: {
          supplies: result.imported,
          failed: result.failed,
          deleted: deletedCount,
          errorCount: result.errors.length + deleteErrors.length,
          errors: [...result.errors.slice(0, 10), ...deleteErrors.slice(0, 10)]
        }
      });
    } catch (error) {
      console.error('Error importing supplies:', error);
      res.status(500).json({ message: "Failed to import supplies" });
    }
  });

  // Assign SKUs from spreadsheet data (Admin only)
  app.post("/api/admin/supplies/assign-skus", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { skuData } = req.body;
      if (!skuData || !Array.isArray(skuData)) {
        return res.status(400).json({ message: "skuData array required" });
      }

      console.log(`[SKU-ASSIGN] Starting SKU assignment for ${skuData.length} items...`);
      
      const { expandAbbreviations } = await import('./abbreviationExpansion');
      
      // Get all supplies from database
      const allSupplies = await storage.getAllSupplies();
      console.log(`[SKU-ASSIGN] Found ${allSupplies.length} supplies in database`);
      
      // Create normalized lookup maps for matching
      const supplyByNormalizedName = new Map<string, typeof allSupplies[0]>();
      const supplyByExactName = new Map<string, typeof allSupplies[0]>();
      
      for (const supply of allSupplies) {
        // Store by exact lowercase name
        const exactKey = supply.name.toLowerCase().trim();
        supplyByExactName.set(exactKey, supply);
        
        // Also create normalized version without special chars
        const normalizedName = supply.name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        supplyByNormalizedName.set(normalizedName, supply);
      }
      
      let matched = 0;
      let notFound = 0;
      const errors: string[] = [];
      const notFoundItems: string[] = [];
      
      for (const item of skuData) {
        const { sku, abbreviatedName } = item;
        if (!sku || !abbreviatedName) continue;
        
        // Expand the abbreviated name using our abbreviation system
        const expandedName = expandAbbreviations(abbreviatedName);
        
        // Try multiple matching strategies
        let foundSupply = null;
        
        // Strategy 1: Exact match on expanded name
        const expandedLower = expandedName.toLowerCase().trim();
        foundSupply = supplyByExactName.get(expandedLower);
        
        // Strategy 2: Normalized match
        if (!foundSupply) {
          const normalizedExpanded = expandedName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          foundSupply = supplyByNormalizedName.get(normalizedExpanded);
        }
        
        // Strategy 3: Fuzzy match - find best match by similarity
        if (!foundSupply) {
          const expandedWords = expandedName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
          let bestMatch = null;
          let bestScore = 0;
          
          for (const supply of allSupplies) {
            const supplyWords = supply.name.toLowerCase().split(/\s+/).filter(w => w.length > 1);
            let matchCount = 0;
            
            for (const word of expandedWords) {
              if (supplyWords.some(sw => sw.includes(word) || word.includes(sw))) {
                matchCount++;
              }
            }
            
            const score = matchCount / Math.max(expandedWords.length, 1);
            if (score > bestScore && score >= 0.6) {
              bestScore = score;
              bestMatch = supply;
            }
          }
          
          if (bestMatch) {
            foundSupply = bestMatch;
          }
        }
        
        if (foundSupply) {
          // Update SKU
          try {
            await storage.updateSupply(foundSupply.id, { sku });
            matched++;
            console.log(`[SKU-ASSIGN] Matched: "${abbreviatedName}" -> "${foundSupply.name}" (SKU: ${sku})`);
          } catch (err: any) {
            errors.push(`Failed to update ${foundSupply.name}: ${err.message}`);
          }
        } else {
          notFound++;
          notFoundItems.push(`${sku}: ${abbreviatedName}`);
        }
      }
      
      console.log(`[SKU-ASSIGN] Complete: ${matched} matched, ${notFound} not found`);
      
      res.json({
        message: `SKU assignment complete: ${matched} matched, ${notFound} not found`,
        stats: {
          matched,
          notFound,
          total: skuData.length
        },
        notFoundItems: notFoundItems.slice(0, 50),
        errors: errors.slice(0, 20)
      });
    } catch (error) {
      console.error('[SKU-ASSIGN] Error:', error);
      res.status(500).json({ message: "Failed to assign SKUs" });
    }
  });

  // Fix Kong toys in Reptiles section (One-time fix - Admin only)
  app.post("/api/admin/supplies/fix-kong-reptiles", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("[FIX-KONG] Clearing Kong toys from reptile category...");
      
      // Direct SQL update to fix Kong products
      const result = await storage.fixKongReptiles();
      
      console.log(`[FIX-KONG] Fixed ${result.count} Kong products`);

      res.json({
        message: `Successfully cleared ${result.count} Kong products from reptile category`,
        count: result.count
      });
    } catch (error) {
      console.error('[FIX-KONG] Error fixing Kong reptiles:', error);
      res.status(500).json({ message: "Failed to fix Kong reptiles" });
    }
  });

  // Get all brand catalog entries (Admin only)
  app.get("/api/admin/brand-catalog", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const entries = await storage.getAllBrandCatalogEntries();
      return res.json(entries);
    } catch (error) {
      console.error("Error fetching brand catalog:", error);
      return res.status(500).json({ message: "Failed to fetch brand catalog" });
    }
  });

  // Create brand catalog entry (Admin only)
  app.post("/api/admin/brand-catalog", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate request body with zod schema
      const { insertBrandCatalogSchema } = await import('@shared/schema');
      const validated = insertBrandCatalogSchema.parse(req.body);

      const entry = await storage.createBrandCatalogEntry(validated);
      return res.json(entry);
    } catch (error) {
      console.error("Error creating brand catalog entry:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation failed",
          error: error.message
        });
      }
      return res.status(500).json({ 
        message: "Failed to create brand catalog entry",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update brand catalog entry (Admin only)
  app.patch("/api/admin/brand-catalog/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate request body with partial zod schema
      const { insertBrandCatalogSchema } = await import('@shared/schema');
      const validated = insertBrandCatalogSchema.partial().parse(req.body);

      const entry = await storage.updateBrandCatalogEntry(parseInt(req.params.id), validated);
      return res.json(entry);
    } catch (error) {
      console.error("Error updating brand catalog entry:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation failed",
          error: error.message
        });
      }
      return res.status(500).json({ message: "Failed to update brand catalog entry" });
    }
  });

  // Delete brand catalog entry (Admin only)
  app.delete("/api/admin/brand-catalog/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteBrandCatalogEntry(parseInt(req.params.id));
      return res.json({ message: "Brand catalog entry deleted successfully" });
    } catch (error) {
      console.error("Error deleting brand catalog entry:", error);
      return res.status(500).json({ message: "Failed to delete brand catalog entry" });
    }
  });

  // Seed brand catalog with validated research (Admin only)
  app.post("/api/admin/brand-catalog/seed", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Seeding brand catalog with validated research...");
      const { seedBrandCatalog } = await import('./seedBrandCatalog');
      
      await seedBrandCatalog(storage);
      
      return res.json({ 
        message: "Brand catalog seeded successfully",
        success: true 
      });
    } catch (error) {
      console.error("Error seeding brand catalog:", error);
      return res.status(500).json({ 
        message: "Failed to seed brand catalog",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Process All: Expand abbreviations → Auto-categorize → Cleanup → Audit (Admin only)
  app.post("/api/admin/supplies/process-all", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Starting 'Process All' - Step 1/3: Expanding abbreviations...");
      const startTime = Date.now();
      
      // Expand abbreviations using brand catalog
      const { expandAbbreviationsAsync } = await import('./abbreviationExpansion');
      const supplies = await storage.getAllSupplies();
      const totalSupplies = supplies.length;
      let expandChanged = 0;
      let expandUnchanged = 0;
      let catalogHits = 0;
      let processed = 0;

      console.log(`Processing ${totalSupplies} supplies...`);

      // Import standardization functions
      const { standardizeProductName, standardizeBrandName } = await import('./productCategorization');
      
      for (const supply of supplies) {
        const nameResult = await expandAbbreviationsAsync(supply.name, storage);
        const descResult = await expandAbbreviationsAsync(supply.description, storage);

        if (nameResult.catalogUsed || descResult.catalogUsed) {
          catalogHits++;
        }

        // Apply standardization (spelling fixes, abbreviation expansion)
        let finalName = standardizeProductName(nameResult.expanded);
        const finalBrand = standardizeBrandName(supply.brand || '');
        
        // Truncate name if it exceeds 255 characters (database column limit)
        if (finalName.length > 255) {
          console.log(`Truncating long name (${finalName.length} chars): ${finalName.substring(0, 50)}...`);
          finalName = finalName.substring(0, 252) + '...';
        }

        const needsUpdate = 
          finalName !== supply.name || 
          descResult.expanded !== supply.description ||
          (finalBrand && finalBrand !== supply.brand);

        if (needsUpdate) {
          await storage.updateSupply(supply.id, {
            name: finalName,
            description: descResult.expanded,
            ...(finalBrand && finalBrand !== supply.brand ? { brand: finalBrand } : {})
          });
          expandChanged++;
        } else {
          expandUnchanged++;
        }
        
        processed++;
        // Log progress every 500 products
        if (processed % 500 === 0) {
          console.log(`Step 1/3 Progress: ${processed}/${totalSupplies} (${Math.round(processed/totalSupplies*100)}%)`);
        }
      }
      console.log(`Step 1/3 Complete: ${expandChanged} changed, ${expandUnchanged} unchanged, ${catalogHits} catalog hits`);
      
      console.log("Step 2/3: Auto-categorizing supplies...");
      
      // Step 0: Remove invalid pets (toys/supplies that shouldn't be in pets table)
      const { detectLiveAnimal } = await import('./productCategorization');
      const allPets = await storage.getAllPets();
      let invalidPetsRemoved = 0;
      let invalidPetsSkipped = 0;
      
      for (const pet of allPets) {
        const detection = detectLiveAnimal(pet.name);
        if (!detection.isLiveAnimal) {
          const hasReferences = await storage.hasPetReferences(pet.id);
          if (hasReferences) {
            invalidPetsSkipped++;
          } else {
            try {
              await storage.deletePet(pet.id);
              invalidPetsRemoved++;
            } catch (error) {
              invalidPetsSkipped++;
            }
          }
        }
      }

      const allSupplies = await storage.getAllSupplies();
      let movedToPets = 0;
      let skippedDueToReferences = 0;
      
      for (const supply of allSupplies) {
        const detection = detectLiveAnimal(supply.name);
        if (detection.isLiveAnimal && detection.species) {
          try {
            await storage.createPet({
              name: supply.name,
              species: detection.species,
              breed: detection.detectedKeywords.join(' ') || null,
              price: supply.price,
              description: supply.description || null,
              imageUrl: supply.imageUrl || null,
              imageUrls: supply.imageUrls || [],
              priceSource: supply.priceSource || 'default',
            });
            
            try {
              await storage.deleteSupply(supply.id);
              movedToPets++;
            } catch (deleteError: any) {
              skippedDueToReferences++;
            }
          } catch (error) {
            console.error(`Error moving "${supply.name}" to pets:`, error);
          }
        }
      }

      // Step 2a: Assign brands to products without brands
      console.log("Step 2a: Assigning brands to products without brands...");
      const { extractBrand } = await import('./brandCatalog');
      const freshSupplies = await storage.getAllSupplies();
      let brandsAssigned = 0;
      
      for (const supply of freshSupplies) {
        if (!supply.brand || supply.brand.trim() === '') {
          const detectedBrand = extractBrand(supply.name);
          if (detectedBrand) {
            await storage.updateSupply(supply.id, { brand: detectedBrand });
            brandsAssigned++;
          }
        }
      }
      console.log(`Brand assignment complete: ${brandsAssigned} products updated`);

      // Step 2b: Auto-categorize specialty sections
      const filterStats = await storage.autoCategorizeAllSupplies();
      
      // Step 2c: Auto-categorize product types
      const categoryStats = await storage.autoCategorizeProductCategories();
      
      // Step 2d: Cleanup categories - fix mismatches, normalize names, split food
      console.log("Step 2d: Cleaning up categories...");
      const cleanupStats = await storage.cleanupCategories();
      
      console.log("Step 3/3: Auditing unknown abbreviations...");
      const { auditUnknownAbbreviations } = await import('./abbreviationAudit');
      const auditResults = await auditUnknownAbbreviations();

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      res.json({
        message: "All processing completed successfully",
        stats: {
          expand: {
            changed: expandChanged,
            unchanged: expandUnchanged,
            catalogHits: catalogHits,
          },
          invalidPetsRemoved,
          invalidPetsSkipped,
          liveAnimals: { movedToPets, skippedDueToReferences },
          brandsAssigned: brandsAssigned,
          filterType: filterStats,
          categories: categoryStats,
          cleanup: cleanupStats,
          audit: {
            total: auditResults.total,
            catalogHits: auditResults.catalogHits,
            unknownCount: auditResults.unknownAbbreviations.length,
          },
        },
        totalDuration: `${totalDuration}s`
      });
    } catch (error) {
      console.error('Error in process-all:', error);
      res.status(500).json({ message: "Failed to complete processing" });
    }
  });

  // Sync categories from Excel file (Admin only)
  // Uses the Excel file as the authoritative source for product categories
  app.post("/api/admin/supplies/sync-categories-from-excel", authMiddleware, excelUpload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("Syncing categories from Excel file...");

      // Parse Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      // Build map of product name -> category from Excel
      const excelCategories = new Map<string, string>();
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const name = row.getCell(2).value?.toString().trim().toLowerCase();
        const category = row.getCell(4).value?.toString().trim();

        if (name && category && !category.startsWith('$')) {
          excelCategories.set(name, category);
        }
      });

      console.log(`Found ${excelCategories.size} products in Excel file`);

      // Get all supplies and update categories
      const allSupplies = await storage.getAllSupplies();
      let updated = 0;
      let unchanged = 0;
      let notFound = 0;

      for (const supply of allSupplies) {
        const nameLower = supply.name.toLowerCase().trim();
        const excelCategory = excelCategories.get(nameLower);

        if (excelCategory) {
          // Normalize category names
          let normalizedCategory = excelCategory;
          const categoryNormalization: Record<string, string> = {
            'cat toy': 'toys',
            'dog toy': 'toys',
            'kennel': 'dogCages',
            'smallanimalsupplies': 'smallanimal',
            'health': 'healthcare',
            'doghouse': 'dogCages',
          };
          if (categoryNormalization[excelCategory.toLowerCase()]) {
            normalizedCategory = categoryNormalization[excelCategory.toLowerCase()];
          }

          if (supply.category !== normalizedCategory) {
            await storage.updateSupply(supply.id, { category: normalizedCategory });
            updated++;
          } else {
            unchanged++;
          }
        } else {
          notFound++;
        }
      }

      console.log(`Category sync complete: ${updated} updated, ${unchanged} unchanged, ${notFound} not in Excel`);

      res.json({
        message: "Category sync completed",
        stats: {
          excelProducts: excelCategories.size,
          updated,
          unchanged,
          notFound
        }
      });
    } catch (error) {
      console.error('Error syncing categories from Excel:', error);
      res.status(500).json({ message: "Failed to sync categories from Excel" });
    }
  });

  // Search for product image from major distributors (Admin only)
  app.post("/api/admin/supplies/search-image/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const supply = await storage.getSupply(parseInt(id));
      
      if (!supply) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Return the search query info for the frontend to use
      const searchQuery = supply.brand 
        ? `${supply.brand} ${supply.name} pet supplies product image site:chewy.com OR site:petco.com OR site:petsmart.com`
        : `${supply.name} pet supplies product image site:chewy.com OR site:petco.com OR site:petsmart.com`;

      res.json({
        productId: supply.id,
        productName: supply.name,
        brand: supply.brand,
        searchQuery: searchQuery,
        message: "Use this search query to find product images"
      });
    } catch (error) {
      console.error('Error searching for product image:', error);
      res.status(500).json({ message: "Failed to search for product image" });
    }
  });

  // Update product image URL (Admin only)
  app.put("/api/admin/supplies/:id/image", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ message: "Image URL is required" });
      }

      await storage.updateSupply(parseInt(id), { imageUrl });

      res.json({ 
        message: "Product image updated successfully",
        imageUrl 
      });
    } catch (error) {
      console.error('Error updating product image:', error);
      res.status(500).json({ message: "Failed to update product image" });
    }
  });

  // Get products without images (Admin only)
  app.get("/api/admin/supplies/without-images", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { limit = '100', offset = '0', brand, category, search } = req.query;
      const supplies = await storage.getSuppliesWithoutImages(
        parseInt(limit as string), 
        parseInt(offset as string),
        brand as string,
        category as string,
        search as string
      );

      res.json(supplies);
    } catch (error) {
      console.error('Error getting products without images:', error);
      res.status(500).json({ message: "Failed to get products without images" });
    }
  });

  // Get products by filter - supports showing all or just missing images (Admin only)
  app.get("/api/admin/supplies/by-filter", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { limit = '100', offset = '0', brand, category, search, missingOnly = 'true' } = req.query;
      const showMissingOnly = missingOnly === 'true';
      
      if (showMissingOnly) {
        // Use existing method for missing images only
        const supplies = await storage.getSuppliesWithoutImages(
          parseInt(limit as string), 
          parseInt(offset as string),
          brand as string,
          category as string,
          search as string
        );
        res.json(supplies);
      } else {
        // Get all supplies matching filters (with or without images)
        const supplies = await storage.getSuppliesByFilter(
          parseInt(limit as string), 
          parseInt(offset as string),
          brand as string,
          category as string,
          search as string
        );
        res.json(supplies);
      }
    } catch (error) {
      console.error('Error getting products by filter:', error);
      res.status(500).json({ message: "Failed to get products" });
    }
  });

  // Get counts by brand and category (Admin only)
  app.get("/api/admin/supplies/image-stats", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const stats = await storage.getSupplyImageStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting supply image stats:', error);
      res.status(500).json({ message: "Failed to get supply image stats" });
    }
  });

  // Batch search for product images - generates search queries for manual image URL entry (Admin only)
  app.post("/api/admin/supplies/batch-image-search", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { productIds, maxProducts = 20 } = req.body;
      
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ message: "Product IDs array is required" });
      }

      // Enforce strict limit to prevent excessive processing (max 50)
      const requestedMax = Math.min(Math.max(1, parseInt(maxProducts) || 20), 50);
      const idsToProcess = productIds.slice(0, Math.min(productIds.length, requestedMax));
      const results = [];

      for (const productId of idsToProcess) {
        try {
          const supply = await storage.getSupply(productId);
          
          if (!supply) {
            results.push({
              productId: parseInt(productId),
              productName: 'Unknown Product',
              brand: null,
              success: false,
              error: 'Product not found',
              searchQuery: '',
              imageUrl: null,
              approved: false
            });
            continue;
          }

          // Build structured search query for pet supply distributors
          const brandPart = supply.brand ? `${supply.brand} ` : '';
          const searchQuery = `${brandPart}${supply.name} pet supply product image site:chewy.com OR site:petco.com OR site:petsmart.com OR site:amazon.com`.trim();
          
          // Return structured result for manual image URL entry
          results.push({
            productId: supply.id,
            productName: supply.name,
            brand: supply.brand || null,
            success: true,
            searchQuery,
            imageUrl: null,
            approved: false,
            error: null
          });
        } catch (error: any) {
          results.push({
            productId: parseInt(productId),
            productName: 'Error loading product',
            brand: null,
            success: false,
            error: error.message || 'Failed to process product',
            searchQuery: '',
            imageUrl: null,
            approved: false
          });
        }
      }

      res.json({
        success: true,
        processed: results.length,
        total: productIds.length,
        maxProducts: requestedMax,
        results
      });
    } catch (error: any) {
      console.error('Batch image search error:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to perform batch image search",
        error: error.message 
      });
    }
  });

  // Get products by brand or category for batch processing (Admin only)
  app.get("/api/admin/supplies/batch-filter", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { brand, category, limit = '50', offset = '0' } = req.query;
      
      if (!brand && !category) {
        return res.status(400).json({ message: "Brand or category is required" });
      }

      const supplies = await storage.getSuppliesByBrandOrCategory({
        brand: brand as string,
        category: category as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });

      res.json(supplies);
    } catch (error) {
      console.error('Error getting products by brand/category:', error);
      res.status(500).json({ message: "Failed to get products by brand/category" });
    }
  });

  // Download and store product image permanently from external URL (Admin only)
  // Also applies abbreviation expansion to correct product names
  app.post("/api/admin/supplies/:id/download-image", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { externalUrl } = req.body;

      if (!externalUrl) {
        return res.status(400).json({ message: "External URL is required" });
      }

      const supply = await storage.getSupply(parseInt(id));
      if (!supply) {
        return res.status(404).json({ message: "Product not found" });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      
      const result = await objectStorageService.downloadAndStoreProductImage(
        externalUrl,
        supply.id,
        supply.name,
        supply.brand || 'unknown'
      );

      if (!result.success) {
        return res.status(400).json({ message: result.error || "Failed to download image" });
      }

      // Apply abbreviation expansion to correct product name
      const { expandAbbreviationsAsync } = await import('./abbreviationExpansion');
      const nameResult = await expandAbbreviationsAsync(supply.name, storage);
      const correctedName = nameResult.expanded;
      const nameWasCorrected = correctedName !== supply.name;

      // Update both image and corrected name
      await storage.updateSupply(supply.id, { 
        imageUrl: result.storedPath!,
        ...(nameWasCorrected ? { name: correctedName } : {})
      });

      res.json({
        success: true,
        productId: supply.id,
        storedPath: result.storedPath,
        nameCorrected: nameWasCorrected,
        originalName: nameWasCorrected ? supply.name : undefined,
        correctedName: nameWasCorrected ? correctedName : undefined
      });
    } catch (error: any) {
      console.error('Error downloading and storing product image:', error);
      res.status(500).json({ message: "Failed to download and store image", error: error.message });
    }
  });

  // Batch download and store product images from external URLs (Admin only)
  // Also applies abbreviation expansion to correct product names
  app.post("/api/admin/supplies/batch-download-images", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { products } = req.body;

      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: "Products array is required" });
      }

      if (products.length > 20) {
        return res.status(400).json({ message: "Maximum 20 products per batch" });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      const { expandAbbreviationsAsync } = await import('./abbreviationExpansion');

      const results: any[] = [];
      let namesCorrected = 0;
      
      for (const product of products) {
        if (!product.id || !product.externalUrl) {
          results.push({ id: product.id, success: false, error: 'Missing id or externalUrl' });
          continue;
        }

        const supply = await storage.getSupply(product.id);
        if (!supply) {
          results.push({ id: product.id, success: false, error: 'Product not found' });
          continue;
        }

        const result = await objectStorageService.downloadAndStoreProductImage(
          product.externalUrl,
          supply.id,
          supply.name,
          supply.brand || 'unknown'
        );

        if (result.success && result.storedPath) {
          // Apply abbreviation expansion to correct product name
          const nameResult = await expandAbbreviationsAsync(supply.name, storage);
          const correctedName = nameResult.expanded;
          const nameWasCorrected = correctedName !== supply.name;
          
          await storage.updateSupply(supply.id, { 
            imageUrl: result.storedPath,
            ...(nameWasCorrected ? { name: correctedName } : {})
          });
          
          if (nameWasCorrected) namesCorrected++;
        }

        results.push({
          id: supply.id,
          name: supply.name,
          success: result.success,
          storedPath: result.storedPath,
          error: result.error
        });

        await new Promise(resolve => setTimeout(resolve, 300));
      }

      res.json({
        success: true,
        processed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      });
    } catch (error: any) {
      console.error('Error batch downloading product images:', error);
      res.status(500).json({ message: "Failed to batch download images", error: error.message });
    }
  });

  // Bulk download ALL external URL images to Object Storage (Admin only)
  // Processes supplies with external URLs in configurable batches by brand
  app.post("/api/admin/supplies/bulk-download-all-images", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { 
        brand = null,           // Filter by brand (null = all brands)
        batchSize = 50,         // Products per batch
        delayMs = 200,          // Delay between downloads
        offset = 0,             // Starting offset for pagination
        maxProducts = 100       // Max products to process in this request
      } = req.body;

      // Get all supplies with external URLs
      let query = `
        SELECT id, name, brand, image_url 
        FROM supplies 
        WHERE image_url LIKE 'http%'
      `;
      
      if (brand) {
        query += ` AND LOWER(brand) = LOWER('${brand.replace(/'/g, "''")}')`;
      }
      
      query += ` ORDER BY brand, id LIMIT ${Math.min(maxProducts, 200)} OFFSET ${offset}`;

      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const products = await db.execute(sql.raw(query));
      
      if (!products.rows || products.rows.length === 0) {
        return res.json({
          success: true,
          message: "No products with external URLs found",
          processed: 0,
          successful: 0,
          failed: 0,
          nextOffset: null
        });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();

      const results: any[] = [];
      let successful = 0;
      let failed = 0;

      for (const row of products.rows as any[]) {
        try {
          const result = await objectStorageService.downloadAndStoreProductImage(
            row.image_url,
            row.id,
            row.name,
            row.brand || 'unknown'
          );

          if (result.success && result.storedPath) {
            await storage.updateSupply(row.id, { imageUrl: result.storedPath });
            successful++;
            results.push({
              id: row.id,
              name: row.name,
              brand: row.brand,
              success: true,
              storedPath: result.storedPath
            });
          } else {
            failed++;
            results.push({
              id: row.id,
              name: row.name,
              brand: row.brand,
              success: false,
              error: result.error
            });
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (error: any) {
          failed++;
          results.push({
            id: row.id,
            name: row.name,
            brand: row.brand,
            success: false,
            error: error.message
          });
        }
      }

      // Calculate next offset for pagination
      const hasMore = products.rows.length === Math.min(maxProducts, 200);
      const nextOffset = hasMore ? offset + products.rows.length : null;

      res.json({
        success: true,
        processed: results.length,
        successful,
        failed,
        offset,
        nextOffset,
        hasMore,
        brandFilter: brand || 'all',
        results
      });
    } catch (error: any) {
      console.error('Error bulk downloading images:', error);
      res.status(500).json({ message: "Failed to bulk download images", error: error.message });
    }
  });

  // Get statistics on supplies with external URLs vs Object Storage (Admin only)
  app.get("/api/admin/supplies/image-download-stats", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      // Get overall stats
      const overallStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN image_url LIKE '/public-objects/%' THEN 1 END) as in_object_storage,
          COUNT(CASE WHEN image_url LIKE 'http%' THEN 1 END) as external_urls,
          COUNT(CASE WHEN image_url IS NULL OR image_url = '' THEN 1 END) as no_image
        FROM supplies
      `);

      // Get stats by brand for external URLs
      const brandStats = await db.execute(sql`
        SELECT 
          COALESCE(brand, 'Unknown') as brand,
          COUNT(*) as external_count
        FROM supplies 
        WHERE image_url LIKE 'http%'
        GROUP BY brand
        ORDER BY COUNT(*) DESC
        LIMIT 50
      `);

      res.json({
        overall: overallStats.rows[0],
        byBrand: brandStats.rows
      });
    } catch (error: any) {
      console.error('Error getting image download stats:', error);
      res.status(500).json({ message: "Failed to get image download stats", error: error.message });
    }
  });

  // Clear all broken external URLs by setting them to null (Admin only)
  // This removes references to broken external images so products show as "no image"
  app.post("/api/admin/supplies/clear-broken-external-urls", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      // Count how many will be affected
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM supplies WHERE image_url LIKE 'http%'
      `);
      const affectedCount = parseInt(countResult.rows[0]?.count as string || '0');

      // Clear all external URLs by setting to null
      await db.execute(sql`
        UPDATE supplies SET image_url = NULL WHERE image_url LIKE 'http%'
      `);

      console.log(`Cleared ${affectedCount} broken external URLs from supplies`);

      res.json({
        success: true,
        clearedCount: affectedCount,
        message: `Cleared ${affectedCount} external URL references. These products now show as 'no image'.`
      });
    } catch (error: any) {
      console.error('Error clearing broken external URLs:', error);
      res.status(500).json({ message: "Failed to clear broken external URLs", error: error.message });
    }
  });

  // Restore Object Storage image references by scanning the bucket (Admin only)
  // This fixes products that have null image_url but have files in Object Storage
  app.post("/api/admin/supplies/restore-image-references", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { objectStorageClient } = await import('./objectStorageService');
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      // Get bucket name from environment
      const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
      if (!publicPaths) {
        return res.status(500).json({ message: "PUBLIC_OBJECT_SEARCH_PATHS not configured" });
      }

      const firstPath = publicPaths.split(';')[0];
      const bucketMatch = firstPath.match(/^([^/]+)/);
      if (!bucketMatch) {
        return res.status(500).json({ message: "Could not parse bucket name from PUBLIC_OBJECT_SEARCH_PATHS" });
      }
      const bucketName = bucketMatch[1];

      console.log(`Scanning Object Storage bucket: ${bucketName}/public/products/`);

      // List all files in the products directory
      const bucket = objectStorageClient.bucket(bucketName);
      const [files] = await bucket.getFiles({ prefix: 'public/products/' });

      console.log(`Found ${files.length} files in Object Storage`);

      // Extract product IDs from file names and build a map
      const fileMap = new Map<number, string>();
      for (const file of files) {
        // File names are like: public/products/brand/product-name-123.jpg
        const match = file.name.match(/-(\d+)\.(jpg|png|gif|webp)$/i);
        if (match) {
          const productId = parseInt(match[1]);
          const storedPath = `/public-objects/${file.name.replace(/^public\//, '')}`;
          fileMap.set(productId, storedPath);
        }
      }

      console.log(`Matched ${fileMap.size} files to product IDs`);

      // Get all products with null image_url
      const nullImageProducts = await db.execute(sql`
        SELECT id FROM supplies WHERE image_url IS NULL
      `);

      let restored = 0;
      for (const row of nullImageProducts.rows) {
        const productId = row.id as number;
        if (fileMap.has(productId)) {
          const storedPath = fileMap.get(productId)!;
          await db.execute(sql`
            UPDATE supplies SET image_url = ${storedPath} WHERE id = ${productId}
          `);
          restored++;
        }
      }

      console.log(`Restored ${restored} image references from Object Storage`);

      res.json({
        success: true,
        filesInStorage: files.length,
        matchedToProducts: fileMap.size,
        productsWithNullImage: nullImageProducts.rows.length,
        restored,
        message: `Restored ${restored} image references from Object Storage`
      });
    } catch (error: any) {
      console.error('Error restoring image references:', error);
      res.status(500).json({ message: "Failed to restore image references", error: error.message });
    }
  });

  // Export image URLs for syncing to production (Admin only)
  // Downloads a JSON file with all product IDs and their image_url values
  app.get("/api/admin/supplies/export-image-urls", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      // Get all products with non-null image URLs
      const result = await db.execute(sql`
        SELECT id, image_url FROM supplies 
        WHERE image_url IS NOT NULL AND image_url != ''
        ORDER BY id
      `);

      const imageData = result.rows.map((row: any) => ({
        id: row.id,
        image_url: row.image_url
      }));

      console.log(`Exporting ${imageData.length} image URLs for sync`);

      // Set headers for JSON download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=image-urls-export.json');
      
      res.json({
        exportedAt: new Date().toISOString(),
        totalProducts: imageData.length,
        data: imageData
      });
    } catch (error: any) {
      console.error('Error exporting image URLs:', error);
      res.status(500).json({ message: "Failed to export image URLs", error: error.message });
    }
  });

  // Import image URLs from development to production (Admin only)
  // Accepts JSON with array of {id, image_url} objects
  app.post("/api/admin/supplies/import-image-urls", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { data } = req.body;
      
      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ message: "Invalid data format. Expected { data: [{id, image_url}, ...] }" });
      }

      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      let updated = 0;
      let skipped = 0;
      let notFound = 0;

      for (const item of data) {
        if (!item.id || !item.image_url) {
          skipped++;
          continue;
        }

        try {
          // Check if product exists
          const existsResult = await db.execute(sql`
            SELECT id FROM supplies WHERE id = ${item.id}
          `);

          if (existsResult.rows.length === 0) {
            notFound++;
            continue;
          }

          // Update the image_url
          await db.execute(sql`
            UPDATE supplies SET image_url = ${item.image_url} WHERE id = ${item.id}
          `);
          updated++;
        } catch (itemError) {
          console.error(`Error updating product ${item.id}:`, itemError);
          skipped++;
        }
      }

      console.log(`Import complete: ${updated} updated, ${skipped} skipped, ${notFound} not found`);

      res.json({
        success: true,
        totalInImport: data.length,
        updated,
        skipped,
        notFound,
        message: `Successfully updated ${updated} product image URLs`
      });
    } catch (error: any) {
      console.error('Error importing image URLs:', error);
      res.status(500).json({ message: "Failed to import image URLs", error: error.message });
    }
  });

  // Sync images by product name/brand (for production sync where IDs differ)
  // Matches Object Storage images to products by name slug instead of ID
  app.post("/api/admin/supplies/sync-images-by-name", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();

      // Check if Object Storage is configured
      if (!objectStorageService.isObjectStorageConfigured()) {
        return res.status(400).json({ 
          message: "Object Storage is not configured in this environment. Please set up Object Storage in the Replit tools panel first, or ensure the PUBLIC_OBJECT_SEARCH_PATHS secret is set.",
          error: "OBJECT_STORAGE_NOT_CONFIGURED"
        });
      }

      console.log('Starting image sync by name...');

      // Step 1: List all images from Object Storage
      const allImages = await objectStorageService.listAllProductImages();
      console.log(`Found ${allImages.length} images in Object Storage`);

      // Step 2: Build a map of brandSlug/productSlug -> storedPath
      // Handle multiple images with same slug (different IDs) by keeping the first one
      const imageMap = new Map<string, string>();
      const duplicates: string[] = [];
      
      for (const img of allImages) {
        const key = `${img.brandSlug}/${img.productSlug}`;
        if (!imageMap.has(key)) {
          imageMap.set(key, img.storedPath);
        } else {
          duplicates.push(key);
        }
      }
      console.log(`Built image map with ${imageMap.size} unique entries, ${duplicates.length} duplicates ignored`);

      // Step 3: Get all products from database
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const result = await db.execute(sql`
        SELECT id, name, brand FROM supplies ORDER BY id
      `);
      
      const products = result.rows as Array<{ id: number; name: string; brand: string | null }>;
      console.log(`Found ${products.length} products in database`);

      // Step 4: Match products to images and update
      let matched = 0;
      let unmatched = 0;
      const unmatchedProducts: Array<{ id: number; name: string; brand: string | null }> = [];

      for (const product of products) {
        const { brandSlug, productSlug } = objectStorageService.generateProductSlug(
          product.name,
          product.brand || 'unknown'
        );
        const key = `${brandSlug}/${productSlug}`;
        
        if (imageMap.has(key)) {
          const storedPath = imageMap.get(key)!;
          await db.execute(sql`
            UPDATE supplies SET image_url = ${storedPath} WHERE id = ${product.id}
          `);
          matched++;
        } else {
          unmatched++;
          if (unmatchedProducts.length < 100) {
            unmatchedProducts.push(product);
          }
        }
      }

      console.log(`Sync complete: ${matched} matched, ${unmatched} unmatched`);

      res.json({
        success: true,
        totalImages: allImages.length,
        uniqueImageSlugs: imageMap.size,
        totalProducts: products.length,
        matched,
        unmatched,
        duplicatesIgnored: duplicates.length,
        sampleUnmatched: unmatchedProducts.slice(0, 20),
        message: `Successfully matched ${matched} products to images`
      });
    } catch (error: any) {
      console.error('Error syncing images by name:', error);
      res.status(500).json({ message: "Failed to sync images by name", error: error.message });
    }
  });

  // Direct file upload for supply images (Admin only)
  // Also applies abbreviation expansion to correct product names
  app.post("/api/admin/supplies/:id/upload-image", authMiddleware, upload.single('image'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const supply = await storage.getSupply(parseInt(id));
      if (!supply) {
        return res.status(404).json({ message: "Product not found" });
      }

      const fs = await import('fs/promises');
      const fileBuffer = await fs.readFile(req.file.path);
      
      const { ObjectStorageService } = await import('./objectStorageService');
      const objectStorageService = new ObjectStorageService();
      
      const result = await objectStorageService.storeUploadedProductImage(
        fileBuffer,
        req.file.mimetype,
        supply.id,
        supply.name,
        supply.brand || 'unknown'
      );

      await fs.unlink(req.file.path).catch(() => {});

      if (!result.success) {
        return res.status(400).json({ message: result.error || "Failed to store image" });
      }

      // Apply abbreviation expansion to correct product name
      const { expandAbbreviationsAsync } = await import('./abbreviationExpansion');
      const nameResult = await expandAbbreviationsAsync(supply.name, storage);
      const correctedName = nameResult.expanded;
      const nameWasCorrected = correctedName !== supply.name;

      // Determine where to place the new image:
      // - If no main image exists, new image becomes main
      // - If main image exists, append new image to imageUrls array
      const hasMainImage = supply.imageUrl && supply.imageUrl.trim() !== '';
      
      let updateData: any = {
        ...(nameWasCorrected ? { name: correctedName } : {})
      };
      
      if (!hasMainImage) {
        // First image: set as main
        updateData.imageUrl = result.storedPath!;
      } else {
        // Additional image: append to imageUrls array
        const existingUrls = supply.imageUrls || [];
        updateData.imageUrls = [...existingUrls, result.storedPath!];
      }
      
      await storage.updateSupply(supply.id, updateData);

      res.json({
        success: true,
        productId: supply.id,
        productName: nameWasCorrected ? correctedName : supply.name,
        storedPath: result.storedPath,
        isMainImage: !hasMainImage,
        nameCorrected: nameWasCorrected,
        originalName: nameWasCorrected ? supply.name : undefined
      });
    } catch (error: any) {
      console.error('Error uploading supply image:', error);
      res.status(500).json({ message: "Failed to upload image", error: error.message });
    }
  });

  // ============================================
  // ORDER PHOTO UPLOAD & EXTRACTION ROUTES
  // ============================================

  // Upload order photo and extract items using AI Vision (Admin only)
  app.post("/api/admin/order-photos", upload.single('photo'), authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const priceMultiplier = parseFloat(req.body.priceMultiplier || "1.0");
      
      if (isNaN(priceMultiplier) || priceMultiplier <= 0) {
        return res.status(400).json({ message: "Invalid price multiplier" });
      }

      // Create the order photo record
      const orderPhoto = await storage.createOrderPhoto({
        userId: user.id,
        imageUrl: `/uploads/${req.file.filename}`,
        priceMultiplier: priceMultiplier.toString(),
        status: "processing"
      });

      // Process the image with AI Vision in background
      const imagePath = req.file.path;
      
      try {
        const extractionResult = await extractOrderFromPhoto(imagePath);
        
        if (!extractionResult.success) {
          // Update status to error
          await storage.updateOrderPhoto(orderPhoto.id, {
            status: "error",
            errorMessage: extractionResult.error || "Failed to extract items"
          });
          return res.status(500).json({ 
            message: "Failed to extract items from photo",
            error: extractionResult.error 
          });
        }

        // Save extracted items to database
        const itemsToCreate = extractionResult.items.map(item => ({
          orderPhotoId: orderPhoto.id,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          markedUpPrice: apply99Pricing(item.unitPrice * priceMultiplier).toFixed(2),
          category: item.category || "accessories",
          brand: item.brand || null,
          notes: item.notes || null,
          addedToInventory: false
        }));

        const extractedItems = await storage.bulkCreateExtractedOrderItems(itemsToCreate);

        // Update status to completed
        await storage.updateOrderPhoto(orderPhoto.id, {
          status: "completed",
          aiResponse: extractionResult.rawResponse || null
        });

        res.json({
          success: true,
          orderPhoto: {
            ...orderPhoto,
            status: "completed"
          },
          extractedItems,
          itemCount: extractedItems.length
        });

      } catch (processingError: any) {
        console.error("Error processing order photo:", processingError);
        await storage.updateOrderPhoto(orderPhoto.id, {
          status: "error",
          errorMessage: processingError.message
        });
        res.status(500).json({ 
          message: "Failed to process order photo",
          error: processingError.message 
        });
      }
    } catch (error: any) {
      console.error("Error uploading order photo:", error);
      res.status(500).json({ message: "Failed to upload order photo" });
    }
  });

  // Get all order photos (Admin only)
  app.get("/api/admin/order-photos", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const orderPhotos = await storage.getAllOrderPhotos();
      res.json(orderPhotos);
    } catch (error) {
      console.error("Error fetching order photos:", error);
      res.status(500).json({ message: "Failed to fetch order photos" });
    }
  });

  // Get a single order photo with its extracted items (Admin only)
  app.get("/api/admin/order-photos/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const orderPhoto = await storage.getOrderPhoto(id);
      
      if (!orderPhoto) {
        return res.status(404).json({ message: "Order photo not found" });
      }

      const extractedItems = await storage.getExtractedOrderItems(id);
      
      res.json({
        orderPhoto,
        extractedItems
      });
    } catch (error) {
      console.error("Error fetching order photo:", error);
      res.status(500).json({ message: "Failed to fetch order photo" });
    }
  });

  // Update an order photo (Admin only)
  app.put("/api/admin/order-photos/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { name } = req.body;
      
      const updatedPhoto = await storage.updateOrderPhoto(id, { name });
      res.json(updatedPhoto);
    } catch (error) {
      console.error("Error updating order photo:", error);
      res.status(500).json({ message: "Failed to update order photo" });
    }
  });

  // Update an extracted order item (Admin only)
  app.put("/api/admin/extracted-items/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { itemName, quantity, unitPrice, markedUpPrice, category, brand, notes } = req.body;
      
      // When manually updating, preserve the exact price without .99 pricing adjustment
      const updatedItem = await storage.updateExtractedOrderItem(id, {
        itemName,
        quantity,
        unitPrice,
        markedUpPrice: parseFloat(markedUpPrice).toFixed(2),
        category,
        brand,
        notes
      });

      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating extracted item:", error);
      res.status(500).json({ message: "Failed to update extracted item" });
    }
  });

  // Delete an extracted order item (Admin only)
  app.delete("/api/admin/extracted-items/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteExtractedOrderItem(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting extracted item:", error);
      res.status(500).json({ message: "Failed to delete extracted item" });
    }
  });

  // Add extracted items to supplies inventory (Admin only)
  app.post("/api/admin/extracted-items/add-to-inventory", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { itemIds } = req.body;
      
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "Item IDs array is required" });
      }

      const results = [];
      
      for (const itemId of itemIds) {
        try {
          const extractedItem = await storage.getExtractedOrderItem(parseInt(itemId));
          
          if (!extractedItem) {
            results.push({ itemId, success: false, error: "Item not found" });
            continue;
          }

          if (extractedItem.addedToInventory) {
            results.push({ itemId, success: false, error: "Already added to inventory" });
            continue;
          }

          // Skip non-inventory items like truck fuel charge
          if (extractedItem.itemName.toLowerCase().includes('truck fuel charge')) {
            results.push({ itemId, success: false, error: "Skipped - non-inventory expense item" });
            continue;
          }

          // Detect if this is a live animal (should go to pets, not supplies)
          const liveAnimalDetection = detectLiveAnimal(extractedItem.itemName);

          if (liveAnimalDetection.isLiveAnimal) {
            // This is a live animal - add to pets instead of supplies
            const speciesMap: Record<string, string> = {
              mice: 'Small Animals',
              mouse: 'Small Animals',
              hamster: 'Small Animals',
              guineapig: 'Small Animals',
              gerbil: 'Small Animals',
              chinchilla: 'Small Animals',
              ferret: 'Small Animals',
              rabbit: 'Small Animals',
              rat: 'Small Animals',
              hedgehog: 'Small Animals',
              goldfish: 'Fish',
              betta: 'Fish',
              guppy: 'Fish',
              molly: 'Fish',
              platy: 'Fish',
              swordtail: 'Fish',
              tetra: 'Fish',
              angelfish: 'Fish',
              gourami: 'Fish',
              barb: 'Fish',
              danio: 'Fish',
              rasbora: 'Fish',
              loach: 'Fish',
              catfish: 'Fish',
              cichlid: 'Fish',
              discus: 'Fish',
              koi: 'Fish',
              shrimp: 'Other',
              algaeeater: 'Other',
              feederfish: 'Fish',
              arowana: 'Fish',
              gecko: 'Reptiles',
              beardeddragon: 'Reptiles',
              chameleon: 'Reptiles',
              iguana: 'Reptiles',
              snake: 'Reptiles',
              turtle: 'Reptiles',
              frog: 'Reptiles',
              salamander: 'Reptiles',
              parakeet: 'Birds',
              cockatiel: 'Birds',
              canary: 'Birds',
              finch: 'Birds',
              parrot: 'Birds'
            };

            const species = speciesMap[liveAnimalDetection.species || ''] || 'Other';

            // Create pet from extracted item
            const pet = await storage.createPet({
              name: extractedItem.itemName,
              species: species,
              breed: liveAnimalDetection.detectedKeywords.join(', ') || null,
              price: extractedItem.markedUpPrice,
              age: null,
              description: extractedItem.notes || null,
              isActive: true
            });

            // Mark item as added to inventory (linked to pet instead of supply)
            await storage.updateExtractedOrderItem(extractedItem.id, {
              addedToInventory: true,
              supplyId: null // No supply ID since it's a pet
            });

            results.push({ 
              itemId: extractedItem.id, 
              success: true, 
              petId: pet.id,
              petName: pet.name,
              isLiveAnimal: true,
              detectedAs: liveAnimalDetection.species
            });
            continue;
          }

          // Apply auto-categorization to determine filterType and category
          const categorizationResult = categorizeProduct({
            name: extractedItem.itemName,
            brand: extractedItem.brand || '',
            description: extractedItem.notes || ''
          });

          // Determine category based on filterType or fall back to extracted category
          let category = extractedItem.category || "accessories";
          if (categorizationResult.filterType === 'aquatic') {
            category = 'fish'; // Aquatic items are fish supplies
          } else if (categorizationResult.filterType === 'reptile') {
            category = 'reptile'; // Reptile items
          } else if (categorizationResult.filterType === 'smallanimal') {
            category = 'smallanimal'; // Small animal items (mice, ferrets, rabbits, etc.)
          }

          // Create supply from extracted item with auto-categorization applied
          const supply = await storage.createSupply({
            name: extractedItem.itemName,
            category: category,
            brand: extractedItem.brand || null,
            price: extractedItem.markedUpPrice,
            description: extractedItem.notes || null,
            stockQuantity: extractedItem.quantity,
            isActive: true,
            filterType: categorizationResult.filterType // Set filterType for aquatic/reptile specialty sections
          });

          // Mark item as added to inventory
          await storage.updateExtractedOrderItem(extractedItem.id, {
            addedToInventory: true,
            supplyId: supply.id
          });

          results.push({ 
            itemId: extractedItem.id, 
            success: true, 
            supplyId: supply.id,
            supplyName: supply.name,
            isLiveAnimal: false
          });
        } catch (itemError: any) {
          console.error(`Error adding item ${itemId} to inventory:`, itemError);
          results.push({ 
            itemId, 
            success: false, 
            error: itemError.message 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      res.json({
        success: true,
        processed: results.length,
        successCount,
        results
      });
    } catch (error: any) {
      console.error("Error adding items to inventory:", error);
      res.status(500).json({ message: "Failed to add items to inventory" });
    }
  });

  // Delete an order photo and all its extracted items (Admin only)
  app.delete("/api/admin/order-photos/:id", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteOrderPhoto(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order photo:", error);
      res.status(500).json({ message: "Failed to delete order photo" });
    }
  });

  // ============================================
  // ASTRO LOYALTY INTEGRATION ROUTES
  // ============================================

  // Test Astro API connection (Admin only)
  app.get("/api/admin/astro/test-connection", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { testAstroConnection } = await import('./astroLoyalty');
      const result = await testAstroConnection();
      
      res.json(result);
    } catch (error) {
      console.error("Error testing Astro connection:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to test Astro connection",
        error: (error as Error).message
      });
    }
  });

  // Get Astro customer status for current user
  app.get("/api/astro/my-status", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const astroCustomer = await storage.getAstroCustomerByUserId(userId);
      
      if (!astroCustomer) {
        return res.json({
          linked: false,
          message: "Your account is not linked to Astro Loyalty yet"
        });
      }

      // Get frequent buyer progress
      const progress = await storage.getFrequentBuyerProgressByCustomer(astroCustomer.id);

      res.json({
        linked: true,
        loyaltyPoints: astroCustomer.loyaltyPoints,
        email: astroCustomer.email,
        lastSyncedAt: astroCustomer.lastSyncedAt,
        syncStatus: astroCustomer.syncStatus,
        frequentBuyerPrograms: progress
      });
    } catch (error) {
      console.error("Error getting Astro status:", error);
      res.status(500).json({ message: "Failed to get loyalty status" });
    }
  });

  // Link customer to Astro Loyalty (creates account if needed)
  app.post("/api/astro/link-account", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if already linked
      const existing = await storage.getAstroCustomerByUserId(userId);
      if (existing) {
        return res.status(400).json({ 
          message: "Account is already linked to Astro Loyalty",
          astroCustomer: existing
        });
      }

      // Lookup or create customer in Astro
      const { lookupOrCreateAstroCustomer } = await import('./astroLoyalty');
      const astroData = await lookupOrCreateAstroCustomer({
        email: user.email || '',
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        phoneNumber: user.phoneNumber || undefined,
      });

      if (!astroData) {
        return res.status(503).json({ 
          message: "Astro Loyalty integration is not currently enabled. Please contact store admin."
        });
      }

      // Create local Astro customer record
      const astroCustomer = await storage.createAstroCustomer({
        userId,
        astroCustomerId: astroData.customerId,
        email: user.email || '',
        phoneNumber: user.phoneNumber || null,
        loyaltyPoints: astroData.loyaltyPoints,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
      });

      res.json({
        success: true,
        message: "Successfully linked to Astro Loyalty!",
        astroCustomer
      });
    } catch (error) {
      console.error("Error linking Astro account:", error);
      res.status(500).json({ message: "Failed to link Astro account" });
    }
  });

  // Sync a purchase to Astro (called automatically on order completion)
  app.post("/api/astro/sync-purchase/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const orderId = parseInt(req.params.orderId);

      // Get the order
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify ownership (unless admin)
      const user = await storage.getUser(userId);
      if (order.userId !== userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if customer is linked to Astro
      const astroCustomer = await storage.getAstroCustomerByUserId(order.userId);
      if (!astroCustomer) {
        return res.status(400).json({ 
          message: "Customer account is not linked to Astro Loyalty"
        });
      }

      // Check if already synced
      const existingSync = await storage.getPurchaseSyncLogByOrder(orderId);
      if (existingSync.length > 0 && existingSync[0].syncStatus === 'success') {
        return res.status(400).json({ 
          message: "This purchase has already been synced to Astro"
        });
      }

      // Get order items
      const orderItemsList = await storage.getOrderItemsByOrder(orderId);
      if (orderItemsList.length === 0) {
        return res.status(400).json({ message: "Order has no items" });
      }

      // Prepare purchase data
      const { syncPurchaseToAstro } = await import('./astroLoyalty');
      const items = [];
      
      for (const item of orderItemsList) {
        if (item.supplyId) {
          const supply = await storage.getSupply(item.supplyId);
          if (supply) {
            items.push({
              productId: supply.id.toString(),
              productName: supply.name,
              brand: supply.brand || undefined,
              quantity: item.quantity,
              unitPrice: parseFloat(item.price),
              totalPrice: parseFloat(item.price) * item.quantity,
            });
          }
        }
      }

      const syncResult = await syncPurchaseToAstro({
        customerId: astroCustomer.astroCustomerId,
        transactionId: orderId.toString(),
        items,
        purchaseDate: order.orderDate,
        totalAmount: parseFloat(order.totalAmount),
      });

      if (!syncResult) {
        // Log failed sync
        await storage.createPurchaseSyncLog({
          orderId,
          astroCustomerId: astroCustomer.id,
          supplyId: null,
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          syncStatus: 'failed',
          syncError: 'Astro integration not enabled',
        });

        return res.status(503).json({ 
          message: "Astro Loyalty integration is not currently enabled"
        });
      }

      // Log successful sync for each item
      for (const item of items) {
        await storage.createPurchaseSyncLog({
          orderId,
          astroCustomerId: astroCustomer.id,
          supplyId: parseInt(item.productId),
          quantity: item.quantity,
          syncStatus: 'success',
          astroTransactionId: syncResult.transactionId,
        });
      }

      res.json({
        success: true,
        message: "Purchase synced to Astro Loyalty successfully!",
        astroTransactionId: syncResult.transactionId
      });
    } catch (error) {
      console.error("Error syncing purchase to Astro:", error);
      res.status(500).json({ message: "Failed to sync purchase" });
    }
  });

  // Get all Astro customers (Admin only)
  app.get("/api/admin/astro/customers", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const customers = await storage.getAllAstroCustomers();
      
      // Enrich with user data
      const enrichedCustomers = await Promise.all(
        customers.map(async (astroCustomer) => {
          const user = await storage.getUser(astroCustomer.userId);
          return {
            ...astroCustomer,
            userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
            userEmail: user?.email
          };
        })
      );

      res.json(enrichedCustomers);
    } catch (error) {
      console.error("Error getting Astro customers:", error);
      res.status(500).json({ message: "Failed to get Astro customers" });
    }
  });

  // ========================================
  // POS INTEGRATION ENDPOINTS
  // ========================================

  // POS Webhook - Receive real-time product updates from POS system
  app.post("/api/pos/webhook", async (req, res) => {
    try {
      const { products, type } = req.body; // type: 'supply' or 'pet'
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ message: "Invalid products data" });
      }

      // Import POS sync functions
      const { bulkSyncFromPOS } = await import('./posSync');
      
      const result = await bulkSyncFromPOS(products, type || 'supply');
      
      console.log(`POS Webhook: Updated=${result.updated}, Created=${result.created}, Skipped=${result.skipped}, Errors=${result.errors.length}`);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error processing POS webhook:", error);
      res.status(500).json({ message: "Failed to process POS webhook" });
    }
  });

  // Manual POS Sync - Admin can trigger manual sync
  app.post("/api/admin/pos/sync", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { products, type } = req.body;
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({ message: "Invalid products data" });
      }

      const { bulkSyncFromPOS } = await import('./posSync');
      const result = await bulkSyncFromPOS(products, type || 'supply');
      
      res.json({
        success: true,
        message: `Synced ${result.updated + result.created} items from POS`,
        ...result
      });
    } catch (error) {
      console.error("Error manual POS sync:", error);
      res.status(500).json({ message: "Failed to sync from POS" });
    }
  });

  // Set manual override flags for a supply
  app.post("/api/admin/supplies/:id/manual-override", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { overridePrice, overrideQuantity } = req.body;

      const { setSupplyManualOverride } = await import('./posSync');
      await setSupplyManualOverride(
        parseInt(id),
        overridePrice ?? false,
        overrideQuantity ?? false
      );

      res.json({ 
        success: true,
        message: "Manual override flags updated"
      });
    } catch (error) {
      console.error("Error setting manual override:", error);
      res.status(500).json({ message: "Failed to set manual override" });
    }
  });

  // Set manual override flag for a pet
  app.post("/api/admin/pets/:id/manual-override", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { overridePrice } = req.body;

      const { setPetManualOverride } = await import('./posSync');
      await setPetManualOverride(parseInt(id), overridePrice ?? false);

      res.json({ 
        success: true,
        message: "Manual override flag updated"
      });
    } catch (error) {
      console.error("Error setting manual override:", error);
      res.status(500).json({ message: "Failed to set manual override" });
    }
  });

  // Get POS sync status
  app.get("/api/admin/pos/status", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { getSuppliesPOSSyncStatus } = await import('./posSync');
      const status = await getSuppliesPOSSyncStatus();
      
      res.json(status);
    } catch (error) {
      console.error("Error getting POS status:", error);
      res.status(500).json({ message: "Failed to get POS status" });
    }
  });

  // Download CSV endpoint for unbranded products
  app.get("/api/download-csv", (req, res) => {
    const filePath = path.join(process.cwd(), 'FINAL-UNBRANDED-PRODUCTS-UPDATED.csv');
    res.download(filePath, 'FINAL-UNBRANDED-PRODUCTS-UPDATED.csv', (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  });

  // ============================================
  // IMAGE URL SYNC (Dev to Production)
  // ============================================
  
  // Export all product image URLs for syncing to production (Admin only)
  app.get("/api/admin/supplies/image-sync/export", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const supplies = await storage.getAllSupplies();
      
      // Export only necessary fields for image sync
      const imageData = supplies
        .filter(s => s.imageUrl && s.imageUrl.trim() !== '')
        .map(s => ({
          id: s.id,
          name: s.name,
          brand: s.brand || null,
          imageUrl: s.imageUrl
        }));

      res.json({
        exportedAt: new Date().toISOString(),
        totalProducts: supplies.length,
        productsWithImages: imageData.length,
        data: imageData
      });
    } catch (error) {
      console.error('Error exporting image URLs:', error);
      res.status(500).json({ message: "Failed to export image URLs" });
    }
  });

  // Import product image URLs (for use in production) (Admin only)
  // IMPORTANT: Matches by NAME + BRAND first (not ID) since IDs differ between environments
  // NEW: Downloads external URLs to Object Storage for permanent storage
  app.post("/api/admin/supplies/image-sync/import", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { data, dryRun = false, downloadToStorage = false } = req.body;

      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ message: "Invalid data format. Expected { data: [...] }" });
      }

      // Load Object Storage service if downloading
      let objectStorageService: any = null;
      if (downloadToStorage && !dryRun) {
        const { ObjectStorageService } = await import('./objectStorageService');
        objectStorageService = new ObjectStorageService();
      }

      // Load all supplies once for efficient matching
      const allSupplies = await storage.getAllSupplies();
      
      // Build lookup maps for fast matching
      const supplyByNameBrand = new Map<string, typeof allSupplies[0]>();
      const supplyByName = new Map<string, typeof allSupplies[0][]>();
      
      for (const supply of allSupplies) {
        // Exact name + brand key (normalized)
        const key = `${supply.name.toLowerCase().trim()}|${(supply.brand || '').toLowerCase().trim()}`;
        supplyByNameBrand.set(key, supply);
        
        // Also index by name only for fallback
        const nameKey = supply.name.toLowerCase().trim();
        if (!supplyByName.has(nameKey)) {
          supplyByName.set(nameKey, []);
        }
        supplyByName.get(nameKey)!.push(supply);
      }

      const stats = {
        attempted: data.length,
        updated: 0,
        skipped: 0,
        notFound: 0,
        matchedByNameBrand: 0,
        matchedByNameOnly: 0,
        downloadedToStorage: 0,
        downloadFailed: 0,
        errors: [] as string[]
      };

      const updates: { id: number; name: string; brand: string | null; oldUrl: string | null; newUrl: string; matchType: string; downloaded?: boolean }[] = [];
      const notFoundItems: { name: string; brand: string | null }[] = [];

      for (const item of data) {
        if (!item.imageUrl) {
          stats.skipped++;
          continue;
        }

        try {
          let supply: typeof allSupplies[0] | undefined;
          let matchType = 'none';

          // PRIORITY 1: Match by exact name + brand (most reliable)
          if (item.name) {
            const key = `${item.name.toLowerCase().trim()}|${(item.brand || '').toLowerCase().trim()}`;
            supply = supplyByNameBrand.get(key);
            if (supply) {
              matchType = 'name+brand';
              stats.matchedByNameBrand++;
            }
          }

          // PRIORITY 2: Match by name only (if brand didn't match but name is unique)
          if (!supply && item.name) {
            const nameKey = item.name.toLowerCase().trim();
            const matches = supplyByName.get(nameKey);
            if (matches && matches.length === 1) {
              supply = matches[0];
              matchType = 'name-only';
              stats.matchedByNameOnly++;
            }
          }

          if (!supply) {
            stats.notFound++;
            notFoundItems.push({ name: item.name, brand: item.brand });
            continue;
          }

          // Check if imageUrl is different
          if (supply.imageUrl === item.imageUrl) {
            stats.skipped++;
            continue;
          }

          let finalImageUrl = item.imageUrl;
          let downloaded = false;

          // If downloadToStorage is enabled and URL is external, download to Object Storage
          if (downloadToStorage && !dryRun && objectStorageService && item.imageUrl.startsWith('http')) {
            try {
              const result = await objectStorageService.downloadAndStoreProductImage(
                item.imageUrl,
                supply.id,
                supply.name,
                supply.brand || 'unknown'
              );
              if (result.success && result.storedPath) {
                finalImageUrl = result.storedPath;
                downloaded = true;
                stats.downloadedToStorage++;
              } else {
                stats.downloadFailed++;
                stats.errors.push(`${supply.name}: Download failed - ${result.error}`);
                continue;
              }
            } catch (downloadError: any) {
              stats.downloadFailed++;
              stats.errors.push(`${supply.name}: Download error - ${downloadError.message}`);
              continue;
            }
          }

          updates.push({
            id: supply.id,
            name: supply.name,
            brand: supply.brand,
            oldUrl: supply.imageUrl,
            newUrl: finalImageUrl,
            matchType,
            downloaded
          });

          if (!dryRun) {
            await storage.updateSupply(supply.id, { imageUrl: finalImageUrl });
          }
          stats.updated++;
        } catch (error: any) {
          stats.errors.push(`${item.name}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        dryRun,
        downloadToStorage,
        stats,
        updates: dryRun ? updates.slice(0, 50) : undefined,
        notFound: notFoundItems.slice(0, 20),
        message: dryRun 
          ? `Dry run complete. ${stats.updated} products would be updated (${stats.matchedByNameBrand} by name+brand, ${stats.matchedByNameOnly} by name only).`
          : downloadToStorage
            ? `Sync complete. ${stats.updated} products updated. ${stats.downloadedToStorage} images downloaded to storage.`
            : `Sync complete. ${stats.updated} products updated.`
      });
    } catch (error) {
      console.error('Error importing image URLs:', error);
      res.status(500).json({ message: "Failed to import image URLs" });
    }
  });

  // Server is now created externally in index.ts
}
