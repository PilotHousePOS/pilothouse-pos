import { getUncachableSendGridClient } from './sendgridIntegration';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';

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

  const { client, fromEmail, replyToList } = await getUncachableSendGridClient();

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
  
  let total = 0;
  let subtotal = 0;
  let totalTax = 0;
  let totalItems = 0;
  let totalLoyaltyDiscounts = 0;
  let loyaltyDiscountCount = 0;
  let totalConvenienceFees = 0;
  let convenienceFeeCount = 0;
  let cardPaymentCount = 0;
  let cardPaymentTotal = 0;
  const categorySales: Map<string, CategorySales> = new Map();
  
  // Process ALL today's orders for gross sales (including refunded ones)
  for (const order of todaysOrders) {
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
    
    const items = orderWithItems.items || [];
    for (const item of items) {
      totalItems += item.quantity || 1;
      const itemPrice = (parseFloat(item.price) || 0) * (item.quantity || 1);
      
      let category = 'Misc.';
      const itemName = (item.itemName || '').toLowerCase();
      
      if (itemName.includes('dog food') || itemName.includes('kibble')) {
        category = 'Dog Food';
      } else if (itemName.includes('cat food')) {
        category = 'Cat Food';
      } else if (itemName.includes('dog treat')) {
        category = 'Dog Treats';
      } else if (itemName.includes('cat treat')) {
        category = 'Cat Treats';
      } else if (itemName.includes('reptile') || itemName.includes('feeder')) {
        category = 'Reptiles/Feeders';
      } else if (itemName.includes('aqua') || itemName.includes('fish')) {
        category = 'Aquatics';
      } else if (itemName.includes('bird')) {
        category = 'Bird Supplies';
      } else if (itemName.includes('toy')) {
        category = 'Toys';
      } else if (itemName.includes('groom') || itemName.includes('bath')) {
        category = 'Grooming';
      } else if (itemName.includes('treat')) {
        category = 'Treats';
      } else if (itemName.includes('food')) {
        category = 'Food';
      } else if (itemName.includes('accessory') || itemName.includes('collar') || itemName.includes('leash')) {
        category = 'Accessories';
      }
      
      const existing = categorySales.get(category) || { name: category, total: 0, count: 0 };
      existing.total += itemPrice;
      existing.count += item.quantity || 1;
      categorySales.set(category, existing);
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
  for (const refund of todaysRefunds) {
    if (refund.refundType === 'full' && refund.orderId) {
      try {
        const refundOrder = await storage.getOrder(refund.orderId);
        if (refundOrder?.convenienceFee) {
          convenienceFeesRefunded += parseFloat(refundOrder.convenienceFee) || 0;
        }
      } catch (e) {}
    }
  }
  const netConvenienceFees = totalConvenienceFees - convenienceFeesRefunded;

  // Stripe processing fees (2.9% + $0.30 per transaction on the total charged)
  // This is what Stripe charges YOU - it's a tax-deductible business expense
  const stripeProcessingFees = cardPaymentCount > 0 
    ? (cardPaymentTotal * 0.029) + (cardPaymentCount * 0.30)
    : 0;
  
  // Net revenue calculations
  const grossRevenue = subtotal; // Product sales before tax
  const netAfterRefunds = grossRevenue - refundedSubtotalTotal;
  const estimatedStripePayout = total - refundedTotal - stripeProcessingFees;

  const transactionCount = todaysOrders.length;
  const avgTicket = transactionCount > 0 ? total / transactionCount : 0;

  const sortedCategories = Array.from(categorySales.values()).sort((a, b) => b.total - a.total);
  const categoryTotal = sortedCategories.reduce((sum, cat) => sum + cat.total, 0);

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
        ${dataRow('Transactions', formatCurrency(total + totalLoyaltyDiscounts), String(transactionCount))}
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
        
        ${sectionHeader('Discounts Applied')}
        ${headerRow('', 'Total $', 'Count #')}
        ${totalLoyaltyDiscounts > 0 
          ? dataRow('Loyalty Rewards', formatCurrency(totalLoyaltyDiscounts), String(loyaltyDiscountCount))
          : dataRow('(None)', '0.00', '0')}
        
        ${sectionHeader('Total Sales By Category')}
        ${headerRow('', 'Total $', 'Disc %')}
        ${sortedCategories.length > 0
          ? sortedCategories.map(cat => 
              dataRow(cat.name, formatCurrency(cat.total), formatPercent(cat.total, categoryTotal))
            ).join('')
          : dataRow('(No categorized items)', '0.00', '')}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(categoryTotal)}</strong>`, '')}
        
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
        
        ${sectionHeader('Payments')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${dataRow('Credit Card (Online)', formatCurrency(cardPaymentTotal), cardPaymentCount > 0 ? formatPercent(cardPaymentTotal, total) : '0.00%')}
        ${total - cardPaymentTotal > 0 ? dataRow('Other/Pending', formatCurrency(total - cardPaymentTotal), formatPercent(total - cardPaymentTotal, total)) : ''}
        
        ${sectionHeader('Refunds')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Subtotal Refunded', formatCurrency(refundedSubtotalTotal), String(totalRefundCount))}
        ${dataRow('Tax Refunded', formatCurrency(refundedTaxTotal), '')}
        ${dataRow('<strong>Total Refunded</strong>', `<strong>${formatCurrency(refundedTotal)}</strong>`, '')}
        
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
        ${dataRow('Less: Refunds', `-${formatCurrency(refundedTotal)}`, '')}
        ${dataRow('Less: Stripe Fees (est.)', `-${formatCurrency(stripeProcessingFees)}`, '')}
        ${dataRow('<strong>Est. Stripe Payout</strong>', `<strong>${formatCurrency(estimatedStripePayout > 0 ? estimatedStripePayout : 0)}</strong>`, '')}
        <tr><td colspan="3" style="padding: 4px 0;"></td></tr>
        ${dataRow('<strong>Net Product Revenue</strong>', `<strong>${formatCurrency(netAfterRefunds > 0 ? netAfterRefunds : 0)}</strong>`, '')}
        ${dataRow('Net Tax Owed', formatCurrency(totalTax - refundedTaxTotal), '')}
        ${totalLoyaltyDiscounts > 0 ? dataRow('Loyalty Discounts Given', `-${formatCurrency(totalLoyaltyDiscounts)}`, '') : ''}
        
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
        <p style="margin: 4px 0;">Stripe fees are estimated. Verify in Stripe Dashboard for exact amounts.</p>
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
Transactions              ${formatCurrency(total + totalLoyaltyDiscounts).padStart(10)}    ${String(transactionCount).padStart(5)}
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

-- Payments --
                          Total $    Sales %
Credit Card (Online)      ${formatCurrency(cardPaymentTotal).padStart(10)}   ${cardPaymentCount > 0 ? formatPercent(cardPaymentTotal, total) : '0.00%'}
${total - cardPaymentTotal > 0 ? `Other/Pending             ${formatCurrency(total - cardPaymentTotal).padStart(10)}   ${formatPercent(total - cardPaymentTotal, total)}` : ''}

-- Refunds --
                          Total $    Count #
Subtotal Refunded         ${formatCurrency(refundedSubtotalTotal).padStart(10)}    ${String(totalRefundCount).padStart(5)}
Tax Refunded              ${formatCurrency(refundedTaxTotal).padStart(10)}
Total Refunded            ${formatCurrency(refundedTotal).padStart(10)}

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

Less: Refunds            -${formatCurrency(refundedTotal).padStart(10)}
Less: Stripe Fees (est.) -${formatCurrency(stripeProcessingFees).padStart(10)}
Est. Stripe Payout        ${formatCurrency(estimatedStripePayout > 0 ? estimatedStripePayout : 0).padStart(10)}

Net Product Revenue       ${formatCurrency(netAfterRefunds > 0 ? netAfterRefunds : 0).padStart(10)}
Net Tax Owed              ${formatCurrency(totalTax - refundedTaxTotal).padStart(10)}
${totalLoyaltyDiscounts > 0 ? `Loyalty Discounts Given   -${formatCurrency(totalLoyaltyDiscounts).padStart(10)}` : ''}

-- Tax Remittance Summary --
                       Collected    Refunded
State Tax (5.00%)      ${formatCurrency(totalTax * 0.4549).padStart(10)}  -${formatCurrency(refundedTaxTotal * 0.4549).padStart(10)}
Parish Tax (5.99%)     ${formatCurrency(totalTax * 0.5451).padStart(10)}  -${formatCurrency(refundedTaxTotal * 0.5451).padStart(10)}
Net Tax Due            ${formatCurrency(totalTax - refundedTaxTotal).padStart(10)}

---
Animal House Pet Store - Daily Online Sales Report
This report shows online orders only.
Combine with POS daily report for full reconciliation.
Stripe fees are estimated. Verify in Stripe Dashboard for exact amounts.
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
      replyToList,
      subject: `Daily Online Sales Report - ${todayStr}`,
      text: textBody,
      html: htmlBody,
    };

    await client.send(msg);
    console.log(`Daily sales report sent to ${email}`);
  }
}
