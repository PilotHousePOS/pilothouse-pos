import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, or, ilike, sql, isNull } from 'drizzle-orm';
import { ObjectStorageService, objectStorageClient } from '../objectStorageService';
import { setObjectAclPolicy } from '../objectAcl';
import https from 'https';

const objectStorageService = new ObjectStorageService();

interface ProductMapping {
  productPattern: string;
  officialSlug: string;
  mainImage: string;
  additionalImages: string[];
}

const NUTRISOURCE_PRODUCT_MAPPINGS: ProductMapping[] = [
  {
    productPattern: 'large breed puppy(?!.*grain free)',
    officialSlug: 'large-breed-puppy-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_LargeBreedPuppy.png',
    additionalImages: [
      'https://nutrisourcepetfoods.com/wp-content/uploads/2022/12/NS_LgBreedPuppy_ChxRice-01.jpg',
      'https://nutrisourcepetfoods.com/wp-content/uploads/2022/12/NS_LgBreedPuppy_ChxRice-02.jpg',
      'https://nutrisourcepetfoods.com/wp-content/uploads/2022/12/NS_LgBreedPuppy_ChxRice-03.jpg',
      'https://nutrisourcepetfoods.com/wp-content/uploads/2022/12/NS_LgBreedPuppy_ChxRice-04.jpg',
      'https://nutrisourcepetfoods.com/wp-content/uploads/2022/12/NS_LgBreedPuppy_ChxRice-07.jpg',
    ]
  },
  {
    productPattern: 'chompy chompers.*beef|beef.*boar',
    officialSlug: 'chompy-chompers-beef',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_ChompyChompersBeef_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'chompy chompers.*rabbit|rabbit.*venison',
    officialSlug: 'chompy-chompers-rabbit',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_ChompyChompersRabbit_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'chompy chompers.*salmon|salmon.*trout',
    officialSlug: 'chompy-chompers-salmon',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_ChompyChompersSalmon_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'chompy chompers.*turkey|turkey.*duck',
    officialSlug: 'chompy-chompers-turkey',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_ChompyChompersTurkey_Front.png',
    additionalImages: []
  },
  {
    productPattern: "grillin'? grillers.*chicken|grillin.*grillers chicken",
    officialSlug: 'grillin-grillers-chicken',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_GrillinGrillersChicken_Front.png',
    additionalImages: []
  },
  {
    productPattern: "grillin'? grillers.*beef|grillin.*grillers beef",
    officialSlug: 'grillin-grillers-beef',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_GrillinGrillersBeef_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'grillin.*grillers.*turkey|turkey.*grillers',
    officialSlug: 'grillin-grillers-turkey',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_GrillinGrillersTurkey_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'grillin.*grillers.*whitefish|whitefish.*grillers',
    officialSlug: 'grillin-grillers-whitefish',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_GrillinGrillersWhitefish_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*chicken|chicken.*little bites',
    officialSlug: 'little-bites-chicken',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesChicken_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*duck|duck.*little bites',
    officialSlug: 'little-bites-duck',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesDuck_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*salmon|salmon.*little bites',
    officialSlug: 'little-bites-salmon',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesSalmon_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*turkey|turkey.*little bites',
    officialSlug: 'little-bites-turkey',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesGFTurkey_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*trout|trout.*little bites',
    officialSlug: 'little-bites-trout',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesGFTrout_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*beef|beef.*little bites|with beef',
    officialSlug: 'little-bites-beef',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesGFBeef_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*salmon|salmon.*little bites|with salmon',
    officialSlug: 'little-bites-salmon',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesSalmon_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'elements crispy',
    officialSlug: 'elements-crispy-crispers',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_CrispyCrispersChicken_Ecomm_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'little bites.*peanut|peanut.*butter.*little',
    officialSlug: 'little-bites-peanut',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_LittleBitesGFPeanutButter_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'big bites.*chicken|chicken.*big bites',
    officialSlug: 'big-bites-chicken',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_BigBitesChicken_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'big bites.*beef|beef.*big bites|grain free beef big',
    officialSlug: 'big-bites-beef',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_BigBitesGFBeef_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'crispy crispers.*chicken|crispers.*chicken|chicken.*duck.*crispers',
    officialSlug: 'crispy-crispers-chicken',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_CrispyCrispersChicken_Ecomm_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'crispy crispers.*lamb|crispers.*lamb|lamb.*beef.*crispers',
    officialSlug: 'crispy-crispers-lamb',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_CrispyCrispersLamb_Ecomm_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'crispy crispers.*turkey|crispers.*turkey|turkey.*venison.*crispers',
    officialSlug: 'crispy-crispers-turkey',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2024/09/NS_CrispyCrispersTurkey_Front.png',
    additionalImages: []
  },
  {
    productPattern: 'cat.*chicken.*rice|chicken.*rice.*cat',
    officialSlug: 'cat-chicken-rice',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NSCat_ChickenRice.png',
    additionalImages: []
  },
  {
    productPattern: 'cat.*chicken.*turkey.*lamb|chicken.*turkey.*lamb.*cat',
    officialSlug: 'cat-chicken-turkey-lamb',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NSCat_ChickenTurkeyLamb.png',
    additionalImages: []
  },
  {
    productPattern: 'cat.*country select|country select.*cat',
    officialSlug: 'cat-country-select',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSCatGF_CountrySelect.png',
    additionalImages: []
  },
  {
    productPattern: 'cat.*turkey.*liver|turkey.*liver.*cat',
    officialSlug: 'cat-turkey-liver',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSCat_TurkeyTurkeyLiver.png',
    additionalImages: []
  },
  {
    productPattern: 'classic catch.*cat|cat.*classic catch',
    officialSlug: 'cat-classic-catch',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSCatGF_ClassicCatch.png',
    additionalImages: []
  },
  {
    productPattern: 'senior.*weight.*cat|cat.*senior.*weight',
    officialSlug: 'cat-senior-weight',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NSCat_SeniorWeightMgmt.png',
    additionalImages: []
  },
  {
    productPattern: 'come-pooch-a|bone broth',
    officialSlug: 'bone-broth',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2022/12/NS_ComePoocha_Chicken.png',
    additionalImages: []
  },
  {
    productPattern: 'purevita.*beef|beef.*stew',
    officialSlug: 'purevita-beef',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/PV_BeefEntree.png',
    additionalImages: []
  },
  {
    productPattern: 'purevita.*turkey|turkey.*stew',
    officialSlug: 'purevita-turkey',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/PV_TurkeyEntree.png',
    additionalImages: []
  },
  {
    productPattern: 'purevita.*chicken|chicken.*stew',
    officialSlug: 'purevita-chicken',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/PV_ChickenEntree.png',
    additionalImages: []
  },
  {
    productPattern: 'heartland select',
    officialSlug: 'heartland-select',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_HeartlandSelect.png',
    additionalImages: []
  },
  {
    productPattern: 'woodlands select',
    officialSlug: 'woodlands-select',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_WoodlandsSelect.png',
    additionalImages: []
  },
  {
    productPattern: 'choice.*chicken.*barley|chicken.*barley.*choice',
    officialSlug: 'choice-chicken-barley',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/Choice_ChickenBarley.png',
    additionalImages: []
  },
  {
    productPattern: 'choice.*whitefish|whitefish.*choice',
    officialSlug: 'choice-whitefish',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/Choice_WhitefishRice.png',
    additionalImages: []
  },
  {
    productPattern: 'grain free.*senior|senior.*grain free',
    officialSlug: 'grain-free-senior',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_Senior.png',
    additionalImages: []
  },
  {
    productPattern: 'grain free.*weight|weight.*grain free',
    officialSlug: 'grain-free-weight-management',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_WeightManagement.png',
    additionalImages: []
  },
  {
    productPattern: 'large breed.*grain free|grain free.*large breed',
    officialSlug: 'gf-large-breed',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_LargePuppy.png',
    additionalImages: []
  },
  {
    productPattern: 'grain free.*small.*medium|small.*medium.*grain free',
    officialSlug: 'gf-small-medium-breed',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_SmMdBreedPuppy.png',
    additionalImages: []
  },
  {
    productPattern: 'element.*open waters|open waters',
    officialSlug: 'element-open-waters',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2023/06/Element_OpenWaters.png',
    additionalImages: []
  },
  {
    productPattern: 'small.*medium.*breed puppy|small & medium breed puppy',
    officialSlug: 'small-and-medium-breed-puppy-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_SmallMediumBreedPuppy.png',
    additionalImages: []
  },
  {
    productPattern: 'adult chicken.*rice|adult small bites chicken.*rice',
    officialSlug: 'adult-chicken-rice',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2019/12/NS_AdultChickenRice.png',
    additionalImages: []
  },
  {
    productPattern: 'adult small bites',
    officialSlug: 'adult-small-bites-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_SmallBitesAdult.png',
    additionalImages: []
  },
  {
    productPattern: 'large breed chicken.*rice|large breed adult',
    officialSlug: 'large-breed-adult-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_LargeBreedChicken.png',
    additionalImages: []
  },
  {
    productPattern: 'beef.*rice',
    officialSlug: 'beef-rice-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_BeefRice.png',
    additionalImages: []
  },
  {
    productPattern: 'lamb meal.*rice',
    officialSlug: 'lamb-meal-rice-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_LambMealRice.png',
    additionalImages: []
  },
  {
    productPattern: 'large breed lamb',
    officialSlug: 'large-breed-lamb-meal-rice-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_LargeBreedLamb.png',
    additionalImages: []
  },
  {
    productPattern: 'senior',
    officialSlug: 'senior-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/01/NS_Senior-2.png',
    additionalImages: []
  },
  {
    productPattern: 'weight management',
    officialSlug: 'weight-management-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NS_WeightManagement-1.png',
    additionalImages: []
  },
  {
    productPattern: 'performance',
    officialSlug: 'performance-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NS_Performance-1.png',
    additionalImages: []
  },
  {
    productPattern: 'grain free lamb|grain free.*lamb',
    officialSlug: 'lamb-meal-peas-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_LambPeas.png',
    additionalImages: []
  },
  {
    productPattern: 'seafood select',
    officialSlug: 'seafood-select-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_SeafoodSelect.png',
    additionalImages: []
  },
  {
    productPattern: 'high plains select',
    officialSlug: 'high-plains-select',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_HighPlainsSelect.png',
    additionalImages: []
  },
  {
    productPattern: 'prairie select',
    officialSlug: 'prairie-select-recipe',
    mainImage: 'https://nutrisourcepetfoods.com/wp-content/uploads/2020/02/NSGF_PrairieSelect.png',
    additionalImages: []
  },
];

