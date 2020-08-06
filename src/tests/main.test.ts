jest.mock('child_process');

import os from 'os';
import path from 'path';
import fs from 'fs';

import mockfs from 'mock-fs';
import { exec } from 'child_process';

import { run, main } from '../main';
import { BadAWSCLIVersionError, NoCachedCredentialsError, ArgumentsError, MisbehavingExpiryDateError } from '../errors';

interface CmdOutput {
    stdout: string;
    stderr: string;
}

type MockExecCommand = (cmd: string, options: object) => CmdOutput | void;

interface MockExecCommands {
    [key: string]: MockExecCommand;
}

type MockExec = (cmd: string, options: object, callback: (err: Error | null, out: CmdOutput) => void) => void;

const emptyOutput: CmdOutput = {
    stdout: '',
    stderr: '',
};

const mockExecCommandsFactory = (mockExecCommands: MockExecCommands): MockExec => {
    return (cmd: string, options: object, callback: (err: Error | null, out: CmdOutput) => void): void => {
        for (const key in mockExecCommands) {
            if (cmd.startsWith(key)) {
                const mockExecCommand: MockExecCommand = mockExecCommands[key];
                let out;
                try {
                    out = mockExecCommand(cmd, options);
                } catch (err) {
                    callback(err, emptyOutput);
                    return;
                }
                callback(null, out || emptyOutput);
                return;
            }
        }
        callback(new Error('Unknown command'), emptyOutput);
    };
};

