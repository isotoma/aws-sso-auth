jest.mock('child_process');

import os from 'os';
import path from 'path';
import fs from 'fs';
import events from 'events';

import mockfs from 'mock-fs';
import { exec, spawn } from 'child_process';

import { run, main } from '../main';
import { BadAWSCLIVersionError, NoCachedCredentialsError, ArgumentsError, MisbehavingExpiryDateError } from '../errors';

interface CmdOutput {
    stdout: string;
    stderr: string;
}

type MockExecCommand = (cmd: string, options: unknown) => CmdOutput | void;

interface MockExecCommands {
    [key: string]: MockExecCommand;
}

type MockExec = (cmd: string, options: unknown, callback: (err: Error | null, out: CmdOutput) => void) => void;

const emptyOutput: CmdOutput = {
    stdout: '',
    stderr: '',
};

const minutesInTheFuture = (minutes: number): Date => {
    return new Date(new Date().getTime() + minutes * 60 * 1000);
};

const mockExecCommandsFactory = (mockExecCommands: MockExecCommands): MockExec => {
    return (cmd: string, options: unknown, callback: (err: Error | null, out: CmdOutput) => void): void => {
        for (const key in mockExecCommands) {
            if (cmd.startsWith(key)) {
                const mockExecCommand: MockExecCommand = mockExecCommands[key];
                let out;
                try {
                    out = mockExecCommand(cmd, options);
                } catch (err) {
                    if (!(err instanceof Error)) {
                        throw err;
                    }
                    callback(err, emptyOutput);
                    return;
                }
                callback(null, out || emptyOutput);
                return;
            }
        }
        callback(new Error(`Unknown command: ${cmd}`), emptyOutput);
    };
};

const defaultExecMocks = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'aws sso get-role-credentials': (cmd: string, options: unknown): CmdOutput => {
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
    'aws --version': (cmd: string, options: unknown): CmdOutput => {
        return {
            stdout: 'aws-cli/2.0.21 Python/3.7.3 Linux/5.7.2-arch1-1 botocore/2.0.0dev25',
            stderr: '',
        };
    },
};

class SpawnOutput extends events.EventEmitter {
    stdout: string;
    stderr: string;

    constructor() {
        super();
        this.stdout = '';
        this.stderr = '';
    }

    setStdout(str: string) {
        this.stdout = str;
    }
    setStderr(str: string) {
        this.stderr = str;
    }
}

type MockSpawnCommand = (cmd: string, args: Array<string>, options: unknown) => CmdOutput;

interface MockSpawnCommands {
    [key: string]: MockSpawnCommand;
}

type MockSpawn = (cmd: string, args: Array<string>, options: unknown) => void;

const defaultSpawnMocks = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'aws sso login': (cmd: string, args: Array<string>, options: unknown): CmdOutput => {
        const content = {
            expiresAt: minutesInTheFuture(20),
            region: 'myregion',
            accessToken: 'myaccesstoken',
        };
        const cacheFilePath = path.join(os.homedir(), '.aws/sso/cache/example.json');
        fs.mkdirSync(path.dirname(cacheFilePath), {
            recursive: true,
        });
        fs.writeFileSync(cacheFilePath, JSON.stringify(content), 'utf8');
        return emptyOutput;
    },
};

const mockSpawnCommandsFactory = (mockSpawnCommands: MockSpawnCommands): MockSpawn => {
    return (cmd: string, args: Array<string>, options: unknown): SpawnOutput => {
        const fullCmd = `${cmd} ${args.join(' ')}`.trim();
        for (const key in mockSpawnCommands) {
            if (fullCmd.startsWith(key)) {
                const mockSpawnCommand: MockSpawnCommand = mockSpawnCommands[key];

                const spawnOut = new SpawnOutput();

                let out;
                try {
                    out = mockSpawnCommand(cmd, args, options);
                } catch (err) {
                    if (!(err instanceof Error)) {
                        throw err;
                    }
                    spawnOut.setStderr('Command errored');
                    setTimeout(() => {
                        spawnOut.emit('close', 1);
                    }, 100);
                    return spawnOut;
                }

                spawnOut.setStdout(out.stdout);
                spawnOut.setStderr(out.stderr);
                setTimeout(() => {
                    spawnOut.emit('close', 0);
                }, 100);

                return spawnOut;
            }
        }

        throw Error(`Unknown command: ${fullCmd}`);
    };
};

