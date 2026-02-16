import { getUncachableSendGridClient } from './sendgridIntegration';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { supplies } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface OrderItem {
  id: number;
  orderId: number;
  supplyId: number | null;
  petId: number | null;
  quantity: number;
  price: string;
  itemName: string | null;
}

interface Order {
  id: number;
  userId: string;
  totalAmount: string;
  status: string | null;
  shippingAddress: string | null;
  orderDate: Date | null;
  updatedAt: Date | null;
}

interface CategorySales {
  name: string;
  total: number;
  count: number;
}

interface DayPartSales {
  name: string;
  total: number;
  count: number;
}

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'dogFood': 'Dog Food',
  'catFood': 'Cat Food',
  'dogTreats': 'Dog Treats',
  'catTreats': 'Cat Treats',
  'food': 'Food',
  'treats': 'Treats',
  'leashesAndCollars': 'Leashes & Collars',
  'leashes': 'Leashes & Collars',
  'accessories': 'Accessories',
  'aquatics': 'Aquatics',
  'reptiles': 'Reptiles',
  'smallanimal': 'Small Animals',
  'toys': 'Toys',
  'healthcare': 'Healthcare',
  'birdSupplies': 'Bird Supplies',
  'beds': 'Beds',
  'dogCages': 'Dog Cages',
  'grooming': 'Grooming',
  'Treats': 'Treats',
  'Accessories': 'Accessories',
  'Healthcare': 'Healthcare',
};

function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

function formatPercent(amount: number, total: number): string {
  if (total === 0) return '0.00%';
  return ((amount / total) * 100).toFixed(2) + '%';
}