async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl.startsWith('http') ? redirectUrl : `https://${urlObj.hostname}${redirectUrl}`).then(resolve);
          return;
        }
      }
      if (response.statusCode !== 200) {
        console.log(`  Failed to download: ${url} (status ${response.statusCode})`);
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.length > 1000 ? buffer : null);
      });
    }).on('error', (err) => {
      console.log(`  Download error: ${err.message}`);
      resolve(null);
    });
  });
}

function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 15);
}

async function storeImage(imageBuffer: Buffer, product: any, suffix: string = ''): Promise<string | null> {
  try {
    const publicPaths = objectStorageService.getPublicObjectSearchPaths();
    const bucketPath = publicPaths[0];
    const pathParts = bucketPath.split('/').filter(Boolean);
    const bucketName = pathParts[0];
    const prefix = pathParts.slice(1).join('/');
    
    const sanitizedBrand = 'nutrisource';
    const sanitizedName = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    const uniqueId = generateUniqueId();
    const ext = suffix ? `.${suffix}.jpg` : '.jpg';
    const objectFileName = `products/${sanitizedBrand}/${sanitizedName}-${product.id}-${uniqueId}${ext}`;
    const fullPath = prefix ? `${prefix}/${objectFileName}` : objectFileName;
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(fullPath);
    
    await file.save(imageBuffer, {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    
    await setObjectAclPolicy(file, { visibility: 'public' });
    
    return `/public-objects/${objectFileName}`;
  } catch (error) {
    console.error(`  Error storing image:`, error);
    return null;
  }
}

function findMapping(productName: string): ProductMapping | null {
  const lowerName = productName.toLowerCase();
  for (const mapping of NUTRISOURCE_PRODUCT_MAPPINGS) {
    const regex = new RegExp(mapping.productPattern, 'i');
    if (regex.test(lowerName)) {
      return mapping;
    }
  }
  return null;
}

function extractSize(name: string): string | null {
  const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|lbs|fl\s*oz)/i);
  if (sizeMatch) {
    return `${sizeMatch[1]}${sizeMatch[2].toLowerCase().replace('lbs', 'lb')}`;
  }
  return null;
}

