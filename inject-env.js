const fs = require('fs');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('⚠️ WARNING: SUPABASE_URL or SUPABASE_ANON_KEY environment variables are missing.');
}

const content = `// Auto-generated configuration file
window.SUPABASE_URL = "${url}";
window.SUPABASE_ANON_KEY = "${key}";
`;

fs.writeFileSync('config.js', content);
console.log('Successfully generated config.js from environment variables.');

