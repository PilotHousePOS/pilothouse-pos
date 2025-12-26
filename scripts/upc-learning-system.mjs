#!/usr/bin/env node
/**
 * UPC Learning System for Animal House Pet Store
 * 
 * Learns from production corrections to improve UPC matching by:
 * 1. Extracting product attributes (size, weight, color, keywords)
 * 2. Comparing production vs development to find corrections
 * 3. Building validation rules based on why UPCs were moved
 * 4. Auto-suggesting UPCs for products without them
 */

import fs from 'fs';
import path from 'path';

// Attribute extraction patterns
const PATTERNS = {
  // Weight patterns: "3oz", "3.2 oz", "12.5lb", "1.5 lbs"
  weight: /(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg|floz|fl\.?\s*oz)/gi,
  
  // Size patterns: "small", "medium", "large", "xl", "xx-large"
  size: /\b(mini|tiny|small|sm|medium|med|large|lg|x-?large|xl|xx-?large|xxl|jumbo|giant)\b/gi,
  
  // Count patterns: "2pk", "3 pack", "12ct"
  count: /(\d+)\s*(pk|pack|ct|count|piece|pieces)/gi,
  
  // Dimension patterns: "12\"", "24 inch", "3ft"
  dimension: /(\d+(?:\.\d+)?)\s*("|inch|inches|in|ft|foot|feet|cm|mm)/gi,
  
  // Wattage patterns: "100w", "75 watt"
  wattage: /(\d+)\s*w(?:att)?s?\b/gi,
  
  // Color patterns
  color: /\b(red|blue|green|yellow|orange|purple|pink|black|white|grey|gray|brown|tan|beige|silver|gold|natural|clear|camo|leopard|zebra)\b/gi,
  
  // Species/animal keywords
  species: /\b(dog|cat|puppy|kitten|bird|fish|reptile|turtle|tortoise|snake|gecko|bearded dragon|hamster|guinea pig|rabbit|ferret|hermit crab|frog|tadpole|betta|goldfish|tropical|marine|aquatic)\b/gi,
  
  // Product type keywords
  productType: /\b(food|treat|treats|chew|chews|toy|toys|bowl|dish|bed|cage|tank|habitat|leash|collar|harness|shampoo|conditioner|supplement|vitamin|calcium|heat|light|bulb|lamp|filter|pump|heater|thermometer|hygrometer|substrate|bedding|litter)\b/gi
};

// Normalize extracted values
function normalizeWeight(value, unit) {
  const num = parseFloat(value);
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u === 'lb' || u === 'lbs') return { value: num * 16, unit: 'oz', original: `${value}${unit}` };
  if (u === 'kg') return { value: num * 35.274, unit: 'oz', original: `${value}${unit}` };
  if (u === 'g') return { value: num * 0.035274, unit: 'oz', original: `${value}${unit}` };
  if (u === 'floz' || u === 'fl.oz' || u === 'fl oz') return { value: num, unit: 'floz', original: `${value}${unit}` };
  return { value: num, unit: 'oz', original: `${value}${unit}` };
}

function normalizeSize(size) {
  const s = size.toLowerCase();
  const mapping = {
    'mini': 'mini', 'tiny': 'mini',
    'small': 'small', 'sm': 'small',
    'medium': 'medium', 'med': 'medium',
    'large': 'large', 'lg': 'large',
    'x-large': 'xlarge', 'xlarge': 'xlarge', 'xl': 'xlarge',
    'xx-large': 'xxlarge', 'xxlarge': 'xxlarge', 'xxl': 'xxlarge',
    'jumbo': 'jumbo', 'giant': 'jumbo'
  };
  return mapping[s] || s;
}

