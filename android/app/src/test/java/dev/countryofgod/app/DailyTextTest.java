package dev.countryofgod.app;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class DailyTextTest {
    @Test
    public void acceptsEmptyAndBomPrefixedInput() {
        for (String source : new String[] {null, "", " \n\t\r\n", "\uFEFF\n"}) {
            DailyText.Entry entry = DailyText.parse(source);
            assertEquals("", entry.title);
            assertEquals("", entry.body);
            assertEquals("", entry.author);
            assertTrue(entry.tracks.isEmpty());
        }
        assertEquals("标题", DailyText.parse("\uFEFF\r\n 标题 \r\n").title);
    }

    @Test
    public void preservesManuscriptIndentationBlankLinesAndTrailingWhitespace() {
        String body = "  第一行  \r\n第二行\r\n\r\n\t第三行\r\n \r\n";
        DailyText.Entry entry = DailyText.parse("\uFEFF标题\r\n\r\n" + body);
        assertEquals("标题", entry.title);
        assertEquals(body, entry.body);
        assertEquals("", entry.author);
    }

    @Test
    public void supportsExistingAuthorPrefixes() {
        String[][] cases = {
                {"[英] 雪莱", "[英] 雪莱"},
                {"【阿根廷】博尔赫斯", "【阿根廷】博尔赫斯"},
                {"作者： 石磊", "石磊"},
                {"作者: 石磊", "石磊"},
                {"— 石磊", "石磊"},
                {"– 石磊", "石磊"}
        };
        for (String[] sample : cases) {
            DailyText.Entry entry = DailyText.parse("标题\n\n " + sample[0] + " \n\n  正文\n");
            assertEquals(sample[1], entry.author);
            assertEquals("  正文\n", entry.body);
        }
    }

    @Test
    public void doesNotGuessUnmarkedAuthorOrRewriteMarkup() {
        DailyText.Entry entry = DailyText.parse("标题\n石磊\n<正文>&原样\n作者：这是正文\n");
        assertEquals("", entry.author);
        assertEquals("石磊\n<正文>&原样\n作者：这是正文\n", entry.body);
    }

    @Test
    public void parsesPubHeadersExplicitlyAndRetainsOriginalBody() {
        String body = "愿望过于强烈，就会溢出现实进入梦境，但你又怎么分辨，这份渴求来自何处？\r\n\r\n"
                + "梅秋秋想起他初二的语文老师。\r\n\r\n  “梦即现实。”  \r\n";
        DailyText.Entry entry = DailyText.parse("\uFEFF愿望过于强烈\r\n石磊\r\n" + body, "pub");
        assertEquals("愿望过于强烈", entry.title);
        assertEquals("石磊", entry.author);
        assertEquals(body, entry.body);
        assertTrue(entry.tracks.isEmpty());
    }

    @Test
    public void preservesEntireProtectedManuscriptIncludingOpeningParagraph() throws IOException {
        Path root = Path.of("").toAbsolutePath();
        while (root != null && !Files.exists(root.resolve("daily/pub/2026_10_15.txt"))) {
            root = root.getParent();
        }
        assertTrue("Protected manuscript must be available", root != null);
        String source = new String(Files.readAllBytes(root.resolve("daily/pub/2026_10_15.txt")), StandardCharsets.UTF_8);
        DailyText.Entry entry = DailyText.parse(source, "pub");
        assertEquals("石磊", entry.author);
        assertTrue(entry.body.startsWith("愿望过于强烈，就会溢出现实进入梦境，但你又怎么分辨，这份渴求来自何处？"));
        int authorEnd = source.indexOf('\n', source.indexOf('\n') + 1);
        assertEquals(source.substring(authorEnd + 1), entry.body);
    }

    @Test
    public void parsesExistingPlaylistAndMultipleBlocks() {
        DailyText.Entry entry = DailyText.parse("每日歌单（每日一曲）\r\n\r\n"
                + "《悼念公主的帕凡舞曲》|/daily/music/ravel-pavane-griner.mp3\r\n"
                + "Joseph-Maurice Ravel · Pavane pour une infante défunte\r\n\r\n"
                + " 第二首 | https://media.example/song.mp3?a=1|2 \r\n"
                + "  歌词第一行  \r\n歌词第二行\r\n\r\n");
        assertEquals(2, entry.tracks.size());
        DailyText.Track first = entry.tracks.get(0);
        assertEquals("《悼念公主的帕凡舞曲》", first.name);
        assertEquals("/daily/music/ravel-pavane-griner.mp3", first.src);
        assertEquals("Joseph-Maurice Ravel · Pavane pour une infante défunte", first.lyrics);
        DailyText.Track second = entry.tracks.get(1);
        assertEquals("第二首", second.name);
        assertEquals("https://media.example/song.mp3?a=1|2", second.src);
        assertEquals("  歌词第一行  \n歌词第二行", second.lyrics);
    }

    @Test
    public void onlyMediaHeadersCanIntroduceTracks() {
        DailyText.Entry entry = DailyText.parse("歌单\n\n没有链接\n歌词|不是歌曲头\n\n"
                + "空链接|  \n\n歌曲|/song.mp3\n歌词|含分隔符\n\n无歌词|/last.mp3");
        assertEquals(2, entry.tracks.size());
        assertEquals("歌词|含分隔符", entry.tracks.get(0).lyrics);
        assertEquals("", entry.tracks.get(1).lyrics);
    }

    @Test
    public void preservesBlankStanzasUntilNextTrackHeader() {
        DailyText.Entry entry = DailyText.parse("歌单\n第一首|/first.mp3\n"
                + "作者\n\n第一节  \n第二行\n\n\n  第二节\n\n"
                + "第二首|second.mp3\n第三节\n\n第四节\n", "music");
        assertEquals(2, entry.tracks.size());
        assertEquals("作者\n\n第一节  \n第二行\n\n\n  第二节", entry.tracks.get(0).lyrics);
        assertEquals("第三节\n\n第四节", entry.tracks.get(1).lyrics);
    }

    @Test
    public void splitsConsecutiveHeadersWithoutRequiringBlankSeparator() {
        DailyText.Entry entry = DailyText.parse("歌单\n第一首|/first.mp3\n歌词\n第二首|/second.mp3");
        assertEquals(2, entry.tracks.size());
        assertEquals("歌词", entry.tracks.get(0).lyrics);
        assertEquals("", entry.tracks.get(1).lyrics);
    }

    @Test(expected = UnsupportedOperationException.class)
    public void tracksCannotBeMutated() {
        DailyText.parse("歌单\n歌曲|/song.mp3").tracks.clear();
    }

    @Test
    public void entryCopiesCallerTrackList() {
        List<DailyText.Track> tracks = new ArrayList<>();
        tracks.add(new DailyText.Track("歌曲", "/song.mp3", ""));
        DailyText.Entry entry = new DailyText.Entry("歌单", "", "", tracks);
        tracks.clear();
        assertEquals(1, entry.tracks.size());
    }

    @Test
    public void handlesTitleAndAuthorWithoutFinalNewline() {
        assertEquals("", DailyText.parse("标题").body);
        DailyText.Entry entry = DailyText.parse("标题\n作者：石磊");
        assertEquals("石磊", entry.author);
        assertEquals("", entry.body);
        assertEquals("", DailyText.parse("标题\n石磊", "pub").body);
    }
}
