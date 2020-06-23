import os from 'os';
import path from 'path';

import mockfs from 'mock-fs';

import { findSSOConfigFromAWSConfig } from '../ssoConfig';
import { MissingSSOConfigError } from '../errors';

describe('findSSOConfigFromAWSConfig', () => {
    afterEach(() => {
        mockfs.restore();
    });

    test('findSSOConfigFromAWSConfig', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: ['[default]', 'sso_role_name = my_role_name', 'sso_account_id = 123456789012'].join('\n'),
        });

        expect(await findSSOConfigFromAWSConfig(undefined)).toEqual({
            roleName: 'my_role_name',
            accountId: '123456789012',
        });
    });

    // test('file does not exist', async () => {
    //     mockfs({});

    //     await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    // });

    test('file is not a valid ini file', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: 'this is not a valid ini file',
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });

    test('section to find appears as value not section', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: 'default = abc',
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });

    test('section to find appears as null value not section', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: 'default = null',
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });

    test('sso_role_name is missing', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: ['[default]', 'sso_account_id = 123456789012'].join('\n'),
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });

    test('sso_account_id is missing', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: ['[default]', 'sso_role_name = my_role_name'].join('\n'),
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });

    test('sso_role_name is not a string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: ['[default]', 'sso_role_name = false', 'sso_account_id = 123456789012'].join('\n'),
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });

    test('sso_account_id is not a string', async () => {
        mockfs({
            [path.join(os.homedir(), '.aws/config')]: ['[default]', 'sso_role_name = my_role_name', 'sso_account_id = null'].join('\n'),
        });

        await expect(findSSOConfigFromAWSConfig(undefined)).rejects.toThrow(MissingSSOConfigError);
    });
});
