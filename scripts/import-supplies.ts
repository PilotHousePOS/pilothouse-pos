import XLSX from 'xlsx';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function importSupplies() {
  try {
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${data.length} rows in Excel file`);
    console.log('Sample row:', data[0]);
    console.log('\nAll column headers:', Object.keys(data[0] || {}));
    
    // Get existing supplies from database
    console.log('\nFetching existing supplies from database...');
    const existingSupplies = await db.select().from(supplies);
    console.log(`Found ${existingSupplies.length} existing supplies in database`);
    
    // Map to track existing items by name (case-insensitive)
    const existingNames = new Set(
      existingSupplies.map(s => s.name.toLowerCase().trim())
    );
    
    let addedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const batchSize = 500; // Insert 500 items at a time
    let batch: any[] = [];
    
    console.log('\nProcessing items...\n');
    
    for (let i = 0; i < data.length; i++) {
      const row: any = data[i];
      
      try {
        // Skip header row (row 1 where Description === 'Description')
        if (row.Description === 'Description') {
          continue;
        }
        
        // Skip inactive items (TRUE column should be true)
        if (row.TRUE !== true && row.TRUE !== 'true') {
          skippedCount++;
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
          skippedCount++;
          continue;
        }
        
        // Check if already exists (case-insensitive)
        if (existingNames.has(name.toLowerCase())) {
          skippedCount++;
          continue;
        }
        
        // Normalize category to match your database categories
        // (food, toys, beds, leashes, healthcare, accessories)
        let normalizedCategory = category;
        if (category.includes('food')) normalizedCategory = 'food';
        else if (category.includes('toy')) normalizedCategory = 'toys';
        else if (category.includes('bed')) normalizedCategory = 'beds';
        else if (category.includes('leash') || category.includes('collar')) normalizedCategory = 'leashes';
        else if (category.includes('health') || category.includes('medical')) normalizedCategory = 'healthcare';
        else normalizedCategory = 'accessories';
        
        // Add to batch
        batch.push({
          name,
          category: normalizedCategory,
          brand: brand || null,
          price: price.toFixed(2),
          description: description || null,
          stockQuantity,
          size: size || null,
          isActive: true,
        });
        
        // Add to tracking set
        existingNames.add(name.toLowerCase());
        
        // Insert batch when it reaches batchSize
        if (batch.length >= batchSize) {
          await db.insert(supplies).values(batch);
          addedCount += batch.length;
          console.log(`Progress: Added ${addedCount} items...`);
          batch = [];
        }
        
      } catch (error: any) {
        errors.push(`Row ${i + 1} (${row.Description}): ${error.message}`);
      }
    }
    
    // Insert remaining items in batch
    if (batch.length > 0) {
      await db.insert(supplies).values(batch);
      addedCount += batch.length;
      console.log(`Progress: Added ${addedCount} items (final batch)...`);
    }
    
    console.log('\n=== Import Summary ===');
    console.log(`Total rows: ${data.length}`);
    console.log(`Added: ${addedCount}`);
    console.log(`Skipped (duplicates): ${skippedCount}`);
    if (errors.length > 0) {
      console.log(`Errors: ${errors.length}`);
      errors.forEach(err => console.log(`  - ${err}`));
    }
    
  } catch (error: any) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

importSupplies();
