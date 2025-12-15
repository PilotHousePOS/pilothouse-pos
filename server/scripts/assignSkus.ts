import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, ilike, or } from 'drizzle-orm';
import { expandAbbreviations } from '../abbreviationExpansion';

const rawData = `052742909400,sd puppy sm br ck 4.5#
052742060255,sd puppy sm br 12.5#
052742937601,sd puppy lg br 15.5#
052742060194,sd puppy lg br ck 27.5#
052742060170,sd puppy lg br lam 30#
052742020402,sd lg br ck 15#
052742909707,sd sm br ck 15.5#
052742909608,sd sm br ck 4.5#
052742289601,sd sm br lam 4.5
052742289700,sd sm br lam 15.5#
052742910000,sd sm br light 4.5#
052742910109,sd sm br light 15.5#
052742909806,SD sm br 7+ 4.5#
052742253305,SD sm br 11+ 4.5#
052742253404,SD sm br 11+ 15.5
052742016054,SD lg br ck 35#
052742203805,SD lg br lam 33#
052742022154,SD lg br light 15#
052742022215,SD lg br light 30#
052742020471,SD lg br 6+ 15#
052742204406,SD lg br 6+ 33#
052742059815,SD puppy lam 4#
052742059389,SD puppy lam 12.5#
052742059396,SD puppy lam 25#
052742713304,SD puppy ck 4.5#
052742936604,SD puppy ck 12.5#
052742060187,SD puppy ck 27.5#
052742713908,SD puppy sm bite 4.5#
052742060248,SD puppy sm bite 12.5#
052742817804,SD ck 5#
052742020419,SD ck 15#
052742016016,SD ck 35#
052742818306,SD sm bite ck 5#
052742020488,SD sm bite ck 15#
052742015989,SD sm bite ck 35#
052742855608,SD lam 15.5#
052742203607,SD lam 33#
052742855509,SD lam sm bite 4.5#
052742855707,SD lam sm bite 15.5#
052742203706,SD lam sm bite 33lb
052742068602,SD salmon 4.5#
052742068619,SD salmon 14#
052742068626,SD salmon 33#
052742022147,SD light 15#
052742022192,SD light30#
052742022130,SD light sm bite 15#
052742022222,SD light sm bite 30#
052742815909,SD 7+ sm bite 5#
052742020426,SD 7+ sm bite 15#
052742204307,SD 7+ sm bite 33#
052742670201,SD 7+ 5#
052742020495,SD 7+ 15#
052742012032,SD vitality sm 3.5#
052742012049,SD vitality sm 12.5#
052742012070,SD vitality 12.5#
052742041285,SD perf digest sm bite 3.5#
052742038292,SD perf digest ck 3.5#
052742038285,SD perf digest ck 12#
052742041339,SD perf digest ck lg br 223
052742041421,SD perf digest salmon 22#
052742001807,SD mobility sm bite 4#
052742923901,SD mobility sm bite 15.5#
052742060552,SD sm min perf weight 12.5#
052742297200,SD perf weight 4#
052742060538,SD perf weight 12#
052742068688,SD puppy sensi 4#
052742068695,SD puppy sensi 13#
052742059136,SD sensi pollock 12#
052742060545,SD perf weight 25#
052742060521,SD perf weight joint 25#
052742007038,SD sm min sensi 4#
052742033167,SD sensi sm bite 4#
052742033181,SD sensi sm bite 15#
052742033198,SD sensi sm bite 30#
052742001821,SD sensi 4#
052742886008,SD sensi 15.5#
052742883908,SD sensi 30#
052742033204,SD sensi lg br 30#
052742022109,SD sensi gr fr 24#
052742187402,SD mini jerky beef
052742187600,SD jerky beef
052742187501,SD mini jerkyck
052742187709,SD jerky ck
052742303208,SD gr fr crunch
052742008998,SD apple
052742008974,SD cranberries
052742244808,SD soft ck
052742245003,SD soft duck
052742244907,SD soft beef
052742336107,SD savories ck
052742336008,SD savories peanut
052742335902,SD savories beef
030111125552,royal can sm 4#
030111512512,royal can sm 14#
030111450913,royal can poodle
030111451415,royal can york 10#
030111451422,royal can york 2.5#
030111511812,royal can chih 10#
029695251184,barn home xsm
029695251139,barn home 25-50#
029695251146,barn home 50-90#
029695259463,indigo 50-90# house
029695219504,vari kennel 70-90#
029695217005,vari kennel giant
791611020807,pop up playpen
076484889516,collapsible crate
027773019565,spree carrier blue 19 in
029695219481,vari kennel 32"
029695219498,vari kennel 36"
029695218637,vari kennel 24"
029695218590,vari kennel 19"
029695219474,vari kennel 28"
027773018254,skudo xsm
027773027454,skudo cat
027773018285,skudo 40#
022517766194,voyager pink 26.6
022517766101,voyager blue 26.6
022517413821,catit s grey
022517413852,catit grey med
022517413814,catit bl s
022517413807,catit red s
022517413838,catit red med
022517766095,catiit blue med
022517766095,voyager pink 24"
022517766002,voyager blue 24"
022517766064,voyager grey 24"
723633014489,NB ck & br rice 24#
723633014496,NB plant 24#
723633429856,NB venisin 22#
723633778053,NB salmon sm br 4#
723633777483,NB salmon 4#
723633777780,NB duck sm br 4#
723633777384,NB duck 4#
074198614530,TOW anc wetland 5#
074198614493,TOW anc stream 5#
074198614578,TOW anc mount 5#
074198614455,TOW anc prarie 5#
074198614462,TOW anc prairie 14#
074198614509,TOW anc stream 14#
074198614585,TOW anc mount 14#
074198614516,TOW anc stream 28#
074198614554,TOW anc wetland 28#
074198614479,TOE anc prairie 28#
074198614547,TOW anc wetland 14#
074198613908,TOW wetland 14$
074198611386,TOW south can 14#
074198612703,TOW appal 14#
074198611379,Tow south can 5#
074198612697,TOW appal 5#
074198609697,TOW wetland 5#
074198609581,TOW pacif stream 5#
074198613922,TOW pacific stream 14#
074198611010,TOW sierra mount 5#
074198613960,TOW sierra mount 14#
074198613977,TOW sierra mount 28#
074198609628,TOW high prairie 5#
074198613946,TOW high prairie 14#
074198613953,TOW high prairie 28#
074198611089,TOW high prairie puppy 5#
074198613991,TOW high prairie puppy 28#
074198611157,pacific stream puppy 5#
074198614004,pacific stream puppy 14#
074198608270,DIAM sm br ck 6#
074198608287,DIAM sm br ck 18#
074198608300,DIAM sm br lamb 18#
074198608232,DIAM sm br puppy 6#
074198608249,DIAM sm br puppy 18#
074198608201,DIAM als ck 40#
074198608430,DIAM senior 35#
074198610662,DIAM light 15#
074198610679,DIAM light 30#
074198611522,DIAM gr fr 28#
074198610693,DIAM lg br lamb 40#
074198608393,DIAM lg br 40#
052742909905,SD sm min 7+ 15.5#
052742930107,SD light sm bite 5#
052742204208,SD 7+ 33#
052742382104,SD sm min perf weight 4#
052742923505,SD mobility lg br 30#
052742007045,SD sm min sensitive 15#
074198615681,DIAM puppy 6#
074198002207,DIAM puppy 20#
074198002405,DIAM puppy 40#
074198608355,DIAM puppy lg br 6#
074198608362,DIAM puppy lg br 20#
074198608379,DIAM puppy lg br 40#
074198003204,DIAM mainten 20#
074198003402,DIAM mainten 40#
074198615674,DIAM prem 6#
074198010202,DIAM prem 20#
074198010509,DIAM prem 50#
074198608157,DIAM lamb 6#
074198608164,DIAM lamb 20#
074198608171,DIAM lamb 40#
074198613854,DIAM skin 15#
074198613847,DIAM skin 30#
074198000500,DIAM orig 50#
034846600520,SPORTMIX bite size 40#
034846700916,SPORTMIX energy plus 50#
034846700435,SPORTMIX high energy 50#
034846600131,SPORTMIX puppy sm bite 1605#
072705105229,FROMM classic 30#
072705105427,FROMM classic puppy 30#
072705105472,FROMM classic puppy 5#
072705105434,Fromm classic puppy 15#
072705105274,FROMM classic 5#
072705105236,FROMM classic 15#`;

