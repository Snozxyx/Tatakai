import { optimizedImageUrl } from './media/imageUrl';

export function cachedProfileImageUrl(value?:string|null):string|undefined {
  return optimizedImageUrl(value);
}
