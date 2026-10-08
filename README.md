# Canopy

Self-hosted, offline-first map for managing a fleet of field-deployed acoustic recorders. Field staff see
every device on a map, record service visits, move and add devices, and keep working without a signal;
changes sync when the connection returns.

- Map with clustering for 5,000+ devices, search and filters (category, status, site group)
- Add devices at the GPS position or by tapping the map; drag to correct; full location history
- Status changes with history and one-tap quick actions
- Maintenance and rotation lists, with route hand-off to Google Maps and Apple Maps
- Works offline: local database on the phone, outbox, automatic sync, downloadable offline map areas
- Installable as an app (PWA); self-hosted map tiles from OpenStreetMap; no third-party services
- Access and activity logs, CSV/GeoJSON export, CSV import

Licensed under the [MIT License](LICENSE). Dependencies are permissively licensed, see
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Quick start

Requirements: a Linux server (x86_64 or arm64) with Docker Engine and the Compose plugin.

```bash
git clone https://github.com/ocelik94/canopy-map.git && cd canopy-map
cp .env.example .env
```

Edit `.env`: set `CANOPY_HOST` and a strong `ADMIN_USERNAME` / `ADMIN_PASSWORD` (there is no default
password; the admin is created on first start only). Then:

```bash
docker compose up -d
```

Open `https://<CANOPY_HOST>`. To add more admins later:

```bash
docker compose exec app node scripts/create-admin.ts <username>
```

The image is published as `ghcr.io/ocelik94/canopy-map` for every release (`1.2.3`, `1.2`, `1`,
`latest`); pin a version with `CANOPY_VERSION` in `.env`.

## HTTPS and hostnames

Service workers (offline mode) and GPS need HTTPS. Caddy terminates TLS, configured in `.env`:

| Setup                                   | `CANOPY_HOST`      | `CADDY_TLS`       |
| --------------------------------------- | ------------------ | ----------------- |
| Local network, Caddy's own CA (default) | `canopy-map.local` | `internal`        |
| Public domain, Let's Encrypt            | `maps.example.com` | `you@example.com` |

Devices must reach the server under exactly `CANOPY_HOST`: use mDNS (`avahi-daemon` and hostname
`canopy-map` give `canopy-map.local`), a DNS record on your router, or a hosts file entry.

With `CADDY_TLS=internal`, every device must trust Caddy's root certificate once:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

- **iPhone/iPad:** open the file in Safari, install the profile under Settings → General → VPN & Device
  Management, then enable it under Settings → General → About → Certificate Trust Settings.
- **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
- **Windows:** install into "Trusted Root Certification Authorities"
  (`certutil -addstore -f ROOT caddy-root.crt`).
- **macOS:** add to the System keychain and set it to "Always Trust".
- **Linux:** copy to `/usr/local/share/ca-certificates/` and run `sudo update-ca-certificates`
  (Fedora: `/etc/pki/ca-trust/source/anchors/` and `sudo update-ca-trust`).
- **Firefox:** Settings → Privacy & Security → Certificates → Import, trust for websites.

Keep the `caddy_data` volume: it holds the CA, and deleting it means every device must trust a new one.

To install Canopy as an app: Safari → Share → Add to Home Screen (iPhone), or Chrome → Install app
(Android). Installed apps keep their offline data reliably.

## Map tiles

Canopy serves vector tiles from a [PMTiles](https://github.com/protomaps/PMTiles) archive built from
OpenStreetMap; it never uses the public OpenStreetMap tile servers. Build an archive for your region with
[Planetiler](https://github.com/onthegomap/planetiler) (Geofabrik region names such as `hessen`,
`bayern` or `germany`):

```bash
docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx4g" -v "$PWD/data":/data \
  ghcr.io/onthegomap/planetiler:latest --download --area=hessen --output=/data/hessen.pmtiles
```

Hessen takes a few minutes (about 210 MB); all of Germany needs about 8 GB RAM, 40 GB of temporary disk
and up to an hour (about 4–6 GB). Copy the archive into the tiles volume:

```bash
docker compose --profile tools run --rm -v "$PWD/data/hessen.pmtiles:/in/hessen.pmtiles:ro" tiles
```

Tile URLs include the archive version, so phones discard cached tiles from an older archive
automatically; saved offline areas must then be downloaded again. Before a field trip, open the map on
Wi-Fi and use the download button to save the area for offline use.

## Backup, restore and updates

```bash
docker/backup.sh                       # consistent database snapshot and photos into ./backups
docker/restore.sh backups/canopy-db-….db.gz [backups/canopy-photos-….tar.gz]
```

Backups keep 30 days by default (`RETENTION_DAYS`, `BACKUP_DIR`). Run them daily with cron:

```cron
15 3 * * * /opt/canopy-map/docker/backup.sh >> /var/log/canopy-backup.log 2>&1
```

Also keep a copy of `.env` and the `caddy_data` volume. To update:

```bash
git pull && docker compose pull && docker compose up -d
```

Database migrations run automatically when the app starts.

## How offline sync works

The phone's IndexedDB is the working copy. Every change (create, edit, move, status, delete) is written
locally together with entries in a persistent outbox, so nothing is lost if the app is closed or the
phone restarts. When the connection returns (detected by `online` events and a health check every 30
seconds), the outbox is pushed, then newer changes are pulled.

- Records have client-generated UUIDs; every push is idempotent, so a retried push never duplicates.
- Devices use last-write-wins per record (newest `updatedAt`, ties broken by user id; timestamps from
  the future are clamped).
- Status and location histories are append-only and merged, so no history entry is ever lost.
- Deletes are soft deletes and sync like any other change.

The header shows online/offline state, pending changes, last sync time and errors.

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the
Open Database License (ODbL). Vector tile schema © [OpenMapTiles](https://openmaptiles.org/)
(CC-BY 4.0). Both are shown in the map.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see [SECURITY.md](SECURITY.md).
