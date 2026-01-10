import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface ProductMapping {
  dbId: number;
  dbName: string;
  frommUrl: string;
  category: string;
}

interface ScrapedData {
  description: string;
  ingredients: string;
  guaranteedAnalysis: string;
  calories: string;
  sizes: string;
  images: string[];
}

// Product name to URL mappings
const FROMM_URL_MAPPINGS: Record<string, string> = {
  // Dog Gold Dry
  'Fromm Gold 5lb': '/products/dog/gold/dry/adult-gold/',
  'Fromm Gold 15lb': '/products/dog/gold/dry/adult-gold/',
  'Fromm Gold 30lb': '/products/dog/gold/dry/adult-gold/',
  'Fromm Gold Puppy 5lb': '/products/dog/gold/dry/puppy-gold/',
  'Fromm Gold Puppy 15lb': '/products/dog/gold/dry/puppy-gold/',
  'Fromm Gold Puppy 30lb': '/products/dog/gold/dry/puppy-gold/',
  'Fromm Gold Large Breed 5lb': '/products/dog/gold/dry/large-breed-adult-gold/',
  'Fromm Gold Large Breed 15lb': '/products/dog/gold/dry/large-breed-adult-gold/',
  'Fromm Gold Large Breed 30lb': '/products/dog/gold/dry/large-breed-adult-gold/',
  'Fromm Gold Large Breed Puppy 5lb': '/products/dog/gold/dry/large-breed-puppy-gold/',
  'Fromm Gold Large Breed Puppy 15lb': '/products/dog/gold/dry/large-breed-puppy-gold/',
  'Fromm Gold Large Breed Puppy 30lb': '/products/dog/gold/dry/large-breed-puppy-gold/',
  'Fromm Gold Small Breed 5lb': '/products/dog/gold/dry/small-breed-adult-gold/',
  'Fromm Gold Small Breed 15lb': '/products/dog/gold/dry/small-breed-adult-gold/',
  'Fromm Gold Senior 5lb': '/products/dog/gold/dry/reduced-activity-and-senior-gold/',
  'Fromm Gold Senior 15lb': '/products/dog/gold/dry/reduced-activity-and-senior-gold/',
  'Fromm Gold Senior 30lb': '/products/dog/gold/dry/reduced-activity-and-senior-gold/',
  'Fromm Gold Weight 5lb': '/products/dog/gold/dry/weight-management-gold/',
  'Fromm Gold Weight 15lb': '/products/dog/gold/dry/weight-management-gold/',
  'Fromm Gold Weight 30lb': '/products/dog/gold/dry/weight-management-gold/',
  'Fromm Gold lb Br Weight 15lb': '/products/dog/gold/dry/large-breed-weight-management-gold/',
  'Fromm Gold Ancient 30lb': '/products/dog/gold/dry/adult-gold-ancient-grains/',
  'Fromm Ancient 15lb': '/products/dog/gold/dry/adult-gold-ancient-grains/',
  'Fromm Coast Weight 26lb': '/products/dog/gold/dry/gold-coast-weight-management/',

  // Dog Classic Dry
  'Fromm Classic 5lb': '/products/dog/classic/dry/classic-adult/',
  'Fromm Classic 15lb': '/products/dog/classic/dry/classic-adult/',
  'Fromm Classic 30lb': '/products/dog/classic/dry/classic-adult/',
  'Fromm Classic Puppy 5lb': '/products/dog/classic/dry/classic-puppy/',
  'Fromm Classic Puppy 15lb': '/products/dog/classic/dry/classic-puppy/',
  'Fromm Classic Puppy 30lb': '/products/dog/classic/dry/classic-puppy/',

  // Dog Four-Star Dry
  'Fromm Beef Frittata Veg 4lb': '/products/dog/four-star/dry/beef-frittata-veg-recipe/',
  'Fromm Beef Frittata Veg 12lb': '/products/dog/four-star/dry/beef-frittata-veg-recipe/',
  'Fromm Beef Frittata Veg 26lb': '/products/dog/four-star/dry/beef-frittata-veg-recipe/',
  'Fromm Chicken À La Veg 4lb': '/products/dog/four-star/dry/chicken-a-la-veg-recipe/',
  'Fromm Chicken À La Veg 12lb': '/products/dog/four-star/dry/chicken-a-la-veg-recipe/',
  'Fromm Chicken À La Veg 26lb': '/products/dog/four-star/dry/chicken-a-la-veg-recipe/',
  'Fromm Chicken Frommage 4lb': '/products/dog/four-star/dry/chicken-au-frommage-recipe/',
  'Fromm Chicken Frommage 12lb': '/products/dog/four-star/dry/chicken-au-frommage-recipe/',
  'Fromm Chicken Frommage 26lb': '/products/dog/four-star/dry/chicken-au-frommage-recipe/',
  'Fromm Duck À La Veg 4lb': '/products/dog/four-star/dry/duck-a-la-veg-recipe/',
  'Fromm Duck À La Veg 12lb': '/products/dog/four-star/dry/duck-a-la-veg-recipe/',
  'Fromm Duck À La Veg 26lb': '/products/dog/four-star/dry/duck-a-la-veg-recipe/',
  'Fromm Game Bird Recipe Bird 4lb': '/products/dog/four-star/dry/game-bird-recipe/',
  'Fromm Game Bird Recipe Bird 12lb': '/products/dog/four-star/dry/game-bird-recipe/',
  'Fromm Game Bird Recipe Bird 26lb': '/products/dog/four-star/dry/game-bird-recipe/',
  'Fromm Hasen Duck 4lb': '/products/dog/four-star/dry/hasen-duckenpfeffer/',
  'Fromm Hasen Duck 12lb': '/products/dog/four-star/dry/hasen-duckenpfeffer/',
  'Fromm Highlander Beef 26lb': '/products/dog/four-star/dry/highlander-beef-oats-n-barley-recipe/',
  'Fromm Lamb & Lentil 4lb': '/products/dog/four-star/dry/lamb-and-lentil-recipe/',
  'Fromm Lamb & Lentil 26lb': '/products/dog/four-star/dry/lamb-and-lentil-recipe/',
  'Fromm Lamb 12lb': '/products/dog/four-star/dry/lamb-and-lentil-recipe/',
  'Fromm Pork & Apple 4lb': '/products/dog/four-star/dry/pork-and-applesauce-recipe/',
  'Fromm Pork & Apple 12lb': '/products/dog/four-star/dry/pork-and-applesauce-recipe/',
  'Fromm Pork & Apple 26lb': '/products/dog/four-star/dry/pork-and-applesauce-recipe/',
  'Fromm Pork & Peas 4lb': '/products/dog/four-star/dry/pork-and-peas-recipe/',
  'Fromm Pork & Peas 12lb': '/products/dog/four-star/dry/pork-and-peas-recipe/',
  'Fromm Rancharosa 12lb': '/products/dog/four-star/dry/rancherosa/',
  'Fromm Rancherosa 4lb': '/products/dog/four-star/dry/rancherosa/',
  'Fromm Salmon À La Veg 4lb': '/products/dog/four-star/dry/salmon-a-la-veg-recipe/',
  'Fromm Salmon À La Veg 12lb': '/products/dog/four-star/dry/salmon-a-la-veg-recipe/',
  'Fromm Salmon À La Veg 26lb': '/products/dog/four-star/dry/salmon-a-la-veg-recipe/',
  'Fromm Surf & Turf 4lb': '/products/dog/four-star/dry/surf-and-turf-recipe/',
  'Fromm Surf & Turf 12lb': '/products/dog/four-star/dry/surf-and-turf-recipe/',
  'Fromm Surf & Turf 26lb': '/products/dog/four-star/dry/surf-and-turf-recipe/',
  'Fromm Trout 4lb': '/products/dog/four-star/dry/trout-and-whitefish-recipe/',
  'Fromm Trout 12lb': '/products/dog/four-star/dry/trout-and-whitefish-recipe/',
  'Fromm Trout 26lb': '/products/dog/four-star/dry/trout-and-whitefish-recipe/',
  'Fromm Whitefish 4lb': '/products/dog/four-star/dry/whitefish-and-potato-recipe/',
  'Fromm Whitefish 12lb': '/products/dog/four-star/dry/whitefish-and-potato-recipe/',
  'Fromm Whitefish 26lb': '/products/dog/four-star/dry/whitefish-and-potato-recipe/',
  'Fromm Zealambder 26lb': '/products/dog/four-star/dry/zealambder-recipe/',

  // Dog Pâté (12.2oz cans)
  'Fromm Beef & Barley 12.2oz': '/products/dog/pate/can/beef-and-barley-pate/',
  'Fromm Beef & Sweet Potato 12.2oz': '/products/dog/pate/can/beef-and-sweet-potato-pate/',
  'Fromm Chicken & Rice 12.2oz': '/products/dog/pate/can/chicken-and-rice-pate/',
  'Fromm Chicken & Sweet Potato 12.2oz': '/products/dog/pate/can/chicken-and-sweet-potato-pate/',
  'Fromm Chicken 12.2oz': '/products/dog/pate/can/chicken-pate/',
  'Fromm Chicken & Duck 12.2oz': '/products/dog/pate/can/chicken-and-duck-pate/',
  'Fromm Duck À La Veg 12.2oz': '/products/dog/pate/can/duck-a-la-veg-pate/',
  'Fromm Lamb & Sweet Potato 12.2oz': '/products/dog/pate/can/lamb-and-sweet-potato-pate/',
  'Fromm Lamb 12.2oz': '/products/dog/pate/can/lamb-pate/',
  'Fromm Salmon & Chicken 12.2oz': '/products/dog/pate/can/salmon-and-chicken-pate/',
  'Fromm Seafood 12.2oz': '/products/dog/pate/can/seafood-medley-pate/',
  'Fromm Turkey & Pumpkin 12.2oz': '/products/dog/pate/can/turkey-and-pumpkin-pate/',
  'Fromm Turkey 12.2oz': '/products/dog/pate/can/turkey-pate/',
  'Fromm Turkey Duck & Sweet Potato 12.2oz': '/products/dog/pate/can/turkey-duck-and-sweet-potato-pate/',
  'Fromm Venison & Beef 12.2oz': '/products/dog/pate/can/venison-and-beef-pate/',
  'Fromm White Fish & Lentil 12.2oz': '/products/dog/pate/can/whitefish-and-lentil-pate/',

  // Dog Four-Star Shredded
  'Fromm Shredded Chicken 12oz': '/products/dog/four-star/can/shredded-chicken-entree/',
  'Fromm Beef Livattini Vegetable 10lb': '/products/cat/four-star/dry/beef-livattini-veg-recipe/',

  // Dog Classic Cans
  'Fromm Clasic Chicken 12.5oz': '/products/dog/classic/can/chicken-and-rice/',
  'Fromm Clasic Puppy 12.5oz': '/products/dog/classic/can/puppy-classic/',
  'Fromm Clasic Rurk 12.5oz': '/products/dog/classic/can/turkey-and-rice/',
  'Fromm Beef Fromm Bites 12.5oz': '/products/dog/classic/can/beef-rice-oats/',
  'Fromm Chicken Fromm Bites 12.5oz': '/products/dog/classic/can/chicken-and-rice/',

  // Dog Nutritionals
  'Fromm Nutritionals Mobility': '/products/dog/nutritionals/treats/mobility-support/',
  'Fromm Nutritionals Digestive': '/products/dog/nutritionals/treats/digestive-support/',
  'Fromm Nutritionals Immunity': '/products/dog/nutritionals/treats/immunity-support/',
  'Fromm Digestive 13oz': '/products/dog/nutritionals/can/digestive-support/',
  'Fromm Immunity 13oz': '/products/dog/nutritionals/can/immunity-support/',
  'Fromm Mobility 13oz': '/products/dog/nutritionals/can/mobility-support/',

  // Dog Crunchy Os
  'Fromm Crunchy O\'s Bacon Blasters': '/products/dog/crunchy-os/treats/bacon-blasters-flavor/',
  'Fromm Crunchy O\'s Banana Kablammas': '/products/dog/crunchy-os/treats/banana-kablammas-flavor/',
  'Fromm Crunchy O\'s Blueberry Blasts': '/products/dog/crunchy-os/treats/blueberry-blasts-flavor/',
  'Fromm Crunchy O\'s Peanut Butter Jammers': '/products/dog/crunchy-os/treats/peanut-butter-jammers-flavor/',
  'Fromm Crunchy O\'s Pot Roast Punchers': '/products/dog/crunchy-os/treats/pot-roast-punchers-flavor/',
  'Fromm Crunchy O\'s Pumpkin': '/products/dog/crunchy-os/treats/pumpkin-kran-pow-flavor/',
  'Fromm Crunchy O\'s Smokin\' CheesePlosions': '/products/dog/crunchy-os/treats/smokin-cheeseplosions-flavor/',

  // Dog Oven-Baked Treats
  'Fromm Oven-Baked Chicken with Peas and Carrots Treats': '/products/dog/four-star/treats/chicken-with-peas-and-carrots/',
  'Fromm Oven-Baked Parmesan Cheese Treats': '/products/dog/four-star/treats/parmesan-cheese/',
  'Fromm Oven-Baked Salmon with Sweet Potato Treats': '/products/dog/four-star/treats/salmon-with-sweet-potato/',
  'Fromm Baked Lamb': '/products/dog/four-star/treats/lamb-with-cranberry/',
  'Fromm Tenderollies ChickaRollie Flavor': '/products/dog/tenderollies/treats/chickarollie-flavor/',

  // Cat Four-Star Dry
  'Fromm Kitten 4lb': '/products/cat/gold/dry/kitten-gold/',
  'Fromm Kitten 10lb': '/products/cat/gold/dry/kitten-gold/',
  'Fromm Cat Adult 4lb': '/products/cat/gold/dry/adult-gold/',
  'Fromm Cat Adult 10lb': '/products/cat/gold/dry/adult-gold/',
  'Fromm Cat Weight 4lb': '/products/cat/gold/dry/weight-management-gold/',
  'Fromm Cat Weight 10lb': '/products/cat/gold/dry/weight-management-gold/',
  'Fromm Cat Beef Liváttini Veg 4lb': '/products/cat/four-star/dry/beef-livattini-veg-recipe/',
  'Fromm Cat Hasen Duckenpfeffer 4lb': '/products/cat/four-star/dry/hasen-duckenpfeffer-recipe/',
  'Fromm Cat Hasen Duckenpfeffer 10lb': '/products/cat/four-star/dry/hasen-duckenpfeffer-recipe/',
  'Fromm Cat Game Bird Recipe 4lb': '/products/cat/four-star/dry/game-bird-recipe/',
  'Fromm Cat Game Bird Recipe 10lb': '/products/cat/four-star/dry/game-bird-recipe/',
  'Fromm Cat Surf & Turf 4lb': '/products/cat/four-star/dry/surf-and-turf-recipe/',
  'Fromm Cat Salmon 4lb': '/products/cat/four-star/dry/salmon-a-la-veg-recipe/',
  'Fromm Cat Duck À La Vegetable 10lb': '/products/cat/four-star/dry/duck-a-la-veg-recipe/',

  // Cat PurrSnickety (these are cat food despite being in dogFood category)
  'Fromm PurrSnickety Chicken 4lb': '/products/cat/purrsnickety/dry/chicken-recipe/',
  'Fromm PurrSnickety Chicken 10lb': '/products/cat/purrsnickety/dry/chicken-recipe/',
  'Fromm PurrSnickety Game Bird Recipe 4lb': '/products/cat/purrsnickety/dry/game-bird-recipe/',
  'Fromm PurrSnickety Game Bird Recipe 10lb': '/products/cat/purrsnickety/dry/game-bird-recipe/',
  'Fromm PurrSnickety Game Bird Recipe 6oz': '/products/cat/purrsnickety/treats/game-bird-recipe/',
  'Fromm PurrSnickety Salmon 4lb': '/products/cat/purrsnickety/dry/salmon-recipe/',
  'Fromm PurrSnickety Salmon 10lb': '/products/cat/purrsnickety/dry/salmon-recipe/',
  'Fromm PurrSnickety Salmon 6oz': '/products/cat/purrsnickety/treats/salmon-recipe/',
  'Fromm PurrSnickitty chicken 6oz': '/products/cat/purrsnickety/treats/chicken-recipe/',
};