async function processNutriSourceProducts(limit: number = 10, dryRun: boolean = false) {
  console.log(`\n=== Processing NutriSource Products ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);
  
  const products = await db
    .select()
    .from(supplies)
    .where(
      and(
        or(
          ilike(supplies.brand, '%nutrisource%'),
          ilike(supplies.name, '%nutrisource%')
        ),
        or(
          isNull(supplies.imageUrls),
          sql`array_length(${supplies.imageUrls}, 1) <= 1 OR ${supplies.imageUrls} IS NULL`
        )
      )
    )
    .limit(limit);
  
  console.log(`Found ${products.length} NutriSource products to process\n`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const product of products) {
    console.log(`\nProcessing: ${product.name} (ID: ${product.id})`);
    
    const mapping = findMapping(product.name);
    if (!mapping) {
      console.log(`  No mapping found, skipping`);
      skipped++;
      continue;
    }
    
    console.log(`  Matched pattern: ${mapping.productPattern}`);
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would download from: ${mapping.mainImage}`);
      console.log(`  [DRY RUN] Would download ${mapping.additionalImages.length} additional images`);
      
      const size = extractSize(product.name);
      if (size) {
        console.log(`  [DRY RUN] Would set size: ${size}`);
      }
      updated++;
      continue;
    }
    
    const imageUrls: string[] = [];
    
    console.log(`  Downloading main image...`);
    const mainBuffer = await downloadImage(mapping.mainImage);
    if (mainBuffer) {
      const storedPath = await storeImage(mainBuffer, product, 'main');
      if (storedPath) {
        imageUrls.push(storedPath);
        console.log(`  Main image stored: ${storedPath}`);
      }
    } else {
      console.log(`  Failed to download main image`);
    }
    
    for (let i = 0; i < mapping.additionalImages.length; i++) {
      const additionalUrl = mapping.additionalImages[i];
      console.log(`  Downloading additional image ${i + 1}...`);
      const buffer = await downloadImage(additionalUrl);
      if (buffer) {
        const storedPath = await storeImage(buffer, product, `add${i + 1}`);
        if (storedPath) {
          imageUrls.push(storedPath);
          console.log(`  Additional image ${i + 1} stored: ${storedPath}`);
        }
      }
    }
    
    if (imageUrls.length > 0) {
      const size = extractSize(product.name);
      
      await db
        .update(supplies)
        .set({
          imageUrl: imageUrls[0],
          imageUrls: imageUrls,
          size: size || product.size,
          updatedAt: new Date()
        })
        .where(eq(supplies.id, product.id));
      
      console.log(`  Updated with ${imageUrls.length} images${size ? `, size: ${size}` : ''}`);
      updated++;
    } else {
      console.log(`  No images downloaded`);
      errors++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

const args = process.argv.slice(2);
const limit = parseInt(args[0]) || 10;
const dryRun = args.includes('--dry-run');

processNutriSourceProducts(limit, dryRun)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
