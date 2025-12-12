import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
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
import { db } from './db';
import { eq } from 'drizzle-orm';
import { expandProductAbbreviations } from './abbreviationExpansion';
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
      const { setObjectAclPolicy } = await import('./objectStorageAcl');
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

      // Get all supplies and pets
      const allSupplies = await storage.getAllSupplies();
      const allPets = await storage.getAllPets();

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
          sku: supply.id.toString(),
          altSku: '',
          category: supply.category || '',
          subCategory: supply.productType || '',
          mfg: supply.brand || '',
          mfgPart: '',
          color: '',
          size: '',
          style: '',
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
          vendor: '',
          vendorBuyQty: '',
          vendorSrp: '',
          vendorCost: '',
          vendorPart: '',
          vendorLeadTime: '',
        });
      });

      // Add pets
      allPets.forEach(pet => {
        const priceNum = pet.price ? parseFloat(pet.price.toString()) : '';
        
        itemsSheet.addRow({
          active: pet.isAvailable ? 'True' : 'False',
          description: pet.name || '',
          descLong: pet.description || pet.name || '',
          descButton: (pet.name || '').substring(0, 20),
          descReceipt: pet.name || '',
          descRemote: pet.name || '',
          descSticky: pet.name || '',
          price: priceNum,
          pricePrompt: '',
          priceSuggest: '',
          costIndex: 0,
          costAvg: '',
          costRecent: '',
          costLow: '',
          costEntered: '',
          stockType: 2,
          qtyOnHand: 1,
          minQty: 0,
          qtyReorder: 0,
          limitQty: '',
          dynamicEnabled: 'False',
          dynamicQty: '',
          orderMin: '',
          sku: 'PET-' + pet.id.toString(),
          altSku: '',
          category: 'Live Animals',
          subCategory: pet.species || '',
          mfg: '',
          mfgPart: '',
          color: '',
          size: '',
          style: pet.breed || '',
          packSize: '',
          packUnit: '',
          sbf: '',
          unit: 'ea',
          chargeUnit: 'ea',
          customField1: '',
          customField2: '',
          customField3: '',
          customField4: '',
          ebtFood: 'False',
          ebtCash: 'False',
          checkAge: '',
          refundable: 'False',
          taxableA: 'True',
          taxableB: 'False',
          taxableC: 'False',
          taxableD: 'False',
          taxIncluded: 'False',
          overridePrice: 'False',
          overrideQty: 'False',
          excludeDisc: 'False',
          excludePromo: 'False',
          vendor: '',
          vendorBuyQty: '',
          vendorSrp: '',
          vendorCost: '',
          vendorPart: '',
          vendorLeadTime: '',
        });
      });

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
      const { category, search, page = '0', limit = '24', animalType, foodType, toyType, healthcareType, aquaticType, reptileType, birdType, smallAnimalProductType, filterType: filterTypeParam } = req.query;
      
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
        smallAnimalProductType: smallAnimalProductType as string | undefined
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
      let supplyData = insertSupplySchema.partial().parse(req.body);
      
      // Apply abbreviation expansion to name and description if provided
      if (supplyData.name || supplyData.description) {
        const expanded = expandProductAbbreviations(
          supplyData.name || undefined,
          supplyData.description || undefined
        );
        if (supplyData.name) supplyData.name = expanded.name;
        if (supplyData.description) supplyData.description = expanded.description;
      }
      
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
      
      // Enrich appointments with pets data using bulk query to avoid N+1
      const appointmentIds = filteredAppointments.map((apt: any) => apt.id);
      const petsByAppointmentId = await storage.getAppointmentPetsByAppointmentIds(appointmentIds);
      
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
        
        return {
          ...apt,
          pets
        };
      });
      
      res.json(appointmentsWithPets);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
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
      const { getLocalDateString, getLocalDayOfWeek } = await import('./scheduler');
      const appointmentDate = new Date(appointmentToApprove.appointmentDate);
      const appointmentDateStr = getLocalDateString(appointmentDate);
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
            const aptDateStr = getLocalDateString(new Date(apt.appointmentDate));
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
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user?.isAdmin && !user?.isGroomer) {
        return res.status(403).json({ message: "Admin or groomer access required" });
      }

      const id = parseInt(req.params.id);
      const { ownerFirstName, ownerLastName, ownerPhoneNumber, pets, pricingMode, price, appointmentDate, appointmentTime } = req.body;

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

      // ALWAYS CHECK CAPACITY LIMITS for any edit that might affect capacity
      // This includes: date changes, pets array changes, OR direct serviceType changes
      // The inline edit UI sends serviceType directly without pets array, so we must check for that too
      const { serviceType } = req.body; // Get serviceType from request body for inline edits
      
      // Use new date if provided, otherwise use current
      const dateToCheck = appointmentDate ? new Date(appointmentDate) : new Date(currentAppointment.appointmentDate);
      // Use timezone-aware functions to prevent UTC/CST mismatch bugs
      const { getLocalDateString, getLocalDayOfWeek } = await import('./scheduler');
      const appointmentDateStr = getLocalDateString(dateToCheck);
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
      
      // Check weekly limits for Monday-Saturday (1-6)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        const weeklyLimit = await storage.getWeeklyAppointmentLimit(dayOfWeek);
        
        if (weeklyLimit) {
          // Count existing appointments on the target date (excluding this one and cancelled/rejected)
          const allAppointments = await storage.getAppointments();
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            // Use timezone-aware date comparison to prevent UTC/CST mismatch
            const aptDateStr = getLocalDateString(new Date(apt.appointmentDate));
            return aptDateStr === appointmentDateStr && 
                   apt.id !== id && // Exclude current appointment being updated
                   apt.status !== 'cancelled' && 
                   apt.status !== 'rejected';
          });
          
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
          
          // Check if update would exceed capacity
          if (bathDogs + requestedBaths > weeklyLimit.maxBathAppointments) {
            return res.status(400).json({
              message: `Cannot update: Bath grooming capacity would be exceeded for this date (limit: ${weeklyLimit.maxBathAppointments} dogs, ${bathDogs} already booked by other appointments). Please select a different date or reduce the number of bath services.`
            });
          }
          
          if (groomDogs + requestedGrooms > weeklyLimit.maxGroomAppointments) {
            return res.status(400).json({
              message: `Cannot update: Full grooming capacity would be exceeded for this date (limit: ${weeklyLimit.maxGroomAppointments} dogs, ${groomDogs} already booked by other appointments). Please select a different date or reduce the number of full groom services.`
            });
          }
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

      // TRANSACTION: Update appointment and pets atomically
      const appointment = await db.transaction(async (tx) => {
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
      
      if (!oldAppointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Groomers can only edit already-approved appointments, not approve pending ones
      if (user?.isGroomer && !user?.isAdmin && oldAppointment?.status === 'scheduled') {
        return res.status(403).json({ message: "Only admins can approve pending appointments" });
      }
      
      // CAPACITY CHECK: When changing status to 'confirmed', check capacity limits
      if (status === 'confirmed' && oldAppointment.status !== 'confirmed') {
        const { getLocalDateString, getLocalDayOfWeek } = await import('./scheduler');
        const appointmentDate = new Date(oldAppointment.appointmentDate);
        const appointmentDateStr = getLocalDateString(appointmentDate);
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
              const aptDateStr = getLocalDateString(new Date(apt.appointmentDate));
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
          const allAppointments = await storage.getAppointments();
          const appointmentsOnDate = allAppointments.filter((apt: any) => {
            // Match against both the raw stored date and timezone-converted date
            const aptDate = new Date(apt.appointmentDate);
            const storedDateStr = aptDate.toISOString().split('T')[0]; // The raw date that was stored
            const localDateStr = getLocalDateString(aptDate); // Timezone-converted date
            const matches = (storedDateStr === appointmentDateStr || localDateStr === appointmentDateStr);
            return matches && 
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
      
      // Admin-created appointments bypass approval, others require approval
      const appointmentData = insertAppointmentSchema.parse({ 
        ...req.body,
        // Use first pet's data for backward compatibility
        petName: firstPet.petName,
        petType: firstPet.petType,
        serviceType: firstPet.serviceType,
        specialNotes: firstPet.specialNotes,
        userId,
        isApproved: isAdmin ? true : false,
        status: isAdmin ? 'confirmed' : 'scheduled'
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
      
      res.json(appointment);
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
      console.log(`Mode: ${updateExisting ? 'Update Existing' : 'Add New Only'}`);

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
        errors: [] as string[]
      };

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

          // Skip if no name or price
          if (!name || name === '' || price <= 0) {
            stats.skipped++;
            continue;
          }

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
              size
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
              size
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

      console.log(`Import complete: ${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors.length} errors`);

      res.json({
        success: true,
        stats,
        message: `Import complete: ${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped`
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

      console.log("Starting supplies-only import...");
      console.log("Import data version:", importData.version);
      console.log("Source environment:", importData.environment);
      console.log(`Processing ${importData.data.supplies.length} supplies...`);

      // Sanitize all supplies data first (convert timestamp strings to Date objects)
      const sanitizedSupplies = importData.data.supplies.map((supply: any) => ({
        ...supply,
        createdAt: supply.createdAt ? new Date(supply.createdAt) : undefined,
        updatedAt: supply.updatedAt ? new Date(supply.updatedAt) : undefined
      }));

      // Use bulk upsert for performance
      const result = await storage.bulkUpsertSupplies(sanitizedSupplies);

      console.log(`Supplies import complete: ${result.imported} supplies imported, ${result.failed} failed, ${result.errors.length} errors`);

      res.json({ 
        message: result.errors.length === 0 
          ? "Supplies import completed successfully" 
          : `Supplies import completed with ${result.errors.length} error(s)`,
        stats: {
          supplies: result.imported,
          failed: result.failed,
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 20) // Return first 20 errors for debugging
        }
      });
    } catch (error) {
      console.error('Error importing supplies:', error);
      res.status(500).json({ message: "Failed to import supplies" });
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

      await storage.updateSupply(supply.id, { imageUrl: result.storedPath! });

      res.json({
        success: true,
        productId: supply.id,
        storedPath: result.storedPath
      });
    } catch (error: any) {
      console.error('Error downloading and storing product image:', error);
      res.status(500).json({ message: "Failed to download and store image", error: error.message });
    }
  });

  // Batch download and store product images from external URLs (Admin only)
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

      const results: any[] = [];
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
          await storage.updateSupply(supply.id, { imageUrl: result.storedPath });
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

  // Direct file upload for supply images (Admin only)
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

      await storage.updateSupply(supply.id, { imageUrl: result.storedPath! });

      res.json({
        success: true,
        productId: supply.id,
        productName: supply.name,
        storedPath: result.storedPath
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

  const httpServer = createServer(app);
  return httpServer;
}
