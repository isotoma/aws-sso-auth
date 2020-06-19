# aws-sso-auth

AWS SSO is supported by the aws cli v2, but it does not provide credentials for using the AWS SDK (as far as I can work out).

This application leverages the aws cli support to provide a simple way to get credentials for your normal day to day aws usage.

## AWS CLI v2

Only version 2 of the CLI supports SSO. You will need to install this and make sure it is being used.

The Linux installation guide is here:

https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html

## Usage

You will need to have a current SSO session with the AWS CLI. Before using the AWS CLI for SSO you need to configure it with `aws sso configure`. Note that `aws-sso-auth` currently expects you to be using a profile called `default` for your sso login.

Run:

```
aws-sso-auth
```

This checks for temporary credentials in `~/.aws/sso/cache/`, then **overwrites** `~/.aws/credentials` with temporary credentials retrieved using `aws sso get-role-credentials`.

## Development

```
npm install
```

Change code, then, to compile and run:

```
npm run build && node build/bin.js
```

and run the tests with:

```
npm run test
```
