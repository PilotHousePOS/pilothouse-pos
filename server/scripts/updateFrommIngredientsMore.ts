import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ADDITIONAL_INGREDIENTS: Record<string, string> = {
  "Gold 5lb": "Chicken, Chicken Meal, Chicken Broth, Oatmeal, Pearled Barley, Brown Rice, Chicken Fat (preserved with mixed tocopherols), Menhaden Fish Meal, Dried Tomato Pomace, Whole Oats, White Rice, Dried Egg Product, Whole Barley, Chicken Liver, Potatoes, Dried Yeast, Cheese, Flaxseed, Salmon Oil (preserved with mixed tocopherols), Salt, Carrots, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Monocalcium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Biotin, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Yucca Schidigera Extract, L-Tryptophan, Taurine, DL-Methionine, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Gold 15lb": "Chicken, Chicken Meal, Chicken Broth, Oatmeal, Pearled Barley, Brown Rice, Chicken Fat (preserved with mixed tocopherols), Menhaden Fish Meal, Dried Tomato Pomace, Whole Oats, White Rice, Dried Egg Product, Whole Barley, Chicken Liver, Potatoes, Dried Yeast, Cheese, Flaxseed, Salmon Oil (preserved with mixed tocopherols), Salt, Carrots, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Monocalcium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Biotin, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Yucca Schidigera Extract, L-Tryptophan, Taurine, DL-Methionine, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Gold 30lb": "Chicken, Chicken Meal, Chicken Broth, Oatmeal, Pearled Barley, Brown Rice, Chicken Fat (preserved with mixed tocopherols), Menhaden Fish Meal, Dried Tomato Pomace, Whole Oats, White Rice, Dried Egg Product, Whole Barley, Chicken Liver, Potatoes, Dried Yeast, Cheese, Flaxseed, Salmon Oil (preserved with mixed tocopherols), Salt, Carrots, Duck, Lamb, Sweet Potatoes, Celery, Alfalfa Meal, Monocalcium Phosphate, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Biotin, Pyridoxine Hydrochloride, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Sorbic Acid (Preservative), Yucca Schidigera Extract, L-Tryptophan, Taurine, DL-Methionine, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Gold Puppy": "Chicken, Chicken Meal, Chicken Broth, Oatmeal, Pearled Barley, Menhaden Fish Meal, Brown Rice, Chicken Fat (preserved with mixed tocopherols), Dried Tomato Pomace, Potatoes, Dried Egg Product, Whole Oats, Salmon Oil (preserved with mixed tocopherols), Dried Yeast, Whole Barley, Chicken Liver, Cheese, Flaxseed, Carrots, Duck, Lamb, Sweet Potatoes, Salt, Celery, Dehydrated Alfalfa Meal, Vitamins [Choline Chloride, Potassium Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Monosodium Phosphate, DL-Methionine, Dried Chicory Root, Taurine, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Chicken Cartilage, Sorbic Acid (Preservative), L-Tryptophan, Yucca Schidigera Extract, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Classic 5lb": "Chicken, Chicken Meal, Brown Rice, Pearled Barley, Oatmeal, White Rice, Chicken Fat (preserved with mixed tocopherols), Dried Plain Beet Pulp, Menhaden Fish Meal, Dried Egg Product, Cheese, Flaxseed, Dried Yeast, Chicken Liver, Salt, Vitamins [Potassium Chloride, Choline Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Calcium Sulfate, Sorbic Acid (Preservative), Chicory Root Extract, Yucca Schidigera Extract, Sodium Selenite, DL-Methionine, L-Tryptophan, Taurine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Classic 15lb": "Chicken, Chicken Meal, Brown Rice, Pearled Barley, Oatmeal, White Rice, Chicken Fat (preserved with mixed tocopherols), Dried Plain Beet Pulp, Menhaden Fish Meal, Dried Egg Product, Cheese, Flaxseed, Dried Yeast, Chicken Liver, Salt, Vitamins [Potassium Chloride, Choline Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Calcium Sulfate, Sorbic Acid (Preservative), Chicory Root Extract, Yucca Schidigera Extract, Sodium Selenite, DL-Methionine, L-Tryptophan, Taurine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Classic 30lb": "Chicken, Chicken Meal, Brown Rice, Pearled Barley, Oatmeal, White Rice, Chicken Fat (preserved with mixed tocopherols), Dried Plain Beet Pulp, Menhaden Fish Meal, Dried Egg Product, Cheese, Flaxseed, Dried Yeast, Chicken Liver, Salt, Vitamins [Potassium Chloride, Choline Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Calcium Sulfate, Sorbic Acid (Preservative), Chicory Root Extract, Yucca Schidigera Extract, Sodium Selenite, DL-Methionine, L-Tryptophan, Taurine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Classic Puppy": "Chicken, Chicken Meal, Brown Rice, Pearled Barley, Oatmeal, White Rice, Chicken Fat (preserved with mixed tocopherols), Dried Plain Beet Pulp, Menhaden Fish Meal, Dried Egg Product, Cheese, Flaxseed, Dried Yeast, Chicken Liver, Salt, Vitamins [Potassium Chloride, Choline Chloride, Vitamin E Supplement, Ascorbic Acid, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Calcium Sulfate, Sorbic Acid (Preservative), Chicory Root Extract, Yucca Schidigera Extract, Sodium Selenite, DL-Methionine, L-Tryptophan, Taurine, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
  "Lamb & Lentil": "Lamb, Lamb Meal, Lentils, Chickpeas, Peas, Dried Egg Product, Pea Flour, Dried Tomato Pomace, Pork Fat (preserved with mixed tocopherols), Pork Liver, Lamb Liver, Salmon Oil (preserved with mixed tocopherols), Cheese, Flaxseed, Carrots, Apples, Broccoli, Cauliflower, Natural Flavor, Potassium Chloride, Salt, Vitamins [Choline Chloride, Vitamin E Supplement, Calcium Carbonate, Riboflavin Supplement, Niacin Supplement, Calcium Pantothenate, Vitamin A Supplement, Vitamin D3 Supplement, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Thiamine Mononitrate, Folic Acid], Chicory Root Extract, Minerals [Zinc Sulfate, Manganese Sulfate, Ferrous Sulfate, Magnesium Sulfate, Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Sulfate, Magnesium Proteinate, Copper Proteinate, Calcium Iodate], Cranberries, Yucca Schidigera Extract, Sorbic Acid (Preservative), Blueberries, Taurine, Sodium Selenite, Dried Lactobacillus casei Fermentation Product, Dried Lactobacillus reuteri Fermentation Product, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus plantarum Fermentation Product.",
};

async function updateMore() {
  console.log('Updating additional Fromm products with verified ingredients...\n');
  
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name FROM supplies 
      WHERE name ILIKE '%fromm%'
      AND (ingredients LIKE '%Salmon, Fish Broth, Chicken, Salmon Meal%' 
           OR ingredients IS NULL 
           OR ingredients = '')
      ORDER BY name
    `);
    
    console.log(`Found ${rows.length} products still needing ingredients\n`);
    
    let updated = 0;
    
    for (const row of rows) {
      for (const [key, ingredients] of Object.entries(ADDITIONAL_INGREDIENTS)) {
        if (row.name.includes(key)) {
          await client.query(
            `UPDATE supplies SET ingredients = $1 WHERE id = $2`,
            [ingredients, row.id]
          );
          console.log(`✓ Updated: ${row.name} (matched "${key}")`);
          updated++;
          break;
        }
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Updated with ingredients: ${updated}`);
    
  } finally {
    client.release();
  }
  
  process.exit(0);
}

updateMore().catch(console.error);
