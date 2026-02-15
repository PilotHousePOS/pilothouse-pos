/**
 * Astro Loyalty REST API Integration Service
 * 
 * Integrates with Astro Loyalty's REST API for:
 * - Customer account lookup and creation
 * - Purchase tracking (frequent buyer programs)
 * - Loyalty points management
 * - Offer and reward redemption
 * 
 * API Base: https://api.astroloyalty.com/api/json/
 * Auth: OAuth-style token via username/password/client_id
 */

const ASTRO_API_BASE = 'https://api.astroloyalty.com/api/json';

interface AstroToken {
  access_token: string;
  token_type: string;
  expires: number;
  created: number;
}

let cachedToken: AstroToken | null = null;
let tokenExpiresAt: number = 0;

function getCredentials() {
  return {
    username: process.env.ASTRO_USERNAME || '',
    password: process.env.ASTRO_PASSWORD || '',
    clientId: process.env.ASTRO_CLIENT_ID || '',
  };
}

export function isAstroEnabled(): boolean {
  const creds = getCredentials();
  return !!(creds.username && creds.password && creds.clientId);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() / 1000 < tokenExpiresAt - 60) {
    return cachedToken.access_token;
  }

  const creds = getCredentials();
  if (!creds.username || !creds.password || !creds.clientId) {
    throw new Error('Astro credentials not configured');
  }

  const params = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    grant_type: 'password',
    client_id: creds.clientId,
  });

  const response = await fetch(`${ASTRO_API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Astro token request failed (${response.status}): ${errorText}`);
  }

  const tokenData = await response.json();
  cachedToken = tokenData;
  tokenExpiresAt = tokenData.created + tokenData.expires;
  
  console.log('[ASTRO] Access token acquired successfully');
  return tokenData.access_token;
}

async function astroRequest(endpoint: string, jsonData?: Record<string, any>): Promise<any> {
  const token = await getAccessToken();

  const params: Record<string, string> = {};
  if (jsonData) {
    params.jsonData = JSON.stringify(jsonData);
  }

  const url = `${ASTRO_API_BASE}/${endpoint}/`;
  console.log(`[ASTRO] API call: ${endpoint}`, jsonData ? JSON.stringify(jsonData) : '(no params)');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ASTRO] API ${endpoint} HTTP error ${response.status}:`, errorText);
    throw new Error(`Astro API ${endpoint} failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const astroStatus = data.astro_status || data.status;
  console.log(`[ASTRO] API ${endpoint} response status:`, astroStatus, 'returnData keys:', data.returnData && typeof data.returnData === 'object' ? Object.keys(data.returnData) : String(data.returnData));
  if (endpoint === 'customerStatus') {
    console.log(`[ASTRO] Full customerStatus response:`, JSON.stringify(data).substring(0, 2000));
  }

  if (astroStatus && astroStatus !== 100) {
    const statusMsg = data.astro_status_message || data.status_messsage || data.status_message || 'Unknown error';
    console.error(`[ASTRO] API ${endpoint} error status ${astroStatus}:`, statusMsg);
    console.error(`[ASTRO] Full response data:`, JSON.stringify(data));
    throw new AstroApiError(astroStatus, statusMsg, endpoint);
  }

  return data;
}

export class AstroApiError extends Error {
  constructor(
    public statusCode: number,
    public statusMessage: string,
    public endpoint: string
  ) {
    super(`Astro API error ${statusCode} (${endpoint}): ${statusMessage}`);
    this.name = 'AstroApiError';
  }
}

export interface AstroCustomerData {
  customerId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  loyaltyPoints?: number;
}

