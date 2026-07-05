/**
 * Pure Server-Sent-Events frame parser — no I/O, no fetch, no Response.
 * Kept side-effect free so it can be unit-tested directly (see sse.test.ts)
 * and reused by both the odds proxy and the future scores proxy.
 *
 * SSE framing (https://html.spec.whatwg.org/multipage/server-sent-events.html):
 *   - Frames are separated by a blank line ("\n\n").
 *   - A frame may have one `id:` line (the event id, used for Last-Event-ID
 *     resume) and one or more `data:` lines. Multiple `data:` lines in the
 *     same frame are legal and must be joined (with "\n") into one payload
 *     before the consumer parses it — most SSE emitters wrap long JSON by
 *     splitting it across several `data:` lines.
 *   - Each field's value drops exactly one leading space after the colon,
 *     e.g. "data: {}" -> "{}", but "data:  {}" -> " {}" (only one space is
 *     structural, the rest is content).
 */

export interface ParsedSseFrame {
  /** The frame's `id:` field, if it had one. */
  id?: string;
  /** All `data:` lines in the frame, joined with "\n" per spec. */
  data: string;
}

/** Strip the field name and, at most, one structural leading space. */
function fieldValue(line: string, prefixLength: number): string {
  const value = line.slice(prefixLength);
  return value.startsWith(" ") ? value.slice(1) : value;
}

/**
 * Parse as many complete frames as `buffer` contains. Returns the parsed
 * frames plus `rest` — the trailing partial frame (if any) that hasn't seen
 * its closing blank line yet and should be prepended to the next chunk.
 */
export function parseSseFrames(buffer: string): {
  frames: ParsedSseFrame[];
  rest: string;
} {
  const segments = buffer.split("\n\n");
  // The last segment is either "" (buffer ended exactly on a frame boundary)
  // or an incomplete frame still waiting on more bytes — either way it's not
  // a complete frame yet, so it becomes `rest`.
  const rest = segments.pop() ?? "";

  const frames: ParsedSseFrame[] = [];
  for (const segment of segments) {
    if (!segment.trim()) continue; // stray blank separator / keep-alive noise

    let id: string | undefined;
    const dataLines: string[] = [];

    for (const rawLine of segment.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("data:")) {
        dataLines.push(fieldValue(line, 5));
      } else if (line.startsWith("id:")) {
        id = fieldValue(line, 3);
      }
      // Other fields (event:, retry:, comments starting with ":") are
      // ignored — nothing upstream uses them today.
    }

    if (dataLines.length === 0 && id === undefined) continue;
    frames.push({ id, data: dataLines.join("\n") });
  }

  return { frames, rest };
}
