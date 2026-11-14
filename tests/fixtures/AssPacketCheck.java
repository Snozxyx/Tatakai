package app.tatakai.me.player;
public final class AssPacketCheck {
  public static void main(String[] args) {
    String format="Format: Start, End, ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text";
    String source="Dialogue: 0:00:00:00,0:00:02:50,10,3,Sign,Alice,0,0,0,,{\\move(10,20,30,40)\\kf30}Hello, world";
    String shifted=AssPacket.shift(source,format,1250000L);
    if(!shifted.startsWith("Dialogue: 0:00:01.25,0:00:03.75,10,3,Sign,Alice,"))throw new AssertionError(shifted);
    if(!shifted.contains("{\\move(10,20,30,40)\\kf30}Hello, world"))throw new AssertionError("ASS override tags were lost");
    String absolute="Dialogue: 0:00:10.00,0:00:12.00,0,0,Default,,0,0,0,,Text";
    if(!AssPacket.shift(absolute,format,0).contains("0:00:10.00,0:00:12.00"))throw new AssertionError("Absolute timing changed");
    System.out.println("Native ASS packet timing and effects passed");
  }
}
