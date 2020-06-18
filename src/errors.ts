export class ApplicationError extends Error {
    readonly prefix: string = 'UnknownError';
    readonly exitCode: number = 1;

    constructor(message: string) {
        super(message);
        this.message = `${this.prefix}: ${message}`;
    }
}

export class ArgumentsError extends ApplicationError {
    readonly prefix = 'ArgumentsError';
}

export class MissingSSOConfigError extends ApplicationError {
    readonly prefix = 'MissingSSOConfigError';
}

export class NoCachedCredentialsError extends ApplicationError {
    readonly prefix = 'NoCachedCredentialsError';
}

export class UnexpectedGetRoleCredentialsOutputError extends ApplicationError {
    readonly prefix = 'UnexpectedGetRoleCredentialsOutputError';
}
