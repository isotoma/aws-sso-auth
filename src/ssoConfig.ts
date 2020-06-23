import fs from 'fs';
import path from 'path';
import os from 'os';

import ini from 'ini';

import { MissingSSOConfigError } from './errors';
import { hasKey } from './utils';

const fsPromises = fs.promises;

interface SSOConfigOptions {
    readonly roleName: string;
    readonly accountId: string;
}

export const findSSOConfigFromAWSConfig = async (profile: string | undefined): Promise<SSOConfigOptions> => {
    const filepath = path.join(os.homedir(), '.aws/config');
    const awsConfig = ini.parse(await fsPromises.readFile(filepath, 'utf8'));
    const sectionName = profile ? `profile ${profile}` : 'default';

    if (!hasKey(sectionName, awsConfig)) {
        throw new MissingSSOConfigError(`No [${sectionName}] section in ${filepath}`);
    }

    const section: unknown = awsConfig[sectionName];

    if (typeof section !== 'object') {
        throw new MissingSSOConfigError(`Malformed [${sectionName}] section in ${filepath}`);
    }

    if (!section) {
        throw new MissingSSOConfigError(`No [${sectionName}] section in ${filepath}`);
    }

    if (!hasKey('sso_role_name', section)) {
        throw new MissingSSOConfigError(`Missing sso_role_name from [${sectionName}] section in ${filepath}`);
    }
    const roleName = section['sso_role_name'];
    if (typeof roleName !== 'string') {
        throw new MissingSSOConfigError(`Bad type for sso_role_name from [${sectionName}] section in ${filepath}`);
    }

    if (!hasKey('sso_account_id', section)) {
        throw new MissingSSOConfigError(`Missing sso_account_id from [${sectionName}] section in ${filepath}`);
    }
    const accountId = section['sso_account_id'];
    if (typeof accountId !== 'string') {
        throw new MissingSSOConfigError(`Bad type for sso_role_name from [${sectionName}] section in ${filepath}`);
    }

    return {
        roleName,
        accountId,
    };
};
