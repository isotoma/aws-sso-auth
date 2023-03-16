import fs from 'fs';
import path from 'path';
import os from 'os';

import { hasKey, reducePromises } from './utils';

const fsPromises = fs.promises;

export interface SSOCacheToken {
    readonly accessToken: string;
    readonly expiresAt: Date;
    readonly region: string;
}

const readCacheFile = async (filepath: string): Promise<SSOCacheToken | undefined> => {
    if (!filepath.endsWith('.json')) {
        return undefined;
    }
    const content = await fsPromises.readFile(filepath, 'utf8');
    let parsedContent: unknown;
    try {
        parsedContent = JSON.parse(content);
    } catch (err) {
        return undefined;
    }

    if (typeof parsedContent !== 'object') {
        return undefined;
    }

    if (!parsedContent) {
        return undefined;
    }

    if (!hasKey('accessToken', parsedContent)) {
        return undefined;
    }
    if (!hasKey('expiresAt', parsedContent)) {
        return undefined;
    }
    if (!hasKey('region', parsedContent)) {
        return undefined;
    }
    const accessToken: unknown = parsedContent.accessToken;
    const expiresAtRaw: unknown = parsedContent.expiresAt;
    const region: unknown = parsedContent.region;

    if (typeof accessToken !== 'string') {
        return undefined;
    }

    if (typeof region !== 'string') {
        return undefined;
    }

    if (typeof expiresAtRaw !== 'string') {
        return undefined;
    }

    const expiresAtDate = new Date(expiresAtRaw.replace('UTC', 'Z'));

    if (expiresAtDate.toString() === 'InvalidDate' || isNaN(expiresAtDate.getTime())) {
        return undefined;
    }

    return {
        accessToken,
        expiresAt: expiresAtDate,
        region,
    };
};

const latestCacheFile = async (cacheDirPath: string, filenames: Array<string>): Promise<SSOCacheToken | undefined> => {
    const reducer = async (currentBest: SSOCacheToken | undefined, filename: string): Promise<SSOCacheToken | undefined> => {
        const filepath = path.join(cacheDirPath, filename);
        const read = await readCacheFile(filepath);
        if (typeof read === 'undefined') {
            return currentBest;
        }

        if (typeof currentBest === 'undefined') {
            return read;
        }

        return read.expiresAt.getTime() > currentBest.expiresAt.getTime() ? read : currentBest;
    };
    return reducePromises(reducer, filenames, undefined);
};

const listCacheFiles = async (cacheDirPath: string): Promise<Array<string>> => {
    try {
        return await fsPromises.readdir(cacheDirPath);
    } catch (err) {
        return [];
    }
};

export const findLatestCacheFile = async (): Promise<SSOCacheToken | undefined> => {
    const cacheDirPath = path.join(os.homedir(), '.aws/sso/cache/');
    const filenames = await listCacheFiles(cacheDirPath);
    return latestCacheFile(cacheDirPath, filenames);
};

export const deleteCliCache = async (): Promise<void> => {
    await fsPromises.rm(path.join(os.homedir(), '.aws/cli/cache/'), {
        recursive: true,
        force: true,
    });
};

export const deleteSsoCache = async (): Promise<void> => {
    await fsPromises.rm(path.join(os.homedir(), '.aws/sso/cache/'), {
        recursive: true,
        force: true,
    });
};

export const deleteCredentials = async (): Promise<void> => {
    try {
        await fsPromises.unlink(path.join(os.homedir(), '.aws/credentials'));
    } catch (err) {
        /* istanbul ignore else */
        if (err.code === 'ENOENT') {
            // File doesn't exist, nothing to do
        } else {
            throw err;
        }
    }
};

export const deleteCredentialsAndCaches = async (): Promise<void> => {
    await deleteCliCache();
    await deleteSsoCache();
    await deleteCredentials();
};
