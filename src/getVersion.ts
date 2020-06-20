import fs from 'fs';
import path from 'path';

import { hasKey } from './utils';

export const getVersionNumber = (): string => {
    const packagePath = path.join(__dirname, '..', 'package.json');
    // Using fs.promises here doesn't work with reading assets from
    // within the pkg executable snapshot filesystem, so just
    // `readFileSync` instead
    const packageData = fs.readFileSync(packagePath, 'utf8');
    let parsed: unknown;
    try {
        parsed = JSON.parse(packageData);
    } catch {
        return 'unknown';
    }

    if (typeof parsed !== 'object') {
        return 'unknown';
    }
    if (!parsed) {
        return 'unknown';
    }

    if (!hasKey('version', parsed)) {
        return 'unknown';
    }

    const version = parsed.version;

    if (typeof version !== 'string') {
        return 'unknown';
    }

    return version;
};
