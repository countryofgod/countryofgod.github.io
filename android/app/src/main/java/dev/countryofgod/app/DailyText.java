package dev.countryofgod.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

public final class DailyText {
    private static final Pattern AUTHOR = Pattern.compile("^(?:\\[[^\\]]+\\]|【[^】]+】|作者[：:]|[—–])");
    private static final Pattern TRACK_SOURCE = Pattern.compile(
            "(?i)^(?:https?://\\S+|(?:/|\\./|\\.\\./)\\S+|[^\\s:|]+/\\S+|"
                    + "[^\\s:|]+\\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|webm)(?:[?#]\\S*)?)$");

    private DailyText() {
    }

    public static Entry parse(String text) {
        return parse(text, "");
    }

    public static Entry parse(String text, String category) {
        String source = text == null ? "" : text.replaceFirst("^\uFEFF", "");
        String[] lines = source.split("\\r?\\n", -1);
        int titleLine = 0;
        while (titleLine < lines.length && lines[titleLine].trim().isEmpty()) {
            titleLine++;
        }
        if (titleLine == lines.length) {
            return new Entry("", "", "", Collections.emptyList());
        }
        String title = lines[titleLine].trim();
        int bodyLine = titleLine + 1;
        String author = "";
        if ("pub".equals(category)) {
            author = bodyLine < lines.length ? lines[bodyLine].trim() : "";
            bodyLine = Math.min(lines.length, bodyLine + 1);
        } else {
            while (bodyLine < lines.length && lines[bodyLine].trim().isEmpty()) {
                bodyLine++;
            }
            if (bodyLine < lines.length && AUTHOR.matcher(lines[bodyLine].trim()).find()) {
                author = lines[bodyLine++].trim().replaceFirst("^(?:作者[：:]\\s*|[—–]\\s*)", "");
            }
        }
        while (bodyLine < lines.length && lines[bodyLine].trim().isEmpty()) {
            bodyLine++;
        }
        int offset = 0;
        for (int line = 0; line < bodyLine && offset < source.length(); line++) {
            int newline = source.indexOf('\n', offset);
            offset = newline < 0 ? source.length() : newline + 1;
        }
        String body = source.substring(offset);
        List<Track> tracks = new ArrayList<>();
        if (!"pub".equals(category)) {
            String name = null;
            String src = null;
            List<String> lyrics = new ArrayList<>();
            for (int line = titleLine + 1; line < lines.length; line++) {
                int separator = lines[line].indexOf('|');
                String candidate = separator < 0 ? "" : lines[line].substring(separator + 1).trim();
                if (separator > 0 && TRACK_SOURCE.matcher(candidate).matches()) {
                    if (name != null) {
                        tracks.add(new Track(name, src, lyricsText(lyrics)));
                    }
                    name = lines[line].substring(0, separator).trim();
                    src = candidate;
                    lyrics.clear();
                } else if (name != null) {
                    lyrics.add(lines[line]);
                }
            }
            if (name != null) {
                tracks.add(new Track(name, src, lyricsText(lyrics)));
            }
        }
        return new Entry(title, body, author, tracks);
    }

    private static String lyricsText(List<String> lines) {
        int end = lines.size();
        while (end > 0 && lines.get(end - 1).trim().isEmpty()) {
            end--;
        }
        return String.join("\n", lines.subList(0, end));
    }

    public static final class Entry {
        public final String title;
        public final String body;
        public final String author;
        public final List<Track> tracks;

        public Entry(String title, String body, String author, List<Track> tracks) {
            this.title = title;
            this.body = body;
            this.author = author;
            this.tracks = Collections.unmodifiableList(new ArrayList<>(tracks));
        }
    }

    public static final class Track {
        public final String name;
        public final String src;
        public final String lyrics;

        public Track(String name, String src, String lyrics) {
            this.name = name;
            this.src = src;
            this.lyrics = lyrics;
        }
    }
}
