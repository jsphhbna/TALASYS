const fs = require('fs');
const path = require('path');

const replacements = {
    '@/lib/auth-context': '@/lib/auth',
    '@/lib/auth-types': '@/lib/auth',
    '@/lib/admin-store': '@/lib/admin',
    '@/lib/superadmin-store': '@/lib/superadmin',
    '@/lib/local-storage-store': '@/lib/resident',
    '@/lib/resident-documents': '@/lib/resident',
    '@/lib/resident-status': '@/lib/resident',
    '@/lib/cloudinary': '@/lib/resident',
    '@/lib/ocr-parser': '@/lib/resident',
    '@/hooks/use-auth-guard': '@/hooks/auth',
    '@/hooks/use-inactivity-timeout': '@/hooks/auth',
    '@/hooks/use-admin-data': '@/hooks/admin',
    '@/hooks/use-superadmin-data': '@/hooks/superadmin',
    '@/hooks/use-resident-data': '@/hooks/resident',
};

const directoriesToScan = ['app', 'components', 'hooks', 'lib'];
let filesModified = 0;

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        if (filepath.includes('node_modules') || filepath.includes('.next') || filepath.includes('.git') || filepath.includes('scratch')) {
            continue;
        }
        
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walk(filepath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            let content = fs.readFileSync(filepath, 'utf8');
            const originalContent = content;
            
            for (const [oldImport, newImport] of Object.entries(replacements)) {
                // regex to match import exact paths inside quotes
                const regex = new RegExp(`(['"])${oldImport.replace(/\\/g, '\\\\')}(['"])`, 'g');
                content = content.replace(regex, `$1${newImport}$2`);
            }
            
            if (content !== originalContent) {
                fs.writeFileSync(filepath, content, 'utf8');
                filesModified++;
                console.log(`Updated ${filepath}`);
            }
        }
    }
}

for (const dir of directoriesToScan) {
    walk(dir);
}

console.log(`Total files modified: ${filesModified}`);
