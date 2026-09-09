# Ream encryption assessment

Reviewed 10 September 2026 for the standard, free consumer Android app `com.reampdf.mobile`, version 1.1.0 (3), source commit `1000f37`. This is a documented technical self-classification assessment for publisher review, not a BIS-issued CCATS, legal opinion, or approval of every destination/end user.

## Technical inventory

| Use | Implementation | Capability |
| --- | --- | --- |
| Password-protect PDFs | `src/pdf/protectPdf.ts`, `pdf-lib-encrypt` 1.0.3 | AES-256, PDF standard security handler V5/R6/AESV3; Web Crypto AES-CBC and SHA-256/384/512 |
| Read protected PDFs | `pdf-lib-encrypt`, PDF.js 6.2.108 | Standard PDF password-based decryption; the app requests the password and rejects incorrect passwords. No password cracking feature. |
| Web/update transport | Android/Chromium platform HTTPS | Standard TLS supplied by the platform; cleartext traffic disabled |
| Authenticate OTA updates | `src/store/updateManifest.ts`, native LiveUpdate plugin | RSA/SHA-256 signatures and SHA-256 integrity checks; signatures do not encrypt document contents |

The app is a finished PDF/scanning utility. It is not sold as a cryptographic library, programmable cryptographic interface, network infrastructure product, penetration-testing tool, digital-forensics tool, or military/intelligence product. The UI lets users choose a PDF password, not replace cryptographic algorithms or key lengths. Standard legacy RC4 reading in dependencies does not make the algorithm proprietary. No custom/unpublished cryptographic algorithm was found in the reviewed product.

## Classification reasoning

AES-256 means the app should not be described as using only authentication or HTTPS. The reasonable working classification for this finished consumer distribution is **mass-market encryption software, ECCN 5D992.c, through the self-classification route in 15 CFR 740.17(b)(1)**. This is an assessment based on the product and distribution assumptions below, not an assertion that BIS has assigned a classification.

The [current Cryptography Note](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-774/appendix-Supplement%20No.%201%20to%20Part%20774) tests public retail availability, fixed cryptographic functionality, installation without substantial supplier assistance, and availability of technical details. Ream's intended free public Play distribution, general-purpose document features, ordinary Android installation, and fixed standard algorithms support those criteria. The publisher must retain this inventory/source and provide technical details if an authority requests them. An internal testing track is preparation for the stated public product; it does not by itself establish public retail availability.

No reviewed capability places this finished app in the special network, cryptanalytic, open-interface or non-standard-cryptography categories requiring prior classification under 740.17(b)(2)/(b)(3). Do not reuse this conclusion for a separately distributed encryption SDK, customized restricted product, or a product adding such capabilities.

## Filing assessment

**No pre-release BIS filing or annual self-classification report has been identified as necessary for the ordinary finished mass-market app described here.** The applicable [current rule, 740.17(e)(3)](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.17), limits reporting to specified categories; its special definition of executable software does not simply mean every Android APK. BIS's [2021 reporting-change table](https://www.bis.gov/media/documents/table-changes-enc-wa2019-rule-final-version.pdf) confirms the removal for ordinary 5x992.c mass-market items described in (b)(1). Some older/general BIS explanatory pages still use broader annual-report language; the current regulation and specific amendment govern this assessment. No report was sent and no CCATS number was invented.

Publishing source code is a separate question from distributing a finished binary. The [current 742.15(b)](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-742/section-742.15) addresses publicly available encryption source and non-standard cryptography. This assessment does not rely merely on the repository being public.

## Remaining publisher responsibilities

- Confirm that the reviewed free, general consumer product and public distribution accurately describe the intended release. Retain the release hash and this assessment with export records.
- Retain applicable country, end-user and end-use restrictions. A software classification is not universal permission to supply every destination. Google applies its download restrictions; separate website/GitHub distribution must also respect applicable controls.
- Reassess if cryptographic functionality, distribution restrictions, customers or intended uses materially change. Seek BIS or qualified export advice if the actual facts differ from this ordinary consumer scenario.
- The Play export checkbox remains a publisher certification. It is distinct from approval to run a build, and from Google's subsequent app review.

This review resolves the earlier unsupported assumption that AES-256 necessarily creates an outstanding annual filing. It does not retroactively certify previous distributions or the publisher's entire business.
