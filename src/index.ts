import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 AI Pop Culture News - TypeScript Setup Complete!');
console.log('Node.js version:', process.version);
console.log('Current working directory:', process.cwd());

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
console.log('Project:', packageJson.name);
console.log('Description:', packageJson.description);

export default function main() {
    console.log('✅ TypeScript compilation and execution working correctly!');
    return 'Setup successful';
}

main();
