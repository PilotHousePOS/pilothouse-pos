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

export async function sendDailySalesReport(recipientEmails: string[]): Promise<void> {
  if (!recipientEmails || recipientEmails.length === 0) {
    throw new Error('No recipient emails provided');
  }

  const { client, fromEmail } = await getUncachableSendGridClient();

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  
  const allOrders = await storage.getOrders();
  
  const todaysOrders = allOrders.filter((order: Order) => {
    if (!order.orderDate) return false;
    const orderDate = new Date(order.orderDate);
    const orderDateStr = orderDate.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const todayDateStr = today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    return orderDateStr === todayDateStr;
  });

  let totalRevenue = 0;
  let totalItems = 0;
  const orderDetails: string[] = [];
  const orderDetailsHtml: string[] = [];

  for (const order of todaysOrders) {
    const orderWithItems = await storage.getOrderWithItems(order.id);
    if (!orderWithItems) continue;

    const user = await storage.getUser(order.userId);
    const customerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown';
    const customerEmail = user?.email || 'N/A';
    
    const orderTotal = parseFloat(order.totalAmount) || 0;
    totalRevenue += orderTotal;
    
    const items = orderWithItems.items || [];
    totalItems += items.reduce((sum: number, item: OrderItem) => sum + (item.quantity || 1), 0);

    const itemLines = items.map((item: OrderItem) => {
      const itemName = item.itemName || 'Unknown Item';
      const qty = item.quantity || 1;
      const price = parseFloat(item.price) || 0;
      return `  - ${itemName} (x${qty}) - $${price.toFixed(2)}`;
    }).join('\n');

    const itemLinesHtml = items.map((item: OrderItem) => {
      const itemName = item.itemName || 'Unknown Item';
      const qty = item.quantity || 1;
      const price = parseFloat(item.price) || 0;
      return `<li>${itemName} (x${qty}) - $${price.toFixed(2)}</li>`;
    }).join('');

    const orderTime = order.orderDate 
      ? new Date(order.orderDate).toLocaleTimeString('en-US', { 
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      : 'Unknown time';

    orderDetails.push(
      `Order #${order.id} - ${orderTime}\n` +
      `Customer: ${customerName} (${customerEmail})\n` +
      `Status: ${order.status || 'pending'}\n` +
      `Items:\n${itemLines}\n` +
      `Order Total: $${orderTotal.toFixed(2)}\n` +
      (order.shippingAddress ? `Shipping: ${order.shippingAddress}\n` : '') +
      `---`
    );

    orderDetailsHtml.push(`
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; background-color: #ffffff;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong style="color: #1e40af;">Order #${order.id}</strong>
          <span style="color: #6b7280;">${orderTime}</span>
        </div>
        <p style="margin: 4px 0; color: #374151;"><strong>Customer:</strong> ${customerName}</p>
        <p style="margin: 4px 0; color: #6b7280; font-size: 14px;">${customerEmail}</p>
        <p style="margin: 4px 0; color: #374151;"><strong>Status:</strong> <span style="text-transform: capitalize;">${order.status || 'pending'}</span></p>
        ${order.shippingAddress ? `<p style="margin: 4px 0; color: #374151;"><strong>Shipping:</strong> ${order.shippingAddress}</p>` : ''}
        <div style="margin-top: 12px;">
          <strong style="color: #374151;">Items:</strong>
          <ul style="margin: 8px 0; padding-left: 20px; color: #4b5563;">
            ${itemLinesHtml}
          </ul>
        </div>
        <div style="text-align: right; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <strong style="color: #1e40af; font-size: 18px;">Total: $${orderTotal.toFixed(2)}</strong>
        </div>
      </div>
    `);
  }

  const textBody = todaysOrders.length === 0
    ? `Daily Sales Report - ${todayStr}\n\nNo orders were placed today.\n\n---\nAnimal House Pet Store`
    : `Daily Sales Report - ${todayStr}\n\n` +
      `SUMMARY\n` +
      `-------\n` +
      `Total Orders: ${todaysOrders.length}\n` +
      `Total Items Sold: ${totalItems}\n` +
      `Total Revenue: $${totalRevenue.toFixed(2)}\n\n` +
      `ORDER DETAILS\n` +
      `-------------\n` +
      orderDetails.join('\n\n') +
      `\n\n---\nAnimal House Pet Store\n` +
      `Use this report to update your Exatouch POS inventory.`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background-color: #f3f4f6;">
      <div style="background-color: #1e40af; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Daily Sales Report</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">${todayStr}</p>
      </div>
      
      <div style="padding: 24px;">
        ${todaysOrders.length === 0 
          ? `<div style="text-align: center; padding: 40px; background-color: #ffffff; border-radius: 8px;">
              <p style="color: #6b7280; font-size: 18px; margin: 0;">No orders were placed today.</p>
            </div>`
          : `
            <div style="background-color: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Summary</h2>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
                <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">Total Orders</p>
                  <p style="margin: 4px 0 0 0; color: #1e40af; font-size: 28px; font-weight: bold;">${todaysOrders.length}</p>
                </div>
                <div style="background-color: #f0fdf4; padding: 16px; border-radius: 8px;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">Items Sold</p>
                  <p style="margin: 4px 0 0 0; color: #16a34a; font-size: 28px; font-weight: bold;">${totalItems}</p>
                </div>
                <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">Total Revenue</p>
                  <p style="margin: 4px 0 0 0; color: #d97706; font-size: 28px; font-weight: bold;">$${totalRevenue.toFixed(2)}</p>
                </div>
              </div>
            </div>
            
            <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Order Details</h2>
            ${orderDetailsHtml.join('')}
          `
        }
        
        <div style="margin-top: 24px; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #d97706;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>Reminder:</strong> Use this report to update your Exatouch POS inventory accordingly.
          </p>
        </div>
      </div>
      
      <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0;">Animal House Pet Store - Daily Automated Report</p>
        <p style="margin: 4px 0 0 0;">This email was automatically generated. Do not reply.</p>
      </div>
    </div>
  `;

  for (const email of recipientEmails) {
    const msg = {
      to: email.trim(),
      from: fromEmail,
      subject: `Daily Sales Report - ${todayStr}`,
      text: textBody,
      html: htmlBody,
    };

    await client.send(msg);
    console.log(`Daily sales report sent to ${email}`);
  }
}
