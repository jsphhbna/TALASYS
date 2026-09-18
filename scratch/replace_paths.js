const fs = require('fs');
const path = require('path');

const pathReplacements = {
    '/login': '/auth/login',
    '/register': '/auth/register',
    '/dashboard': '/resident/dashboard',
    '/history': '/resident/history',
    '/notifications': '/resident/notifications',
    '/profile': '/resident/profile',
    '/request': '/resident/request',
};

const importReplacements = {
    '@/components/history': '@/components/resident/history',
    '@/components/profile': '@/components/resident/profile',
    '@/components/register': '@/components/auth/register',
    '@/components/layout/resident-mobile-nav': '@/components/resident/layout/resident-mobile-nav',
    '@/components/layout/admin-sidebar': '@/components/admin/layout/admin-sidebar',
    '@/components/layout/admin-header': '@/components/admin/layout/admin-header',
    '@/components/layout/superadmin-sidebar': '@/components/superadmin/layout/superadmin-sidebar',
    '@/components/layout/superadmin-header': '@/components/superadmin/layout/superadmin-header',
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
            
            // 1. Replace component imports
            for (const [oldImport, newImport] of Object.entries(importReplacements)) {
                // regex to match import exact paths inside quotes
                const regex = new RegExp(`(['"])${oldImport.replace(/\\/g, '\\\\')}`, 'g');
                content = content.replace(regex, `$1${newImport}`);
            }
            
            // 2. Replace URL paths in href and router.push
            for (const [oldPath, newPath] of Object.entries(pathReplacements)) {
                // Matches href="/login" or href={'/login'} or router.push('/login') or router.push("/login")
                // Not doing a global search and replace to avoid messing up random text, specifically targeting these patterns.
                
                // Match router.push("/login") or push('/login')
                const routerRegex = new RegExp(`(router\\.push|push)\\((['"])${oldPath.replace(/\\/g, '\\\\')}(['"])`, 'g');
                content = content.replace(routerRegex, `$1($2${newPath}$3`);
                
                // Match href="/login" or href={'/login'} or href={\`/login\`}
                const hrefRegex = new RegExp(`(href\\s*=\\s*\\{?\\s*(?:[\`'"]))${oldPath.replace(/\\/g, '\\\\')}([\`'"]?\\s*\\}?)`, 'g');
                content = content.replace(hrefRegex, `$1${newPath}$2`);
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
