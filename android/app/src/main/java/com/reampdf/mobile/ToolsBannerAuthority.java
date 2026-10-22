package com.reampdf.mobile;
import java.io.File;
import java.io.IOException;
import java.util.Objects;
import java.net.URI;

/** Active source must be installed assets or a direct native LiveUpdate bundle; JS chooses neither ID nor mode. */
public final class ToolsBannerAuthority {
    public static final String TEST_ID="ca-app-pub-3940256099942544/9214589741";
    public static final class Metadata {
        public final int schema;
        public final String mode,provider,appId,bannerId,consent,rating,debugGeography;
        public final boolean advertising,isTesting,underAge;
        public Metadata(int schema,String mode,boolean advertising,String provider,String appId,String bannerId,boolean testing,String consent,String rating,boolean underAge,String geography){this.schema=schema;this.mode=mode;this.advertising=advertising;this.provider=provider;this.appId=appId;this.bannerId=bannerId;isTesting=testing;this.consent=consent;this.rating=rating;this.underAge=underAge;debugGeography=geography;}
    }
    public static final class Result {
        public final boolean allowed;
        public final String reason;
        private Result(boolean allowed,String reason){this.allowed=allowed;this.reason=reason;}
    }
    private static boolean valid(Metadata m){
        if(m==null||m.schema!=4||!m.advertising||!"google-admob".equals(m.provider)||!"google-ump".equals(m.consent)||!"G".equals(m.rating)||!m.underAge||m.appId==null||!m.appId.matches("ca-app-pub-\\d{16}~\\d{10}")||m.bannerId==null)return false;
        if("android-debug".equals(m.mode))return m.isTesting&&TEST_ID.equals(m.bannerId)&&("EEA".equals(m.debugGeography)||"US".equals(m.debugGeography)||"OTHER".equals(m.debugGeography));
        return "production".equals(m.mode)&&!m.isTesting&&m.debugGeography==null&&m.bannerId.matches("ca-app-pub-\\d{16}/\\d{10}")&&!m.bannerId.contains("3940256099942544");
    }
    public static Result validate(Metadata active,Metadata installed,boolean debuggable,boolean productionVerified){
        if(!valid(active)||!valid(installed))return new Result(false,"invalid-metadata");
        if(!Objects.equals(active.mode,installed.mode)||!Objects.equals(active.appId,installed.appId)||!Objects.equals(active.bannerId,installed.bannerId)||!Objects.equals(active.debugGeography,installed.debugGeography))return new Result(false,"installed-authority-mismatch");
        if(active.isTesting)return new Result(debuggable,debuggable?"debug-test-only":"not-debuggable");
        return new Result(productionVerified,productionVerified?"accepted":"device-acceptance-pending");
    }
    public static String resolveRoot(String path,File files,String remoteServer) throws IOException {
        if(remoteServer!=null&&!remoteServer.isEmpty())return null;
        if("public".equals(path))return "public";
        if(path==null||path.isEmpty())return null;
        File raw=new File(path),canonical=raw.getCanonicalFile(),parent=new File(files,"_capacitor_live_update_bundles").getCanonicalFile();
        // Trusted parent may itself have an OS alias (/data/user/0 or Windows short names).
        // Validate both parent chains and unchanged leaf, not their original text spellings.
        if(!raw.isAbsolute()||raw.getParentFile()==null||!parent.equals(raw.getParentFile().getCanonicalFile())||!parent.equals(canonical.getParentFile())||!raw.getName().equals(canonical.getName())||!canonical.getName().matches("[A-Za-z0-9_-]{1,128}"))return null;
        return canonical.getPath();
    }
    public static boolean isHomeUrl(String current,String localOrigin){
        try{
            URI url=new URI(current),expected=new URI(localOrigin);
            if(url.getHost()==null||expected.getHost()==null||url.getUserInfo()!=null||url.getQuery()!=null||!Objects.equals(url.getScheme(),expected.getScheme())||!url.getHost().equalsIgnoreCase(expected.getHost())||url.getPort()!=expected.getPort())return false;
            String path=url.getRawPath(),fragment=url.getRawFragment();
            return (path==null||path.isEmpty()||path.equals("/"))&&(fragment==null||fragment.isEmpty()||fragment.equals("/"));
        }catch(Exception e){return false;}
    }
    public static boolean requestAllowed(boolean foreground,boolean consent,boolean initialized,int underAge,String rating){return foreground&&consent&&initialized&&underAge==1&&"G".equals(rating);}
}
