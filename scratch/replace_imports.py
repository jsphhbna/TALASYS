import os
import re

replacements = {
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
}

directories_to_scan = ['app', 'components', 'hooks', 'lib']
files_modified = 0

for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.next' in root or '.git' in root or 'scratch' in root:
        continue
    
    for file in files:
        if file.endswith(('.ts', '.tsx')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            for old_import, new_import in replacements.items():
                content = re.sub(rf'([\'\"]){old_import}([\'\"])', rf'\g<1>{new_import}\g<2>', content)
            
            if content != original_content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                files_modified += 1
                print(f'Updated {filepath}')

print(f'Total files modified: {files_modified}')