const defaultExecMocks = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'aws sso login': (cmd: string, options: object): void => {
        const content = {
            expiresAt: new Date(new Date().getTime() + 60 * 1000),
            region: 'myregion',
            accessToken: 'myaccesstoken',
        };
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/example.json'), JSON.stringify(content), 'utf8');
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'aws sso get-role-credentials': (cmd: string, options: object): CmdOutput => {
        const content = {
            roleCredentials: {
                accessKeyId: 'myaccesskeyid',
                secretAccessKey: 'mysecretaccesskey',
                sessionToken: 'mysessiontoken',
                expiration: new Date(3020, 0, 1, 12, 30, 0).getTime(),
            },
        };
        return {
            stdout: JSON.stringify(content),
            stderr: '',
        };
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'aws --version': (cmd: string, options: object): CmdOutput => {
        return {
            stdout: 'aws-cli/2.0.21 Python/3.7.3 Linux/5.7.2-arch1-1 botocore/2.0.0dev25',
            stderr: '',
        };
    },
};

describe('run', () => {
    beforeEach(() => {
        mockfs({
            [path.join(os.homedir(), '.aws/')]: {},
            [path.join(os.homedir(), '.aws/sso/cache/')]: {},
        });

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockClear();
    });

    afterEach(() => {
        mockfs.restore();
    });

    test('run', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
        });

        const expectedPath = path.join(os.homedir(), '.aws/credentials');
        const foundCredentialsContent = fs.readFileSync(expectedPath, 'utf8');

        const expectedLines = [
            '[default]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));

        const fileModeOctal = '0' + (fs.lstatSync(expectedPath).mode & parseInt('777', 8)).toString(8);
        expect(fileModeOctal).toEqual('0600');
    });

    test('run, finds cache file', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "3020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
        });

        const foundCredentialsContent = fs.readFileSync(path.join(os.homedir(), '.aws/credentials'), 'utf8');

        const expectedLines = [
            '[default]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));
    });

    test('run, handles expired latest cache file', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "1020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
        });

        const foundCredentialsContent = fs.readFileSync(path.join(os.homedir(), '.aws/credentials'), 'utf8');

        const expectedLines = [
            '[default]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));
    });

    test('run, handles non-expired latest cache file, but credentials still fail with error due to expiry (see https://github.com/isotoma/aws-sso-auth/issues/23)', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const content = {
            // Still valid for a bit
            expiresAt: new Date(new Date().getTime() + 30 * 1000),
            region: 'myregion',
            accessToken: 'not_actually_valid_access_token',
        };
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/wrongly_claims_to_be_valid.json'), JSON.stringify(content), 'utf8');

        let didThrowError = false;

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso get-role-credentials': (cmd: string, options: object): CmdOutput => {
                    if (cmd.includes('not_actually_valid_access_token')) {
                        didThrowError = true;
                        throw {
                            stderr: 'An error occurred (UnauthorizedException) when calling the GetRoleCredentials operation: Session token not found or invalid',
                        };
                    } else {
                        const content = {
                            roleCredentials: {
                                accessKeyId: 'myaccesskeyid',
                                secretAccessKey: 'mysecretaccesskey',
                                sessionToken: 'mysessiontoken',
                                expiration: new Date(3020, 0, 1, 12, 30, 0).getTime(),
                            },
                        };
                        return {
                            stdout: JSON.stringify(content),
                            stderr: '',
                        };
                    }
                },
            }),
        );

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
        });

        expect(didThrowError).toBe(true);
        const foundCredentialsContent = fs.readFileSync(path.join(os.homedir(), '.aws/credentials'), 'utf8');

        const expectedLines = [
            '[default]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));
    });

    test('run, errors if running aws sso login creates non-expired latest cache file, but credentials still fail with error due to expiry, and does not re-run aws sso login (see https://github.com/isotoma/aws-sso-auth/issues/23)', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        let awsSsoLoginCallCount = 0;

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                'aws sso login': (cmd: string, options: object): void => {
                    awsSsoLoginCallCount++;
                    const fn = defaultExecMocks['aws sso login'];
                    fn(cmd, options);
                },
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso get-role-credentials': (cmd: string, options: object): CmdOutput => {
                    throw {
                        stderr: 'An error occurred (UnauthorizedException) when calling the GetRoleCredentials operation: Session token not found or invalid',
                    };
                },
            }),
        );

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
            }),
        ).rejects.toThrow(MisbehavingExpiryDateError);

        expect(awsSsoLoginCallCount).toEqual(1);
    });

    test('run, errors if get-role-credentials throws an unexpected error)', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso get-role-credentials': (cmd: string, options: object): CmdOutput => {
                    throw {
                        stderr: 'Unknown error occurred',
                    };
                },
            }),
        );

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
            }),
        ).rejects.toEqual({ stderr: 'Unknown error occurred' });
    });

    test('run, errors if aws sso login fails to generate a cache file', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso login': (cmd: string, options: object): void => {
                    // do nothing
                },
            }),
        );

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
            }),
        ).rejects.toThrow(NoCachedCredentialsError);
    });

    test('run, credentialsProcessOutput', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: true,
        });

        expect(consoleLogSpy).toHaveBeenCalledWith(
            ['{', '"Version":1,', '"AccessKeyId":"myaccesskeyid",', '"SecretAccessKey":"mysecretaccesskey",', '"SessionToken":"mysessiontoken",', '"Expiration":"3020-01-01T12:30:00.000Z"', '}'].join(
                '',
            ),
        );
    });

    test('run, credentialsProcessOutput from cache', async () => {
        const cacheFileContent = [
            '{',
            '"Version":1,',
            '"AccessKeyId":"myaccesskeyid",',
            '"SecretAccessKey":"mysecretaccesskey",',
            '"SessionToken":"mysessiontoken",',
            '"Expiration":"3020-01-01T12:30:00.000Z"',
            '}',
        ].join('');
        fs.writeFileSync(path.join(os.homedir(), '.aws-sso-auth-credentials.json'), cacheFileContent, 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: true,
        });

        expect(consoleLogSpy).toHaveBeenCalledWith(
            ['{', '"Version":1,', '"AccessKeyId":"myaccesskeyid",', '"SecretAccessKey":"mysecretaccesskey",', '"SessionToken":"mysessiontoken",', '"Expiration":"3020-01-01T12:30:00.000Z"', '}'].join(
                '',
            ),
        );
    });

    test('run verbose', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const consoleErrorSpy = jest.spyOn(global.console, 'error').mockImplementation();

        await run({
            verbose: true,
            profile: undefined,
            credentialsProcessOutput: false,
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('INFO:', 'Starting');
    });

    test('run, custom profile', async () => {
        const configLines = ['[profile myprofile]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "3020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        await run({
            verbose: false,
            profile: 'myprofile',
            credentialsProcessOutput: false,
        });

        const foundCredentialsContent = fs.readFileSync(path.join(os.homedir(), '.aws/credentials'), 'utf8');

        const expectedLines = [
            '[profile myprofile]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));
    });

    test('run, bad AWS CLI version', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws --version': (cmd: string, options: object): CmdOutput => {
                    return {
                        stdout: 'aws-cli/1',
                        stderr: '',
                    };
                },
            }),
        );

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
            }),
        ).rejects.toThrow(BadAWSCLIVersionError);
    });
});

