# imatch-cordova-sample

Sample Apache Cordova app for the [BPI iMatch](https://www.bpiservices.eu/solutions/imatch/) using
[cordova-plugin-imatch](https://github.com/bpiservices/cordova-plugin-imatch) 2.x. It connects to an
iMatch over Bluetooth, captures fingerprints, reads smartcards and reads ICAO travel documents.

## Prerequisites

| | Version |
|---|---|
| Node.js | 20.17 or newer |
| Android | JDK 17 or newer, Android Studio with SDK platform 36 and build tools 36 |
| iOS | macOS with Xcode 15 or newer, CocoaPods not required |
| iMatch SDK | requested from BPI, see below |
| cordova-plugin-imatch | 2.0.0 or newer, from npm |

The Cordova CLI is a dev dependency, so no global install is needed.

## The iMatch SDK

The plugin wraps the native iMatch SDKs. Their binaries are not part of the public repositories.
Request the SDK from BPI and unzip it into this project as `imatch-sdk/`:

```
imatch-sdk/
├── sdk-version.json
├── android/imatchsdk.aar
└── ios/iMatchSDK.xcframework/
```

Only the platforms you build for need to be present. `npm run check:sdk`
shows what will be picked up. Alternatively point `IMATCH_SDK_DIR` at the unzipped folder.

## Run

```
npm install
npm run check:sdk
npm run android        # cordova run android
npm run ios            # cordova run ios
```

`cordova run` adds the platform on first use and stages the SDK into the plugin when it is installed.
After a new SDK drop, run `npm run plugin:unlink` so the plugin is installed again and picks it up.

## Functions

- **Connect** scans for iMatch devices and connects to the one found, or lets you pick one.
  After connecting it shows hardware type, firmware version and battery, and checks whether a
  firmware update is available.
- **Fingerprint** starts a two finger capture on iMatch 45 and 50 (`scanFingerprint`) or a single
  finger capture on iMatch 20 (`scanFingerprintFAP20`). `fp_finished` is treated as the
  completion signal; a 60 second timeout switches the reader off if it never arrives.
- **Smartcard** reads a card with a known ATR and logs the parsed fields.
- **Passport** reads the document whose MRZ is typed in the text field.
  DG1 and DG2 are shown.
- **Update** flashes the firmware bundled with the SDK and shows progress.

## More information

- [cordova-plugin-imatch README](https://github.com/bpiservices/cordova-plugin-imatch#readme) for the JS API
