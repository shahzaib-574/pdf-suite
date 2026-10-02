package com.reampdf.mobile;
import java.io.File;
import org.junit.Test;
import static org.junit.Assert.*;
public class ToolsBannerAuthorityTest {
    private static final String APP="ca-app-pub-0000000000000000~0000000000";
    private static final String UNIT="ca-app-pub-0000000000000000/0000000000";
    private ToolsBannerAuthority.Metadata metadata(String mode,String id) {
        return new ToolsBannerAuthority.Metadata(4,mode,true,"google-admob",APP,id,mode.equals("android-debug"),"google-ump","G",true,mode.equals("android-debug")?"OTHER":null);
    }
    @Test public void testIdAcceptedOnlyInMatchingDebugMode() {
        ToolsBannerAuthority.Metadata m=metadata("android-debug",ToolsBannerAuthority.TEST_ID);
        assertTrue(ToolsBannerAuthority.validate(m,m,true,false).allowed);
        assertFalse(ToolsBannerAuthority.validate(m,m,false,false).allowed);
        assertFalse(ToolsBannerAuthority.validate(metadata("production",UNIT),m,true,true).allowed);
    }
    @Test public void productionRemainsDisabledUntilDeviceAcceptance() {
        ToolsBannerAuthority.Metadata m=metadata("production",UNIT);
        assertFalse(ToolsBannerAuthority.validate(m,m,true,false).allowed);
        assertTrue(ToolsBannerAuthority.validate(m,m,false,true).allowed);
    }
    @Test public void malformedMissingAndWebsiteConfigurationDenied() {
        ToolsBannerAuthority.Metadata m=metadata("android-debug",ToolsBannerAuthority.TEST_ID);
        assertFalse(ToolsBannerAuthority.validate(null,m,true,false).allowed);
        assertFalse(ToolsBannerAuthority.validate(metadata("website",ToolsBannerAuthority.TEST_ID),m,true,false).allowed);
        assertFalse(ToolsBannerAuthority.validate(new ToolsBannerAuthority.Metadata(3,"android-debug",true,"google-admob",APP,ToolsBannerAuthority.TEST_ID,true,"google-ump","G",true,"OTHER"),m,true,false).allowed);
    }
    @Test public void otaCannotChangeApprovedUnitOrAudience() {
        ToolsBannerAuthority.Metadata m=metadata("android-debug",ToolsBannerAuthority.TEST_ID);
        assertFalse(ToolsBannerAuthority.validate(metadata("android-debug","other-unit"),m,true,false).allowed);
        assertFalse(ToolsBannerAuthority.validate(new ToolsBannerAuthority.Metadata(4,"android-debug",true,"google-admob",APP,ToolsBannerAuthority.TEST_ID,true,"google-ump","G",false,"OTHER"),m,true,false).allowed);
    }
    @Test public void activeOtaRootSelectedInsteadOfPackagedMetadata() throws Exception {
        File files=new File(System.getProperty("java.io.tmpdir"),"ream-authority-fixture");
        assertEquals("public",ToolsBannerAuthority.resolveRoot("public",files,null));
        File bundle=new File(files,"_capacitor_live_update_bundles/test-one");
        assertEquals(bundle.getCanonicalPath(),ToolsBannerAuthority.resolveRoot(bundle.getPath(),files,null));
        assertNotEquals(ToolsBannerAuthority.resolveRoot(bundle.getPath(),files,null),ToolsBannerAuthority.resolveRoot(new File(files,"_capacitor_live_update_bundles/test-two").getPath(),files,null));
    }
    @Test public void escapeUnknownPathAndRemoteServerDenied() throws Exception {
        File files=new File(System.getProperty("java.io.tmpdir"),"ream-authority-fixture");
        assertNull(ToolsBannerAuthority.resolveRoot(new File(files,"_capacitor_live_update_bundles/../outside").getPath(),files,null));
        assertNull(ToolsBannerAuthority.resolveRoot(files.getPath(),files,null));
        assertNull(ToolsBannerAuthority.resolveRoot("public",files,"https://example.com"));
        assertNull(ToolsBannerAuthority.resolveRoot(new File(files,"_capacitor_live_update_bundles/a/nested").getPath(),files,null));
    }
    @Test public void nativeHomeRequiresExactLocalOriginAndHomeFragment() {
        String local="https://localhost";
        assertTrue(ToolsBannerAuthority.isHomeUrl("https://localhost/#/",local));
        assertTrue(ToolsBannerAuthority.isHomeUrl("https://localhost/",local));
        for(String url:new String[]{"https://localhost/#/settings/","https://localhost/#/recents/","https://localhost/#/tool/merge/","https://example.com/","https://localhost.evil/","http://localhost/","https://localhost:444/","https://user@localhost/","https://localhost/other/#/","not a URI"}){
            assertFalse(url,ToolsBannerAuthority.isHomeUrl(url,local));
        }
    }
    @Test public void requestRequiresForegroundConsentInitializationAndExistingAudiencePolicy() {
        assertTrue(ToolsBannerAuthority.requestAllowed(true,true,true,1,"G"));
        assertFalse(ToolsBannerAuthority.requestAllowed(false,true,true,1,"G"));
        assertFalse(ToolsBannerAuthority.requestAllowed(true,false,true,1,"G"));
        assertFalse(ToolsBannerAuthority.requestAllowed(true,true,false,1,"G"));
        assertFalse(ToolsBannerAuthority.requestAllowed(true,true,true,-1,"G"));
        assertFalse(ToolsBannerAuthority.requestAllowed(true,true,true,1,"PG"));
    }
}
