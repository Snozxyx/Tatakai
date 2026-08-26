import { describe, it, expect } from 'vitest';
import { decodePlayer1Payload } from '../src/providers/stream/watchanimeworld.js';

describe('decodePlayer1Payload', () => {
  it('decodes the WatchAnimeWorld player1 payload format used in live pages', () => {
    const encoded = 'W3sibGFuZ3VhZ2UiOiJIaW5kaSIsImxpbmsiOiJodHRwczpcL1wvc2hvcnQuaWN1XC9zUDdOLTNCcnIifSx7Imxhbmd1YWdlIjoiVGFtaWwiLCJsaW5rIjoiaHR0cHM6XC9cL3Nob3J0LmljdVwveEhSa19HNlZHIn0seyJsYW5ndWFnZSI6IlRlbHVndSIsImxpbmsiOiJodHRwczpcL1wvc2hvcnQuaWN1XC81b2Rpd2xKODJ3In0seyJsYW5ndWFnZSI6Ik1hbGF5YWxhbSIsImxpbmsiOiJodHRwczpcL1wvc2hvcnQuaWN1XC81UG51aXdFY3QifSx7Imxhbmd1YWdlIjoiS2FubmFkYSIsImxpbmsiOiJodHRwczpcL1wvc2hvcnQuaWN1XC9BM2xPeEpxNmEifSx7Imxhbmd1YWdlIjoiRW5nbGlzaCIsImxpbmsiOiJodHRwczpcL1wvc2hvcnQuaWN1XC9DelJwRVB6Nm1jIn0seyJsYW5ndWFnZSI6IkphcGFuZXNlIiwibGluayI6Imh0dHBzOlwvXC9zaG9ydC5pY3VcL1IycndCSEhXQSJ9XQ%3D%3D';

    const decoded = decodePlayer1Payload(encoded);
    expect(decoded).toContain('Hindi');
    expect(decoded).toContain('Japanese');
    expect(decoded).toContain('https://short.icu');
  });
});