describe('main', () => {
    beforeEach(() => {
        mockfs({
            [path.join(os.homedir(), '.aws/')]: {},
            [path.join(os.homedir(), '.aws/sso/cache/')]: {},
        });

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockClear();
    });

    afterEach(() => {
        mockfs.restore();
    });

    test('main', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = (exec as unknown) as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        await main([]);

        const foundCredentialsContent = fs.readFileSync(path.join(os.homedir(), '.aws/credentials'), 'utf8');

        const expectedLines = [
            '[default]',
            'aws_access_key_id = myaccesskeyid',
            'aws_secret_access_key = mysecretaccesskey',
            'aws_session_token = mysessiontoken',
            'aws_security_token = mysessiontoken',
            '',
        ];
        expect(foundCredentialsContent).toEqual(expectedLines.join('\n'));
    });

    test('too many arguments', async () => {
        await expect(main(['a', 'b', 'c'])).rejects.toThrow(ArgumentsError);
    });

    test('unexpected argument', async () => {
        await expect(main(['badarg'])).rejects.toThrow(ArgumentsError);
    });

    test('bad options', async () => {
        await expect(main(['--bad-option'])).rejects.toThrow(ArgumentsError);
    });
});

describe('main, version', () => {
    afterEach(() => {
        mockfs.restore();
    });

    test('version', async () => {
        mockfs({
            [path.join(path.dirname(path.dirname(__dirname)), 'package.json')]: '{"version": "1.2.3"}',
        });
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await main(['version']);
        expect(consoleLogSpy).toHaveBeenCalledWith('1.2.3');
    });

    test('package.json not json', async () => {
        mockfs({
            [path.join(path.dirname(path.dirname(__dirname)), 'package.json')]: 'not json',
        });
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await main(['version']);
        expect(consoleLogSpy).toHaveBeenCalledWith('unknown');
    });

    test('package.json not object', async () => {
        mockfs({
            [path.join(path.dirname(path.dirname(__dirname)), 'package.json')]: '1',
        });
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await main(['version']);
        expect(consoleLogSpy).toHaveBeenCalledWith('unknown');
    });

    test('package.json not object', async () => {
        mockfs({
            [path.join(path.dirname(path.dirname(__dirname)), 'package.json')]: 'null',
        });
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await main(['version']);
        expect(consoleLogSpy).toHaveBeenCalledWith('unknown');
    });

    test('package.json missing version key', async () => {
        mockfs({
            [path.join(path.dirname(path.dirname(__dirname)), 'package.json')]: '{"otherkey": 1}',
        });
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await main(['version']);
        expect(consoleLogSpy).toHaveBeenCalledWith('unknown');
    });

    test('package.json version not string', async () => {
        mockfs({
            [path.join(path.dirname(path.dirname(__dirname)), 'package.json')]: '{"version": false}',
        });
        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await main(['version']);
        expect(consoleLogSpy).toHaveBeenCalledWith('unknown');
    });
});