async function assignSkus() {
  console.log('[SKU-ASSIGN] Starting SKU assignment...');
  
  // Parse the raw data
  const skuData: {sku: string, abbreviatedName: string}[] = [];
  for (const line of rawData.split('\n')) {
    const [sku, ...nameParts] = line.split(',');
    const abbreviatedName = nameParts.join(',').trim();
    if (sku && abbreviatedName) {
      skuData.push({ sku: sku.trim(), abbreviatedName });
    }
  }
  
  console.log(`[SKU-ASSIGN] Parsed ${skuData.length} SKU entries`);
  
  // Get all supplies from database
  const allSupplies = await db.select().from(supplies);
  console.log(`[SKU-ASSIGN] Found ${allSupplies.length} supplies in database`);
  
  // Create normalized lookup maps for matching
  const supplyByNormalizedName = new Map<string, typeof allSupplies[0]>();
  const supplyByExactName = new Map<string, typeof allSupplies[0]>();
  
  for (const supply of allSupplies) {
    const exactKey = supply.name.toLowerCase().trim();
    supplyByExactName.set(exactKey, supply);
    
    const normalizedName = supply.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    supplyByNormalizedName.set(normalizedName, supply);
  }
  
  let matched = 0;
  let notFound = 0;
  const notFoundItems: string[] = [];
  
  for (const item of skuData) {
    const { sku, abbreviatedName } = item;
    
    // Expand the abbreviated name using our abbreviation system
    const expandedName = expandAbbreviations(abbreviatedName);
    
    // Try multiple matching strategies
    let foundSupply = null;
    
    // Strategy 1: Exact match on expanded name
    const expandedLower = expandedName.toLowerCase().trim();
    foundSupply = supplyByExactName.get(expandedLower);
    
    // Strategy 2: Normalized match
    if (!foundSupply) {
      const normalizedExpanded = expandedName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      foundSupply = supplyByNormalizedName.get(normalizedExpanded);
    }
    
    // Strategy 3: Fuzzy match - find best match by word similarity
    if (!foundSupply) {
      const expandedWords = expandedName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      let bestMatch = null;
      let bestScore = 0;
      
      for (const supply of allSupplies) {
        const supplyWords = supply.name.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        let matchCount = 0;
        
        for (const word of expandedWords) {
          if (supplyWords.some(sw => sw.includes(word) || word.includes(sw))) {
            matchCount++;
          }
        }
        
        const score = matchCount / Math.max(expandedWords.length, 1);
        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          bestMatch = supply;
        }
      }
      
      if (bestMatch) {
        foundSupply = bestMatch;
      }
    }
    
    if (foundSupply) {
      // Update SKU
      await db.update(supplies)
        .set({ sku })
        .where(eq(supplies.id, foundSupply.id));
      matched++;
      console.log(`[SKU-ASSIGN] ✓ Matched: "${abbreviatedName}" -> "${foundSupply.name}" (SKU: ${sku})`);
    } else {
      notFound++;
      notFoundItems.push(`${sku}: ${abbreviatedName} -> ${expandedName}`);
    }
  }
  
  console.log('\n[SKU-ASSIGN] === SUMMARY ===');
  console.log(`Matched: ${matched}`);
  console.log(`Not Found: ${notFound}`);
  
  if (notFoundItems.length > 0) {
    console.log('\n[SKU-ASSIGN] Items not found:');
    for (const item of notFoundItems.slice(0, 30)) {
      console.log(`  - ${item}`);
    }
  }
  
  process.exit(0);
}

assignSkus().catch(err => {
  console.error('[SKU-ASSIGN] Error:', err);
  process.exit(1);
});
