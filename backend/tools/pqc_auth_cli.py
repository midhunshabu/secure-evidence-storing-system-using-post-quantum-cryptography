#!/usr/bin/env python3
"""CLI helper to generate and use client-side PQC auth keys."""

import argparse
import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.modules.pqc_engine import pqc_engine


def cmd_generate(args):
    keypair = pqc_engine.generate_keypair("sig")
    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    public_path = os.path.join(out_dir, "client_auth_public.key")
    secret_path = os.path.join(out_dir, "client_auth_secret.key")

    with open(public_path, "w", encoding="utf-8") as f:
        f.write(keypair["public_key"])
    with open(secret_path, "w", encoding="utf-8") as f:
        f.write(keypair["secret_key"])

    print(f"Algorithm: {keypair['algorithm']}")
    print(f"Public key: {public_path}")
    print(f"Secret key: {secret_path}")


def _read_secret(args):
    if args.secret_key:
        return args.secret_key.strip()
    if args.secret_key_file:
        with open(args.secret_key_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    raise ValueError("Provide --secret-key or --secret-key-file")


def cmd_sign(args):
    secret_key = _read_secret(args)

    # Basic input guard for accidental malformed values.
    base64.b64decode(secret_key)

    signature = pqc_engine.sign(args.challenge, secret_key)
    print(signature)


def build_parser():
    parser = argparse.ArgumentParser(description="PQC auth signer tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate client auth PQC keypair")
    generate_parser.add_argument("--out-dir", default=".", help="Output directory for key files")
    generate_parser.set_defaults(func=cmd_generate)

    sign_parser = subparsers.add_parser("sign", help="Sign a login challenge")
    sign_parser.add_argument("--challenge", required=True, help="Challenge string from /api/auth/login-challenge")
    sign_parser.add_argument("--secret-key", help="Base64 secret key string")
    sign_parser.add_argument("--secret-key-file", help="Path to secret key file")
    sign_parser.set_defaults(func=cmd_sign)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