export interface AstroPurchaseData {
  customerId: string;
  internalCustomerId?: string;
  transactionId: string;
  items: Array<{
    productId: string;
    productName: string;
    brand?: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  purchaseDate: Date;
  totalAmount: number;
}

export interface AstroFrequentBuyerData {
  programId: string;
  programName: string;
  productName?: string;
  currentPunches: number;
  requiredPunches: number;
  freeItemsEarned: number;
  cardId?: string;
  cardStatus?: string;
  expiresAt?: Date;
}

export interface AstroCustomerStatus {
  astroCustomerId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  pointsBalance: number;
  frequentBuyerCards: Array<{
    cardId: string;
    programId: string;
    programTitle: string;
    manufacturer: string;
    status: string;
    requiredPurchases: number;
    rewardCount: number;
    programImage?: string;
    programDescription?: string;
    purchases: Array<{
      transactionId: string;
      itemCode: string;
      itemDescription: string;
      purchaseDate: string;
    }>;
    freeGoods: Array<{
      rewardId: string;
      itemId: string;
      itemDescription: string;
      freeQty: number;
      redeemedOn: string | null;
    }>;
  }>;
  offerRewards: Array<{
    title: string;
    type: string;
    rebateAmount?: number;
    rewardId: string;
    expires: string;
  }>;
  pointsTransactions: Array<{
    transactionId: string;
    description: string;
    date: string;
    qty: number;
    total: number;
  }>;
  eligiblePointsRewards: Array<{
    rewardId: string;
    title: string;
    pointsRequired: number;
    rewardType: string;
    rewardValue: number;
  }>;
}

/**
 * Search for a customer in Astro by email or phone
 */
export async function searchAstroCustomer(
  email?: string,
  phone?: string
): Promise<{ astroCustomerId: string; firstName: string; lastName: string } | null> {
  if (!isAstroEnabled()) return null;

  try {
    const searchData: Record<string, string> = {};
    if (email) searchData.email_address = email;
    if (phone) searchData.phone = phone.replace(/\D/g, '');

    const data = await astroRequest('searchCustomer', searchData);
    
    if (data.returnData && data.returnData.astro_customer_id) {
      return {
        astroCustomerId: String(data.returnData.astro_customer_id),
        firstName: data.returnData.first_name || '',
        lastName: data.returnData.last_name || '',
      };
    }
    return null;
  } catch (error) {
    if (error instanceof AstroApiError && error.statusCode === 310) {
      return null;
    }
    console.error('[ASTRO] Error searching customer:', error);
    return null;
  }
}

/**
 * Look up or create a customer in Astro Loyalty system
 */
export async function lookupOrCreateAstroCustomer(
  customerData: AstroCustomerData
): Promise<{ customerId: string; loyaltyPoints: number } | null> {
  if (!isAstroEnabled()) {
    console.log('[ASTRO] Integration not enabled - skipping customer lookup');
    return null;
  }

  try {
    const existing = await searchAstroCustomer(customerData.email, customerData.phoneNumber);
    
    if (existing) {
      console.log('[ASTRO] Found existing customer:', existing.astroCustomerId);
      
      if (customerData.customerId) {
        try {
          await astroRequest('linkCustomer', {
            customerID: customerData.customerId,
            astro_customer_id: existing.astroCustomerId,
          });
          console.log('[ASTRO] Linked existing customer to internal ID:', customerData.customerId);
        } catch (linkError) {
          if (linkError instanceof AstroApiError && linkError.statusCode === 320) {
            console.log('[ASTRO] Customer already linked');
          } else {
            console.warn('[ASTRO] Could not link customer:', linkError);
          }
        }
      }

      let points = 0;
      try {
        const internalID = customerData.customerId || `animalhouse-${existing.astroCustomerId}`;
        await ensureCustomerLinked(existing.astroCustomerId, internalID);
        const pointsData = await astroRequest('customerPointsStatus', {
          customerID: internalID,
        });
        points = pointsData.returnData?.astroPointsBalance || 0;
      } catch (e) {
        console.warn('[ASTRO] Could not fetch points:', e);
      }

      return { customerId: existing.astroCustomerId, loyaltyPoints: points };
    }

    console.log('[ASTRO] Creating new customer for:', customerData.email);
    const addData: Record<string, string> = {
      customerID: customerData.customerId || customerData.email,
      first_name: customerData.firstName || '',
      last_name: customerData.lastName || '',
    };
    if (customerData.email) addData.email_address = customerData.email;
    if (customerData.phoneNumber) addData.phone = customerData.phoneNumber.replace(/\D/g, '');

    const result = await astroRequest('addCustomer', addData);
    const astroId = String(result.returnData?.astro_customer_id);
    
    console.log('[ASTRO] Created customer:', astroId);
    return { customerId: astroId, loyaltyPoints: 0 };
  } catch (error) {
    console.error('[ASTRO] Error in lookupOrCreateCustomer:', error);
    return null;
  }
}

/**
 * Get full customer status from Astro (frequent buyer cards, offers, points)
 */
export async function getCustomerStatus(
  astroCustomerID: string,
  includeCompleted: boolean = false,
  internalId?: string
): Promise<AstroCustomerStatus | null> {
  if (!isAstroEnabled()) return null;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    const data = await astroRequest('customerStatus', {
      customerID: linkedID,
      completed_cards: includeCompleted ? 1 : 0,
    });

    const rd = data.returnData;
    if (!rd) {
      console.log('[ASTRO] customerStatus: no returnData in response');
      return null;
    }

    console.log(`[ASTRO] customerStatus for ${astroCustomerID}: points=${rd.astroPointsBalance}, cards=${(rd.astroCardData || []).length}, offers=${(rd.astroOfferRewards || []).length}`);
    if ((rd.astroCardData || []).length === 0) {
      console.log(`[ASTRO] Raw astroCardData value:`, JSON.stringify(rd.astroCardData));
      console.log(`[ASTRO] All returnData keys:`, Object.keys(rd));
    }

    return {
      astroCustomerId: String(rd.astro_customer_id),
      firstName: rd.first_name,
      lastName: rd.last_name,
      email: rd.email_address,
      phone: rd.phone,
      pointsBalance: rd.astroPointsBalance || 0,
      frequentBuyerCards: (rd.astroCardData || []).map((card: any) => ({
        cardId: String(card.astro_card_id),
        programId: String(card.astro_program_id),
        programTitle: card.astro_program_title,
        manufacturer: card.astro_mfg_name || '',
        status: card.astro_card_status,
        requiredPurchases: parseInt(card.card_purchase_required_count) || 12,
        rewardCount: parseInt(card.card_reward_count) || 1,
        programImage: card.astro_program_image || undefined,
        programDescription: card.astro_program_long_description || undefined,
        purchases: (card.cardPurchases || []).map((p: any) => ({
          transactionId: String(p.imported_transaction_id),
          itemCode: p.item_code,
          itemDescription: p.item_description,
          purchaseDate: p.purchase_date,
        })),
        freeGoods: (card.cardFreeGoods || []).map((fg: any) => ({
          rewardId: String(fg.astro_reward_id),
          itemId: String(fg.astro_item_id || fg.astro_reward_id),
          itemDescription: fg.item_description,
          freeQty: fg.free_qty,
          redeemedOn: fg.redeemed_on,
        })),
      })),
      offerRewards: (rd.astroOfferRewards || []).map((offer: any) => ({
        title: offer.offer_title,
        type: offer.offer_type,
        rebateAmount: offer.rebate_amount,
        rewardId: String(offer.offer_reward_id),
        expires: offer.offer_expires,
      })),
      pointsTransactions: (rd.astroPointsTransactions || []).map((pt: any) => ({
        transactionId: String(pt.astro_points_transaction_id),
        description: pt.pointsDescription,
        date: pt.pointsDate,
        qty: pt.pointsQty,
        total: pt.totalPoints,
      })),
      eligiblePointsRewards: (rd.astroPointsEligibleRewards || []).map((pr: any) => ({
        rewardId: String(pr.astro_points_reward_id),
        title: pr.pointsRewardTitle,
        pointsRequired: pr.pointsRequired,
        rewardType: pr.reward_type,
        rewardValue: pr.reward_value,
      })),
    };
  } catch (error) {
    console.error('[ASTRO] Error getting customer status:', error);
    return null;
  }
}

