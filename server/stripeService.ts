// Stripe service layer for Animal House Pet Store
// Handles checkout sessions, customer creation, and payment operations

import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import { db } from './db';
import { sql } from 'drizzle-orm';

export class StripeService {
  // Create a customer in Stripe
  async createCustomer(email: string, name: string, metadata?: Record<string, string>) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name,
      metadata,
    });
  }

  // Get or create customer by email
  async getOrCreateCustomer(email: string, name: string) {
    const stripe = await getUncachableStripeClient();
    
    // Check if customer exists in Stripe
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    
    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }
    
    // Create new customer
    return await this.createCustomer(email, name);
  }

  // Create a checkout session for an order
  async createOrderCheckoutSession(options: {
    orderId: number;
    customerEmail: string;
    customerName: string;
    lineItems: Array<{
      name: string;
      quantity: number;
      unitAmount: number; // in cents
    }>;
    successUrl: string;
    cancelUrl: string;
  }) {
    const stripe = await getUncachableStripeClient();
    
    // Get or create customer
    const customer = await this.getOrCreateCustomer(options.customerEmail, options.customerName);
    
    // Create checkout session with price_data for manual order approval workflow
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: options.lineItems.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
          },
          unit_amount: item.unitAmount,
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      metadata: {
        orderId: options.orderId.toString(),
      },
    });

    return session;
  }

  // Create a payment intent for manual charge
  async createPaymentIntent(options: {
    amount: number; // in cents
    customerEmail: string;
    customerName: string;
    orderId: number;
    description?: string;
  }) {
    const stripe = await getUncachableStripeClient();
    
    // Get or create customer
    const customer = await this.getOrCreateCustomer(options.customerEmail, options.customerName);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: options.amount,
      currency: 'usd',
      customer: customer.id,
      description: options.description || `Order #${options.orderId}`,
      metadata: {
        orderId: options.orderId.toString(),
      },
    });

    return paymentIntent;
  }

  // Get the publishable key for client-side
  async getPublishableKey() {
    return await getStripePublishableKey();
  }

  // Query products from the synced stripe schema
  async listProducts(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result.rows;
  }

  // Query prices from the synced stripe schema
  async listPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result.rows;
  }

  // Get products with their prices
  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result.rows;
  }
}

export const stripeService = new StripeService();
