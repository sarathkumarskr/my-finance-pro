const fs = require('fs');
const path = require('path');

const replacements = [
  // FLAGS — compound emojis (need extra patterns)
  { find: '\\uD83C\\uDDE6\\uD83C\\uDDEA', replace: '🇦🇪' },
  { find: '\\uD83C\\uDDEE\\uD83C\\uDDF3', replace: '🇮🇳' },
  { find: '\\uD83C\\uDDFA\\uD83C\\uDDF8', replace: '🇺🇸' },
  
  // Calendar
  { find: '\\uD83D\\uDCC5', replace: '📅' },
  
  // Just in case any leftover patterns
  { find: '\\uD83D\\uDCB0', replace: '💰' },
  { find: '\\uD83D\\uDCB3', replace: '💳' },
];
  
  // Money & Finance
  { find: '\\uD83D\\uDCB0', replace: '💰' },
  { find: '\\uD83D\\uDCB3', replace: '💳' },
  { find: '\\uD83D\\uDCB8', replace: '💸' },
  { find: '\\uD83D\\uDCB5', replace: '💵' },
  { find: '\\uD83D\\uDCB2', replace: '💲' },
  { find: '\\u20B9', replace: '₹' },
  
  // Documents & Charts
  { find: '\\uD83D\\uDCCB', replace: '📋' },
  { find: '\\uD83D\\uDCC5', replace: '📅' },
  { find: '\\uD83D\\uDCCA', replace: '📊' },
  { find: '\\uD83D\\uDCC8', replace: '📈' },
  { find: '\\uD83D\\uDCC9', replace: '📉' },
  { find: '\\uD83D\\uDCDA', replace: '📚' },
  
  // People & Gestures
  { find: '\\uD83D\\uDC4B', replace: '👋' },
  { find: '\\uD83E\\uDD1D', replace: '🤝' },
  { find: '\\uD83D\\uDC68\\u200D\\uD83D\\uDC69\\u200D\\uD83D\\uDC67', replace: '👨‍👩‍👧' },
  
  // Targets & Warnings
  { find: '\\uD83C\\uDFAF', replace: '🎯' },
  { find: '\\uD83D\\uDEA8', replace: '🚨' },
  { find: '\\u26A0\\uFE0F', replace: '⚠️' },
  { find: '\\u2705', replace: '✅' },
  { find: '\\u2713', replace: '✓' },
  { find: '\\u2715', replace: '✕' },
  { find: '\\u2795', replace: '➕' },
  { find: '\\u2A2F', replace: '✗' },
  
  // Buildings & Places
  { find: '\\uD83C\\uDFE0', replace: '🏠' },
  { find: '\\uD83C\\uDFE6', replace: '🏦' },
  { find: '\\uD83C\\uDFE5', replace: '🏥' },
  { find: '\\uD83C\\uDFDB\\uFE0F', replace: '🏛️' },
  { find: '\\uD83C\\uDFDB', replace: '🏛' },
  { find: '\\uD83C\\uDFAC', replace: '🎬' },
  
  // Food & Shopping
  { find: '\\uD83C\\uDF54', replace: '🍔' },
  { find: '\\uD83D\\uDED2', replace: '🛒' },
  { find: '\\uD83D\\uDECD\\uFE0F', replace: '🛍️' },
  { find: '\\uD83D\\uDECD', replace: '🛍' },
  
  // Transport
  { find: '\\uD83D\\uDE97', replace: '🚗' },
  { find: '\\uD83D\\uDE8C', replace: '🚌' },
  { find: '\\u2708\\uFE0F', replace: '✈️' },
  { find: '\\u2708', replace: '✈' },
  
  // Tech & Communication
  { find: '\\uD83D\\uDCF1', replace: '📱' },
  { find: '\\uD83D\\uDCA1', replace: '💡' },
  { find: '\\uD83D\\uDCE5', replace: '📥' },
  
  // Misc
  { find: '\\uD83C\\uDFE7', replace: '🏧' },
  { find: '\\uD83D\\uDC8A', replace: '💊' },
  { find: '\\uD83D\\uDED0', replace: '🛐' },
  { find: '\\uD83C\\uDF81', replace: '🎁' },
  { find: '\\uD83E\\uDDD1\\u200D\\uD83D\\uDCBB', replace: '🧑‍💻' },
  { find: '\\uD83C\\uDFE2', replace: '🏢' },
  { find: '\\uD83D\\uDD12', replace: '🔒' },
  { find: '\\uD83D\\uDD04', replace: '🔄' },
  { find: '\\uD83D\\uDD34', replace: '🔴' },
  { find: '\\uD83D\\uDFE3', replace: '🟣' },
  { find: '\\uD83D\\uDEE1\\uFE0F', replace: '🛡️' },
  { find: '\\uD83D\\uDEE1', replace: '🛡' },
  { find: '\\uD83E\\uDE99', replace: '🪙' },
  { find: '\\uD83C\\uDF89', replace: '🎉' },
  { find: '\\u23F0', replace: '⏰' },
  { find: '\\u203A', replace: '›' },
  { find: '\\u2014', replace: '—' },
  { find: '\\u2212', replace: '−' },
  { find: '\\u00B7', replace: '·' },
  { find: '\\u00D7', replace: '×' },
  { find: '\\u00A0', replace: ' ' },
  { find: '\\u2026', replace: '…' },
  { find: '\\u2248', replace: '≈' },
  { find: '\\u2192', replace: '→' },
  { find: '\\u2197\\uFE0F', replace: '↗️' },
  { find: '\\u2198\\uFE0F', replace: '↘️' },
];

function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && !full.includes('node_modules') && !full.includes('.git')) {
        walk(full);
      } else if (/\.(tsx|ts|jsx|js)$/.test(file)) {
        let content = fs.readFileSync(full, 'utf8');
        let changed = false;
        replacements.forEach(({ find, replace }) => {
          if (content.includes(find)) {
            content = content.split(find).join(replace);
            changed = true;
          }
        });
        if (changed) {
          fs.writeFileSync(full, content);
          console.log('✓ Fixed:', full);
        }
      }
    });
  }
  
  console.log('🔍 Final emoji cleanup...\n');
  walk(path.join(__dirname, 'src'));
  console.log('\n✅ Done!');