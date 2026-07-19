# Queless Android APK release

The APK is a production release artifact, not source code. Keep it outside the
Git repositories at:

`/var/www/queless.org/releases/android`

The Nginx configuration serves only these public filename shapes:

- `/downloads/queless-latest.apk`
- `/downloads/queless-v1.0.1.apk` (and later semantic versions)

## Publish a signed release

Build the Android **release** variant with the Queless production signing key.
Never upload a debug APK. Verify the artifact before placing it on the server:

```bash
apksigner verify --verbose --print-certs /path/to/queless-v1.0.1.apk
sha256sum /path/to/queless-v1.0.1.apk
```

Create release storage and install the verified artifact:

```bash
install -d -m 0755 /var/www/queless.org/releases/android
install -m 0644 /path/to/queless-v1.0.1.apk \
  /var/www/queless.org/releases/android/queless-v1.0.1.apk
ln -sfn queless-v1.0.1.apk \
  /var/www/queless.org/releases/android/queless-latest.apk
```

Set the matching backend release metadata in the live backend environment:

```dotenv
ANDROID_APP_VERSION=1.0.1
ANDROID_APK_URL=https://queless.org/downloads/queless-latest.apk
ANDROID_RELEASE_NOTES=Services-only Android release with image and scheduling fixes
ANDROID_FORCE_UPDATE=false
ANDROID_RELEASE_DATE=2026-07-14
ANDROID_APK_SIZE=Set this to the verified human-readable file size
ANDROID_APK_SHA256=Set this to the verified release checksum
```

The URL can later be changed to the official Play Store listing without
changing the API contract.

## Enable and verify

Install the `location /downloads/` rules from
`deploy/nginx/queless.org.conf`, then validate before reload:

```bash
nginx -t
systemctl reload nginx
curl -I https://queless.org/downloads/queless-latest.apk
curl -I https://queless.org/downloads/queless-v1.0.1.apk
curl https://queless.org/api/app-version
```

Both APK responses must be HTTPS `200` responses with:

`Content-Type: application/vnd.android.package-archive`

Also download the public URL again and confirm its checksum matches the
verified release artifact:

```bash
curl -L https://queless.org/downloads/queless-latest.apk -o /tmp/queless-latest.apk
sha256sum /tmp/queless-latest.apk /var/www/queless.org/releases/android/queless-v1.0.1.apk
```
