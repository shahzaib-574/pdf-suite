# Ream 1.2.1 (7) signed candidate record

**This candidate was not uploaded to Google Play and was not published through
the OTA channel.**

Protected production workflow
[`36581089000`](https://github.com/shahzaib-574/pdf-suite/actions/runs/36581089000)
built and verified the signed APK, AAB and private R8 mapping from exact source
commit `aaeca68531169bd28a1676fccb6cf3df81f5d867`. The workflow passed package,
version, signature, AdMob production-mode, ZIP/ELF alignment and artifact-hash
checks. The generated manifest is preserved byte-for-byte as
[`RELEASE_1.2.1_MANIFEST.txt`](RELEASE_1.2.1_MANIFEST.txt).

The downloaded APK, AAB and private mapping remain in the ignored local candidate
directory `tmp/production-aab-run7/`; all three SHA-256 values were independently
matched to the preserved manifest. The mapping file is private build evidence and
is intentionally not committed.

Later commit `2f8837fc1321b40ef51a1b3282f57c9aa6ac63d8` changes only the 16 KB smoke-test
script. Exact-head protected capture
[`36583170884`](https://github.com/shahzaib-574/pdf-suite/actions/runs/36583170884)
then passed API 36 visual capture and the signed API 35 16 KB PDF-reader,
native-camera and stable-process smoke.
