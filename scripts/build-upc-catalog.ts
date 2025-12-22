import fs from 'fs';

interface SourceEntry {
  upc: string;
  name: string;
  source?: string;
  quantity?: string;
}

interface PdfExtraction {
  filename: string;
  extractedAt: string;
  items: { upc: string; name: string; quantity?: string }[];
}

interface ExtractionDatabase {
  extractions: PdfExtraction[];
}

interface UpcCatalogEntry {
  upc: string;
  names: string[];
  sources: { type: string; count: number }[];
  primaryName: string;
}

interface UpcCatalog {
  generatedAt: string;
  totalUniqueUpcs: number;
  sourceBreakdown: { source: string; count: number }[];
  entries: UpcCatalogEntry[];
}

function normalizeUpc(upc: string): string | null {
  const digits = upc.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 14) {
    return digits.padStart(12, '0');
  }
  return null;
}

function loadJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    console.log(`Could not load: ${path}`);
    return null;
  }
}

function selectBestName(names: string[]): string {
  const sorted = [...names].sort((a, b) => {
    const aLen = a.length;
    const bLen = b.length;
    const aHasAbbrev = /\b[A-Z]{2,}\b/.test(a) || a.includes('/');
    const bHasAbbrev = /\b[A-Z]{2,}\b/.test(b) || b.includes('/');
    if (aHasAbbrev !== bHasAbbrev) return aHasAbbrev ? 1 : -1;
    return bLen - aLen;
  });
  return sorted[0] || '';
}

async function buildCatalog() {
  console.log('=== BUILDING UNIFIED UPC CATALOG ===\n');

  const upcMap = new Map<string, { names: Set<string>; sources: Map<string, number> }>();

  const uniqueUpcs = loadJsonFile<SourceEntry[]>('scripts/unique_upcs.json');
  if (uniqueUpcs) {
    console.log(`Loading unique_upcs.json: ${uniqueUpcs.length} entries`);
    for (const entry of uniqueUpcs) {
      const normalized = normalizeUpc(entry.upc);
      if (!normalized) continue;
      
      if (!upcMap.has(normalized)) {
        upcMap.set(normalized, { names: new Set(), sources: new Map() });
      }
      const record = upcMap.get(normalized)!;
      if (entry.name) record.names.add(entry.name.trim());
      record.sources.set('unique_upcs', (record.sources.get('unique_upcs') || 0) + 1);
    }
  }

  const combinedUpcs = loadJsonFile<SourceEntry[]>('combined_upcs.json');
  if (combinedUpcs) {
    console.log(`Loading combined_upcs.json: ${combinedUpcs.length} entries`);
    for (const entry of combinedUpcs) {
      const normalized = normalizeUpc(entry.upc);
      if (!normalized) continue;
      
      if (!upcMap.has(normalized)) {
        upcMap.set(normalized, { names: new Set(), sources: new Map() });
      }
      const record = upcMap.get(normalized)!;
      if (entry.name) record.names.add(entry.name.trim());
      const src = entry.source === 'spreadsheet' ? 'spreadsheet' : 'combined';
      record.sources.set(src, (record.sources.get(src) || 0) + 1);
    }
  }

  const pdfDb = loadJsonFile<ExtractionDatabase>('scripts/pdf_extractions_db.json');
  if (pdfDb) {
    let pdfItems = 0;
    for (const extraction of pdfDb.extractions) {
      for (const item of extraction.items) {
        pdfItems++;
        const normalized = normalizeUpc(item.upc);
        if (!normalized) continue;
        
        if (!upcMap.has(normalized)) {
          upcMap.set(normalized, { names: new Set(), sources: new Map() });
        }
        const record = upcMap.get(normalized)!;
        if (item.name) record.names.add(item.name.trim());
        record.sources.set('pdf_invoice', (record.sources.get('pdf_invoice') || 0) + 1);
      }
    }
    console.log(`Loading pdf_extractions_db.json: ${pdfItems} items from ${pdfDb.extractions.length} PDFs`);
  }

  const entries: UpcCatalogEntry[] = [];
  const sourceStats = new Map<string, number>();

  for (const [upc, record] of upcMap) {
    const names = Array.from(record.names).filter(n => n.length > 0);
    const sources = Array.from(record.sources.entries()).map(([type, count]) => ({ type, count }));
    
    for (const src of sources) {
      sourceStats.set(src.type, (sourceStats.get(src.type) || 0) + 1);
    }

    entries.push({
      upc,
      names,
      sources,
      primaryName: selectBestName(names)
    });
  }

  entries.sort((a, b) => a.upc.localeCompare(b.upc));

  const catalog: UpcCatalog = {
    generatedAt: new Date().toISOString(),
    totalUniqueUpcs: entries.length,
    sourceBreakdown: Array.from(sourceStats.entries()).map(([source, count]) => ({ source, count })),
    entries
  };

  fs.writeFileSync('scripts/upc_catalog.json', JSON.stringify(catalog, null, 2));

  console.log('\n=== CATALOG SUMMARY ===');
  console.log(`Total unique UPCs: ${catalog.totalUniqueUpcs}`);
  console.log('\nSource breakdown:');
  for (const { source, count } of catalog.sourceBreakdown) {
    console.log(`  ${source}: ${count} UPCs`);
  }

  const withNames = entries.filter(e => e.names.length > 0).length;
  const multipleNames = entries.filter(e => e.names.length > 1).length;
  console.log(`\nUPCs with product names: ${withNames} (${(withNames/entries.length*100).toFixed(1)}%)`);
  console.log(`UPCs with multiple name variants: ${multipleNames}`);

  console.log(`\nCatalog saved to: scripts/upc_catalog.json`);
}

buildCatalog().catch(console.error);
