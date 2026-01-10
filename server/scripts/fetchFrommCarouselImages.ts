import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

interface FrommProduct {
  id: number;
  name: string;
  image_url: string | null;
}

interface ProductUrlMapping {
  productLine: string;
  category: string;
  slug: string;
}

function buildManufacturerUrl(name: string): string | null {
  const lowerName = name.toLowerCase().replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i');
  const isCat = lowerName.includes("cat") || lowerName.includes("kitten") || lowerName.includes("purrsnick");
  const isCanned = lowerName.match(/\d+(\.\d+)?\s*oz/i) !== null;
  
  // Crunchy O's
  if (lowerName.includes("crunchy o")) {
    if (lowerName.includes("banana")) return "https://frommfamily.com/products/dog/crunchy-os/treats/banana-kablammas-flavor/";
    if (lowerName.includes("blueberry")) return "https://frommfamily.com/products/dog/crunchy-os/treats/blueberry-blasts-flavor/";
    if (lowerName.includes("peanut butter")) return "https://frommfamily.com/products/dog/crunchy-os/treats/peanut-butter-jammers-flavor/";
    if (lowerName.includes("pot roast")) return "https://frommfamily.com/products/dog/crunchy-os/treats/pot-roast-punchers-flavor/";
    if (lowerName.includes("pumpkin")) return "https://frommfamily.com/products/dog/crunchy-os/treats/pumpkin-kran-pow-flavor/";
    if (lowerName.includes("cheese")) return "https://frommfamily.com/products/dog/crunchy-os/treats/smokin-cheeseplosions-flavor/";
    if (lowerName.includes("bacon")) return "https://frommfamily.com/products/dog/crunchy-os/treats/bacon-blasters-flavor/";
  }
  
  // Four-Star Dog Treats
  if (lowerName.includes("oven-baked") || lowerName.includes("baked")) {
    if (lowerName.includes("parmesan")) return "https://frommfamily.com/products/dog/four-star/treats/parmesan-cheese-recipe/";
    if (lowerName.includes("salmon")) return "https://frommfamily.com/products/dog/four-star/treats/salmon-with-sweet-potato-recipe/";
    if (lowerName.includes("lamb")) return "https://frommfamily.com/products/dog/four-star/treats/lamb-with-cranberry-recipe/";
    if (lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/four-star/treats/chicken-with-peas-and-carrots-recipe/";
  }
  
  // Nutritionals
  if (lowerName.includes("nutritional")) {
    if (lowerName.includes("digestive")) return "https://frommfamily.com/products/dog/nutritionals/treats/digestive-functional-dog-treats/";
    if (lowerName.includes("immunity")) return "https://frommfamily.com/products/dog/nutritionals/treats/immunity-functional-dog-treats/";
    if (lowerName.includes("mobility")) return "https://frommfamily.com/products/dog/nutritionals/treats/mobility-functional-dog-treats/";
  }
  
  // Tenderollies
  if (lowerName.includes("tenderollies") || lowerName.includes("tenderollie")) {
    if (lowerName.includes("chicken") || lowerName.includes("chickarollie")) return "https://frommfamily.com/products/dog/tenderollies/soft-and-savory-treats/chickarollie-flavor/";
    if (lowerName.includes("beef") || lowerName.includes("beefarollie")) return "https://frommfamily.com/products/dog/tenderollies/soft-and-savory-treats/beefarollie-flavor/";
    if (lowerName.includes("turkey") || lowerName.includes("turkarollie")) return "https://frommfamily.com/products/dog/tenderollies/soft-and-savory-treats/turkarollie-flavor/";
  }
  
  // Gold Dog Dry
  if ((lowerName.includes("gold") || lowerName.includes("adult") || lowerName.includes("puppy") || lowerName.includes("senior")) && !isCat && !isCanned) {
    if (lowerName.includes("puppy") && lowerName.includes("large")) return "https://frommfamily.com/products/dog/gold/dry/large-breed-puppy-gold/";
    if (lowerName.includes("puppy")) return "https://frommfamily.com/products/dog/gold/dry/puppy-gold/";
    if (lowerName.includes("large breed adult")) return "https://frommfamily.com/products/dog/gold/dry/large-breed-adult-gold/";
    if (lowerName.includes("large breed") || lowerName.includes("lb br")) return "https://frommfamily.com/products/dog/gold/dry/large-breed-adult-gold/";
    if (lowerName.includes("small breed adult")) return "https://frommfamily.com/products/dog/gold/dry/small-breed-adult-gold/";
    if (lowerName.includes("small breed")) return "https://frommfamily.com/products/dog/gold/dry/small-breed-adult-gold/";
    if (lowerName.includes("weight") || lowerName.includes("coast")) return "https://frommfamily.com/products/dog/gold/dry/weight-management-gold/";
    if (lowerName.includes("senior")) return "https://frommfamily.com/products/dog/gold/dry/senior-gold/";
    if (lowerName.includes("ancient")) return "https://frommfamily.com/products/dog/gold/dry/adult-gold-ancient-grains/";
    if (lowerName.includes("adult") || lowerName.includes("gold")) return "https://frommfamily.com/products/dog/gold/dry/adult-gold/";
  }
  
  // Classic Dry (not canned)
  if (lowerName.includes("classic") && !isCanned) {
    if (lowerName.includes("puppy")) return "https://frommfamily.com/products/dog/classic/dry/puppy-classic/";
    return "https://frommfamily.com/products/dog/classic/dry/adult-classic/";
  }
  
  // Ancient Grains dry (standalone)
  if (lowerName.includes("ancient") && !isCanned) {
    return "https://frommfamily.com/products/dog/gold/dry/adult-gold-ancient-grains/";
  }
  
  // Gold Cat
  if (lowerName.includes("cat") && (lowerName.includes("gold") || lowerName.includes("adult") || lowerName.includes("kitten"))) {
    if (lowerName.includes("kitten")) return "https://frommfamily.com/products/cat/gold/dry/kitten-gold/";
    if (lowerName.includes("indoor")) return "https://frommfamily.com/products/cat/gold/dry/indoor-cat-gold/";
    if (lowerName.includes("weight")) return "https://frommfamily.com/products/cat/gold/dry/weight-management-gold/";
    if (lowerName.includes("adult")) return "https://frommfamily.com/products/cat/gold/dry/adult-gold/";
  }
  
  // Four-Star Dog Dry
  if (!isCat && !isCanned) {
    if (lowerName.includes("beef frittata")) return "https://frommfamily.com/products/dog/four-star/dry/beef-frittata-veg-recipe/";
    if (lowerName.includes("chicken a la veg") || lowerName.includes("chicken à la veg")) return "https://frommfamily.com/products/dog/four-star/dry/chicken-a-la-veg-recipe/";
    if (lowerName.includes("chicken au frommage") || lowerName.includes("chicken frommage")) return "https://frommfamily.com/products/dog/four-star/dry/chicken-au-frommage-recipe/";
    if (lowerName.includes("duck a la veg") || lowerName.includes("duck à la veg")) return "https://frommfamily.com/products/dog/four-star/dry/duck-a-la-veg-recipe/";
    if (lowerName.includes("game bird")) return "https://frommfamily.com/products/dog/four-star/dry/game-bird-recipe/";
    if (lowerName.includes("hasen")) return "https://frommfamily.com/products/dog/four-star/dry/hasen-duckenpfeffer/";
    if (lowerName.includes("highlander")) return "https://frommfamily.com/products/dog/four-star/dry/highlander-beef-oats-n-barley-recipe/";
    if (lowerName.includes("lamb") && lowerName.includes("lentil")) return "https://frommfamily.com/products/dog/four-star/dry/lamb-and-lentil-recipe/";
    if (lowerName.includes("lamb") && !lowerName.includes("lentil") && !lowerName.includes("sweet")) return "https://frommfamily.com/products/dog/four-star/dry/lamb-and-lentil-recipe/";
    if (lowerName.includes("pork") && (lowerName.includes("applesauce") || lowerName.includes("apple"))) return "https://frommfamily.com/products/dog/four-star/dry/pork-and-applesauce-recipe/";
    if (lowerName.includes("pork") && lowerName.includes("peas")) return "https://frommfamily.com/products/dog/four-star/dry/pork-and-peas-recipe/";
    if (lowerName.includes("rancherosa") || lowerName.includes("rancharosa")) return "https://frommfamily.com/products/dog/four-star/dry/rancherosa/";
    if (lowerName.includes("salmon a la veg") || lowerName.includes("salmon à la veg")) return "https://frommfamily.com/products/dog/four-star/dry/salmon-a-la-veg-recipe/";
    if (lowerName.includes("salmon tunalini")) return "https://frommfamily.com/products/dog/four-star/dry/salmon-tunalini-recipe/";
    if (lowerName.includes("surf") && lowerName.includes("turf")) return "https://frommfamily.com/products/dog/four-star/dry/surf-and-turf-recipe/";
    if (lowerName.includes("trout") && lowerName.includes("whitefish")) return "https://frommfamily.com/products/dog/four-star/dry/trout-and-whitefish-recipe/";
    if (lowerName.includes("trout") && !lowerName.includes("whitefish")) return "https://frommfamily.com/products/dog/four-star/dry/trout-and-whitefish-recipe/";
    if (lowerName.includes("whitefish") && lowerName.includes("potato")) return "https://frommfamily.com/products/dog/four-star/dry/whitefish-and-potato-recipe/";
    if (lowerName.includes("whitefish") && !lowerName.includes("potato") && !lowerName.includes("lentil")) return "https://frommfamily.com/products/dog/four-star/dry/whitefish-and-potato-recipe/";
    if (lowerName.includes("zealambder")) return "https://frommfamily.com/products/dog/four-star/dry/zealambder-recipe/";
    // Beef Livattini for Dog
    if (lowerName.includes("livattini") || lowerName.includes("liváttini")) return "https://frommfamily.com/products/dog/four-star/dry/beef-livattini-veg-recipe/";
    // Fromm Bites treats
    if (lowerName.includes("fromm bites") || lowerName.includes("bites")) return "https://frommfamily.com/products/dog/four-star/treats/chicken-with-peas-and-carrots-recipe/";
  }
  
  // Four-Star Cat Dry
  if (lowerName.includes("cat")) {
    if (lowerName.includes("beef") && lowerName.includes("livattini")) return "https://frommfamily.com/products/cat/four-star/dry/beef-livattini-veg-recipe/";
    if (lowerName.includes("chicken a la veg") || lowerName.includes("chicken à la veg")) return "https://frommfamily.com/products/cat/four-star/dry/chicken-a-la-veg-recipe/";
    if (lowerName.includes("duck a la veg") || lowerName.includes("duck à la vegetable") || lowerName.includes("duck à la veg")) return "https://frommfamily.com/products/cat/four-star/dry/duck-a-la-veg-recipe/";
    if (lowerName.includes("game bird")) return "https://frommfamily.com/products/cat/four-star/dry/game-bird-recipe/";
    if (lowerName.includes("hasen")) return "https://frommfamily.com/products/cat/four-star/dry/hasen-duckenpfeffer/";
    if (lowerName.includes("salmon a la veg") || lowerName.includes("salmon à la veg")) return "https://frommfamily.com/products/cat/four-star/dry/salmon-a-la-veg-recipe/";
    if (lowerName.includes("salmon tunachovy")) return "https://frommfamily.com/products/cat/four-star/dry/salmon-tunachovy-recipe/";
    if (lowerName.includes("surf") && lowerName.includes("turf")) return "https://frommfamily.com/products/cat/four-star/dry/surf-and-turf-recipe/";
  }
  
  // PurrSnickitty (various spellings)
  if (lowerName.includes("purrsnick")) {
    if (lowerName.includes("chicken")) return "https://frommfamily.com/products/cat/purrsnickitty/dry/chicken-recipe/";
    if (lowerName.includes("salmon")) return "https://frommfamily.com/products/cat/purrsnickitty/dry/salmon-recipe/";
    if (lowerName.includes("turkey")) return "https://frommfamily.com/products/cat/purrsnickitty/dry/turkey-recipe/";
    if (lowerName.includes("game bird")) return "https://frommfamily.com/products/cat/purrsnickitty/dry/game-bird-recipe/";
  }
  
  // Kitten
  if (lowerName.includes("kitten")) {
    return "https://frommfamily.com/products/cat/gold/dry/kitten-gold/";
  }
  
  // Cat Weight Management
  if (isCat && lowerName.includes("weight")) {
    return "https://frommfamily.com/products/cat/gold/dry/weight-management-gold/";
  }
  
  // Cat Salmon (non-PurrSnickitty)
  if (isCat && lowerName.includes("salmon") && !lowerName.includes("purrsnick") && !lowerName.includes("tunachovy")) {
    return "https://frommfamily.com/products/cat/four-star/dry/salmon-a-la-veg-recipe/";
  }
  
  // Cat Beef Livattini
  if (isCat && (lowerName.includes("livattini") || lowerName.includes("liváttini"))) {
    return "https://frommfamily.com/products/cat/four-star/dry/beef-livattini-veg-recipe/";
  }
  
  // Nutritionals Treats (6oz bags)
  if (lowerName.includes("nutritional") || lowerName.includes("digestive") || lowerName.includes("immunity") || lowerName.includes("mobility")) {
    if (lowerName.includes("digestive")) return "https://frommfamily.com/products/dog/nutritionals/treats/digestive-functional-dog-treats/";
    if (lowerName.includes("immunity")) return "https://frommfamily.com/products/dog/nutritionals/treats/immunity-functional-dog-treats/";
    if (lowerName.includes("mobility")) return "https://frommfamily.com/products/dog/nutritionals/treats/mobility-functional-dog-treats/";
  }
  
  // Tenderollies
  if (lowerName.includes("tenderollie")) {
    return "https://frommfamily.com/products/dog/tenderollies/soft-and-savory-treats/chickarollie-flavor/";
  }
  
  // Oven-Baked Treats
  if (lowerName.includes("oven-baked") || (lowerName.includes("baked") && !lowerName.includes("crunchy"))) {
    if (lowerName.includes("parmesan")) return "https://frommfamily.com/products/dog/four-star/treats/parmesan-cheese-recipe/";
    if (lowerName.includes("salmon")) return "https://frommfamily.com/products/dog/four-star/treats/salmon-with-sweet-potato-recipe/";
    if (lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/four-star/treats/chicken-with-peas-and-carrots-recipe/";
    if (lowerName.includes("lamb")) return "https://frommfamily.com/products/dog/four-star/treats/lamb-with-cranberry-recipe/";
  }
  
  // Classic Canned
  if (lowerName.includes("classic") && lowerName.match(/\d+(\.\d+)?\s*oz/i)) {
    if (lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/classic/can/chicken-and-rice-pate/";
    if (lowerName.includes("turkey")) return "https://frommfamily.com/products/dog/classic/can/turkey-and-rice-pate/";
    if (lowerName.includes("puppy")) return "https://frommfamily.com/products/dog/classic/can/puppy-classic-pate/";
  }
  
  // Fromm Pate (Diner line) Dog Canned - 12.2oz cans
  if (isCanned && !isCat) {
    // Shredded products
    if (lowerName.includes("shredded")) {
      if (lowerName.includes("beef")) return "https://frommfamily.com/products/dog/four-star/can/shredded-beef-in-gravy-entree/";
      if (lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/four-star/can/shredded-chicken-in-gravy-entree/";
      if (lowerName.includes("pork")) return "https://frommfamily.com/products/dog/four-star/can/shredded-pork-in-gravy-entree/";
      if (lowerName.includes("turkey")) return "https://frommfamily.com/products/dog/four-star/can/shredded-turkey-in-gravy-entree/";
    }
    // Classic canned
    if (lowerName.includes("clasic") || lowerName.includes("classic")) {
      if (lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/classic/can/chicken-and-rice-pate/";
      if (lowerName.includes("turkey") || lowerName.includes("rurk")) return "https://frommfamily.com/products/dog/classic/can/turkey-and-rice-pate/";
      if (lowerName.includes("puppy")) return "https://frommfamily.com/products/dog/classic/can/puppy-classic-pate/";
    }
    // Fromm Pate canned
    if (lowerName.includes("beef") && lowerName.includes("barley")) return "https://frommfamily.com/products/dog/fromm-pate/can/beef-and-barley-pate/";
    if (lowerName.includes("beef") && lowerName.includes("sweet potato")) return "https://frommfamily.com/products/dog/fromm-pate/can/beef-and-sweet-potato-pate/";
    if (lowerName.includes("chicken") && lowerName.includes("rice")) return "https://frommfamily.com/products/dog/fromm-pate/can/chicken-and-rice-pate/";
    if (lowerName.includes("chicken") && lowerName.includes("sweet potato")) return "https://frommfamily.com/products/dog/fromm-pate/can/chicken-and-sweet-potato-pate/";
    if (lowerName.includes("chicken") && lowerName.includes("duck")) return "https://frommfamily.com/products/dog/fromm-pate/can/chicken-and-duck-pate/";
    if (lowerName.includes("duck") && lowerName.includes("sweet potato")) return "https://frommfamily.com/products/dog/fromm-pate/can/duck-and-sweet-potato-pate/";
    if (lowerName.includes("lamb") && lowerName.includes("sweet potato")) return "https://frommfamily.com/products/dog/fromm-pate/can/lamb-and-sweet-potato-pate/";
    if (lowerName.includes("salmon") && lowerName.includes("rice")) return "https://frommfamily.com/products/dog/fromm-pate/can/salmon-and-rice-pate/";
    if (lowerName.includes("salmon") && lowerName.includes("sweet potato")) return "https://frommfamily.com/products/dog/fromm-pate/can/salmon-and-sweet-potato-pate/";
    if (lowerName.includes("salmon") && lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/fromm-pate/can/salmon-and-chicken-pate/";
    if (lowerName.includes("turkey") && lowerName.includes("rice")) return "https://frommfamily.com/products/dog/fromm-pate/can/turkey-and-rice-pate/";
    if (lowerName.includes("turkey") && lowerName.includes("sweet potato")) return "https://frommfamily.com/products/dog/fromm-pate/can/turkey-and-sweet-potato-pate/";
    if (lowerName.includes("turkey") && lowerName.includes("duck")) return "https://frommfamily.com/products/dog/fromm-pate/can/turkey-duck-and-sweet-potato-pate/";
    if (lowerName.includes("turkey") && lowerName.includes("pumpkin")) return "https://frommfamily.com/products/dog/fromm-pate/can/turkey-and-pumpkin-pate/";
    if (lowerName.includes("venison") && lowerName.includes("lentil")) return "https://frommfamily.com/products/dog/fromm-pate/can/venison-and-lentil-pate/";
    if (lowerName.includes("venison") && lowerName.includes("beef")) return "https://frommfamily.com/products/dog/fromm-pate/can/venison-and-beef-pate/";
    if (lowerName.includes("whitefish") && lowerName.includes("lentil")) return "https://frommfamily.com/products/dog/fromm-pate/can/whitefish-and-lentil-pate/";
    if (lowerName.includes("seafood")) return "https://frommfamily.com/products/dog/fromm-pate/can/seafood-medley-pate/";
    // Single protein canned
    if (lowerName.includes("chicken") && !lowerName.includes("duck") && !lowerName.includes("rice") && !lowerName.includes("sweet")) return "https://frommfamily.com/products/dog/fromm-pate/can/chicken-pate/";
    if (lowerName.includes("turkey") && !lowerName.includes("duck") && !lowerName.includes("rice") && !lowerName.includes("sweet") && !lowerName.includes("pumpkin")) return "https://frommfamily.com/products/dog/fromm-pate/can/turkey-pate/";
    if (lowerName.includes("lamb") && !lowerName.includes("sweet")) return "https://frommfamily.com/products/dog/fromm-pate/can/lamb-pate/";
  }
  
  // Four-Star Shredded Canned
  if (lowerName.includes("shredded") && lowerName.match(/\d+(\.\d+)?\s*oz/i)) {
    if (lowerName.includes("beef")) return "https://frommfamily.com/products/dog/four-star/can/shredded-beef-in-gravy-entree/";
    if (lowerName.includes("chicken")) return "https://frommfamily.com/products/dog/four-star/can/shredded-chicken-in-gravy-entree/";
    if (lowerName.includes("pork")) return "https://frommfamily.com/products/dog/four-star/can/shredded-pork-in-gravy-entree/";
    if (lowerName.includes("turkey")) return "https://frommfamily.com/products/dog/four-star/can/shredded-turkey-in-gravy-entree/";
  }
  
  return null;
}

async function fetchImagesFromUrl(url: string): Promise<string[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const html = await response.text();
    
    // Extract all CDN image URLs
    const imageRegex = /https:\/\/cdn\.frommfamily\.com\/media\/[^"'\s)]+\.(jpg|png|jpeg|webp)/gi;
    const matches = html.match(imageRegex) || [];
    
    // Filter and deduplicate - prioritize product images over generic ones
    const uniqueImages = [...new Set(matches)];
    
    // Filter out unwanted images (Q&A, food-safety, etc.)
    const filteredImages = uniqueImages.filter(img => {
      const lowerImg = img.toLowerCase();
      return !lowerImg.includes('q-a') &&
             !lowerImg.includes('food-safety') &&
             !lowerImg.includes('icon_') &&
             !lowerImg.includes('.svg');
    });
    
    // Prioritize images (h1k hero images first, then lifestyle, then others)
    const prioritized = filteredImages.sort((a, b) => {
      const aIsHero = a.includes('h1k') ? 0 : 1;
      const bIsHero = b.includes('h1k') ? 0 : 1;
      if (aIsHero !== bIsHero) return aIsHero - bIsHero;
      
      const aIsProduct = a.includes('tile_lifestyle-product') ? 0 : 1;
      const bIsProduct = b.includes('tile_lifestyle-product') ? 0 : 1;
      if (aIsProduct !== bIsProduct) return aIsProduct - bIsProduct;
      
      const aIsFeatures = a.includes('tile_features') ? 0 : 1;
      const bIsFeatures = b.includes('tile_features') ? 0 : 1;
      return aIsFeatures - bIsFeatures;
    });
    
    // Return max 8 unique images
    return prioritized.slice(0, 8);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return [];
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get all Fromm products
    const { rows } = await client.query<FrommProduct>(`
      SELECT id, name, image_url FROM supplies 
      WHERE name ILIKE '%fromm%'
      ORDER BY name
    `);
    
    console.log(`Processing ${rows.length} Fromm products...\n`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const product of rows) {
      const url = buildManufacturerUrl(product.name);
      
      if (!url) {
        console.log(`SKIP: No URL mapping for: ${product.name}`);
        skipped++;
        continue;
      }
      
      console.log(`Fetching: ${product.name}`);
      console.log(`  URL: ${url}`);
      
      const images = await fetchImagesFromUrl(url);
      
      if (images.length > 0) {
        // First image becomes main, rest go to carousel
        const mainImage = images[0];
        const carouselImages = images.slice(1);
        
        await client.query(
          `UPDATE supplies SET image_url = $1, image_urls = $2 WHERE id = $3`,
          [mainImage, carouselImages.length > 0 ? carouselImages : null, product.id]
        );
        
        console.log(`  Updated: ${images.length} images (1 main + ${carouselImages.length} carousel)`);
        updated++;
      } else {
        console.log(`  No images found`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total: ${rows.length}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
