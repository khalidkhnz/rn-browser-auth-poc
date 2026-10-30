# React Native system-browser auth POC

Proves a React Native app can open the external browser for login and regain control when the website redirects to a custom URL scheme. No WebView.

```
App: tap Login  -->  Linking.openURL(http://<host>:3100/login)  -->  Chrome / Safari
                                                                         |
                                                                  tap Mock Login
                                                                         |
App: shows result  <--  OS deep link  <--  302 myapp://auth/callback?code=demo123
```

## Security

**The mock authorization code is for demonstration only. This is not a secure production authentication mechanism.**

- `demo123` is hardcoded and no credentials are checked.
- Any app can register `myapp://`, so another app on the device could intercept the callback.
- There is no `state` parameter (CSRF) and no PKCE (code interception).
- Nothing is exchanged for a token and nothing is persisted.

For production, use OAuth 2.0 Authorization Code with PKCE plus `state`, exchange the code server-side or with the PKCE verifier, and prefer verified links (Android App Links, iOS Universal Links) over a custom scheme.

## Layout

| Path | What |
| --- | --- |
| `auth-web/api/index.ts` | Mock login site. Node built-ins only, no runtime dependencies. Vercel function. |
| `auth-web/dev-server.ts` | Runs the same handler locally. |
| `.github/workflows/ios-ipa.yml` | Builds an unsigned IPA on a macOS runner. |
| `mobile/App.tsx` | One-screen Expo app. Opens browser, handles callback, shows status. |
| `mobile/app.json` | Sets `"scheme": "myapp"`. |

## Prerequisites

- Node 24. `mise.toml` pins it: run `mise trust && mise install`. Expo SDK 58 needs `^22.13` or `^24.3`, and the site relies on Node 24 running TypeScript directly.
- Android: an Android SDK, a working emulator or device, and JDK 17. React Native 0.88 compiles against SDK 37 with NDK 27.1. Gradle downloads these on the first build, so expect it to take several minutes and a few GB.
- iOS: Xcode with a simulator, and CocoaPods.

**Expo Go will not work.** Expo Go only answers to `exp://`. `myapp://` is registered only in your own binary, so you need a development build. The commands below make one.

## Run

Terminal 1, the site:

```bash
cd auth-web
npm install
npm start
```

Terminal 2, the app:

```bash
cd mobile
npm install
npm run android   # or: npm run ios
```

Then:

1. Open the app and tap **Login**.
2. Chrome or Safari opens the mock login page.
3. Tap **Mock Login**. Safari asks whether to open the app, tap Open.
4. The app returns to the foreground and shows **Authentication Successful** with `Code: demo123`.

Tap **Cancel** instead to see **Authentication Failed** with `Reason: access_denied`.

## Reaching the site

The app picks the site's address like this:

| Target | Address |
| --- | --- |
| Android emulator | `http://10.0.2.2:3100` (emulator alias for the host) |
| iOS simulator | `http://localhost:3100` |
| Physical device | Set `EXPO_PUBLIC_AUTH_URL`, see below |

For a physical device on the same Wi-Fi, use your computer's LAN IP:

```bash
EXPO_PUBLIC_AUTH_URL=http://192.168.1.20:3100 npm run android
```

Port 3100 is the default. To change it, run the site with `PORT=xxxx npm start` and set `EXPO_PUBLIC_AUTH_URL` to match.

## Deployed site

Live at <https://rn-browser-auth-poc.vercel.app/login>. To point a local app at it:

```bash
EXPO_PUBLIC_AUTH_URL=https://rn-browser-auth-poc.vercel.app npm run android
```

Redeploy from `auth-web` with `vercel deploy --prod`.

`vercel.json` names the function explicitly because Vercel otherwise treats the project as a Node backend and ignores `api/`. TypeScript stays on 6.x because Vercel's build calls TypeScript's JS API, which TypeScript 7 no longer has.

## LiveContainer (iOS without a Mac build)

