import { getUncachableSendGridClient } from '../server/sendgridIntegration';
import { readFileSync } from 'fs';

async function emailCSV() {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const csvContent = readFileSync('FINAL-UNBRANDED-PRODUCTS-UPDATED.csv', 'utf-8');
  
  // Create attachment
  const base64CSV = Buffer.from(csvContent).toString('base64');
  
  const msg = {
    to: 'tgskipbusiness@gmail.com',
    from: fromEmail,
    subject: 'Unbranded Products Report - 1,334 Products',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">📊 Unbranded Products Export</h1>
        </div>
        <div style="padding: 30px; background-color: #f9fafb;">
          <p style="color: #4b5563; font-size: 16px;">
            Attached is the updated CSV file with <strong>1,334 remaining unbranded products</strong> after the improved pattern matching.
          </p>
          
          <h3 style="color: #1f2937;">Summary of Recent Improvements:</h3>
          <ul style="color: #4b5563;">
            <li>✅ 45 more products assigned brands (from 5,872 to 5,917)</li>
            <li>✅ Brand success rate: <strong>81.60%</strong> (up from 80.98%)</li>
            <li>✅ Added 2 new brands: Farnam, Pets First, Preston</li>
          </ul>
          
          <h3 style="color: #1f2937;">New Pattern Matches Added:</h3>
          <ul style="color: #4b5563;">
            <li><strong>Fromm:</strong> "from cat", "from dog", "from kitten", "from puppy", "from adult"</li>
            <li><strong>Canidae:</strong> "canid", "cand"</li>
            <li><strong>Penn Plax:</strong> "dory betta", "spongebob"</li>
            <li><strong>Ethical Products:</strong> "kfc"</li>
            <li><strong>Pets First:</strong> "lsu", "saints", "nola saints"</li>
          </ul>
          
          <h3 style="color: #1f2937;">Products Fixed:</h3>
          <ul style="color: #4b5563;">
            <li>21 LSU/Saints products → Pets First</li>
            <li>9 Dory/Spongebob betta tanks → Penn Plax</li>
            <li>6 "From Cat Adult" products → Fromm</li>
            <li>4 KFC toys → Ethical Products</li>
            <li>4 "Canid/Cand" products → Canidae</li>
            <li>1 Canine RED CELL → Farnam</li>
          </ul>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">
            The CSV file is attached and ready to open in Excel or Google Sheets.
          </p>
        </div>
      </div>
    `,
    attachments: [{
      content: base64CSV,
      filename: 'FINAL-UNBRANDED-PRODUCTS-UPDATED.csv',
      type: 'text/csv',
      disposition: 'attachment'
    }]
  };
  
  await client.send(msg);
  console.log('✅ Email sent successfully to tgskipbusiness@gmail.com!');
}

emailCSV().catch(console.error).finally(() => process.exit(0));
