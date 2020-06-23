# aws-sso-auth

AWS SSO is supported by the aws cli v2, but it does not provide credentials for using the AWS SDK (as far as I can work out).

This application leverages the aws cli support to provide a simple way to get credentials for your normal day to day aws usage.

## AWS CLI v2

Only version 2 of the CLI supports SSO. You will need to install this and make sure it is being used.

The Linux installation guide is here:

https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html

## Installation

Oneline:
```
$ bash <(curl "https://raw.githubusercontent.com/isotoma/aws-sso-auth/master/install.sh")
```

Or, if you don't like running scripts from the internet:
- download an executable from https://github.com/isotoma/aws-sso-auth/releases
- make it executable with `chmod a+x`
- put it somewhere that is on your `$PATH`

Or, if you don't trust those executables:
- Checkout this repository
- Run `npm run package`
- Take one of the executables from `./dist/`
- put it somewhere that is on your `$PATH`

Or, if you don't trust executables made by pkg:
- Checkout this repository
- Run `npm run build`
- Alias `node /path/to/repo/build/bin.js` to `aws-sso-auth`

## Usage

You will need to have a current SSO session with the AWS CLI. Before using the AWS CLI for SSO you need to configure it with `aws sso configure`. By default, `aws-sso-auth` the profile called `default` for your sso login. Change this with the `--profile` flag if needed.

Run:

```
aws-sso-auth
```

This checks for temporary credentials in `~/.aws/sso/cache/`, then **overwrites** `~/.aws/credentials` with temporary credentials retrieved using `aws sso get-role-credentials`.

## Usage with `credentials_process`

Rather than overwriting `~/.aws/credentials`, provided the SDK/program you need to read AWS credentials can make use of the `credentials_process` option (see https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sourcing-external.html), you can instead put the following in a profile that also has the `sso_...` configuration in `~/.aws/config`:

```
credential_process = /usr/local/bin/aws-sso-auth-executable credentials-process
```
(or a different path, if you've installed elsewhere - note it needs to be an absolute path)

This way, whenever anything needs AWS credentials, it will call that command. This caches credentials in `~/.aws-sso-auth-credentials.json`, rather than touching anything in `~/.aws`.

## Finding version of an executable

Inspect the version of an executable with:
```
aws-sso-auth version
```

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

You can build standalone executables with:

```
npm run package
```

and executables are produced in `./dist/`.