/**
 * Ensure a customer is linked in Astro with an internal customerID.
 * The Astro API requires `customerID` (internal POS ID) for addTransaction,
 * not `astro_customer_id`. We must link first using linkCustomer.
 */
async function ensureCustomerLinked(
  astroCustomerId: string,
  internalId?: string
): Promise<string> {
  const customerID = internalId || `animalhouse-${astroCustomerId}`;
  
  try {
    await astroRequest('linkCustomer', {
      customerID,
      astro_customer_id: astroCustomerId,
    });
    console.log(`[ASTRO] Linked customer: internal=${customerID} -> astro=${astroCustomerId}`);
  } catch (error) {
    if (error instanceof AstroApiError && error.statusCode === 320) {
      console.log(`[ASTRO] Customer already linked: ${customerID}`);
    } else {
      console.warn('[ASTRO] linkCustomer warning (proceeding anyway):', error);
    }
  }
  
  return customerID;
}

/**
 * Sync a purchase to Astro for frequent buyer tracking
 */
export async function syncPurchaseToAstro(
  purchaseData: AstroPurchaseData
): Promise<{ transactionId: string; success: boolean } | null> {
  if (!isAstroEnabled()) {
    console.log('[ASTRO] Integration not enabled - skipping purchase sync');
    return null;
  }

  try {
    const itemsWithUpc = purchaseData.items.filter(item => item.sku);
    
    if (itemsWithUpc.length === 0) {
      console.log('[ASTRO] No items with UPCs to sync for order:', purchaseData.transactionId);
      return { transactionId: purchaseData.transactionId, success: true };
    }

    const linkedCustomerID = await ensureCustomerLinked(
      purchaseData.customerId,
      purchaseData.internalCustomerId
    );

    if (itemsWithUpc.length === 1) {
      const item = itemsWithUpc[0];
      const txDate = purchaseData.purchaseDate instanceof Date 
        ? purchaseData.purchaseDate.toISOString().split('T')[0]
        : new Date(purchaseData.purchaseDate).toISOString().split('T')[0];
      const result = await astroRequest('addTransaction', {
        customerID: linkedCustomerID,
        transactionID: `${purchaseData.transactionId}-${item.productId}`,
        saleID: purchaseData.transactionId,
        item_code: item.sku,
        item_qty: item.quantity,
        item_amount: item.totalPrice,
        item_transaction_date: txDate,
      });

      console.log('[ASTRO] Single transaction synced:', result.returnData);
      return {
        transactionId: purchaseData.transactionId,
        success: true,
      };
    }

    const batchTxDate = purchaseData.purchaseDate instanceof Date 
      ? purchaseData.purchaseDate.toISOString().split('T')[0]
      : new Date(purchaseData.purchaseDate).toISOString().split('T')[0];
    const transactions = itemsWithUpc.map(item => ({
      transactionID: `${purchaseData.transactionId}-${item.productId}`,
      item_code: item.sku,
      item_qty: item.quantity,
      item_amount: item.totalPrice,
      item_transaction_date: batchTxDate,
    }));

    const result = await astroRequest('addTransactionBatch', {
      customerID: linkedCustomerID,
      saleID: purchaseData.transactionId,
      transactions,
    });

    console.log('[ASTRO] Batch transaction synced:', result.returnData);
    return {
      transactionId: purchaseData.transactionId,
      success: true,
    };
  } catch (error) {
    console.error('[ASTRO] Error syncing purchase:', error);
    return null;
  }
}

