import fs from 'fs';
import path from 'path';

import { hasKey } from './utils';

const fsPromises = fs.promises;

export const getVersionNumber = async (): Promise<string> => {
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageData = await fsPromises.readFile(packagePath, 'utf8');
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