// Extract all attributes from a product name
function extractAttributes(name, description = '') {
  const text = `${name} ${description}`.toLowerCase();
  const attrs = {};
  
  // Extract weight
  const weightMatch = text.match(PATTERNS.weight);
  if (weightMatch) {
    const match = weightMatch[0].match(/(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg|floz|fl\.?\s*oz)/i);
    if (match) {
      attrs.weight = normalizeWeight(match[1], match[2]);
    }
  }
  
  // Extract size
  const sizeMatch = text.match(PATTERNS.size);
  if (sizeMatch) {
    attrs.size = normalizeSize(sizeMatch[0]);
  }
  
  // Extract count
  const countMatch = text.match(PATTERNS.count);
  if (countMatch) {
    const match = countMatch[0].match(/(\d+)/);
    if (match) {
      attrs.count = parseInt(match[1]);
    }
  }
  
  // Extract dimension
  const dimMatch = text.match(PATTERNS.dimension);
  if (dimMatch) {
    const match = dimMatch[0].match(/(\d+(?:\.\d+)?)\s*("|inch|inches|in|ft|foot|feet|cm|mm)/i);
    if (match) {
      attrs.dimension = { value: parseFloat(match[1]), unit: match[2].replace(/"/g, 'in') };
    }
  }
  
  // Extract wattage
  const wattMatch = text.match(PATTERNS.wattage);
  if (wattMatch) {
    const match = wattMatch[0].match(/(\d+)/);
    if (match) {
      attrs.wattage = parseInt(match[1]);
    }
  }
  
  // Extract colors
  const colorMatches = text.match(PATTERNS.color);
  if (colorMatches) {
    attrs.colors = [...new Set(colorMatches.map(c => c.toLowerCase()))];
  }
  
  // Extract species keywords
  const speciesMatches = text.match(PATTERNS.species);
  if (speciesMatches) {
    attrs.species = [...new Set(speciesMatches.map(s => s.toLowerCase()))];
  }
  
  // Extract product type keywords
  const typeMatches = text.match(PATTERNS.productType);
  if (typeMatches) {
    attrs.productTypes = [...new Set(typeMatches.map(t => t.toLowerCase()))];
  }
  
  return attrs;
}

// Compare two products and identify attribute differences
function compareProducts(product1, product2) {
  const attrs1 = extractAttributes(product1.name, product1.description);
  const attrs2 = extractAttributes(product2.name, product2.description);
  
  const differences = [];
  
  // Check weight difference
  if (attrs1.weight && attrs2.weight) {
    if (attrs1.weight.unit === attrs2.weight.unit) {
      const diff = Math.abs(attrs1.weight.value - attrs2.weight.value);
      if (diff > 0.5) { // More than 0.5oz difference
        differences.push({
          type: 'weight',
          product1: attrs1.weight.original,
          product2: attrs2.weight.original,
          severity: diff > 2 ? 'critical' : 'warning'
        });
      }
    }
  }
  
  // Check size difference
  if (attrs1.size && attrs2.size && attrs1.size !== attrs2.size) {
    differences.push({
      type: 'size',
      product1: attrs1.size,
      product2: attrs2.size,
      severity: 'critical'
    });
  }
  
  // Check wattage difference
  if (attrs1.wattage && attrs2.wattage && attrs1.wattage !== attrs2.wattage) {
    differences.push({
      type: 'wattage',
      product1: `${attrs1.wattage}w`,
      product2: `${attrs2.wattage}w`,
      severity: 'critical'
    });
  }
  
  // Check color difference
  if (attrs1.colors && attrs2.colors) {
    const colorDiff = attrs1.colors.filter(c => !attrs2.colors.includes(c));
    if (colorDiff.length > 0) {
      differences.push({
        type: 'color',
        product1: attrs1.colors.join(', '),
        product2: attrs2.colors.join(', '),
        severity: 'warning'
      });
    }
  }
  
  return {
    product1: { id: product1.id, name: product1.name, attrs: attrs1 },
    product2: { id: product2.id, name: product2.name, attrs: attrs2 },
    differences,
    isMatch: differences.filter(d => d.severity === 'critical').length === 0
  };
}

// Validation rules for UPC assignment
const VALIDATION_RULES = {
  // Size must match exactly
  size: { tolerance: 'exact', severity: 'critical' },
  
  // Wattage must match exactly
  wattage: { tolerance: 'exact', severity: 'critical' },
  
  // Weight can have small variance (±0.5oz for items under 5oz, ±5% for larger)
  weight: { 
    tolerance: (w1, w2) => {
      if (w1.unit !== w2.unit) return false;
      const diff = Math.abs(w1.value - w2.value);
      if (w1.value < 5) return diff <= 0.5;
      return diff / w1.value <= 0.05;
    },
    severity: 'critical'
  },
  
  // Dimension must match exactly
  dimension: { tolerance: 'exact', severity: 'critical' },
  
  // Count must match exactly
  count: { tolerance: 'exact', severity: 'critical' },
  
  // Color should match but can be warning
  color: { tolerance: 'exact', severity: 'warning' },
  
  // Brand prefix must match (from brand-upc-prefixes.json)
  brandPrefix: { tolerance: 'exact', severity: 'critical' }
};

// Find products that could share a UPC (same base product, different variants)
function findSimilarProducts(products, targetProduct) {
  const targetAttrs = extractAttributes(targetProduct.name, targetProduct.description);
  const candidates = [];
  
  for (const product of products) {
    if (product.id === targetProduct.id) continue;
    if (product.brand !== targetProduct.brand) continue;
    
    const comparison = compareProducts(targetProduct, product);
    
    // Calculate similarity score
    let score = 0;
    
    // Same brand = base score
    if (product.brand === targetProduct.brand) score += 40;
    
    // Check for critical mismatches
    const criticalMismatches = comparison.differences.filter(d => d.severity === 'critical');
    if (criticalMismatches.length > 0) {
      score -= criticalMismatches.length * 20;
    }
    
    // Check for similar product types
    const productAttrs = extractAttributes(product.name, product.description);
    if (productAttrs.productTypes && targetAttrs.productTypes) {
      const commonTypes = productAttrs.productTypes.filter(t => targetAttrs.productTypes.includes(t));
      score += commonTypes.length * 10;
    }
    
    if (score > 30) {
      candidates.push({
        product,
        score,
        comparison,
        sku: product.sku
      });
    }
  }
  
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Export functions for use by other scripts
export {
  extractAttributes,
  compareProducts,
  findSimilarProducts,
  VALIDATION_RULES,
  PATTERNS
};

// Main execution
if (process.argv[1].includes('upc-learning-system')) {
  console.log('UPC Learning System initialized');
  console.log('Validation rules:', Object.keys(VALIDATION_RULES));
  
  // Example usage
  const testProduct = { 
    id: 1, 
    name: 'Zoo Med Calcium + D3 3.2oz',
    description: '',
    brand: 'Zoo Med'
  };
  
  console.log('\nTest extraction:', extractAttributes(testProduct.name));
}