/**
 * Add loyalty points by dollar amount - uses customerID (internal linked ID)
 */
export async function addPointsByDollar(
  astroCustomerID: string,
  dollarAmount: number,
  internalId?: string
): Promise<{ pointsTransactionId: string; totalPoints: number } | null> {
  if (!isAstroEnabled()) return null;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    const result = await astroRequest('addPointsByDollar', {
      customerID: linkedID,
      dollarAmount,
    });

    return {
      pointsTransactionId: String(result.returnData?.astro_points_transaction_id),
      totalPoints: result.returnData?.total_points || 0,
    };
  } catch (error) {
    console.error('[ASTRO] Error adding points by dollar:', error);
    return null;
  }
}

/**
 * Void/reverse a transaction in Astro - uses customerID (internal linked ID)
 * Used when refunding an order to remove the purchase from loyalty tracking
 */
export async function voidTransaction(
  astroCustomerID: string,
  transactionId: string,
  internalId?: string
): Promise<boolean> {
  if (!isAstroEnabled()) return false;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    await astroRequest('voidTransaction', {
      customerID: linkedID,
      transactionID: transactionId,
    });

    console.log(`[ASTRO] Voided transaction ${transactionId} for customer ${astroCustomerID}`);
    return true;
  } catch (error) {
    console.error('[ASTRO] Error voiding transaction:', error);
    return false;
  }
}

/**
 * Deduct loyalty points by dollar amount - reversal of addPointsByDollar
 * Used when refunding an order to remove points that were earned
 */
