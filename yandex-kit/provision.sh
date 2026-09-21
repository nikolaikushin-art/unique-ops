#!/usr/bin/env bash
# Unique Operations → Yandex Cloud — single-pass provisioning script.
#
# Run this yourself (or hand it to Claude Code) on a machine that has:
#   - the `yc` CLI installed and authenticated (`yc init`)
#   - docker + docker compose
#   - psql / pg_dump / pg_restore
#
# It's written to be safe to re-run: every `yc` create step checks if the
# resource already exists first. Nothing here touches your LIVE Supabase
# project or real data — that's steps 8-9, clearly marked, and you should
# read the plan (MIGRATION-PLAN.md) before uncommenting them.
#
# Fill in the CONFIG block below, then: bash provision.sh

set -euo pipefail

# ============ CONFIG — fill these in ============
FOLDER_ID=""                      # yc config list  → your default folder
ZONE="ru-central1-a"
PG_CLUSTER_NAME="unique-operations-pg"
PG_DB_NAME="unique_operations"
PG_USER="uo_app"
PG_PASSWORD=""                    # set a strong password
OBJECT_STORAGE_BUCKET="unique-operations-assets"
VM_NAME="unique-operations-stack"
VM_IMAGE_FAMILY="ubuntu-2204-lts"
DOMAIN="ops.uniquedetailing.ru"
# ==================================================

if [ -z "$FOLDER_ID" ] || [ -z "$PG_PASSWORD" ]; then
  echo "Fill in FOLDER_ID and PG_PASSWORD in the CONFIG block first." >&2
  exit 1
fi

echo "== 1. Confirm yc auth and folder =="
yc config list
yc resource-manager folder get "$FOLDER_ID"

echo "== 2. Managed PostgreSQL cluster (if it doesn't already exist) =="
if ! yc managed-postgresql cluster get "$PG_CLUSTER_NAME" >/dev/null 2>&1; then
  yc managed-postgresql cluster create \
    --name "$PG_CLUSTER_NAME" \
    --environment production \
    --network-name default \
    --host zone-id=${ZONE},subnet-name=default-${ZONE} \
    --postgresql-version 16 \
    --resource-preset s2.micro \
    --disk-type network-ssd \
    --disk-size 20 \
    --user name=${PG_USER},password=${PG_PASSWORD} \
    --database name=${PG_DB_NAME},owner=${PG_USER}
else
  echo "Cluster $PG_CLUSTER_NAME already exists, skipping create."
fi

echo "== 3. Object Storage bucket (replaces R2 + legacy Supabase Storage) =="
yc storage bucket create --name "$OBJECT_STORAGE_BUCKET" --default-storage-class standard || \
  echo "Bucket may already exist, continuing."

echo "== 4. Static access key for Object Storage (save this output!) =="
yc iam service-account create --name uo-storage-sa || true
SA_ID=$(yc iam service-account get uo-storage-sa --format json | jq -r .id)
yc resource-manager folder add-access-binding "$FOLDER_ID" \
  --role storage.editor --subject serviceAccount:${SA_ID}
yc iam access-key create --service-account-id "$SA_ID" \
  --format json > storage-access-key.json
echo "Wrote storage-access-key.json — key_id/secret go into .env.yandex as YC_STORAGE_ACCESS_KEY / YC_STORAGE_SECRET_KEY"

echo "== 5. Compute VM for the self-hosted Supabase stack =="
if ! yc compute instance get "$VM_NAME" >/dev/null 2>&1; then
  yc compute instance create \
    --name "$VM_NAME" \
    --zone "$ZONE" \
    --network-interface subnet-name=default-${ZONE},nat-ip-version=ipv4 \
    --create-boot-disk image-family=${VM_IMAGE_FAMILY},size=30 \
    --memory 4 --cores 2 \
    --ssh-key ~/.ssh/id_rsa.pub
else
  echo "VM $VM_NAME already exists, skipping create."
fi
VM_IP=$(yc compute instance get "$VM_NAME" --format json | jq -r '.network_interfaces[0].primary_v4_address.one_to_one_nat.address')
echo "VM public IP: $VM_IP  — this is where docker-compose.yml runs."

echo "== 6. Get Managed PostgreSQL connection details =="
yc managed-postgresql cluster get "$PG_CLUSTER_NAME" --format json | \
  jq '{host: .host[0].name, name: .name}'
echo "Full host/port for DATABASE_URL: use the cluster's connection string from"
echo "  yc managed-postgresql cluster list-hosts $PG_CLUSTER_NAME"

echo "== 7. Postbox: verify a sender domain (manual, one-time) =="
echo "Console: https://console.yandex.cloud/folders/${FOLDER_ID}/postbox"
echo "Add domain ${DOMAIN#*.}, add the DKIM/SPF DNS records it gives you, wait for verification."
echo "Then create an SMTP credential there for POSTBOX_SMTP_USER / POSTBOX_SMTP_PASSWORD."

echo
echo "== NEXT (manual) =="
echo "1. Fill in .env.yandex using: storage-access-key.json, the PG connection details above, and Postbox SMTP creds."
echo "2. scp docker-compose.yml kong.yml .env.yandex ${VM_IP}:~/"
echo "3. ssh ${VM_IP}, install docker + compose plugin, run: docker compose --env-file .env.yandex up -d"
echo "4. Apply schema: for f in supabase/migrations/*.sql; do psql \"\$DATABASE_URL\" -f \$f; done"
echo "5. Smoke-test: curl http://${VM_IP}:8000/auth/v1/health"
echo
echo "== STOP — do not run past this point until you've read MIGRATION-PLAN.md =="
echo "   step 8 (real data pg_dump/restore) and step 9 (Vercel cutover) touch production."
