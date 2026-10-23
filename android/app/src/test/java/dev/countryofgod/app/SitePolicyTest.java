package dev.countryofgod.app;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public final class SitePolicyTest {
    private final SitePolicy policy = new SitePolicy("https://example.com/");

    @Test
    public void keepsPagesAndIpodHistoryInsideApp() {
        assertEquals(SitePolicy.Destination.INTERNAL, policy.classify("https://example.com/#ipod-music"));
        assertEquals(SitePolicy.Destination.INTERNAL, policy.classify("https://example.com/p/test?q=1"));
        assertEquals(SitePolicy.Destination.INTERNAL, policy.classify("https://EXAMPLE.COM:443/admin"));
    }

    @Test
    public void opensOtherOriginsAndEmailExternally() {
        assertEquals(SitePolicy.Destination.EXTERNAL, policy.classify("https://other.example/"));
        assertEquals(SitePolicy.Destination.EXTERNAL, policy.classify("http://example.com/"));
        assertEquals(SitePolicy.Destination.EXTERNAL, policy.classify("https://example.com:8443/"));
        assertEquals(SitePolicy.Destination.EXTERNAL, policy.classify("mailto:editor@example.com"));
    }

    @Test
    public void rejectsLocalFilesScriptsAndIntentInjection() {
        for (String address : new String[] {"file:///sdcard/test", "content://test", "javascript:alert(1)",
                "intent://example.com/#Intent;scheme=https;end", "data:text/html,test", "about:blank",
                "https://user:pass@example.com/", "https://example.com@evil.example/", "not a url"}) {
            assertEquals(address, SitePolicy.Destination.BLOCKED, policy.classify(address));
        }
    }

    @Test
    public void supportsLocalPreviewWithoutTrustingOtherPorts() {
        SitePolicy local = new SitePolicy("http://10.0.2.2:3000/");
        assertEquals(SitePolicy.Destination.INTERNAL, local.classify("http://10.0.2.2:3000/admin"));
        assertEquals(SitePolicy.Destination.EXTERNAL, local.classify("http://10.0.2.2:3001/"));
    }
}
