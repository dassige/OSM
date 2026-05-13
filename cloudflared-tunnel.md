# Cloudflare Tunnel Setup Guide

This guide explains how to expose the OpReady application to the internet over **HTTPS** using a Cloudflare Tunnel (`cloudflared`). This is the recommended approach when you already have a Cloudflare account and do not want to manage SSL certificates or open inbound firewall ports.

---

## How It Works

```
Browser (HTTPS)
      │
  Cloudflare edge     ← TLS termination, DDoS protection, your Cloudflare plan
      │
  cloudflared daemon  ← outbound-only encrypted tunnel running on your server
      │
  OpReady (:812)      ← Node.js app, unchanged, plain HTTP internally
```

`cloudflared` creates a persistent **outbound** connection from your server to Cloudflare's edge. No inbound ports need to be opened on your firewall or router. Cloudflare handles HTTPS for all incoming browser traffic; your app sees only plain HTTP on localhost.

---

## Prerequisites

- A Cloudflare account with your domain (`dassig.net` or similar) added and its DNS managed by Cloudflare.
- The OpReady app running and reachable on its local port (e.g. `http://localhost:812`).
- A Linux server with `sudo` access (Debian/Ubuntu instructions below; RPM variants noted where they differ).

---

## 1. Install `cloudflared`

**Debian / Ubuntu:**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
     -o cloudflared.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb
```

**RHEL / CentOS / Fedora:**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.rpm \
     -o cloudflared.rpm
sudo rpm -ivh cloudflared.rpm
rm cloudflared.rpm
```

**Verify the installation:**
```bash
cloudflared --version
```

---

## 2. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

`cloudflared` prints a URL. Open it in a browser, log in to your Cloudflare account, and click the domain you want to use. A certificate is saved to `~/.cloudflared/cert.pem` — this is your account-level credential and is needed only for management commands (create, delete, route DNS). It is not used at runtime.

---

## 3. Create the Tunnel

```bash
cloudflared tunnel create opready
```

This creates a named tunnel and saves a **tunnel credentials file** at:
```
~/.cloudflared/<tunnel-id>.json
```

The tunnel ID (a UUID) is printed on screen. Copy it — you will need it in the next step.

To list existing tunnels at any time:
```bash
cloudflared tunnel list
```

---

## 4. Create the Configuration File

Create (or edit) the config file at `~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: dassig.net
    service: http://localhost:812
  - service: http_status:404
```

> **Notes:**
> - Replace `<your-tunnel-id>` in both lines with the UUID from step 3.
> - The path in `credentials-file` assumes you are running as `root`. If running as another user, replace `/root` with that user's home directory (e.g. `/home/ubuntu`).
> - To use a subdomain (e.g. `app.dassig.net`), change the `hostname` value accordingly.
> - The final `- service: http_status:404` is a required catch-all rule; leave it as-is.

### Multiple hostnames (optional)

If you want to expose OpReady on a subdomain while keeping the apex domain for something else:

```yaml
ingress:
  - hostname: app.dassig.net
    service: http://localhost:812
  - service: http_status:404
```

---

## 5. Route DNS to the Tunnel

```bash
cloudflared tunnel route dns opready dassig.net
```

This automatically creates a `CNAME` record in your Cloudflare DNS pointing `dassig.net` to the tunnel endpoint. You can verify it in the Cloudflare dashboard under **DNS → Records** — it will appear as a proxied (orange cloud) CNAME.

If you used a subdomain in step 4, route that instead:
```bash
cloudflared tunnel route dns opready app.dassig.net
```

---

## 6. Test the Tunnel Manually

Before installing it as a service, run the tunnel in the foreground to confirm it works:

```bash
cloudflared tunnel run opready
```

Open `https://dassig.net` in a browser. If OpReady loads correctly over HTTPS, the tunnel is working. Press `Ctrl+C` to stop.

---

## 7. Run as a System Service

Install and start `cloudflared` as a `systemd` service so it starts automatically on reboot:

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Check the service is running:
```bash
sudo systemctl status cloudflared
```

View live logs:
```bash
sudo journalctl -u cloudflared -f
```

---

## 8. Cloudflare Dashboard — SSL/TLS Setting

In the Cloudflare dashboard, go to your domain → **SSL/TLS → Overview** and confirm the encryption mode is set to **Full** (not *Flexible*).

| Mode | Meaning |
|---|---|
| **Flexible** | Browser→Cloudflare is HTTPS; Cloudflare→your server is plain HTTP. Works, but not ideal. |
| **Full** | Browser→Cloudflare is HTTPS; Cloudflare→your server is also HTTPS. Requires a cert on your server — not applicable here since we use a tunnel. |
| **Full (Strict)** | Same as Full but validates the cert. Not needed for tunnel setups. |

For a Cloudflare Tunnel, **Full** is the recommended setting. Cloudflare encrypts the tunnel connection itself regardless of this setting, so the app stays secure.

---

## 9. Verify PWA Works

Once the tunnel is active:

1. On your Android device, open Chrome and navigate to `https://dassig.net`.
2. Wait a few seconds — the **Install OpReady** banner should slide in at the top of the page.
3. From a desktop Chrome browser, open DevTools → **Application → Service Workers** to confirm the service worker is registered with status `activated and is running`.

If the banner does not appear on the first visit, try a hard reload (`Ctrl+Shift+R`) — the service worker registers in the background on first load and the install prompt appears from the second visit onwards.

---

## Troubleshooting

### Tunnel not connecting

```bash
sudo journalctl -u cloudflared -n 50
```

Common causes:
- `credentials-file` path in `config.yml` is wrong or the file has incorrect permissions.
- The tunnel ID in `config.yml` does not match the credentials file name.
- `cloudflared` was not re-authenticated after the `cert.pem` expired (certs expire after ~10 years — unlikely, but run `cloudflared tunnel login` again if needed).

### Site loads but shows the wrong app / 404

Check the `ingress` section in `config.yml`. The `hostname` must exactly match the domain in the browser (including or excluding `www`).

### Service worker not registering

Open Chrome DevTools on the device → **Application → Service Workers**. If it shows an error, it is almost always a non-HTTPS origin. Confirm the browser address bar shows `https://` (not `http://`).

### DNS not propagating

Run `cloudflared tunnel route dns opready <hostname>` again — it is idempotent. Check the Cloudflare DNS dashboard to confirm the CNAME record exists and is proxied (orange cloud icon).

---

## Updating `cloudflared`

```bash
sudo systemctl stop cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
     -o cloudflared.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb
sudo systemctl start cloudflared
cloudflared --version
```

---

## Uninstalling

```bash
sudo systemctl stop cloudflared
sudo cloudflared service uninstall
sudo dpkg -r cloudflared          # Debian/Ubuntu
# or: sudo rpm -e cloudflared     # RHEL/CentOS

cloudflared tunnel delete opready  # removes the tunnel from Cloudflare
```

Remove the DNS record manually in the Cloudflare dashboard under **DNS → Records**.
