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
    return await reducePromises(reducer, filenames, undefined);
};

export const findLatestCacheFile = async (): Promise<SSOCacheToken | undefined> => {
    const cacheDirPath = path.join(os.homedir(), '.aws/sso/cache/');
    const filenames = await fsPromises.readdir(cacheDirPath);
    return await latestCacheFile(cacheDirPath, filenames);
};