const BASE_URL = 'https://frommfamily.com';

async function fetchProductData(url: string): Promise<ScrapedData | null> {
  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.log(`  Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Extract meta description
    const descMatch = /<meta name="description" content="([^"]+)"/.exec(html);
    const description = descMatch ? descMatch[1] : '';
    
    // Extract ingredients from markdown-like structure
    let ingredients = '';
    const ingredientsMatch = /### Ingredients\s*\n\n([\s\S]*?)(?=\n\n###|\n\n## |$)/.exec(html);
    if (!ingredientsMatch) {
      // Try HTML extraction
      const ingHtmlMatch = /<div[^>]*class="ingredients[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
      if (ingHtmlMatch) {
        ingredients = ingHtmlMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    } else {
      ingredients = ingredientsMatch[1]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\\/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Extract guaranteed analysis
    const gaMatch = /### Guaranteed Analysis\s*\n\n([\s\S]*?)(?=\n\n###|\n\n## |$)/.exec(html);
    let guaranteedAnalysis = '';
    if (gaMatch) {
      guaranteedAnalysis = gaMatch[1]
        .replace(/^- /gm, '')
        .replace(/\n/g, '; ')
        .trim();
    }
    
    // Extract caloric content
    const calMatch = /### Caloric Content\s*\n\n([\s\S]*?)(?=\n\n###|\n\n## |$)/.exec(html);
    let calories = '';
    if (calMatch) {
      calories = calMatch[1]
        .replace(/^- /gm, '')
        .replace(/\n/g, '; ')
        .trim();
    }
    
    // Extract sizes
    const sizesMatch = /### Available Sizes\s*\n\n([^\n]+)/.exec(html);
    const sizes = sizesMatch ? sizesMatch[1].trim() : '';
    
    // Extract images
    const images: string[] = [];
    const imgRegex = /https:\/\/cdn\.frommfamily\.com\/media\/[^)\s"]+\.(jpg|png|jpeg)/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const imgUrl = imgMatch[0];
      // Filter out menu and icon images
      if (!images.includes(imgUrl) && 
          !imgUrl.includes('menu-') && 
          !imgUrl.includes('icon_') &&
          !imgUrl.includes('_282x242') &&
          !imgUrl.includes('_256x400')) {
        images.push(imgUrl);
      }
    }
    
    return {
      description,
      ingredients,
      guaranteedAnalysis,
      calories,
      sizes,
      images: images.slice(0, 8)
    };
  } catch (e) {
    console.log(`  Error fetching ${url}:`, e);
    return null;
  }
}

async function main() {
  // Get all Fromm products from database
  const result = await pool.query(`
    SELECT id, name, category, description, ingredients, image_url
    FROM supplies 
    WHERE name ILIKE '%fromm%'
    ORDER BY name
  `);
  
  console.log(`Found ${result.rows.length} Fromm products in database\n`);
  
  let matched = 0;
  let unmatched = 0;
  let updated = 0;
  let failed = 0;
  
  const unmatchedProducts: string[] = [];
  
  for (const row of result.rows) {
    const url = FROMM_URL_MAPPINGS[row.name];
    
    if (!url) {
      unmatched++;
      unmatchedProducts.push(`${row.id}: ${row.name}`);
      continue;
    }
    
    matched++;
    console.log(`[${matched}] ${row.name} -> ${url}`);
    
    // Check if already has real data (not placeholder)
    const hasPlaceholderData = row.description?.includes('family-made in Wisconsin since 1904');
    
    if (!hasPlaceholderData && row.ingredients && row.ingredients.length > 100) {
      console.log('  Already has real data, skipping...');
      continue;
    }
    
    // Fetch data from Fromm website
    const data = await fetchProductData(url);
    
    if (!data || !data.description) {
      console.log('  No data found');
      failed++;
      continue;
    }
    
    console.log(`  Description: ${data.description.substring(0, 60)}...`);
    console.log(`  Ingredients: ${data.ingredients?.substring(0, 60)}...`);
    console.log(`  Images: ${data.images.length} found`);
    
    // Build update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;
    
    if (data.description) {
      updateFields.push(`description = $${paramCount++}`);
      updateValues.push(data.description);
    }
    
    if (data.ingredients) {
      updateFields.push(`ingredients = $${paramCount++}`);
      updateValues.push(data.ingredients);
    }
    
    if (data.guaranteedAnalysis) {
      updateFields.push(`guaranteed_analysis = $${paramCount++}`);
      updateValues.push(data.guaranteedAnalysis);
    }
    
    // Update main image if we have product images
    if (data.images.length > 0) {
      // Find the product bag/can image (usually first one with _h1k or product image)
      const productImage = data.images.find(img => 
        img.includes('_h1k') || 
        img.includes('_5lb') || 
        img.includes('_15lb') ||
        img.includes('_30lb') ||
        img.includes('_12-2oz') ||
        img.includes('_4lb') ||
        img.includes('_10lb')
      ) || data.images[0];
      
      updateFields.push(`image_url = $${paramCount++}`);
      updateValues.push(productImage);
      
      // Add additional images to carousel
      if (data.images.length > 1) {
        updateFields.push(`image_urls = $${paramCount++}`);
        updateValues.push(data.images);
      }
    }
    
    if (updateFields.length > 0) {
      updateValues.push(row.id);
      const updateQuery = `
        UPDATE supplies 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
      `;
      
      try {
        await pool.query(updateQuery, updateValues);
        console.log('  Updated successfully');
        updated++;
      } catch (e) {
        console.log('  Update failed:', e);
        failed++;
      }
    }
    
    // Add small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total products: ${result.rows.length}`);
  console.log(`Matched to URLs: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  
  if (unmatchedProducts.length > 0) {
    console.log('\nUnmatched products:');
    unmatchedProducts.forEach(p => console.log(`  ${p}`));
  }
  
  await pool.end();
}

main().catch(console.error);
