import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
export function mediaCachePlugin(): Plugin;
export function serveStaticMedia(req: IncomingMessage, res: ServerResponse, filename: string): boolean;
