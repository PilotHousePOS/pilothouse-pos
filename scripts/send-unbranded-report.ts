import { getUncachableSendGridClient } from '../server/sendgridIntegration';
import * as fs from 'fs';
import * as path from 'path';

async function sendUnbrandedReport() {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    // Read the CSV file
    const csvPath = path.join(process.cwd(), 'TRULY-UNBRANDED-PRODUCTS.csv');
    const csvContent = fs.readFileSync(csvPath);
    const base64Content = csvContent.toString('base64');
    
    const msg = {
      to: 'tgskipbusiness@gmail.com',
      from: fromEmail,
      subject: 'PilotHouse - Unbranded Products Report (989 items)',
      text: `Attached is the TRULY-UNBRANDED-PRODUCTS.csv report containing 989 products that could not be automatically assigned brands.

Summary:
- Total Products: 7,251
- Products with Brands: 6,262 (86.36%)
- Remaining Unbranded: 989 (13.64%)
- Unique Brands: 188

Most remaining products are generic items (accessories, aquarium decorations, etc.) without clear brand identifiers.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">PilotHouse</h1>
          </div>
          <div style="padding: 30px; background-color: #f9fafb;">
            <h2 style="color: #1f2937;">Unbranded Products Report</h2>
            
            <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #0369a1;">📊 Summary</h3>
              <ul style="margin: 0; padding-left: 20px; color: #374151;">
                <li><strong>Total Products:</strong> 7,251</li>
                <li><strong>Products with Brands:</strong> 6,262 (86.36%)</li>
                <li><strong>Remaining Unbranded:</strong> 989 (13.64%)</li>
                <li><strong>Unique Brands:</strong> 188</li>
              </ul>
            </div>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              The attached CSV contains 989 products that could not be automatically assigned brands through our verification system.
            </p>
            
            <h3 style="color: #1f2937;">Breakdown by Category:</h3>
            <ul style="color: #4b5563; font-size: 14px; line-height: 1.8;">
              <li>Accessories: 672 (67.9%)</li>
              <li>Aquatics: 74 (7.5%)</li>
              <li>Reptiles: 64 (6.5%)</li>
              <li>Food: 33 (3.3%)</li>
              <li>Small Animal: 27 (2.7%)</li>
              <li>Other categories: 119 products</li>
            </ul>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Most remaining products are truly generic items (aquarium plants, decorations, basic accessories) without clear brand identifiers in their names.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              PilotHouse - Brand Verification System
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          content: base64Content,
          filename: 'TRULY-UNBRANDED-PRODUCTS.csv',
          type: 'text/csv',
          disposition: 'attachment'
        }
      ]
    };
    
    await client.send(msg);
    console.log('✅ Report sent successfully to tgskipbusiness@gmail.com');
  } catch (error: any) {
    console.error('❌ Failed to send email:', error);
    if (error.response?.body) {
      console.error('SendGrid error details:', JSON.stringify(error.response.body, null, 2));
    }
    process.exit(1);
  }
}

sendUnbrandedReport();
