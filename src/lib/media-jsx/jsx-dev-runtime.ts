import { jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';
import { mediaProps } from './props';
export { Fragment } from 'react/jsx-dev-runtime';
export type { JSX } from 'react/jsx-dev-runtime';

export const jsxDEV: typeof reactJsxDEV = (type, props, key, isStatic, source, self) =>
  reactJsxDEV(type, mediaProps(type, props), key, isStatic, source, self);
