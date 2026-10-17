import { parseXMLTVChunk } from "./epgParser";
// Each message ends at a programme boundary. Never construct a DOM for an entire guide.
self.onmessage = (
  event: MessageEvent<{ id: number; text: string; playlistId: string }>
) => {
  try {
    self.postMessage({
      id: event.data.id,
      programs: parseXMLTVChunk(event.data.text, event.data.playlistId),
    });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "Invalid guide",
    });
  }
};
