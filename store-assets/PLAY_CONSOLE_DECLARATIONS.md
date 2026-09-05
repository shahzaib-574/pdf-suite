# Play Console declarations — ad-free build

Prepared 5 September 2026. This is a reviewable draft, not a record of submitted Console answers. Confirm the actual uploaded bundle and every version still distributed on other tracks before changing app-wide disclosures.

| Item | Draft for this ad-free build |
| --- | --- |
| Contains ads | No. AdMob and its native dependency have been removed, not merely hidden. |
| Advertising ID | No. Verify the merged artifact has no AD_ID or AdServices permissions. |
| Data collected by Ream | No off-device document, account, advertising or analytics collection is implemented in this build. |
| Data shared by Ream | No SDK sharing is implemented. User-initiated external Save/Share sends only the file the user chooses to their chosen destination. Review Google's user-initiated-transfer exception for the final form. |
| App access | All tools work without a Ream account or login. |
| Camera | Optional camera access for scanning; gallery/file picker remains available. No broad storage access. |
| Target audience / content rating | Publisher must answer truthfully for the intended audience. Removing ads does not automatically establish a child-directed audience or a rating. The former ad-specific adult-only build gate has been removed. |
| Account deletion | No account-creation feature. Local files can be deleted individually or cleared in Settings. |

Data safety describes the sum of data practices across currently distributed versions, so do not replace an existing ad-supported disclosure solely because a new internal build is ad-free. Internal-only testing is exempt from Data safety inclusion, but public/closed/open distribution has additional requirements. [Google Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

Declare ads based on the distributed product. [Google app-content review guidance](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en).

The bundled privacy policy is `public/privacy.html`. Publish the matching policy to the listing's public policy URL before broader distribution; this local edit has not updated the hosted page. The legacy `app-ads.txt` is not required for this build and is not packaged in the application.

Before upload: verify signed artifact permissions and absence of ad components; review all active tracks; complete device QA; confirm version code exceeds previous uploads; publish the matching policy; review the Console's final saved summaries. Do not mark these steps complete from a web build alone.