[LiveContainer](https://github.com/LiveContainer/LiveContainer) runs an IPA without installing it. That changes how the callback must work:

- iOS only knows the `livecontainer://` scheme. The guest app's `myapp://` is never registered, so a redirect to it fails.
- `livecontainer://open-url?url=<base64>` does work. LiveContainer decodes it and delivers the original `myapp://auth/callback?...` to the guest, so `App.tsx` handles it the same way.

The site chooses the redirect from a fixed `via=livecontainer` flag, which the IPA build adds to the login URL through `EXPO_PUBLIC_LIVECONTAINER=1`. The site never accepts a redirect URL from the caller, because that would be an open redirect.

To build and run:

1. Run the **Unsigned iOS IPA** workflow in GitHub Actions and download the artifact.
2. In LiveContainer, tap **+** and choose `BrowserAuthPOC-unsigned.ipa`.
3. Open the app and tap **Login**. Safari opens the deployed site.
4. Tap **Mock Login**, then allow Safari to open LiveContainer.

The IPA is unsigned, so it cannot be installed directly on an iPhone. LiveContainer signs it on import. It is built for LiveContainer only: it uses the `livecontainer` scheme, so a second LiveContainer install (`livecontainer2`) would need the site changed.

## Platform configuration

All native config comes from `"scheme": "myapp"` in `mobile/app.json`. `expo prebuild` (run automatically by `expo run:*`) generates it, so no native files are edited by hand. `mobile/android` and `mobile/ios` are generated and gitignored.

**Android**, in `AndroidManifest.xml`:

```xml
<activity android:name=".MainActivity" android:launchMode="singleTask" android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="myapp" />
  </intent-filter>
</activity>
```

`BROWSABLE` lets a browser fire the intent. `singleTask` delivers the callback to the running app instead of starting a second copy.

**iOS**, in `Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>myapp</string>
    </array>
  </dict>
</array>
```

Expo's `ExpoAppSceneDelegate` forwards incoming URLs to `RCTLinkingManager`, so no delegate code is needed here. A bare React Native iOS app has to make those calls itself.

## How the callback is handled

`App.tsx` listens in two places, because which one fires depends on whether the app was already running:

- `Linking.addEventListener('url', ...)`: app was in the background.
- `Linking.getInitialURL()`: the deep link launched the app from cold.

URLs are parsed with `expo-linking`'s `parse()`. For `myapp://auth/callback`, `auth` is the hostname and `callback` is the path. React Native's built-in `URL` lacks `searchParams`, so it isn't used.

The site redirects with a server-side 302 after a form POST rather than from JavaScript. Chrome on Android blocks custom-scheme navigation without a user gesture, and the button tap provides one.

## Production note

This POC uses `Linking.openURL` so the callback is a genuine OS deep link through a real browser. The side effects are Safari's "Open in app?" prompt and a browser tab left open behind the app. Production apps usually use `expo-web-browser`'s `openAuthSessionAsync`, which wraps `ASWebAuthenticationSession` on iOS and Custom Tabs on Android. It removes both side effects, and it is still not a WebView.

## Test the deep link without the browser

```bash
# Android
adb shell am start -a android.intent.action.VIEW -d "myapp://auth/callback?code=demo123"

# iOS simulator
xcrun simctl openurl booted "myapp://auth/callback?code=demo123"
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Browser can't reach the page | Site not running, wrong host, or a physical device without `EXPO_PUBLIC_AUTH_URL`. |
| Tapping Mock Login does nothing, or "address invalid" | App with `myapp` scheme not installed, or you ran it in Expo Go. |
| `/login` shows a different site | Something else owns the port. Check with `lsof -iTCP:3100 -sTCP:LISTEN`. |
| Scheme change has no effect | Rebuild: `npx expo prebuild --clean`, then `npm run android` or `npm run ios`. |
| App stays on "Waiting for browser login…" | You closed the browser without choosing. Tap Login again. |
| "Open debugger to view warnings" toast after returning | Dev-only. The dev-server socket dropped while the app was behind the browser ("Cannot connect to Expo CLI"). Harmless. |
| `[CXX1101] NDK at ... did not have a source.properties file` | Interrupted NDK install. Delete that folder under `$ANDROID_HOME/ndk` and rebuild. |
| `No initial system image for this configuration!` | AVD's system image is incomplete. Reinstall it with `sdkmanager`. |

## Verification status

Tested on an Android 36 emulator with real Chrome: success, cancel, cold start from a deep link, missing code, and an unrelated `myapp://` path being ignored.

Also tested end to end on that emulator against the deployed HTTPS site.

**iOS has not been run**, on a simulator, a device, or in LiveContainer. The `Info.plist` scheme and delegate wiring were checked by reading the generated project, and the LiveContainer redirect was checked by reading LiveContainer's source (v3.8.11).