describe('run', () => {
    beforeEach(() => {
        mockfs({
            [path.join(os.homedir(), '.aws/')]: {},
            [path.join(os.homedir(), '.aws/sso/cache/')]: {},
            [path.join(__dirname, '..', '..', 'package.json')]: fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
        });

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockClear();

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockClear();
    });

    afterEach(() => {
        mockfs.restore();
    });

    test('run', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
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

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
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

    test('run, credentials expiry within window', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(
            mockSpawnCommandsFactory({
                ...defaultSpawnMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso login': (cmd: string, options: unknown): CmdOutput => {
                    const content = {
                        // Expires in 5 minutes
                        expiresAt: minutesInTheFuture(5),
                        region: 'myregion',
                        accessToken: 'myaccesstoken',
                    };
                    const cacheFilePath = path.join(os.homedir(), '.aws/sso/cache/example.json');
                    fs.mkdirSync(path.dirname(cacheFilePath), {
                        recursive: true,
                    });
                    fs.writeFileSync(cacheFilePath, JSON.stringify(content), 'utf8');
                    return emptyOutput;
                },
            }),
        );

        const consoleErrorSpy = jest.spyOn(global.console, 'error').mockImplementation();

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('WARN:', 'This may cause issues when using these credentials with the JS SDK, in particular the AWS CDK.');
        expect(consoleErrorSpy).toHaveBeenCalledWith('WARN:', `Workaround: go to your AWS SSO login URL, click 'Sign out', then re-run this command with --force`);
    });

    test('run, credentials expiry within window, useful error message', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', 'sso_start_url = mystarturl', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(
            mockSpawnCommandsFactory({
                ...defaultSpawnMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso login': (cmd: string, options: unknown): CmdOutput => {
                    const content = {
                        // Expires in 5 minutes
                        expiresAt: minutesInTheFuture(5),
                        region: 'myregion',
                        accessToken: 'myaccesstoken',
                    };
                    const cacheFilePath = path.join(os.homedir(), '.aws/sso/cache/example.json');
                    fs.mkdirSync(path.dirname(cacheFilePath), {
                        recursive: true,
                    });
                    fs.writeFileSync(cacheFilePath, JSON.stringify(content), 'utf8');
                    return emptyOutput;
                },
            }),
        );

        const consoleErrorSpy = jest.spyOn(global.console, 'error').mockImplementation();

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('WARN:', `Workaround: go to mystarturl, click 'Sign out', then re-run this command with --force`);
    });

    test('run, handles expired latest cache file', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "1020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
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

    test('run, handles non-expired latest cache file, but skipExpiryCheck', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "3020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: true,
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

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso get-role-credentials': (cmd: string, options: unknown): CmdOutput => {
                    if (cmd.includes('not_actually_valid_access_token')) {
                        didThrowError = true;
                        throw {
                            stderr: 'An error occurred (UnauthorizedException) when calling the GetRoleCredentials operation: Session token not found or invalid',
                        };
                    } else {
                        const roleCredentialsContent = {
                            roleCredentials: {
                                accessKeyId: 'myaccesskeyid',
                                secretAccessKey: 'mysecretaccesskey',
                                sessionToken: 'mysessiontoken',
                                expiration: new Date(3020, 0, 1, 12, 30, 0).getTime(),
                            },
                        };
                        return {
                            stdout: JSON.stringify(roleCredentialsContent),
                            stderr: '',
                        };
                    }
                },
            }),
        );

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
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

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso get-role-credentials': (cmd: string, options: unknown): CmdOutput => {
                    throw {
                        stderr: 'An error occurred (UnauthorizedException) when calling the GetRoleCredentials operation: Session token not found or invalid',
                    };
                },
            }),
        );

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(
            mockSpawnCommandsFactory({
                ...defaultSpawnMocks,
                'aws sso login': (cmd: string, args: Array<string>, options: unknown): CmdOutput => {
                    awsSsoLoginCallCount++;
                    const fn = defaultSpawnMocks['aws sso login'];
                    return fn(cmd, args, options);
                },
            }),
        );

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
                force: false,
                skipExpiryCheck: false,
            }),
        ).rejects.toThrow(MisbehavingExpiryDateError);

        expect(awsSsoLoginCallCount).toEqual(1);
    });

    test('run, errors if get-role-credentials throws an unexpected error)', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso get-role-credentials': (cmd: string, options: unknown): CmdOutput => {
                    throw {
                        stderr: 'Unknown error occurred',
                    };
                },
            }),
        );

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
                force: false,
                skipExpiryCheck: false,
            }),
        ).rejects.toEqual({ stderr: 'Unknown error occurred' });
    });

    test('run, errors if aws sso login fails to generate a cache file', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(
            mockSpawnCommandsFactory({
                ...defaultSpawnMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws sso login': (cmd: string, options: unknown): CmdOutput => {
                    return emptyOutput;
                },
            }),
        );

        await expect(
            run({
                verbose: false,
                profile: undefined,
                credentialsProcessOutput: false,
                force: false,
                skipExpiryCheck: false,
            }),
        ).rejects.toThrow(NoCachedCredentialsError);
    });

    test('run, credentialsProcessOutput', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: true,
            force: false,
            skipExpiryCheck: false,
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

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        const consoleLogSpy = jest.spyOn(global.console, 'log').mockImplementation();

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: true,
            force: false,
            skipExpiryCheck: false,
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

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        const consoleErrorSpy = jest.spyOn(global.console, 'error').mockImplementation();

        await run({
            verbose: true,
            profile: undefined,
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith('INFO:', 'Starting');
    });

    test('run, custom profile', async () => {
        const configLines = ['[profile myprofile]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "3020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: 'myprofile',
            credentialsProcessOutput: false,
            force: false,
            skipExpiryCheck: false,
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

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(
            mockExecCommandsFactory({
                ...defaultExecMocks,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                'aws --version': (cmd: string, options: unknown): CmdOutput => {
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
                force: false,
                skipExpiryCheck: false,
            }),
        ).rejects.toThrow(BadAWSCLIVersionError);
    });

    test('run, force', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "3020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const credentialsLines = [
            '[default]',
            'aws_access_key_id = myoldaccesskeyid',
            'aws_secret_access_key = myoldsecretaccesskey',
            'aws_session_token = myoldsessiontoken',
            'aws_security_token = myoldsessiontoken',
            '',
        ];
        fs.writeFileSync(path.join(os.homedir(), '.aws/credentials'), credentialsLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: true,
            skipExpiryCheck: false,
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

    test('run, force, no existing credentials file', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const ssoCacheLines = ['{', '  "accessToken": "my_access_token",', '  "expiresAt": "3020-01-01T12:30:00Z",', '  "region": "eu-west-1"', '}'];
        fs.writeFileSync(path.join(os.homedir(), '.aws/sso/cache/valid.json'), ssoCacheLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

        await run({
            verbose: false,
            profile: undefined,
            credentialsProcessOutput: false,
            force: true,
            skipExpiryCheck: false,
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
});

describe('main', () => {
    beforeEach(() => {
        mockfs({
            [path.join(os.homedir(), '.aws/')]: {},
            [path.join(os.homedir(), '.aws/sso/cache/')]: {},
            [path.join(__dirname, '..', '..', 'package.json')]: fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
        });

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockClear();

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockClear();
    });

    afterEach(() => {
        mockfs.restore();
    });

    test('main', async () => {
        const configLines = ['[default]', 'sso_role_name = myssorolename', 'sso_account_id = myssoaccountid', ''];
        fs.writeFileSync(path.join(os.homedir(), '.aws/config'), configLines.join('\n'), 'utf8');

        const execMock = exec as unknown as jest.Mock<void>;
        execMock.mockImplementation(mockExecCommandsFactory(defaultExecMocks));

        const spawnMock = spawn as unknown as jest.Mock<void>;
        spawnMock.mockImplementation(mockSpawnCommandsFactory(defaultSpawnMocks));

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
