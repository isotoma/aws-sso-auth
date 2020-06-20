#!/bin/bash -e

function stderr() {
    >&2 echo "$1"
}

function error() {
    stderr "Error: $1"
    exit 1
}

function info() {
    stderr "Info: $1"
}
    

function main() {
    info "Finding latest version..."
    latest_version="$(curl --silent --header 'Accept: application/vnd.github.v3+json' https://api.github.com/repos/isotoma/aws-sso-auth/releases | grep tag_name | head -n 1 | sed -e 's/.*:\s*//' -e 's/^"//' -e 's/",\?$//')"
    platform_uname="$(uname -s)"
    case "$platform_uname" in
        Linux*)
            platform=linux
            ;;
        Darwin*)
            platform=mac
            ;;
        *)
            error "Unknown platform: $platform_uname"
            ;;
    esac

    info "Downloading to temporary directory..."
    download_url="https://github.com/isotoma/aws-sso-auth/releases/download/$latest_version/aws-sso-auth-$platform"
    tmp_dir="$(mktemp -d -t aws-sso-auth-XXXXXXXX)"
    tmp_download_path="$tmp_dir/aws-sso-auth"
    curl --silent --location "$download_url" --output "$tmp_download_path"

    target_directory_path="/usr/local/bin/aws-sso-auth"

    info "Will install aws-sso-auth executable version=$latest_version, platform=$platform to $target_directory_path"
    info "  Downloaded from: $download_url"
    info "  MD5 checksum: $(md5sum $tmp_download_path || echo unknown)"

    read -p "Are you sure? " -r
    if [[ ! $REPLY =~ ^(Y|y|yes)$ ]]
    then
        rm -rf "$tmp_dir"
        error "Not confirmed, exiting"
    fi

    info "Installing..."
    install -T "$tmp_download_path" "$target_directory_path" || {
        info "Trying again with sudo..."
        sudo install -T --owner=root --group=root "$tmp_download_path" "$target_directory_path"
    }

    rm -rf "$tmp_dir"

    info "Installation succeeded, checking if on PATH using 'which aws-sso-auth'"
    which aws-sso-auth

    info "And checking installed version using 'aws-sso-auth version'"
    aws-sso-auth version
}

main
