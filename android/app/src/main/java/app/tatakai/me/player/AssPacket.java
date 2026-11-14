package app.tatakai.me.player;

import java.util.Locale;

/** Keeps every ASS event field and override tag; only rebases container timestamps. */
final class AssPacket {
    static String shift(String data, String format, long offsetUs) {
        String[] fields = format.replaceFirst("(?i)^Format:\s*", "").split(",");
        StringBuilder result = new StringBuilder();
        for (String line : data.split("\r?\n")) {
            if (!line.startsWith("Dialogue:")) continue;
            String[] values = line.substring(9).trim().split(",", fields.length);
            if (values.length != fields.length) continue;
            for (int i=0; i<fields.length; i++) {
                String field = fields[i].trim();
                if (field.equalsIgnoreCase("Start") || field.equalsIgnoreCase("End"))
                    values[i] = timestamp(parse(values[i]) + offsetUs);
            }
            result.append("Dialogue: ").append(String.join(",", values)).append('\n');
        }
        return result.toString();
    }
    private static long parse(String value) {
        String[] time = value.trim().split(":");
        if (time.length == 4) time = new String[] {time[0],time[1],time[2]+"."+time[3]};
        if (time.length != 3) return 0;
        try { return Math.round((Double.parseDouble(time[0])*3600 + Double.parseDouble(time[1])*60 + Double.parseDouble(time[2]))*1000000); }
        catch (NumberFormatException ignored) { return 0; }
    }
    private static String timestamp(long us) {
        long cs = Math.max(0, Math.round(us/10000.0));
        return String.format(Locale.US, "%d:%02d:%02d.%02d", cs/360000, (cs/6000)%60, (cs/100)%60, cs%100);
    }
}
