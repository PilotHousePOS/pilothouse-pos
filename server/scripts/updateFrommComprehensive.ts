import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const INGREDIENT_MAP: Record<string, string> = {
  "Large Breed Adult": "Chicken, Chicken Meal, Chicken Broth, Oatmeal, Pearled Barley, Brown Rice, White Rice, Dried Tomato Pomace, Whole Oats, Whole Barley, Menhaden Fish Meal, Chicken Liver, Dried Egg Product, Chicken Fat (preserved with mixed tocopherols), Potatoes, Cheese, Flaxseed, Salmon Oil (preserved with mixed tocopherols), Dried Yeast, Carrots, Salt, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Monosodium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Calcium Sulfate, Chicory Root Extract, Taurine, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Yucca Schidigera Extract, DL-Methionine, Sodium Selenite, L-Tryptophan, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Large Breed Puppy": "Chicken, Chicken Meal, Chicken Broth, Oatmeal, Pearled Barley, Brown Rice, Potatoes, Menhaden Fish Meal, Dried Tomato Pomace, Chicken Fat (preserved with mixed tocopherols), Dried Egg Product, Chicken Liver, Whole Oats, Dried Yeast, Flaxseed, Whole Barley, Cheese, Salmon Oil (preserved with mixed tocopherols), Salt, Carrots, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Vitamins [Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Monosodium Phosphate, DL-Methionine, Chicory Root Extract, Calcium Sulfate, Taurine, Choline Chloride, Chicken Cartilage, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Yucca Schidigera Extract, L-Tryptophan, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Weight Management": "Turkey Liver, Chicken Meal, Turkey Broth, Oatmeal, Pearled Barley, Menhaden Fish Meal, Whole Oats, Dried Tomato Pomace, Whitefish, Whole Barley, Brown Rice, Millet, White Rice, Oat Hulls, Flaxseed, Pea Fiber, Dried Yeast, Salmon Oil (preserved with mixed tocopherols), Chicken Fat (preserved with mixed tocopherols), Dried Egg Product, Potatoes, Salt, Sweet Potatoes, Carrots, Celery, Cheese, Alfalfa Meal, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Taurine, Chicory Root Extract, Sorbic Acid (Preservative), Monosodium Phosphate, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Yucca Schidigera Extract, L-Carnitine, DL-Methionine, L-Tryptophan, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Large Breed Weight": "Turkey Liver, Turkey Broth, Chicken Meal, Oatmeal, Pearled Barley, Dried Tomato Pomace, Brown Rice, White Rice, Whitefish, Menhaden Fish Meal, Whole Oats, Whole Barley, Millet, Flaxseed, Dried Egg Product, Chicken Fat (preserved with mixed tocopherols), Salmon Oil (preserved with mixed tocopherols), Miscanthus Grass, Oat Hulls, Potatoes, Dried Yeast, Cheese, Carrots, Sweet Potatoes, Celery, Salt, Vitamins [Potassium Chloride, Choline Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Taurine, Chicory Root Extract, Alfalfa Meal, Sorbic Acid (Preservative), Calcium Sulfate, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Chicken Cartilage, L-Carnitine, Yucca Schidigera Extract, Sodium Selenite, L-Tryptophan, DL-Methionine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Reduced Activity": "Chicken, Chicken Meal, Chicken Broth, Oat Groats, Pearled Barley, Brown Rice, Potatoes, Millet, Dried Tomato Pomace, Menhaden Fish Meal, Whole Oats, Chicken Liver, White Rice, Whole Barley, Salmon Oil (preserved with mixed tocopherols), Chicken Fat (preserved with mixed tocopherols), Dried Yeast, Cheese, Flaxseed, Dried Egg Product, Salt, Carrots, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Chicken Cartilage, Monosodium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Chicory Root Extract, Yucca Schidigera Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Taurine, L-Tryptophan, DL-Methionine, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Senior": "Chicken, Chicken Meal, Chicken Broth, Oat Groats, Pearled Barley, Brown Rice, Potatoes, Millet, Dried Tomato Pomace, Menhaden Fish Meal, Whole Oats, Chicken Liver, White Rice, Whole Barley, Salmon Oil (preserved with mixed tocopherols), Chicken Fat (preserved with mixed tocopherols), Dried Yeast, Cheese, Flaxseed, Dried Egg Product, Salt, Carrots, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Chicken Cartilage, Monosodium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Chicory Root Extract, Yucca Schidigera Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Taurine, L-Tryptophan, DL-Methionine, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Heartland Gold Adult": "Beef, Pork Meat & Bone Meal, Lentils, Peas, Chickpeas, Potatoes, Dried Tomato Pomace, Pea Flour, Pork Liver, Pork Fat (preserved with mixed tocopherols), Salmon Oil (preserved with mixed tocopherols), Dried Egg Product, Flaxseed, Cheese, Dried Yeast, Lamb, Alfalfa Meal, Celery, Salt, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Carrots, Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Yucca Schidigera Extract, Taurine, Sodium Selenite, Sorbic Acid (Preservative), L-Tryptophan, DL-Methionine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Heartland Gold Puppy": "Beef, Pork Meat & Bone Meal, Peas, Lentils, Chickpeas, Potatoes, Pork, Dried Egg Product, Pea Flour, Dried Tomato Pomace, Pork Liver, Pork Fat (preserved with mixed tocopherols), Salmon Oil (preserved with mixed tocopherols), Flaxseed, Cheese, Dried Yeast, Lamb, Alfalfa Meal, Celery, Carrots, Salt, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Taurine, Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Yucca Schidigera Extract, Sodium Selenite, Sorbic Acid (Preservative), L-Tryptophan, DL-Methionine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Small Breed Adult": "Chicken, Chicken Meal, Oatmeal, Pearled Barley, Chicken Broth, Brown Rice, Menhaden Fish Meal, Chicken Fat (preserved with mixed tocopherols), Dried Tomato Pomace, Dried Egg Product, Whole Oats, Salmon Oil (preserved with mixed tocopherols), Whole Barley, Dried Yeast, Chicken Liver, Cheese, Flaxseed, White Rice, Potatoes, Carrots, Salt, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Monosodium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Taurine, Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Yucca Schidigera Extract, Sorbic Acid (Preservative), DL-Methionine, L-Tryptophan, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  
  "Blueberry Blasts": "Chickpeas, Peas, Chicken, Potatoes, Pea Starch, Chicken Liver, Blueberries, Sunflower Oil (preserved with mixed tocopherols), Dried Egg Product, Tapioca, Natural Flavor, Coconut Oil (preserved with mixed tocopherols), Calcium Sulfate.",
  
  "Peanut Butter Jammers": "Whole Grain Sorghum, Oatmeal, Pearled Barley, Peanut Butter, Dried Egg Product, Dried Whey, Strawberries, Peanut Flour, Brewers Dried Yeast, Natural Flavor, Tapioca, Blueberries, Peanut Oil (preserved with mixed tocopherols), Calcium Carbonate.",
  
  "Pot Roast Punchers": "Whole Grain Sorghum, Beef, Pork Liver, Oatmeal, Pearled Barley, Potatoes, Sweet Potatoes, Dried Egg Product, Sunflower Oil (preserved with mixed tocopherols), Carrots, Celery, Natural Flavor, Pork Fat (preserved with mixed tocopherols), Tapioca, Calcium Carbonate.",
  
  "Banana Kablammas": "Chickpeas, Peas, Chicken, Potatoes, Pea Starch, Chicken Liver, Bananas, Sunflower Oil (preserved with mixed tocopherols), Dried Egg Product, Tapioca, Natural Flavor, Coconut Oil (preserved with mixed tocopherols), Calcium Sulfate.",
  
  "Smokin' CheesePlosions": "Whole Grain Sorghum, Oatmeal, Pearled Barley, Cheese, Pork Liver, Dried Egg Product, Bacon, Dried Whey, Natural Smoke Flavor, Brewers Dried Yeast, Natural Flavor, Tapioca, Pork Fat (preserved with mixed tocopherols), Calcium Carbonate.",
  
  "Bacon Blasters": "Whole Grain Sorghum, Pork Liver, Oatmeal, Pearled Barley, Bacon, Potatoes, Dried Egg Product, Sunflower Oil (preserved with mixed tocopherols), Sweet Potatoes, Brewers Dried Yeast, Natural Smoke Flavor, Tapioca, Natural Flavor, Pork Fat (preserved with mixed tocopherols), Calcium Carbonate.",
};

