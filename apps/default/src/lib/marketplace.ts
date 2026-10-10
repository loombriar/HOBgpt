import { type GenesisNode } from '@/lib/genesis-data';

export const PRODUCTS_PROJECT_ID = 'Jh4hJjUDzfNiMHaH';

type GalleryItem = {
  id: string;
  title: string;
  description?: string;
  price: number;
  category?: string;
  style?: string;
  designerId?: string;
  designerName?: string;
  status?: string;
  images?: Array<{ url: string }>;
  seoTitle?: string; seoDescription?: string; seoTags?: string; shareImageUrl?: string;
  giftNoteAvailable?:boolean; shippingCostCents?: number|null; freeShippingThresholdCents?: number|null; handlingDaysMin?: number|null; handlingDaysMax?: number|null; internationalShipping?: boolean;
  productionType?: 'One of a Kind'|'Limited Quantity'|'Made to Order'; stockQuantity?: number; availableQuantity?: number|null; soldQuantity?: number; reservedQuantity?: number;
};

function galleryItemToGenesis(item: GalleryItem): GenesisNode {
  const images = Array.isArray(item.images) ? item.images.map((image) => image.url).filter(Boolean) : [];
  return {
    id: item.id,
    parentId: null,
    content: item.title,
    fieldValues: {
      '/attributes/@price': String(item.price ?? 0),
      '/attributes/@categ': item.category || 'One-of-a-kind',
      '/attributes/@tagsx': [item.style, item.category].filter(Boolean).join(', ') || 'Independent design',
      '/attributes/@style': item.style || '',
      '/attributes/@sizex': 'One of one',
      '/attributes/@desig': item.designerName || item.designerId || 'Independent designer',
      '/attributes/@desid': item.designerId || '',
      '/attributes/@descr': item.description || 'A one-of-a-kind piece made with intention.',
      '/attributes/@statx': item.productionType !== 'Made to Order' && item.availableQuantity === 0 ? (Number(item.soldQuantity ?? 0) > 0 ? 'Sold Out' : 'Temporarily Unavailable') : item.status === 'published' || !item.status ? 'Available' : item.status,
      '/attributes/@image': images[0] || '',
      '/attributes/@gally': images.join('\n'),
      '/attributes/@seotl': item.seoTitle || '',
      '/attributes/@seods': item.seoDescription || '',
      '/attributes/@seotg': item.seoTags || '',
      '/attributes/@share': item.shareImageUrl || '',
      '/attributes/@giftn': item.giftNoteAvailable ? 'yes' : 'no',
      '/attributes/@shipc': item.shippingCostCents == null ? '' : String(item.shippingCostCents),
      '/attributes/@shipf': item.freeShippingThresholdCents == null ? '' : String(item.freeShippingThresholdCents),
      '/attributes/@handl': item.handlingDaysMin == null ? '' : String(item.handlingDaysMin),
      '/attributes/@handx': item.handlingDaysMax == null ? '' : String(item.handlingDaysMax),
      '/attributes/@intl': item.internationalShipping ? 'yes' : 'no',
      '/attributes/@ptype': item.productionType || 'One of a Kind',
      '/attributes/@stock': String(item.availableQuantity ?? item.stockQuantity ?? (item.productionType === 'Made to Order' ? 0 : 1)),
    },
  };
}

export async function getCatalogProducts(_isAuthenticated: boolean): Promise<GenesisNode[]> {
  const response = await fetch('/api/gallery', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Marketplace gallery unavailable.');
  const data = await response.json();
  if (!Array.isArray(data?.items)) throw new Error('Marketplace gallery unavailable.');
  return data.items.map(galleryItemToGenesis);
}
export const DESIGNERS_PROJECT_ID = 'WEttcv6jabX2q9a9';
export const PRIVATE_DESIGNER_LISTINGS_PROJECT_ID = 'QUQPuN1aFvGorkJ3';
export const PRODUCT_INQUIRY_FLOW_ID = '01M3QHM2WS9696Q1CZQAN748KQ';
export const HOUSE_OF_BRIAR_AGENT_ID = '01M3PZ25F6V6H974MMAZ4Q0EX1';
export const HOUSE_OF_BRIAR_PUBLIC_AGENT_ID = 'house-of-briar-guide-01M3PZ25F8KYQ9XJP5FKY9F840';

export const MARKET_STYLES = [
  'Boho', 'Cottagecore', 'Gothic', 'Romantic', 'Vintage', 'Whimsical', 'Minimalist', 'Streetwear', 'Avant-Garde', 'Art Nouveau', 'Dark Academia', 'Fairycore', 'Fantasy', 'Retro', 'Punk', 'Western',
] as const;

export const MARKET_CATEGORIES = [
  'One-of-a-kind',
  'Upcycled',
  'Vintage-inspired',
  'Handmade',
  'Botanical',
  'Limited edition',
  'Statement piece',
  'Costumes',
] as const;

export const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getProductVisual(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('tulip')) return 'from-rose-950 via-primary/70 to-amber-900';
  if (normalized.includes('lavender') || normalized.includes('palm')) return 'from-violet-950 via-slate-700 to-primary';
  return 'from-primary via-emerald-900 to-amber-950';
}

export function getProductImages(imageUrl?: string | null, galleryUrls?: string | null) {
  const gallery = galleryUrls?.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean) ?? [];
  return Array.from(new Set([imageUrl?.trim(), ...gallery].filter((url): url is string => Boolean(url))));
}

export const SAVED_PRODUCTS_KEY = 'house-of-briar:saved-products';

export function getSavedProductIds() {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(SAVED_PRODUCTS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function setSavedProductIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVED_PRODUCTS_KEY, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new Event('house-of-briar-saved-products'));
}

export async function getPersistentFavoriteIds(accessToken?: string | null) {
  if (!accessToken) return getSavedProductIds();
  const guestIds = getSavedProductIds();
  if (guestIds.length) {
    await fetch('/api/my/favorites/merge', { method:'POST', headers:{ ...(accessToken==='__house_session__'?{}:{Authorization:`Bearer ${accessToken}`}), 'Content-Type':'application/json' }, body:JSON.stringify({listingIds:guestIds}) });
  }
  const response=await fetch('/api/my/favorites',{headers:{...(accessToken==='__house_session__'?{}:{Authorization:`Bearer ${accessToken}`}),Accept:'application/json'}});
  if(!response.ok) throw new Error('Saved pieces could not be loaded.');
  const data=await response.json();
  const ids=Array.isArray(data?.ids)?data.ids.filter((id:unknown):id is string=>typeof id==='string'):[];
  setSavedProductIds(ids);
  return ids;
}

export async function setPersistentFavorite(productId:string,saved:boolean,accessToken?:string|null) {
  if(!accessToken) {
    const current=getSavedProductIds();
    setSavedProductIds(saved?[...current,productId]:current.filter(id=>id!==productId));
    return;
  }
  const response=await fetch(`/api/my/favorites/${encodeURIComponent(productId)}`,{method:saved?'POST':'DELETE',headers:{...(accessToken==='__house_session__'?{}:{Authorization:`Bearer ${accessToken}`}),Accept:'application/json'}});
  if(!response.ok) throw new Error('Saved piece could not be updated.');
  const current=getSavedProductIds();
  setSavedProductIds(saved?[...current,productId]:current.filter(id=>id!==productId));
}

export function isPublicProduct(product: { fieldValues: Record<string, string> }) {
  return (product.fieldValues.Status ?? product.fieldValues['/attributes/@statx'] ?? '') === 'Available';
}
