import { Request } from "express";
import { JWTUser } from "./auth";

// Custom request type that extends Express Request with user property
export interface AuthenticatedRequest extends Request {
  user?: JWTUser;
}