#!/usr/bin/env node

/**
 * XML Entity Fixer
 * 
 * This script fixes common XML entity issues in DeltaV exports.
 * Run it before importing XML into the system.
 * 
 * Usage:
 *   node fix-xml-entities.js input.xml output.xml
 */

const fs = require('fs');
const path = require('path');

function fixXmlEntities(xmlContent) {
  console.log('🔧 Starting XML entity fix...');
  
  let fixed = xmlContent;
  let issuesFound = 0;
  
  // Fix 1: Unescaped ampersands (but not valid entities)
  // This regex finds & that are NOT followed by a valid entity name
  const ampersandPattern = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g;
  const ampersandMatches = fixed.match(ampersandPattern);
  if (ampersandMatches) {
    console.log(`⚠️  Found ${ampersandMatches.length} unescaped ampersands`);
    fixed = fixed.replace(ampersandPattern, '&amp;');
    issuesFound += ampersandMatches.length;
  }
  
  // Fix 2: Unescaped less-than signs (but not valid tags)
  // This is trickier - we only want to escape < that are NOT part of tags
  // For now, we'll leave this as it's complex and less common
  
  // Fix 3: Remove invalid control characters (except tab, newline, carriage return)
  const controlCharsPattern = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/g;
  const controlMatches = fixed.match(controlCharsPattern);
  if (controlMatches) {
    console.log(`⚠️  Found ${controlMatches.length} invalid control characters`);
    fixed = fixed.replace(controlCharsPattern, '');
    issuesFound += controlMatches.length;
  }
  
  // Fix 4: Replace smart quotes with regular quotes
  const smartQuotesPattern = /[\u201C\u201D\u2018\u2019]/g;
  const smartQuotesMatches = fixed.match(smartQuotesPattern);
  if (smartQuotesMatches) {
    console.log(`⚠️  Found ${smartQuotesMatches.length} smart quotes`);
    fixed = fixed
      .replace(/[\u201C\u201D]/g, '"')  // Replace smart double quotes
      .replace(/[\u2018\u2019]/g, "'"); // Replace smart single quotes
    issuesFound += smartQuotesMatches.length;
  }
  
  // Fix 5: Fix common invalid entity references
  const invalidEntities = [
    { pattern: /&nbsp;/g, replacement: '&#160;' },
    { pattern: /&copy;/g, replacement: '&#169;' },
    { pattern: /&reg;/g, replacement: '&#174;' },
    { pattern: /&trade;/g, replacement: '&#8482;' },
    { pattern: /&deg;/g, replacement: '&#176;' },
    { pattern: /&plusmn;/g, replacement: '&#177;' },
    { pattern: /&micro;/g, replacement: '&#181;' },
  ];
  
  invalidEntities.forEach(({ pattern, replacement }) => {
    const matches = fixed.match(pattern);
    if (matches) {
      console.log(`⚠️  Found ${matches.length} ${pattern.source} entities`);
      fixed = fixed.replace(pattern, replacement);
      issuesFound += matches.length;
    }
  });
  
  console.log(`✅ Fixed ${issuesFound} issues`);
  return fixed;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node fix-xml-entities.js <input.xml> <output.xml>');
    console.log('');
    console.log('Example:');
    console.log('  node fix-xml-entities.js system-export.xml system-export-fixed.xml');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const outputFile = args[1];
  
  console.log('📂 Input file:', inputFile);
  console.log('📂 Output file:', outputFile);
  
  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error('❌ Input file not found:', inputFile);
    process.exit(1);
  }
  
  // Read input file
  console.log('📖 Reading input file...');
  const xmlContent = fs.readFileSync(inputFile, 'utf-8');
  console.log('📊 Input file size:', (xmlContent.length / 1024 / 1024).toFixed(2), 'MB');
  
  // Fix entities
  const fixedXml = fixXmlEntities(xmlContent);
  
  // Write output file
  console.log('💾 Writing output file...');
  fs.writeFileSync(outputFile, fixedXml, 'utf-8');
  console.log('📊 Output file size:', (fixedXml.length / 1024 / 1024).toFixed(2), 'MB');
  
  console.log('');
  console.log('✅ Done! Fixed XML written to:', outputFile);
  console.log('');
  console.log('Next steps:');
  console.log('1. Try importing the fixed file into the application');
  console.log('2. If you still get errors, check the line number in the error message');
  console.log('3. Open the fixed file and manually inspect that line');
}

main();
