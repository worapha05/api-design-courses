#!/usr/bin/env bash
# สร้าง CA + server/client certs สำหรับ mTLS demo (local only)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
cd "$DIR"

openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 365 \
  -subj "/CN=bootcamp-ca"

openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365

openssl req -newkey rsa:2048 -nodes -keyout client.key -out client.csr \
  -subj "/CN=gateway-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365

rm -f *.csr *.srl
echo "Created certs in $DIR"
ls -la
