import XLSX from 'xlsx';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function updateSupplies() {
  try {
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${data.length} rows in Excel file`);
    
    // Get existing supplies
    console.log('Fetching existing supplies from database...');
    const existingSupplies = await db.select().from(supplies);
    console.log(`Found ${existingSupplies.length} existing supplies in database`);
    
    // Create a map of existing supplies by name (lowercase)
    const supplyMap = new Map();
    existingSupplies.forEach(supply => {
      supplyMap.set(supply.name.toLowerCase().trim(), supply);
    });
    
    let updatedCount = 0;
    let addedCount = 0;
    let skippedCount = 0;
    const batchSize = 500;
    let newBatch: any[] = [];
    
    console.log('\nProcessing items...\n');
    
    for (let i = 0; i < data.length; i++) {
      const row: any = data[i];
      
      try {
        // Skip header row
        if (row.Description === 'Description') {
          continue;
        }
        
        // Skip inactive items
        if (row.TRUE !== true && row.TRUE !== 'true') {
          skippedCount++;
          continue;
        }
        
        // Extract full data from Excel
        const fullName = (row.Description || '').toString().trim();
        const fullDescription = (row.DescLong || '').toString().trim();
        const category = (row['Category '] || row.Category || 'accessories').toString().trim().toLowerCase();
        const brand = (row.Mfg || row.Vendor || '').toString().trim();
        const price = parseFloat(row.Price || '0');
        const stockQuantity = parseInt(row.QtyOnHand || '0', 10) || 0;
        const size = (row.Size || '').toString().trim();
        
        // Skip if no name or price
        if (!fullName || fullName === '' || price <= 0) {
          skippedCount++;
          continue;
        }
        
        // Normalize category
        let normalizedCategory = category;
        if (category.includes('food')) normalizedCategory = 'food';
        else if (category.includes('toy')) normalizedCategory = 'toys';
        else if (category.includes('bed')) normalizedCategory = 'beds';
        else if (category.includes('leash') || category.includes('collar')) normalizedCategory = 'leashesAndCollars';
        else if (category.includes('health') || category.includes('medical')) normalizedCategory = 'healthcare';
        else normalizedCategory = 'accessories';
        
        // Check if exists
        const existing = supplyMap.get(fullName.toLowerCase());
        
        if (existing) {
          // Update existing supply with full name and description
          await db.update(supplies)
            .set({
              name: fullName, // Full name without abbreviation
              description: fullDescription || fullName, // Full description from DescLong
              category: normalizedCategory,
              brand: brand || null,
              price: price.toFixed(2),
              stockQuantity,
              size: size || null,
            })
            .where(eq(supplies.id, existing.id));
          
          updatedCount++;
          if (updatedCount % 100 === 0) {
            console.log(`Progress: Updated ${updatedCount} items...`);
          }
        } else {
          // Add new item
          newBatch.push({
            name: fullName, // Full name without abbreviation
            category: normalizedCategory,
            brand: brand || null,
            price: price.toFixed(2),
            description: fullDescription || fullName, // Full description from DescLong
            stockQuantity,
            size: size || null,
            isActive: true,
          });
          
          // Insert batch when it reaches batchSize
          if (newBatch.length >= batchSize) {
            await db.insert(supplies).values(newBatch);
            addedCount += newBatch.length;
            console.log(`Progress: Added ${addedCount} new items...`);
            newBatch = [];
          }
        }
        
      } catch (error: any) {
        console.error(`Row ${i + 1} error:`, error.message);
      }
    }
    
    // Insert remaining new items
    if (newBatch.length > 0) {
      await db.insert(supplies).values(newBatch);
      addedCount += newBatch.length;
      console.log(`Progress: Added ${addedCount} new items (final batch)...`);
    }
    
    console.log('\n=== Update Summary ===');
    console.log(`Total rows: ${data.length}`);
    console.log(`Updated with full names: ${updatedCount}`);
    console.log(`Added new: ${addedCount}`);
    console.log(`Skipped (inactive/invalid): ${skippedCount}`);
    
  } catch (error: any) {
    console.error('Update failed:', error.message);
    process.exit(1);
  }
}

updateSupplies();