export async function deductPointsByDollar(
  astroCustomerID: string,
  dollarAmount: number,
  internalId?: string
): Promise<boolean> {
  if (!isAstroEnabled()) return false;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    await astroRequest('addPointsByDollar', {
      customerID: linkedID,
      dollarAmount: -dollarAmount,
    });

    console.log(`[ASTRO] Deducted points for $${dollarAmount.toFixed(2)} from customer ${astroCustomerID}`);
    return true;
  } catch (error) {
    console.error('[ASTRO] Error deducting points by dollar:', error);
    return false;
  }
}

/**
 * Redeem points reward
 */
export async function redeemPoints(
  astroCustomerID: string,
  astroPointsRewardId: string,
  internalId?: string
): Promise<{ success: boolean; pointsDeducted: number } | null> {
  if (!isAstroEnabled()) return null;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    const result = await astroRequest('redeemPoints', {
      customerID: linkedID,
      astro_points_reward_id: astroPointsRewardId,
    });

    return {
      success: true,
      pointsDeducted: Math.abs(result.returnData?.total_points || 0),
    };
  } catch (error) {
    console.error('[ASTRO] Error redeeming points:', error);
    return null;
  }
}

/**
 * Check if a UPC is eligible for a free item reward
 */
export async function checkRedemptionEligibility(
  astroCustomerID: string,
  itemCode: string,
  internalId?: string
): Promise<{ isEligible: boolean; rewardId?: string; programType?: string } | null> {
  if (!isAstroEnabled()) return null;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    const result = await astroRequest('checkRedemptionEligibility', {
      customerID: linkedID,
      item_code: itemCode,
    });

    return {
      isEligible: result.returnData?.isEligible === true,
      rewardId: result.returnData?.astro_reward_id ? String(result.returnData.astro_reward_id) : undefined,
      programType: result.returnData?.program_type,
    };
  } catch (error) {
    if (error instanceof AstroApiError && error.statusCode === 700) {
      return { isEligible: false };
    }
    console.error('[ASTRO] Error checking redemption eligibility:', error);
    return null;
  }
}

/**
 * Add a frequent buyer redemption
 */
