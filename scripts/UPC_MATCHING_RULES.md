# UPC Matching Rules & Configuration

## Overview
- Target: 90% coverage with 100% accuracy
- Total supplies: 7,225
- Total UPCs available: 5,302 (from FLAGGED_ALL_UPCS.json)

## Validation Rules (STRICT - All Must Pass)

### 1. Size Matching
Sizes must match exactly if both products have them:
- xxsmall, xsmall, small, mini, medium, large, xlarge, xxlarge, jumbo, giant
- "small" ≠ "xsmall", "large" ≠ "xlarge"

### 2. Wattage Matching
Extract with: /(\d+)\s*w\b/i
- 25W ≠ 50W, 75W ≠ 100W, etc.

### 3. Weight/Volume Matching
Units: oz, lb, g, ml, qt, gal
- Value AND unit must match exactly
- 8oz ≠ 16oz, 5lb ≠ 10lb

### 4. Dimension Matching
Extract with: /(\d+\.?\d*)[\"\\']/
- 13" ≠ 7", 12" ≠ 11", etc.

### 5. Critical Product Type Exclusions
These pairs are incompatible:
- wheel/millet, wheel/spray, wheel/food
- spinner/millet, spinner/food
- dish/mat, dish/heater, dish/lamp
- bowl/mat, bowl/heater
- cage/food, cage/treat
- tank/food, tank/treat
- bulb/mat, bulb/dish
- lamp/dish, lamp/bowl
- feeder/heater, feeder/lamp
- toy/food, toy/treat
- collar/food, collar/treat
- leash/food, leash/treat

### 6. Keyword Matching
- "corner" must match (corner dish ≠ regular dish)
- Product codes in collars/harnesses should match

## Abbreviation Dictionary (200+ mappings)
See smart-match-v2.mjs for full list including:
- Products: fd→food, trt→treat, chw→chew, bwl→bowl, etc.
- Sizes: sm→small, md→medium, lg→large, xl→xlarge
- Colors: blk→black, blu→blue, wht→white, rd→red
- Animals: dg→dog, ct→cat, fsh→fish, rptl→reptile

## UPC Source Files
1. scripts/FLAGGED_ALL_UPCS.json - 5,302 UPCs with brand assignments
2. scripts/all_invoice_upcs.json - Invoice source UPCs
3. scripts/maybe_upcs_clean_3171.json - Maybe inventory source

## Matching Script
scripts/smart-match-v2.mjs - Main strict matching script
Usage: npx tsx scripts/smart-match-v2.mjs "<Brand>" [threshold] [limit]

## Progress Tracking
- Each match session updates supplies.upc column
- Run: SELECT COUNT(upc), COUNT(*) FROM supplies; for progress

## Common Errors to Catch
1. Wattage mismatches (25W vs 50W)
2. Dimension mismatches (13" vs 7")
3. Size number mismatches (Size 1 vs Size 4)
4. Product type conflicts (Wheel vs Millet)
5. Corner vs non-corner products
