package dev.countryofgod.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class SitePolicy {
    enum Destination { INTERNAL, EXTERNAL, BLOCKED }

    private final URI origin;

    SitePolicy(String siteUrl) {
        origin = URI.create(siteUrl);
    }

    Destination classify(String address) {
        try {
            URI target = new URI(address);
            String scheme = target.getScheme();
            if (scheme == null || target.getRawUserInfo() != null) {
                return Destination.BLOCKED;
            }
            scheme = scheme.toLowerCase(Locale.ROOT);
            if (scheme.equals("mailto")) {
                return Destination.EXTERNAL;
            }
            if ((!scheme.equals("https") && !scheme.equals("http")) || target.getHost() == null) {
                return Destination.BLOCKED;
            }
            if (scheme.equalsIgnoreCase(origin.getScheme()) &&
                    target.getHost().equalsIgnoreCase(origin.getHost()) &&
                    port(target) == port(origin)) {
                return Destination.INTERNAL;
            }
            return Destination.EXTERNAL;
        } catch (URISyntaxException | IllegalArgumentException exception) {
            return Destination.BLOCKED;
        }
    }

    private static int port(URI address) {
        return address.getPort() >= 0 ? address.getPort()
                : ("https".equalsIgnoreCase(address.getScheme()) ? 443 : 80);
    }
}
