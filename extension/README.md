# POMIBERRY Chrome extension (Phase 2 preview)

This optional Manifest V3 extension adds a movable strawberry timer to Chrome webpages and applies the allowlist saved in the POMIBERRY app while a focus session is active. The timer card is visible by default; drag the berry or its title to move it. It is separate from the basic app and must be loaded into Chrome by the user.

## Install for local testing

1. Start POMIBERRY on its default local address with `npm.cmd start`.
2. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this `extension/` folder.
3. Accept Chrome's requested site access. The extension declares `<all_urls>` host access because it must identify top-level navigations to websites that are not allowlisted. When it redirects an already-open tab, it temporarily saves that tab's original URL in Chrome extension storage so it can restore the tab when focus restrictions end. These URLs stay on this device; the extension does not read page contents, cookies, passwords, or Chrome's browsing-history database.
4. Open `http://127.0.0.1:4173`, choose **Settings → Website focus**, add main website domains to **Websites you can choose**, add sign-in/helper domains to the separate field if needed, select **Choose one website for each focus session**, and save.
5. Start a focus session and check one or more domains in the **Websites for this focus session** list. Chrome redirects other already-open website tabs as well as new top-level website navigation. The settings status says protection is active only after Chrome confirms the rules were applied.

POMIBERRY itself stays allowed. The selected website and configured sign-in/helper domains (including their subdomains) stay allowed for that session. Website rules clear for breaks and when a focus session ends; tabs redirected by the extension return to their saved URLs. The blocked page offers a user-started five-minute override. If the app or extension is disconnected, the app must not be treated as proof that filtering is active.

## Limits

- The extension restricts top-level `http`/`https` navigation in Chrome. It does not block embedded frames or subresource requests, Chrome internal pages, other browsers, or desktop applications. It is an aid, not an unbypassable system lock.
- The POMIBERRY widget can appear over webpages in Chrome. It cannot float over unrelated desktop apps; that needs the native Tauri window implementation.
- Website restrictions require the local POMIBERRY preview to remain available at `127.0.0.1:4173` or `localhost:4173`. If that origin or port changes, update the manifest and allow rules together.
- Chrome extension permissions and load steps are browser-controlled; this repository does not install the extension or grant permissions automatically.