async function updateFrommProducts() {
  console.log('=== Updating Fromm Products with Verified Ingredients ===\n');
  
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name FROM supplies 
      WHERE name ILIKE '%fromm%'
      AND (ingredients LIKE '%Salmon, Fish Broth, Chicken, Salmon Meal%' 
           OR ingredients IS NULL 
           OR ingredients = ''
           OR ingredients LIKE 'Available Sizes%')
      ORDER BY name
    `);
    
    console.log(`Found ${rows.length} products needing ingredient updates\n`);
    
    let updated = 0;
    const notMatched: string[] = [];
    
    for (const row of rows) {
      let matched = false;
      const nameLower = row.name.toLowerCase();
      
      for (const [pattern, ingredients] of Object.entries(INGREDIENT_MAP)) {
        const patternLower = pattern.toLowerCase();
        
        if (nameLower.includes(patternLower)) {
          await client.query(
            `UPDATE supplies SET ingredients = $1 WHERE id = $2`,
            [ingredients, row.id]
          );
          console.log(`✓ Updated: ${row.name} (matched "${pattern}")`);
          updated++;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        notMatched.push(row.name);
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Updated: ${updated} products`);
    console.log(`Not matched: ${notMatched.length} products`);
    
    if (notMatched.length > 0) {
      console.log(`\nProducts still needing mappings:`);
      notMatched.forEach(name => console.log(`  - ${name}`));
    }
    
  } finally {
    client.release();
  }
  
  process.exit(0);
}

updateFrommProducts().catch(console.error);