export async function sendDailySalesReport(recipientEmails: string[]): Promise<void> {
  if (!recipientEmails || recipientEmails.length === 0) {
    throw new Error('No recipient emails provided');
  }

  const { client, fromEmail, replyTo } = await getUncachableSendGridClient();

  const today = new Date();
  const cstOptions = { timeZone: 'America/Chicago' };
  
  const reportDate = today.toLocaleDateString('en-US', { 
    ...cstOptions,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
  
  const reportTime = today.toLocaleTimeString('en-US', {
    ...cstOptions,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const startDateStr = today.toLocaleDateString('en-US', { 
    ...cstOptions,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
  
  const allOrders = await storage.getOrders();
  
  const todaysOrders = allOrders.filter((order: Order) => {
    if (!order.orderDate) return false;
    const orderDate = new Date(order.orderDate);
    const orderDateStr = orderDate.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const todayDateStr = today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    return orderDateStr === todayDateStr;
  });

  const refundedOrders = todaysOrders.filter(order => order.status === 'refunded' || (order as any).paymentStatus === 'refunded');
  
  // Separate cancelled/voided orders from active orders
  const cancelledOrders = todaysOrders.filter(order => order.status === 'cancelled');
  const activeOrders = todaysOrders.filter(order => order.status !== 'cancelled');

  let total = 0;
  let subtotal = 0;
  let totalTax = 0;
  let totalItems = 0;
  let totalLoyaltyDiscounts = 0;
  let loyaltyDiscountCount = 0;
  let totalOrderDiscounts = 0;
  let orderDiscountCount = 0;
  const discountDetails: Array<{ orderId: number; amount: number; reason: string; type: string }> = [];
  let totalConvenienceFees = 0;
  let convenienceFeeCount = 0;
  let cardPaymentCount = 0;
  let cardPaymentTotal = 0;
  const categorySales: Map<string, CategorySales> = new Map();
  const dayPartSales: Map<string, DayPartSales> = new Map();
  let groomingOrderTotal = 0;
  let groomingOrderCount = 0;
  let supplyOrderTotal = 0;
  let supplyOrderCount = 0;
  let voidedTotal = 0;
  let voidedCount = cancelledOrders.length;

  // Cache supply categories to avoid repeated DB lookups
  const supplyCategoryCache: Map<number, string> = new Map();
  
  // Calculate voided order totals
  for (const order of cancelledOrders) {
    voidedTotal += parseFloat(order.totalAmount) || 0;
  }
  
  // Process active orders (non-cancelled) for gross sales
  for (const order of activeOrders) {
    const orderWithItems = await storage.getOrderWithItems(order.id);
    if (!orderWithItems) continue;

    const orderTotal = parseFloat(order.totalAmount) || 0;
    const orderSubtotal = parseFloat((order as any).subtotal) || orderTotal;
    const orderTax = parseFloat((order as any).taxAmount) || 0;
    const loyaltyDiscount = parseFloat((order as any).loyaltyDiscount) || 0;
    const convenienceFee = parseFloat((order as any).convenienceFee) || 0;
    
    total += orderTotal;
    subtotal += orderSubtotal;
    totalTax += orderTax;
    
    if (convenienceFee > 0) {
      totalConvenienceFees += convenienceFee;
      convenienceFeeCount++;
    }
    
    if ((order as any).paymentStatus === 'paid' || (order as any).stripePaymentIntentId) {
      cardPaymentCount++;
      cardPaymentTotal += orderTotal;
    }
    
    if (loyaltyDiscount > 0) {
      totalLoyaltyDiscounts += loyaltyDiscount;
      loyaltyDiscountCount++;
    }
    
    const orderDiscountAmount = parseFloat((order as any).discountAmount) || 0;
    const orderDiscountReason = (order as any).discountReason || '';
    if (orderDiscountAmount > 0) {
      totalOrderDiscounts += orderDiscountAmount;
      orderDiscountCount++;
      let discountType = 'Other';
      if (orderDiscountReason.toLowerCase().includes('employee')) {
        discountType = 'Employee Discount';
      } else if (orderDiscountReason.toLowerCase().includes('astro') || orderDiscountReason.toLowerCase().includes('loyalty') || orderDiscountReason.toLowerCase().includes('reward')) {
        discountType = 'Astro Loyalty Reward';
      }
      discountDetails.push({
        orderId: order.id,
        amount: orderDiscountAmount,
        reason: orderDiscountReason,
        type: discountType,
      });
    }

    // Net Sales By Day Part - categorize by order time in CST
    if (order.orderDate) {
      const orderHour = parseInt(new Date(order.orderDate).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }));
      let dayPart = 'Evening (5PM-Close)';
      if (orderHour >= 7 && orderHour < 12) {
        dayPart = 'Morning (7AM-12PM)';
      } else if (orderHour >= 12 && orderHour < 17) {
        dayPart = 'Afternoon (12PM-5PM)';
      } else if (orderHour < 7) {
        dayPart = 'After Hours (12AM-7AM)';
      }
      const existing = dayPartSales.get(dayPart) || { name: dayPart, total: 0, count: 0 };
      existing.total += orderTotal;
      existing.count++;
      dayPartSales.set(dayPart, existing);
    }

    // Determine order type (grooming vs supply)
    let hasGrooming = false;
    const items = orderWithItems.items || [];
    for (const item of items) {
      totalItems += item.quantity || 1;
      const itemPrice = (parseFloat(item.price) || 0) * (item.quantity || 1);
      
      // Look up actual category from DB using supplyId
      let categoryDisplay = 'Misc.';
      if (item.supplyId) {
        let dbCategory = supplyCategoryCache.get(item.supplyId);
        if (dbCategory === undefined) {
          try {
            const [supply] = await db.select({ category: supplies.category }).from(supplies).where(eq(supplies.id, item.supplyId));
            dbCategory = supply?.category || null;
            supplyCategoryCache.set(item.supplyId, dbCategory || '');
          } catch { supplyCategoryCache.set(item.supplyId, ''); }
        }
        if (dbCategory && CATEGORY_DISPLAY_NAMES[dbCategory]) {
          categoryDisplay = CATEGORY_DISPLAY_NAMES[dbCategory];
        } else if (dbCategory) {
          categoryDisplay = dbCategory.charAt(0).toUpperCase() + dbCategory.slice(1);
        }
      }

      // Fallback: guess from item name if no supplyId or category
      if (categoryDisplay === 'Misc.' && !item.supplyId) {
        const itemName = (item.itemName || '').toLowerCase();
        if (itemName.includes('groom') || itemName.includes('bath')) {
          categoryDisplay = 'Grooming';
          hasGrooming = true;
        } else if (itemName.includes('dog food') || itemName.includes('kibble')) {
          categoryDisplay = 'Dog Food';
        } else if (itemName.includes('cat food')) {
          categoryDisplay = 'Cat Food';
        } else if (itemName.includes('dog treat')) {
          categoryDisplay = 'Dog Treats';
        } else if (itemName.includes('cat treat')) {
          categoryDisplay = 'Cat Treats';
        } else if (itemName.includes('reptile') || itemName.includes('feeder')) {
          categoryDisplay = 'Reptiles';
        } else if (itemName.includes('aqua') || itemName.includes('fish')) {
          categoryDisplay = 'Aquatics';
        } else if (itemName.includes('bird')) {
          categoryDisplay = 'Bird Supplies';
        } else if (itemName.includes('toy')) {
          categoryDisplay = 'Toys';
        } else if (itemName.includes('treat')) {
          categoryDisplay = 'Treats';
        } else if (itemName.includes('food')) {
          categoryDisplay = 'Food';
        } else if (itemName.includes('collar') || itemName.includes('leash')) {
          categoryDisplay = 'Leashes & Collars';
        } else if (itemName.includes('accessory')) {
          categoryDisplay = 'Accessories';
        } else if (itemName.includes('health') || itemName.includes('medic')) {
          categoryDisplay = 'Healthcare';
        }
      }
      if (categoryDisplay === 'Grooming') hasGrooming = true;
      
      const existing = categorySales.get(categoryDisplay) || { name: categoryDisplay, total: 0, count: 0 };
      existing.total += itemPrice;
      existing.count += item.quantity || 1;
      categorySales.set(categoryDisplay, existing);
    }

    if (hasGrooming) {
      groomingOrderTotal += orderTotal;
      groomingOrderCount++;
    } else {
      supplyOrderTotal += orderTotal;
      supplyOrderCount++;
    }
  }

  // Get refund data from multiple sources for reliability
  // Source 1: Query refunds by date range (CST-aware)
  const cstNow = new Date(today.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const todayCST = new Date(cstNow.getFullYear(), cstNow.getMonth(), cstNow.getDate());
  const tomorrowCST = new Date(todayCST);
  tomorrowCST.setDate(tomorrowCST.getDate() + 1);

  const cstOffsetMs = today.getTime() - cstNow.getTime();
  const todayStartUTC = new Date(todayCST.getTime() + cstOffsetMs);
  const todayEndUTC = new Date(tomorrowCST.getTime() + cstOffsetMs - 1);

  let todaysRefunds: any[] = [];
  try {
    todaysRefunds = await storage.getRefundsByDateRange(todayStartUTC, todayEndUTC);
  } catch (e) {
    // Fallback if method not available
  }

  // Source 2: Also get refunds linked to today's orders (catches any missed by date range)
  const todayOrderIds = todaysOrders.map(o => o.id);
  if (todayOrderIds.length > 0) {
    try {
      for (const oid of todayOrderIds) {
        const orderRefunds = await storage.getRefundsByOrderId(oid);
        for (const r of orderRefunds) {
          if (!todaysRefunds.some((tr: any) => tr.id === r.id)) {
            todaysRefunds.push(r);
          }
        }
      }
    } catch (e) {}
  }

  let refundSubtotal = todaysRefunds.reduce((sum: number, r: any) => sum + (parseFloat(r.subtotalRefunded) || 0), 0);
  let refundTax = todaysRefunds.reduce((sum: number, r: any) => sum + (parseFloat(r.taxRefunded) || 0), 0);
  let refundTotal = todaysRefunds.reduce((sum: number, r: any) => sum + (parseFloat(r.totalRefunded) || 0), 0);
  let refundCount = todaysRefunds.length;

  // Source 3: If still no refund records, query Stripe API directly
  if (refundCount === 0 && refundedOrders.length === 0) {
    try {
      const stripe = await getUncachableStripeClient();
      const startOfDayUnix = Math.floor(todayStartUTC.getTime() / 1000);
      const endOfDayUnix = Math.floor(todayEndUTC.getTime() / 1000);

      const stripeRefunds = await stripe.refunds.list({
        created: { gte: startOfDayUnix, lte: endOfDayUnix },
        limit: 100,
      });

      if (stripeRefunds.data.length > 0) {
        refundCount = stripeRefunds.data.length;
        refundTotal = stripeRefunds.data.reduce((sum, r) => sum + (r.amount / 100), 0);
        const taxRate = 0.1099;
        refundSubtotal = parseFloat((refundTotal / (1 + taxRate)).toFixed(2));
        refundTax = parseFloat((refundTotal - refundSubtotal).toFixed(2));
        console.log(`Sales report: Retrieved ${refundCount} refunds ($${refundTotal.toFixed(2)}) from Stripe API`);
      }
    } catch (stripeErr: any) {
      console.error('Failed to fetch refunds from Stripe API:', stripeErr.message);
    }
  }

  // Final fallback to order-level refund data
  const refundedTotal = refundCount > 0 ? refundTotal : refundedOrders.reduce((sum, order) => sum + (parseFloat(order.totalAmount) || 0), 0);
  const refundedTaxTotal = refundCount > 0 ? refundTax : refundedOrders.reduce((sum, order) => sum + (parseFloat((order as any).taxAmount) || 0), 0);
  const refundedSubtotalTotal = refundCount > 0 ? refundSubtotal : refundedOrders.reduce((sum, order) => sum + (parseFloat((order as any).subtotal) || 0), 0);
  const totalRefundCount = refundCount > 0 ? refundCount : refundedOrders.length;

  // Convenience fees refunded - look at orders that had full refunds today
  let convenienceFeesRefunded = 0;
  let stripeFeesPaidOnRefundedOrders = 0;
  for (const refund of todaysRefunds) {
    if (refund.orderId) {
      try {
        const refundOrder = await storage.getOrder(refund.orderId);
        if (refundOrder) {
          if (refund.refundType === 'full' && refundOrder.convenienceFee) {
            convenienceFeesRefunded += parseFloat(refundOrder.convenienceFee) || 0;
          }
          const originalOrderTotal = parseFloat(refundOrder.totalAmount) || 0;
          if (originalOrderTotal > 0) {
            stripeFeesPaidOnRefundedOrders += (originalOrderTotal * 0.029) + 0.30;
          }
        }
      } catch (e) {}
    }
  }
  stripeFeesPaidOnRefundedOrders = Math.round(stripeFeesPaidOnRefundedOrders * 100) / 100;
  const netConvenienceFees = totalConvenienceFees - convenienceFeesRefunded;

  // Stripe processing fees (2.9% + $0.30 per transaction on the total charged)
  // This is what Stripe charges YOU - it's a tax-deductible business expense
  const stripeProcessingFees = cardPaymentCount > 0 
    ? (cardPaymentTotal * 0.029) + (cardPaymentCount * 0.30)
    : 0;
  
  // Total out-of-pocket cost on refunds: only the Stripe fees they keep (convenience fee is already in refund total, not a double charge)
  const totalRefundCost = stripeFeesPaidOnRefundedOrders;
  
  // Net revenue calculations
  const grossRevenue = subtotal; // Product sales before tax
  const netAfterRefunds = grossRevenue - refundedSubtotalTotal;
  const estimatedStripePayout = total - refundedTotal - stripeProcessingFees;
  const netDeposit = total - refundedTotal - stripeProcessingFees;

  // Fetch Stripe balance data for the report period
  let stripeChargeCount = 0;
  let stripeChargeGross = 0;
  let stripeFeesTotal = 0;
  let stripeRefundCount = 0;
  let stripeRefundGross = 0;
  let stripeActivityBeforeFees = 0;
  let stripeBalanceChange = 0;
  let stripeStartingBalance = 0;
  let stripeEndingBalance = 0;
  let stripePayoutsTotal = 0;
  let hasStripeBalanceData = false;

  try {
    const stripe = await getUncachableStripeClient();
    const startOfDayUnix = Math.floor(todayStartUTC.getTime() / 1000);
    const endOfDayUnix = Math.floor(todayEndUTC.getTime() / 1000);

    let allTxns: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const params: any = {
        created: { gte: startOfDayUnix, lte: endOfDayUnix },
        limit: 100,
      };
      if (startingAfter) params.starting_after = startingAfter;
      const batch = await stripe.balanceTransactions.list(params);
      allTxns = allTxns.concat(batch.data);
      hasMore = batch.has_more;
      if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
    }

    for (const txn of allTxns) {
      stripeFeesTotal += txn.fee / 100;

      if (txn.type === 'charge') {
        stripeChargeCount++;
        stripeChargeGross += txn.amount / 100;
      } else if (txn.type === 'refund') {
        stripeRefundCount++;
        stripeRefundGross += Math.abs(txn.amount) / 100;
      } else if (txn.type === 'payout') {
        stripePayoutsTotal += Math.abs(txn.amount) / 100;
      }
    }

    stripeActivityBeforeFees = stripeChargeGross - stripeRefundGross;
    stripeBalanceChange = stripeActivityBeforeFees - stripeFeesTotal;

    const balance = await stripe.balance.retrieve();
    stripeEndingBalance = (balance.available?.[0]?.amount || 0) / 100 + (balance.pending?.[0]?.amount || 0) / 100;
    stripeStartingBalance = stripeEndingBalance - stripeBalanceChange + stripePayoutsTotal;
    hasStripeBalanceData = true;
  } catch (e: any) {
    console.log('Could not fetch Stripe balance data for report:', e.message);
  }

  const transactionCount = activeOrders.length;
  const avgTicket = transactionCount > 0 ? total / transactionCount : 0;

  const sortedCategories = Array.from(categorySales.values()).sort((a, b) => b.total - a.total);
  const categoryTotal = sortedCategories.reduce((sum, cat) => sum + cat.total, 0);

  const dayPartOrder = ['Morning (7AM-12PM)', 'Afternoon (12PM-5PM)', 'Evening (5PM-Close)', 'After Hours (12AM-7AM)'];
  const sortedDayParts = dayPartOrder
    .filter(dp => dayPartSales.has(dp))
    .map(dp => dayPartSales.get(dp)!);

  const receiptStyle = `
    font-family: 'Courier New', Courier, monospace;
    max-width: 420px;
    margin: 0 auto;
    background-color: #ffffff;
    padding: 20px;
    border: 1px solid #ccc;
  `;

  const sectionHeader = (title: string) => `
    <tr>
      <td colspan="3" style="text-align: center; font-weight: bold; padding: 12px 0 6px 0; border-bottom: 1px solid #000;">
        -- ${title} --
      </td>
    </tr>
  `;

  const dataRow = (label: string, value: string, extra?: string) => `
    <tr>
      <td style="text-align: right; padding: 2px 8px 2px 0; white-space: nowrap;">${label}</td>
      <td style="text-align: right; padding: 2px 8px; white-space: nowrap;">${value}</td>
      ${extra ? `<td style="text-align: right; padding: 2px 0 2px 8px; white-space: nowrap;">${extra}</td>` : '<td></td>'}
    </tr>
  `;

  const headerRow = (col1: string, col2: string, col3?: string) => `
    <tr>
      <td style="text-align: right; padding: 6px 8px 2px 0; font-weight: bold;">${col1}</td>
      <td style="text-align: right; padding: 6px 8px 2px 8px; font-weight: bold;">${col2}</td>
      ${col3 ? `<td style="text-align: right; padding: 6px 0 2px 8px; font-weight: bold;">${col3}</td>` : '<td></td>'}
    </tr>
  `;

  const noOrdersMessage = transactionCount === 0 ? `
    <tr>
      <td colspan="3" style="text-align: center; padding: 20px; color: #666; font-style: italic;">
        No online orders placed today.
      </td>
    </tr>
  ` : '';

  const htmlBody = `
    <div style="${receiptStyle}">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">&#128062; Animal House</div>
        <div style="font-size: 12px;">
          <strong>ANIMAL HOUSE LLC</strong><br>
          2934 Cypress St<br>
          West Monroe LA 71291<br>
          318 322-3023
        </div>
      </div>
      
      <!-- Date/Time Info -->
      <div style="text-align: center; margin-bottom: 16px; font-size: 12px;">
        <div>Date: ${reportDate} ${reportTime}</div>
        <div>Start: ${startDateStr} 12:00AM</div>
        <div>End: ${startDateStr} 11:59PM</div>
      </div>
      
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        
        ${sectionHeader('Order Summary')}
        ${noOrdersMessage}
        ${transactionCount > 0 ? `
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Transactions', formatCurrency(total + totalLoyaltyDiscounts + totalOrderDiscounts), String(transactionCount))}
        ${totalOrderDiscounts > 0 ? dataRow('Order Discounts', `-${formatCurrency(totalOrderDiscounts)}`, String(orderDiscountCount)) : ''}
        ${dataRow('Loyalty Discounts', totalLoyaltyDiscounts > 0 ? `-${formatCurrency(totalLoyaltyDiscounts)}` : '0.00', String(loyaltyDiscountCount))}
        ${dataRow('Subtotal', formatCurrency(subtotal), String(totalItems) + ' items')}
        ${dataRow('Taxes (10.99%)', formatCurrency(totalTax), '')}
        ${dataRow('Convenience Fees', formatCurrency(totalConvenienceFees), String(convenienceFeeCount))}
        ${dataRow('<strong>Total Collected</strong>', `<strong>${formatCurrency(total)}</strong>`, '')}
        <tr><td colspan="3" style="padding: 8px 0;"></td></tr>
        ${dataRow('Avg. Ticket', formatCurrency(avgTicket), '')}
        ` : ''}
        
        ${transactionCount > 0 ? `
        ${sectionHeader('Gross Sales By Category')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${sortedCategories.length > 0 
          ? sortedCategories.map(cat => 
              dataRow(cat.name, formatCurrency(cat.total), formatPercent(cat.total, categoryTotal))
            ).join('')
          : dataRow('(No categorized items)', '0.00', '')}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(categoryTotal)}</strong>`, '')}
        
        ${sectionHeader('Net Sales By Day Part')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${sortedDayParts.length > 0
          ? sortedDayParts.map(dp =>
              dataRow(dp.name, formatCurrency(dp.total), formatPercent(dp.total, total))
            ).join('')
          : dataRow('(No orders)', '0.00', '')}
        ${dataRow('<strong>Report Total</strong>', `<strong>${formatCurrency(total)}</strong>`, '<strong>100.00%</strong>')}
        
        ${sectionHeader('Online Sales By Order Type')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${supplyOrderCount > 0 ? dataRow('Supply Orders', formatCurrency(supplyOrderTotal), formatPercent(supplyOrderTotal, total)) : ''}
        ${groomingOrderCount > 0 ? dataRow('Grooming Orders', formatCurrency(groomingOrderTotal), formatPercent(groomingOrderTotal, total)) : ''}
        ${supplyOrderCount === 0 && groomingOrderCount === 0 ? dataRow('(No orders)', '0.00', '') : ''}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(total)}</strong>`, '')}
        
        ${sectionHeader('Discounts Applied')}
        ${headerRow('', 'Total $', 'Count #')}
        ${totalLoyaltyDiscounts > 0 
          ? dataRow('Loyalty Credits', formatCurrency(totalLoyaltyDiscounts), String(loyaltyDiscountCount))
          : ''}
        ${(() => {
          const employeeDiscounts = discountDetails.filter(d => d.type === 'Employee Discount');
          const astroDiscounts = discountDetails.filter(d => d.type === 'Astro Loyalty Reward');
          const otherDiscounts = discountDetails.filter(d => d.type === 'Other');
          const empTotal = employeeDiscounts.reduce((s, d) => s + d.amount, 0);
          const astroTotal = astroDiscounts.reduce((s, d) => s + d.amount, 0);
          const otherTotal = otherDiscounts.reduce((s, d) => s + d.amount, 0);
          let rows = '';
          if (empTotal > 0) rows += dataRow('Employee Discounts', formatCurrency(empTotal), String(employeeDiscounts.length));
          if (astroTotal > 0) rows += dataRow('Astro Rewards', formatCurrency(astroTotal), String(astroDiscounts.length));
          if (otherTotal > 0) rows += dataRow('Other Discounts', formatCurrency(otherTotal), String(otherDiscounts.length));
          const allTotal = totalLoyaltyDiscounts + totalOrderDiscounts;
          if (allTotal > 0) {
            rows += dataRow('<strong>Total Discounts</strong>', `<strong>${formatCurrency(allTotal)}</strong>`, String(loyaltyDiscountCount + orderDiscountCount));
          }
          return rows;
        })()}
        ${totalLoyaltyDiscounts === 0 && totalOrderDiscounts === 0 ? dataRow('(None)', '0.00', '0') : ''}
        ${discountDetails.length > 0 ? `
        <tr><td colspan="3" style="padding: 4px 0;"></td></tr>
        <tr><td colspan="3" style="text-align: center; font-weight: bold; font-size: 11px; padding-bottom: 4px;">Discount Detail</td></tr>
        ${discountDetails.map(d => {
          let reasonDisplay = d.type;
          if (d.type === 'Astro Loyalty Reward') {
            try {
              const parsed = JSON.parse(d.reason.replace('Astro Loyalty Reward: ', ''));
              reasonDisplay = parsed.appliedRewards?.map((r: any) => r.rewardName || 'Free Item').join(', ') || 'Astro Reward';
            } catch { reasonDisplay = 'Astro Reward'; }
          } else if (d.type === 'Employee Discount') {
            const pctMatch = d.reason.match(/(\d+)%/);
            reasonDisplay = pctMatch ? `Employee (${pctMatch[1]}%)` : 'Employee Discount';
          }
          return dataRow(`Order #${d.orderId}`, `-${formatCurrency(d.amount)}`, reasonDisplay);
        }).join('')}
        ` : ''}
        
        ${sectionHeader('Sales By Staff')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${dataRow('Online Sales', formatCurrency(total), '100.00%')}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(total)}</strong>`, '')}
        
        ${sectionHeader('Taxes Collected')}
        ${headerRow('', 'Total $', 'Rate %')}
        ${dataRow('State Tax (5.00%)', formatCurrency(totalTax * 0.4549), '5.0000%')}
        ${dataRow('Parish Tax (5.99%)', formatCurrency(totalTax * 0.5451), '5.9900%')}
        ${dataRow('<strong>Total Tax</strong>', `<strong>${formatCurrency(totalTax)}</strong>`, '10.9900%')}
        ${totalRefundCount > 0 ? dataRow('Tax Refunded', `-${formatCurrency(refundedTaxTotal)}`, '') : ''}
        ${totalRefundCount > 0 ? dataRow('<strong>Net Tax Owed</strong>', `<strong>${formatCurrency(totalTax - refundedTaxTotal)}</strong>`, '') : ''}
        
        ${sectionHeader('Convenience Fees (Revenue)')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Fees Collected', formatCurrency(totalConvenienceFees), String(convenienceFeeCount))}
        ${convenienceFeesRefunded > 0 ? dataRow('Fees Refunded', `-${formatCurrency(convenienceFeesRefunded)}`, '') : ''}
        ${convenienceFeesRefunded > 0 ? dataRow('<strong>Net Fees</strong>', `<strong>${formatCurrency(netConvenienceFees)}</strong>`, '') : ''}
        <tr>
          <td colspan="3" style="text-align: center; padding: 4px; color: #666; font-size: 11px;">
            Convenience fees are pass-through revenue (2.9% + $0.30)
          </td>
        </tr>
        
        ${sectionHeader('Stripe Processing Fees (Expense)')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Processing Fees', formatCurrency(stripeProcessingFees), String(cardPaymentCount))}
        <tr>
          <td colspan="3" style="text-align: center; padding: 4px; color: #666; font-size: 11px;">
            Tax-deductible business expense (est. 2.9% + $0.30/txn)
          </td>
        </tr>
        
        ${sectionHeader('Payment Transactions')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${dataRow('Credit', formatCurrency(cardPaymentTotal), cardPaymentCount > 0 ? formatPercent(cardPaymentTotal, total) : '0.00%')}
        ${totalLoyaltyDiscounts > 0 ? dataRow('Discount (Loyalty)', formatCurrency(totalLoyaltyDiscounts), formatPercent(totalLoyaltyDiscounts, total + totalLoyaltyDiscounts)) : ''}
        ${total - cardPaymentTotal > 0 ? dataRow('Other/Pending', formatCurrency(total - cardPaymentTotal), formatPercent(total - cardPaymentTotal, total)) : ''}
        
        ${sectionHeader('Refunded Payments')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Subtotal Refunded', formatCurrency(refundedSubtotalTotal), String(totalRefundCount))}
        ${dataRow('Tax Refunded', formatCurrency(refundedTaxTotal), '')}
        ${convenienceFeesRefunded > 0 ? dataRow('Conv. Fees Refunded', formatCurrency(convenienceFeesRefunded), '') : ''}
        ${dataRow('<strong>Total Refunded to Customer</strong>', `<strong>${formatCurrency(refundedTotal)}</strong>`, '')}
        ${totalRefundCount > 0 ? `
        <tr><td colspan="3" style="padding: 4px 0;"></td></tr>
        ${headerRow('Cost of Refunds (Your Loss)', '', '')}
        ${dataRow('Stripe Fees Not Returned', `<strong style="color: #dc2626;">-${formatCurrency(stripeFeesPaidOnRefundedOrders)}</strong>`, '')}
        <tr>
          <td colspan="3" style="text-align: center; padding: 4px; color: #666; font-size: 11px;">
            Stripe keeps the original processing fee on refunds
          </td>
        </tr>
        ` : ''}
        
        ${sectionHeader('Voided Payments')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Voided/Cancelled', formatCurrency(voidedTotal), String(voidedCount))}
        
        ${sectionHeader('Settlement')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Credit Sales', formatCurrency(total), String(transactionCount))}
        ${dataRow('Credit Refunds', `-${formatCurrency(refundedTotal)}`, String(totalRefundCount))}
        ${dataRow('<strong>Net Credit</strong>', `<strong>${formatCurrency(total - refundedTotal)}</strong>`, '')}
        
        ${sectionHeader('Financial Summary')}
        ${headerRow('', 'Total $', '')}
        ${dataRow('Gross Product Sales', formatCurrency(grossRevenue), '')}
        ${dataRow('Sales Tax Collected', formatCurrency(totalTax), '')}
        ${dataRow('Convenience Fees Collected', formatCurrency(totalConvenienceFees), '')}
        ${dataRow('<strong>Total Collected</strong>', `<strong>${formatCurrency(total)}</strong>`, '')}
        <tr><td colspan="3" style="padding: 4px 0;"></td></tr>
        ${dataRow('Less: Refunds', refundedTotal > 0 ? `-${formatCurrency(refundedTotal)}` : formatCurrency(0), '')}
        ${dataRow('Less: Stripe Fees (est.)', `-${formatCurrency(stripeProcessingFees)}`, '')}
        ${totalRefundCost > 0 ? dataRow('Less: Refund Costs', `-${formatCurrency(totalRefundCost)}`, '') : ''}
        ${(() => {
          const payout = total - refundedTotal - stripeProcessingFees - totalRefundCost;
          return dataRow('<strong>Est. Net Payout</strong>', `<strong>${payout < 0 ? '-' + formatCurrency(Math.abs(payout)) : formatCurrency(payout)}</strong>`, '');
        })()}
        <tr><td colspan="3" style="padding: 4px 0;"></td></tr>
        ${dataRow('<strong>Net Product Revenue</strong>', `<strong>${netAfterRefunds < 0 ? '-' + formatCurrency(Math.abs(netAfterRefunds)) : formatCurrency(netAfterRefunds)}</strong>`, '')}
        ${dataRow('Net Tax Owed', formatCurrency(totalTax - refundedTaxTotal), '')}
        ${totalLoyaltyDiscounts > 0 ? dataRow('Loyalty Discounts Given', `-${formatCurrency(totalLoyaltyDiscounts)}`, '') : ''}
        
        ${hasStripeBalanceData ? `
        ${sectionHeader('Stripe Balance Summary')}
        ${headerRow('', 'Total $', '')}
        ${dataRow('Starting Balance', `${stripeStartingBalance < 0 ? '-' + formatCurrency(Math.abs(stripeStartingBalance)) : formatCurrency(stripeStartingBalance)}`, '')}
        <tr><td colspan="3" style="padding: 2px 0;"></td></tr>
        ${headerRow('Balance change from activity', '', '')}
        ${dataRow('&nbsp;&nbsp;Account activity before fees', `${stripeActivityBeforeFees < 0 ? '-' + formatCurrency(Math.abs(stripeActivityBeforeFees)) : formatCurrency(stripeActivityBeforeFees)}`, '')}
        ${dataRow('&nbsp;&nbsp;Less fees', stripeFeesTotal > 0 ? `-${formatCurrency(stripeFeesTotal)}` : formatCurrency(0), '')}
        ${dataRow('<strong>Net balance change</strong>', `<strong>${stripeBalanceChange < 0 ? '-' + formatCurrency(Math.abs(stripeBalanceChange)) : formatCurrency(stripeBalanceChange)}</strong>`, '')}
        ${dataRow('Total Payouts', stripePayoutsTotal > 0 ? `-${formatCurrency(stripePayoutsTotal)}` : formatCurrency(0), '')}
        ${dataRow('<strong>Ending Balance</strong>', `<strong>${stripeEndingBalance < 0 ? '-' + formatCurrency(Math.abs(stripeEndingBalance)) : formatCurrency(stripeEndingBalance)}</strong>`, '')}
        <tr><td colspan="3" style="padding: 4px 0;"></td></tr>
        ${headerRow('Activity Breakdown', 'Total $', 'Count #')}
        ${dataRow('Charges', formatCurrency(stripeChargeGross), String(stripeChargeCount))}
        ${dataRow('Refunds', stripeRefundGross > 0 ? `-${formatCurrency(stripeRefundGross)}` : formatCurrency(0), String(stripeRefundCount))}
        ` : ''}
        
        ${sectionHeader('Net Deposit')}
        ${headerRow('', 'Total $', '')}
        ${dataRow('Total Collected', formatCurrency(total), '')}
        ${dataRow('Less: Refunds', refundedTotal > 0 ? `-${formatCurrency(refundedTotal)}` : formatCurrency(0), '')}
        ${dataRow('Less: Stripe Fees', `-${formatCurrency(hasStripeBalanceData ? stripeFeesTotal : stripeProcessingFees)}`, '')}
        ${totalRefundCost > 0 ? dataRow('Less: Refund Costs', `-${formatCurrency(totalRefundCost)}`, '') : ''}
        ${(() => {
          const actualFees = hasStripeBalanceData ? stripeFeesTotal : stripeProcessingFees;
          const nd = total - refundedTotal - actualFees - totalRefundCost;
          return dataRow('<strong>Net Deposit Amount</strong>', `<strong style="${nd < 0 ? 'color: #dc2626;' : ''}">${nd < 0 ? '-' + formatCurrency(Math.abs(nd)) : formatCurrency(nd)}</strong>`, '');
        })()}
        
        ${sectionHeader('Tax Remittance Summary')}
        ${headerRow('', 'Collected $', 'Refunded $')}
        ${dataRow('State Tax (5.00%)', formatCurrency(totalTax * 0.4549), formatCurrency(refundedTaxTotal * 0.4549))}
        ${dataRow('Parish Tax (5.99%)', formatCurrency(totalTax * 0.5451), formatCurrency(refundedTaxTotal * 0.5451))}
        ${dataRow('<strong>Net Tax Due</strong>', `<strong>${formatCurrency(totalTax - refundedTaxTotal)}</strong>`, '')}
        ` : ''}
        
      </table>
      
      <!-- Footer line -->
      <div style="border-top: 2px solid #000; margin-top: 16px;"></div>
      
      <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #666;">
        <p style="margin: 4px 0;"><strong>Online Sales Report</strong> - Animal House Pet Store</p>
        <p style="margin: 4px 0;">This report shows online orders only.</p>
        <p style="margin: 4px 0;">Combine with POS daily report for full reconciliation.</p>
        <p style="margin: 4px 0;">${hasStripeBalanceData ? 'Stripe fees pulled from Stripe API.' : 'Stripe fees are estimated (2.9% + $0.30). Verify in Stripe Dashboard.'}</p>
      </div>
    </div>
  `;

  const textBody = transactionCount === 0 
    ? `
ANIMAL HOUSE LLC
2934 Cypress St
West Monroe LA 71291
318 322-3023

Date: ${reportDate} ${reportTime}
Start: ${startDateStr} 12:00AM
End: ${startDateStr} 11:59PM

-- Order Summary --
No online orders placed today.

---
Animal House Pet Store - Daily Online Sales Report
    `
    : `
ANIMAL HOUSE LLC
2934 Cypress St
West Monroe LA 71291
318 322-3023

Date: ${reportDate} ${reportTime}
Start: ${startDateStr} 12:00AM
End: ${startDateStr} 11:59PM

-- Order Summary --
                          Total $    Count #
Transactions              ${formatCurrency(total + totalLoyaltyDiscounts + totalOrderDiscounts).padStart(10)}    ${String(transactionCount).padStart(5)}
${totalOrderDiscounts > 0 ? `Order Discounts          ${('-' + formatCurrency(totalOrderDiscounts)).padStart(10)}    ${String(orderDiscountCount).padStart(5)}` : ''}
Loyalty Discounts         ${(totalLoyaltyDiscounts > 0 ? '-' + formatCurrency(totalLoyaltyDiscounts) : '0.00').padStart(10)}    ${String(loyaltyDiscountCount).padStart(5)}
Subtotal                  ${formatCurrency(subtotal).padStart(10)}    ${(totalItems + ' items').padStart(5)}
Taxes (10.99%)            ${formatCurrency(totalTax).padStart(10)}
Convenience Fees          ${formatCurrency(totalConvenienceFees).padStart(10)}    ${String(convenienceFeeCount).padStart(5)}
Total Collected           ${formatCurrency(total).padStart(10)}
Avg. Ticket               ${formatCurrency(avgTicket).padStart(10)}

-- Taxes Collected --
                          Total $    Rate %
State Tax                 ${formatCurrency(totalTax * 0.4549).padStart(10)}    5.0000%
Parish Tax                ${formatCurrency(totalTax * 0.5451).padStart(10)}    5.9900%
Total Tax                 ${formatCurrency(totalTax).padStart(10)}   10.9900%
${totalRefundCount > 0 ? `Tax Refunded             -${formatCurrency(refundedTaxTotal).padStart(10)}
Net Tax Owed              ${formatCurrency(totalTax - refundedTaxTotal).padStart(10)}` : ''}

-- Convenience Fees (Revenue) --
                          Total $    Count #
Fees Collected            ${formatCurrency(totalConvenienceFees).padStart(10)}    ${String(convenienceFeeCount).padStart(5)}
${convenienceFeesRefunded > 0 ? `Fees Refunded            -${formatCurrency(convenienceFeesRefunded).padStart(10)}
Net Fees                  ${formatCurrency(netConvenienceFees).padStart(10)}` : ''}
  (Pass-through revenue: 2.9% + $0.30)

-- Stripe Processing Fees (Expense) --
                          Total $    Count #
Processing Fees           ${formatCurrency(stripeProcessingFees).padStart(10)}    ${String(cardPaymentCount).padStart(5)}
  (Tax-deductible business expense, est. 2.9% + $0.30/txn)

-- Gross Sales By Category --
                          Total $    Sales %
${sortedCategories.map(cat => 
  `${cat.name.padEnd(24)} ${formatCurrency(cat.total).padStart(10)}    ${formatPercent(cat.total, categoryTotal).padStart(7)}`
).join('\n')}
Total                     ${formatCurrency(categoryTotal).padStart(10)}

-- Net Sales By Day Part --
                          Total $    Sales %
${sortedDayParts.map(dp =>
  `${dp.name.padEnd(24)} ${formatCurrency(dp.total).padStart(10)}    ${formatPercent(dp.total, total).padStart(7)}`
).join('\n')}
Report Total              ${formatCurrency(total).padStart(10)}   100.00%

-- Online Sales By Order Type --
                          Total $    Sales %
${supplyOrderCount > 0 ? `Supply Orders             ${formatCurrency(supplyOrderTotal).padStart(10)}   ${formatPercent(supplyOrderTotal, total)}` : ''}
${groomingOrderCount > 0 ? `Grooming Orders           ${formatCurrency(groomingOrderTotal).padStart(10)}   ${formatPercent(groomingOrderTotal, total)}` : ''}
Total                     ${formatCurrency(total).padStart(10)}

-- Discounts Applied --
                          Total $    Count #
${totalLoyaltyDiscounts > 0 ? `Loyalty Credits           ${formatCurrency(totalLoyaltyDiscounts).padStart(10)}    ${String(loyaltyDiscountCount).padStart(5)}` : ''}
${(() => {
  const employeeDiscounts = discountDetails.filter(d => d.type === 'Employee Discount');
  const astroDiscounts = discountDetails.filter(d => d.type === 'Astro Loyalty Reward');
  const otherDiscounts = discountDetails.filter(d => d.type === 'Other');
  const empTotal = employeeDiscounts.reduce((s, d) => s + d.amount, 0);
  const astroTotal = astroDiscounts.reduce((s, d) => s + d.amount, 0);
  const otherTotal = otherDiscounts.reduce((s, d) => s + d.amount, 0);
  let rows = '';
  if (empTotal > 0) rows += `Employee Discounts        ${formatCurrency(empTotal).padStart(10)}    ${String(employeeDiscounts.length).padStart(5)}\n`;
  if (astroTotal > 0) rows += `Astro Rewards             ${formatCurrency(astroTotal).padStart(10)}    ${String(astroDiscounts.length).padStart(5)}\n`;
  if (otherTotal > 0) rows += `Other Discounts           ${formatCurrency(otherTotal).padStart(10)}    ${String(otherDiscounts.length).padStart(5)}\n`;
  const allTotal = totalLoyaltyDiscounts + totalOrderDiscounts;
  if (allTotal > 0) rows += `Total Discounts           ${formatCurrency(allTotal).padStart(10)}    ${String(loyaltyDiscountCount + orderDiscountCount).padStart(5)}\n`;
  return rows;
})()}
${totalLoyaltyDiscounts === 0 && totalOrderDiscounts === 0 ? '(None)                        0.00        0' : ''}
${discountDetails.length > 0 ? `
  Discount Detail:
${discountDetails.map(d => {
  let reasonDisplay = d.type;
  if (d.type === 'Astro Loyalty Reward') {
    try {
      const parsed = JSON.parse(d.reason.replace('Astro Loyalty Reward: ', ''));
      reasonDisplay = parsed.appliedRewards?.map((r: any) => r.rewardName || 'Free Item').join(', ') || 'Astro Reward';
    } catch { reasonDisplay = 'Astro Reward'; }
  } else if (d.type === 'Employee Discount') {
    const pctMatch = d.reason.match(/(\d+)%/);
    reasonDisplay = pctMatch ? `Employee (${pctMatch[1]}%)` : 'Employee Discount';
  }
  return `  Order #${d.orderId}  -${formatCurrency(d.amount).padStart(8)}  ${reasonDisplay}`;
}).join('\n')}` : ''}

-- Payment Transactions --
                          Total $    Sales %
Credit                    ${formatCurrency(cardPaymentTotal).padStart(10)}   ${cardPaymentCount > 0 ? formatPercent(cardPaymentTotal, total) : '0.00%'}
${totalLoyaltyDiscounts > 0 ? `Discount (Loyalty)        ${formatCurrency(totalLoyaltyDiscounts).padStart(10)}   ${formatPercent(totalLoyaltyDiscounts, total + totalLoyaltyDiscounts)}` : ''}
${total - cardPaymentTotal > 0 ? `Other/Pending             ${formatCurrency(total - cardPaymentTotal).padStart(10)}   ${formatPercent(total - cardPaymentTotal, total)}` : ''}

-- Refunded Payments --
                          Total $    Count #
Subtotal Refunded         ${formatCurrency(refundedSubtotalTotal).padStart(10)}    ${String(totalRefundCount).padStart(5)}
Tax Refunded              ${formatCurrency(refundedTaxTotal).padStart(10)}
${convenienceFeesRefunded > 0 ? `Conv. Fees Refunded       ${formatCurrency(convenienceFeesRefunded).padStart(10)}` : ''}
Total Refunded            ${formatCurrency(refundedTotal).padStart(10)}
${totalRefundCount > 0 ? `
Cost of Refunds (Your Loss):
Stripe Fees Not Returned -${formatCurrency(stripeFeesPaidOnRefundedOrders).padStart(9)}
  (Stripe keeps the original processing fee on refunds)` : ''}

-- Voided Payments --
                          Total $    Count #
Voided/Cancelled          ${formatCurrency(voidedTotal).padStart(10)}    ${String(voidedCount).padStart(5)}

-- Settlement --
                          Total $    Count #
Credit Sales              ${formatCurrency(total).padStart(10)}    ${String(transactionCount).padStart(5)}
Credit Refunds           -${formatCurrency(refundedTotal).padStart(10)}    ${String(totalRefundCount).padStart(5)}
Net Credit                ${formatCurrency(total - refundedTotal).padStart(10)}

-- Financial Summary --
                          Total $
Gross Product Sales       ${formatCurrency(grossRevenue).padStart(10)}
Sales Tax Collected       ${formatCurrency(totalTax).padStart(10)}
Convenience Fees          ${formatCurrency(totalConvenienceFees).padStart(10)}
Total Collected           ${formatCurrency(total).padStart(10)}

Less: Refunds            ${refundedTotal > 0 ? '-' + formatCurrency(refundedTotal).padStart(9) : formatCurrency(0).padStart(10)}
Less: Stripe Fees (est.) -${formatCurrency(stripeProcessingFees).padStart(9)}
${totalRefundCost > 0 ? `Less: Refund Costs       -${formatCurrency(totalRefundCost).padStart(9)}` : ''}
Est. Net Payout           ${(() => { const p = total - refundedTotal - stripeProcessingFees - totalRefundCost; return (p < 0 ? '-' + formatCurrency(Math.abs(p)) : formatCurrency(p)).padStart(10); })()}

Net Product Revenue       ${(netAfterRefunds < 0 ? '-' + formatCurrency(Math.abs(netAfterRefunds)) : formatCurrency(netAfterRefunds)).padStart(10)}
Net Tax Owed              ${formatCurrency(totalTax - refundedTaxTotal).padStart(10)}
${totalLoyaltyDiscounts > 0 ? `Loyalty Discounts Given   -${formatCurrency(totalLoyaltyDiscounts).padStart(10)}` : ''}
${hasStripeBalanceData ? `
-- Stripe Balance Summary --
                          Total $
Starting Balance          ${(stripeStartingBalance < 0 ? '-' + formatCurrency(Math.abs(stripeStartingBalance)) : formatCurrency(stripeStartingBalance)).padStart(10)}

Balance change from activity
  Activity before fees    ${(stripeActivityBeforeFees < 0 ? '-' + formatCurrency(Math.abs(stripeActivityBeforeFees)) : formatCurrency(stripeActivityBeforeFees)).padStart(10)}
  Less fees              -${formatCurrency(stripeFeesTotal).padStart(9)}
Net balance change        ${(stripeBalanceChange < 0 ? '-' + formatCurrency(Math.abs(stripeBalanceChange)) : formatCurrency(stripeBalanceChange)).padStart(10)}
Total Payouts            ${stripePayoutsTotal > 0 ? '-' + formatCurrency(stripePayoutsTotal).padStart(9) : formatCurrency(0).padStart(10)}
Ending Balance            ${(stripeEndingBalance < 0 ? '-' + formatCurrency(Math.abs(stripeEndingBalance)) : formatCurrency(stripeEndingBalance)).padStart(10)}

Activity Breakdown        Total $    Count #
Charges                   ${formatCurrency(stripeChargeGross).padStart(10)}    ${String(stripeChargeCount).padStart(5)}
Refunds                  ${stripeRefundGross > 0 ? '-' + formatCurrency(stripeRefundGross).padStart(9) : formatCurrency(0).padStart(10)}    ${String(stripeRefundCount).padStart(5)}` : ''}

-- Net Deposit --
                          Total $
Total Collected           ${formatCurrency(total).padStart(10)}
Less: Refunds            ${refundedTotal > 0 ? '-' + formatCurrency(refundedTotal).padStart(9) : formatCurrency(0).padStart(10)}
Less: Stripe Fees        -${formatCurrency(hasStripeBalanceData ? stripeFeesTotal : stripeProcessingFees).padStart(9)}
${totalRefundCost > 0 ? `Less: Refund Costs       -${formatCurrency(totalRefundCost).padStart(9)}` : ''}
Net Deposit Amount        ${(() => { const af = hasStripeBalanceData ? stripeFeesTotal : stripeProcessingFees; const nd = total - refundedTotal - af - totalRefundCost; return (nd < 0 ? '-' + formatCurrency(Math.abs(nd)) : formatCurrency(nd)).padStart(10); })()}

-- Tax Remittance Summary --
                       Collected    Refunded
State Tax (5.00%)      ${formatCurrency(totalTax * 0.4549).padStart(10)}  -${formatCurrency(refundedTaxTotal * 0.4549).padStart(10)}
Parish Tax (5.99%)     ${formatCurrency(totalTax * 0.5451).padStart(10)}  -${formatCurrency(refundedTaxTotal * 0.5451).padStart(10)}
Net Tax Due            ${formatCurrency(totalTax - refundedTaxTotal).padStart(10)}

---
Animal House Pet Store - Daily Online Sales Report
This report shows online orders only.
Combine with POS daily report for full reconciliation.
${hasStripeBalanceData ? 'Stripe fees pulled from Stripe API.' : 'Stripe fees are estimated (2.9% + $0.30). Verify in Stripe Dashboard.'}
  `;

  const todayStr = today.toLocaleDateString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  for (const email of recipientEmails) {
    const msg = {
      to: email.trim(),
      from: fromEmail,
      replyTo,
      subject: `Daily Online Sales Report - ${todayStr}`,
      text: textBody,
      html: htmlBody,
    };

    await client.send(msg);
    console.log(`Daily sales report sent to ${email}`);
  }
}
