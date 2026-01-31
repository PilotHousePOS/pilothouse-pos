import { getUncachableSendGridClient } from './sendgridIntegration';
import { storage } from './storage';

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

  const { client, fromEmail } = await getUncachableSendGridClient();

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

  // Separate completed and refunded orders
  const completedOrders = todaysOrders.filter(order => order.status !== 'refunded');
  const refundedOrders = todaysOrders.filter(order => order.status === 'refunded');
  
  // Calculate totals from completed orders only
  let total = 0;
  let subtotal = 0;
  let totalTax = 0;
  let totalItems = 0;
  const categorySales: Map<string, CategorySales> = new Map();
  
  for (const order of completedOrders) {
    const orderWithItems = await storage.getOrderWithItems(order.id);
    if (!orderWithItems) continue;

    const orderTotal = parseFloat(order.totalAmount) || 0;
    const orderSubtotal = parseFloat((order as any).subtotal) || orderTotal;
    const orderTax = parseFloat((order as any).taxAmount) || 0;
    
    total += orderTotal;
    subtotal += orderSubtotal;
    totalTax += orderTax;
    
    const items = orderWithItems.items || [];
    for (const item of items) {
      totalItems += item.quantity || 1;
      const itemPrice = (parseFloat(item.price) || 0) * (item.quantity || 1);
      
      // Categorize by item type (simplified categories)
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

  // Calculate refunded amount
  const refundedTotal = refundedOrders.reduce((sum, order) => sum + (parseFloat(order.totalAmount) || 0), 0);
  const refundedTax = refundedOrders.reduce((sum, order) => sum + (parseFloat((order as any).taxAmount) || 0), 0);
  
  // Average ticket (from completed orders only, guard against zero)
  const transactionCount = completedOrders.length;
  const avgTicket = transactionCount > 0 ? total / transactionCount : 0;

  // Sort categories by total
  const sortedCategories = Array.from(categorySales.values()).sort((a, b) => b.total - a.total);
  const categoryTotal = sortedCategories.reduce((sum, cat) => sum + cat.total, 0);

  // Build the receipt-style HTML
  const receiptStyle = `
    font-family: 'Courier New', Courier, monospace;
    max-width: 400px;
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

  // Handle no orders case
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
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">🐾 Animal House</div>
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
        ${dataRow('Open orders', '0.00', '')}
        ${dataRow('Transactions', formatCurrency(total), String(transactionCount))}
        ${dataRow('Discounts', '0.00', '0')}
        ${dataRow('Subtotal', formatCurrency(subtotal), '')}
        ${dataRow('Taxes (10.99%)', formatCurrency(totalTax), '')}
        ${dataRow('In Trx Tips', '0.00', '')}
        ${dataRow('Admin Fee', '0.00', '0')}
        ${dataRow('CF Refunded', '0.00', '')}
        ${dataRow('Convenience Fee', '0.00', '')}
        ${dataRow('Delivery Fee', '0.00', '')}
        ${dataRow('Other', '0.00', '')}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(total)}</strong>`, '')}
        <tr><td colspan="3" style="padding: 8px 0;"></td></tr>
        ${dataRow('Bottles Return', '0.00', '')}
        ${dataRow('Exchanges', '0.00', '')}
        ${dataRow('Payment On Acc', '0.00', '')}
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
        
        ${sectionHeader('Discount By Category')}
        ${headerRow('', 'Total $', 'Disc %')}
        ${dataRow('(None)', '0.00', '0.00%')}
        
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
        
        ${sectionHeader('Taxes')}
        ${headerRow('', 'Total $', 'Rate %')}
        ${dataRow('State Tax (5.00%)', formatCurrency(totalTax * 0.4549), '5.0000%')}
        ${dataRow('Federal Tax (5.99%)', formatCurrency(totalTax * 0.5451), '5.9900%')}
        ${dataRow('<strong>Total Tax</strong>', `<strong>${formatCurrency(totalTax)}</strong>`, '10.9900%')}
        
        ${sectionHeader('Payments Transactions')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${dataRow('Cash', '0.00', '0.00%')}
        ${dataRow('Credit (Online)', formatCurrency(total), '100.00%')}
        ${dataRow('Discount', '0.00', '0.00%')}
        
        ${sectionHeader('Company Pay In Details')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('(None)', '0.00', '0')}
        
        ${sectionHeader('Refunded Payments')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Total', formatCurrency(refundedTotal), String(refundedOrders.length))}
        
        ${sectionHeader('Voided Payments')}
        ${headerRow('', 'Total $', 'Sales %')}
        ${dataRow('(None)', '0.00', '0.00%')}
        
        ${sectionHeader('Settlement')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Credit Sales', formatCurrency(total), String(transactionCount))}
        ${dataRow('Credit Refunds', formatCurrency(refundedTotal), String(refundedOrders.length))}
        ${dataRow('Total Credit', formatCurrency(total - refundedTotal), '')}
        ${dataRow('Debit Sales', '0.00', '')}
        ${dataRow('Debit Refunds', '0.00', '')}
        ${dataRow('Total Debit', '0.00', '')}
        ${dataRow('EBT Sales', '0.00', '')}
        ${dataRow('EBT Refunds', '0.00', '')}
        ${dataRow('Total EBT', '0.00', '')}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(total - refundedTotal)}</strong>`, '')}
        
        ${sectionHeader('Online Credit Card Trans.')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('All Online Payments', formatCurrency(total), String(transactionCount))}
        <tr>
          <td colspan="3" style="text-align: center; padding: 8px; color: #666; font-size: 11px;">
            (Card type breakdown not available for online orders)
          </td>
        </tr>
        
        ${sectionHeader('Promotions and Discounts')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Discount', '0.00', '0')}
        
        ${sectionHeader('Summary')}
        ${headerRow('', 'Total $', 'Count #')}
        ${dataRow('Cash', '0.00', '0')}
        ${dataRow('Pay in', '0.00', '0')}
        ${dataRow('Net Cash', '0.00', '')}
        ${dataRow('Credit (Online)', formatCurrency(total), String(transactionCount))}
        ${dataRow('<strong>Total</strong>', `<strong>${formatCurrency(total)}</strong>`, '')}
        ${dataRow('Net Online Sales', formatCurrency(total - refundedTotal), '')}
        ` : ''}
        
      </table>
      
      <!-- Footer line -->
      <div style="border-top: 2px solid #000; margin-top: 16px;"></div>
      
      <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #666;">
        <p style="margin: 4px 0;"><strong>Online Sales Report</strong> - Animal House Pet Store</p>
        <p style="margin: 4px 0;">This report shows online orders only.</p>
        <p style="margin: 4px 0;">Combine with POS daily report for full reconciliation.</p>
      </div>
    </div>
  `;

  // Plain text version
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
Transactions              ${formatCurrency(total).padStart(10)}    ${String(transactionCount).padStart(5)}
Subtotal                  ${formatCurrency(subtotal).padStart(10)}
Taxes (10.99%)            ${formatCurrency(totalTax).padStart(10)}
Total                     ${formatCurrency(total).padStart(10)}
Avg. Ticket               ${formatCurrency(avgTicket).padStart(10)}

-- Taxes --
                          Total $    Rate %
State Tax                 ${formatCurrency(totalTax * 0.4549).padStart(10)}    5.0000%
Federal Tax               ${formatCurrency(totalTax * 0.5451).padStart(10)}    5.9900%
Total Tax                 ${formatCurrency(totalTax).padStart(10)}   10.9900%

-- Gross Sales By Category --
                          Total $    Sales %
${sortedCategories.map(cat => 
  `${cat.name.padEnd(24)} ${formatCurrency(cat.total).padStart(10)}    ${formatPercent(cat.total, categoryTotal).padStart(7)}`
).join('\n')}
Total                     ${formatCurrency(categoryTotal).padStart(10)}

-- Payments Transactions --
                          Total $    Sales %
Cash                           0.00     0.00%
Credit (Online)           ${formatCurrency(total).padStart(10)}   100.00%

-- Settlement --
                          Total $    Count #
Credit Sales              ${formatCurrency(total).padStart(10)}    ${String(transactionCount).padStart(5)}
Credit Refunds            ${formatCurrency(refundedTotal).padStart(10)}    ${String(refundedOrders.length).padStart(5)}
Total                     ${formatCurrency(total - refundedTotal).padStart(10)}

-- Summary --
                          Total $    Count #
Credit (Online)           ${formatCurrency(total).padStart(10)}    ${String(transactionCount).padStart(5)}
Total                     ${formatCurrency(total).padStart(10)}
Net Online Sales          ${formatCurrency(total - refundedTotal).padStart(10)}

---
Animal House Pet Store - Daily Online Sales Report
This report shows online orders only.
Combine with POS daily report for full reconciliation.
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
      subject: `Daily Online Sales Report - ${todayStr}`,
      text: textBody,
      html: htmlBody,
    };

    await client.send(msg);
    console.log(`Daily sales report sent to ${email}`);
  }
}
