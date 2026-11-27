# Publishing GitHub sign-in

Torchbearer owns its GitHub App authorization. End users need a browser and a GitHub account; they do not install GitHub CLI, register an app, or provide a token.

## One-time publisher registration

1. In the publishing account or organization's GitHub settings, open **Developer settings → GitHub Apps → New GitHub App**.
2. Choose an available name identifying Torchbearer, supply the project's homepage/repository URL, and enable **Device Flow**. Leave **Request user authorization (OAuth) during installation** off; Torchbearer starts its own device authorization.
3. Disable **Active** under webhooks for this local integration. A web authorization callback and hosted authentication service are not used by device flow.
4. Keep permissions minimal. Connecting and displaying the current GitHub account does not need repository write permissions; add permissions only when implementing repository features. For public distribution, allow installation on **Any account**.
5. Leave user access token expiration enabled. Copy the app's **Client ID**, not its numeric App ID. No client secret or app private key is needed for device authorization or refreshing device-issued user tokens.
6. Set `GITHUB_CLIENT_ID` in `backend/config/github_app.py` to this public value before building/distributing a release. It is safe to commit this identifier. Users of that build do not need to configure it themselves.

For local development or a separately branded deployment, override the bundled ID in the launcher's environment:

```powershell
$env:TORCHBEARER_GITHUB_CLIENT_ID = 'YOUR_PUBLIC_GITHUB_APP_CLIENT_ID'
python scripts/dev.py
```

On macOS/Linux:

```sh
TORCHBEARER_GITHUB_CLIENT_ID=YOUR_PUBLIC_GITHUB_APP_CLIENT_ID python scripts/dev.py
```

The current source does not contain a registered publisher Client ID. Without one, Settings explains that GitHub sign-in is unavailable for this build. Do not substitute GitHub CLI's application identity or ask end users for secrets.

## Secure local storage

Install backend dependencies with `python scripts/setup.py`. The bundled `keyring` dependency uses Windows Credential Manager, macOS Keychain, or Linux Secret Service. Linux desktop sessions need an installed, unlocked Secret Service provider such as GNOME Keyring or a compatible KDE service. Headless Linux sessions without that service cannot persist a connection.

Torchbearer selects these OS backends explicitly and never falls back to plaintext files, browser storage, or SQLite for tokens. Each credential is namespaced to the app data directory and connection UUID. A database backup alone cannot restore authorization on another machine; sign in again there.

## References

- [Register a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
- [GitHub App device authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)
- [Refresh device-issued user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens#refreshing-a-user-access-token-with-a-refresh-token)
- [Python keyring](https://keyring.readthedocs.io/en/latest/)
