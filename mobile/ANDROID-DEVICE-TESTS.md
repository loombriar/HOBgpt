# Android release evidence — physical device required

**Release status: BLOCKED until every gate below is evidenced on a physical Android device.** A web test, unsigned APK, or CI build is not a device release test.

Record: tester ______ | date ______ | phone model ______ | Android version ______ | device API ______ | app version ______ | Git SHA ______ | release AAB SHA-256 ______ | upload certificate SHA-256 ______ | Play Console upload certificate SHA-256 ______

| Gate | Physical-device procedure | Result / evidence |
| --- | --- | --- |
| API 36+ | Inspect the **final signed AAB** with bundletool and record targetSdkVersion; require >=36 | NOT TESTED |
| Signing | Compare signed AAB certificate fingerprint with Play Console upload certificate; install release-equivalent signed build | NOT TESTED |
| Permissions | Inspect merged manifest; confirm no unneeded sensitive permissions. Grant/deny photo selection and verify app continues to work | NOT TESTED |
| Crashes/ANRs | Cold start, force-stop/relaunch, rotate, background/foreground, low network; collect logcat and Android vitals evidence | NOT TESTED |
| Login | Customer code login, logout, session restore/expiry; designer sign-in; test Android keyboard and authentication return | NOT TESTED |
| Checkout | Stripe **test-mode** successful checkout, cancellation, external browser/app switch and return, order confirmation; no live card charges | NOT TESTED |
| Uploads | Designer photo chooser, multiple photos, HEIC/JPEG/PNG, invalid file, denied selection, interrupted network | NOT TESTED |
| Back | Gesture and hardware Back from login, product, cart, photo picker, checkout, and external return; check no unintended app exit | NOT TESTED |
| Layout | Android 16 edge-to-edge, status/nav bars, keyboard overlap, portrait/landscape and accessibility labels | NOT TESTED |
| Privacy | Confirm in-app policy URL opens; Play Console Data safety matches actual SDKs, collection, sharing, retention and deletion flow | NOT TESTED |

## Evidence to attach

Attach the signed AAB fingerprint and bundletool manifest output; merged AndroidManifest.xml; phone screenshots or screen recording of each journey; timestamped logcat/crash report; CI artifact/run URL; and tester's pass/fail notes. Do not upload private customer data, sign-in codes, keystores, or payment credentials.

## Release decision

**NO-GO** until all gates pass, the final AAB is signed with the approved upload key, and Play Console declarations are reviewed. CI verifies compilation only; it cannot confirm phone behavior.
