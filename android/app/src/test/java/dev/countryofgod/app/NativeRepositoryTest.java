package dev.countryofgod.app;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public final class NativeRepositoryTest {
    private final URI site = URI.create("https://example.com/");

    @Test
    public void permitsHttpSiteOnlyForDebugAndKeepsRequestsOnThatOrigin() throws IOException {
        URI local = NativeRepository.siteAddress("http://localhost:3000/", true);
        assertEquals(URI.create("http://localhost:3000/api/guestbook"),
                NativeRepository.requestAddress(local, "/api/guestbook"));
        assertThrows(IllegalArgumentException.class,
                () -> NativeRepository.siteAddress("http://localhost:3000/", false));
        for (String path : new String[] {"http://localhost:3001/api/guestbook",
                "http://other.example:3000/api/guestbook", "https://localhost:3000/api/guestbook"}) {
            assertThrows(IOException.class, () -> NativeRepository.requestAddress(local, path));
        }
    }

    @Test
    public void acceptsHttpsForBothBuildTypesAndRejectsInvalidSiteUrls() {
        assertEquals(site, NativeRepository.siteAddress(site.toString(), true));
        assertEquals(site, NativeRepository.siteAddress(site.toString(), false));
        for (boolean debug : new boolean[] {true, false}) {
            for (String address : new String[] {"https://example.com/?query=1", "https://example.com/#fragment",
                    "ftp://example.com/", "https://user:pass@example.com/"}) {
                assertThrows(IllegalArgumentException.class, () -> NativeRepository.siteAddress(address, debug));
            }
        }
    }

    @Test
    public void resolvesContentAndApiPathsOnConfiguredOrigin() throws IOException {
        for (String path : new String[] {"/daily-manifest.json", "/daily/pub/2026_10_15.txt",
                "/api/articles", "/api/guestbook?limit=12&page=2", "/api/echoes?article=daily%3Aone",
                "/api/drafts?slot=echo%3Aone"}) {
            assertEquals("https://example.com" + path, NativeRepository.requestAddress(site, path).toString());
        }
        assertEquals(URI.create("https://EXAMPLE.COM:443/api/daily"),
                NativeRepository.requestAddress(site, "https://EXAMPLE.COM:443/api/daily"));
    }

    @Test
    public void rejectsExternalAndDowngradeRequestsIncludingRedirectTargets() {
        for (String path : new String[] {"https://evil.example/api/guestbook", "//evil.example/image.png",
                "http://example.com/api/articles", "https://example.com:8443/api/articles",
                "https://example.com.evil.example/", "/api/articles#fragment"}) {
            assertThrows(path, IOException.class, () -> NativeRepository.requestAddress(site, path));
        }
    }

    @Test
    public void acceptsExternalHttpsImagesAndHttpsRedirectDestinations() throws IOException {
        for (String path : new String[] {"https://images.example/picture.webp", "//r2.example/image.png",
                "https://i.example/image.jpg?token=one", "https://other.example:8443/redirected.png"}) {
            assertEquals(NativeRepository.mediaAddress(site, path), NativeRepository.imageAddress(site, path));
            assertThrows(IOException.class, () -> NativeRepository.requestAddress(site, path));
        }
        assertEquals(URI.create("https://example.com/api/guestbook/1/image"),
                NativeRepository.imageAddress(site, "/api/guestbook/1/image"));
    }

    @Test
    public void rejectsImageDowngradesCredentialsAndUnsafeRedirects() {
        for (String path : new String[] {"http://images.example/image.png", "http://example.com/image.png",
                "https://user:pass@images.example/image.png", "file:///sdcard/image.png",
                "content://images/1", "javascript:alert(1)", "https://images.example/image.png#fragment"}) {
            assertThrows(path, IOException.class, () -> NativeRepository.imageAddress(site, path));
        }
        URI local = NativeRepository.siteAddress("http://localhost:3000/", true);
        assertThrows(IOException.class, () -> NativeRepository.imageAddress(local, "http://images.example/image.png"));
    }

    @Test
    public void allowsOnlyHttpAndHttpsMediaWithoutCredentials() {
        assertEquals("https://example.com/daily/music/song.mp3",
                NativeRepository.mediaAddress(site, "/daily/music/song.mp3").toString());
        assertEquals("https://cdn.example/picture.webp",
                NativeRepository.mediaAddress(site, "//cdn.example/picture.webp").toString());
        assertEquals("http://cdn.example/picture.jpg",
                NativeRepository.mediaAddress(site, "http://cdn.example/picture.jpg").toString());
        for (String path : new String[] {null, "javascript:alert(1)", "file:///sdcard/private",
                "content://images/1", "data:image/png,test", "intent://host/#Intent;end",
                "https://user:password@example.com/", "https://example.com@evil.example/",
                "https://example.com:65536/", "https://example.com:0/", "https:///missing-host",
                "https://example.com/\\evil", "https://example.com/line\r\nbreak", "/bad path"}) {
            assertThrows(String.valueOf(path), IllegalArgumentException.class,
                    () -> NativeRepository.mediaAddress(site, path));
            assertThrows(String.valueOf(path), IOException.class,
                    () -> NativeRepository.requestAddress(site, path));
        }
    }

    @Test
    public void resolvesRelativeMediaAgainstSitePath() {
        assertEquals(URI.create("https://example.com/journal/daily/music/song.mp3"),
                NativeRepository.mediaAddress(URI.create("https://example.com/journal/"), "daily/music/song.mp3"));
    }

    @Test
    public void acceptsExactImageAndResponseLimits() throws IOException {
        for (int limit : new int[] {NativeRepository.MAX_IMAGE_BYTES, NativeRepository.MAX_RESPONSE_BYTES}) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            NativeRepository.copyLimited(new ByteArrayInputStream(new byte[limit]), output, limit);
            assertEquals(limit, output.size());
        }
    }

    @Test
    public void rejectsOversizedStreamsWithoutTrustingAvailableOrReadingRest() {
        for (int limit : new int[] {NativeRepository.MAX_IMAGE_BYTES, NativeRepository.MAX_RESPONSE_BYTES}) {
            ByteArrayInputStream input = new ByteArrayInputStream(new byte[limit + 200]) {
                @Override
                public int available() { return 0; }
            };
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            assertThrows(IOException.class, () -> NativeRepository.copyLimited(input, output, limit));
            assertEquals(limit, output.size());
            assertEquals(0, input.read());
            int remaining = 1;
            while (input.read() != -1) {
                remaining++;
            }
            assertEquals(199, remaining);
        }
    }

    @Test
    public void propagatesProviderReadErrors() {
        InputStream input = new InputStream() {
            @Override
            public int read() throws IOException { throw new IOException("Provider failed"); }
        };
        IOException failure = assertThrows(IOException.class,
                () -> NativeRepository.copyLimited(input, new ByteArrayOutputStream(), NativeRepository.MAX_IMAGE_BYTES));
        assertEquals("Provider failed", failure.getMessage());
    }
}