export async function addRedemption(
  astroCustomerID: string,
  astroRewardId: string,
  astroItemId: string,
  customerInfo?: { email?: string; address?: string; city?: string; state?: string; zip?: string },
  internalId?: string
): Promise<boolean> {
  if (!isAstroEnabled()) return false;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerID}`;
    await ensureCustomerLinked(astroCustomerID, linkedID);
    
    const data: Record<string, any> = {
      customerID: linkedID,
      astro_reward_id: astroRewardId,
      astro_item_id: astroItemId,
    };
    if (customerInfo?.email) data.customer_email_address = customerInfo.email;
    if (customerInfo?.address) data.customer_address = customerInfo.address;
    if (customerInfo?.city) data.customer_city = customerInfo.city;
    if (customerInfo?.state) data.customer_state = customerInfo.state;
    if (customerInfo?.zip) data.customer_zip = customerInfo.zip;

    console.log(`[ASTRO] addRedemption request:`, JSON.stringify(data));
    const result = await astroRequest('addRedemption', data);
    console.log(`[ASTRO] addRedemption response:`, JSON.stringify(result));
    return true;
  } catch (error: any) {
    console.error('[ASTRO] Error adding redemption:', error?.message || error);
    return false;
  }
}

/**
 * Get list of active offers the store is enrolled in
 */
export async function listOffers(): Promise<Array<{
  programId: string;
  manufacturer: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  imageUrl?: string;
  inStoreOnly: boolean;
}>> {
  if (!isAstroEnabled()) return [];

  try {
    const result = await astroRequest('listOffers');
    const offers = Array.isArray(result.returnData) ? result.returnData : 
                   result.returnData ? [result.returnData] : [];
    
    return offers.map((offer: any) => ({
      programId: String(offer.astro_program_id),
      manufacturer: offer.astro_mfg_name,
      title: offer.astro_program_title,
      description: offer.astro_program_long_description || '',
      startDate: offer.astro_program_start_date,
      endDate: offer.astro_program_end_date,
      imageUrl: offer.astro_program_image,
      inStoreOnly: offer.in_store_only === 1,
    }));
  } catch (error) {
    console.error('[ASTRO] Error listing offers:', error);
    return [];
  }
}

/**
 * Check which UPCs are eligible for Astro programs
 */
export async function checkEligibleItems(
  itemCodes?: string[]
): Promise<Array<{
  itemCode: string;
  itemDescription: string;
  manufacturer: string;
  programs: Array<{ programId: string; programTitle: string; type: string }>;
}>> {
  if (!isAstroEnabled()) return [];

  try {
    const data: Record<string, any> = {};
    if (itemCodes && itemCodes.length === 1) {
      data.item_code = itemCodes[0];
    } else if (itemCodes && itemCodes.length > 1) {
      data.item_code_batch = itemCodes;
    }

    const result = await astroRequest('eligiblePurchaseItems', data);
    const items = Array.isArray(result.returnData) ? result.returnData : [];
    
    return items.map((item: any) => ({
      itemCode: item.item_code,
      itemDescription: item.item_description,
      manufacturer: item.astro_mfg_name,
      programs: item.available_programs ? (Array.isArray(item.available_programs) ? item.available_programs : [item.available_programs]).map((p: any) => ({
        programId: String(p.astro_mfg_program_id),
        programTitle: p.astro_mfg_program_title,
        type: p.astro_mfg_program_type,
      })) : [],
    }));
  } catch (error) {
    console.error('[ASTRO] Error checking eligible items:', error);
    return [];
  }
}

/**
 * Get frequent buyer progress (wrapper for backward compatibility)
 */
export async function getFrequentBuyerProgress(
  customerId: string
): Promise<AstroFrequentBuyerData[]> {
  if (!isAstroEnabled()) return [];

  try {
    const status = await getCustomerStatus(customerId);
    if (!status) return [];

    return status.frequentBuyerCards.map(card => ({
      programId: card.programId,
      programName: card.programTitle,
      productName: card.manufacturer,
      currentPunches: card.purchases.length,
      requiredPunches: 0,
      freeItemsEarned: card.freeGoods.filter(fg => fg.redeemedOn).length,
      cardId: card.cardId,
      cardStatus: card.status,
    }));
  } catch (error) {
    console.error('[ASTRO] Error getting frequent buyer progress:', error);
    return [];
  }
}

/**
 * Get customer's current loyalty points balance
 */
export async function getLoyaltyPoints(astroCustomerId: string, internalId?: string): Promise<number> {
  if (!isAstroEnabled()) return 0;

  try {
    const linkedID = internalId || `animalhouse-${astroCustomerId}`;
    await ensureCustomerLinked(astroCustomerId, linkedID);
    
    const result = await astroRequest('customerPointsStatus', {
      customerID: linkedID,
    });
    return result.returnData?.astroPointsBalance || 0;
  } catch (error) {
    console.error('[ASTRO] Error getting loyalty points:', error);
    return 0;
  }
}

/**
 * Update customer info in Astro
 */
export async function updateAstroCustomer(
  customerID: string,
  data: { firstName?: string; lastName?: string; email?: string; phone?: string }
): Promise<boolean> {
  if (!isAstroEnabled()) return false;

  try {
    const updateData: Record<string, string> = { astro_customer_id: customerID };
    if (data.firstName) updateData.first_name = data.firstName;
    if (data.lastName) updateData.last_name = data.lastName;
    if (data.email) updateData.email_address = data.email;
    if (data.phone) updateData.phone = data.phone.replace(/\D/g, '');

    await astroRequest('updateCustomer', updateData);
    return true;
  } catch (error) {
    console.error('[ASTRO] Error updating customer:', error);
    return false;
  }
}

/**
 * Test connection to Astro API
 */
export async function testAstroConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  if (!isAstroEnabled()) {
    return {
      success: false,
      message: 'Astro Loyalty integration is not configured. Please set ASTRO_USERNAME, ASTRO_PASSWORD, and ASTRO_CLIENT_ID.',
    };
  }

  try {
    const token = await getAccessToken();
    
    let offers: any[] = [];
    try {
      offers = await listOffers();
    } catch (e) {
    }

    return {
      success: true,
      message: `Connected to Astro Loyalty API successfully. Token acquired. ${offers.length} active offers found.`,
      details: {
        tokenAcquired: true,
        activeOffers: offers.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Astro API connection failed: ${(error as Error).message}`,
    };
  }
}
