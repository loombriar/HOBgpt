const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FAVORITE_KEY = 'house-of-briar:favorites';

function showCheckoutReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  const donation = params.get('donation');
  if (!checkout && !donation) return;
  const notice = document.createElement('div');
  notice.className = 'checkout-return-notice';
  notice.setAttribute('role', 'status');
  if (checkout === 'success') notice.textContent = 'Thank you. Your payment was submitted. Bank payments may remain pending until Stripe confirms they have cleared.';
  else if (checkout === 'canceled') notice.textContent = 'Checkout was canceled. Your payment was not completed.';
  else if (donation === 'success') notice.textContent = 'Thank you for supporting House of Briar. Bank donations may remain pending until Stripe confirms they have cleared.';
  else notice.textContent = 'Your donation checkout was canceled.';
  document.body.prepend(notice);
  history.replaceState({}, '', window.location.pathname + window.location.hash);
}
window.addEventListener('DOMContentLoaded', showCheckoutReturnStatus);

const byId = (id) => document.getElementById(id);
const year = byId('year');
if (year) year.textContent = new Date().getFullYear();

const productGrid = byId('product-grid');
const shopStatus = byId('shop-status');
const designerModal = byId('designer-modal');
const designerLoginBtn = byId('designer-login-btn');
const designerSignupLink = byId('designer-signup-link');
const designerSignupForm = byId('designer-signup-form');
const designerSignupMessage = byId('designer-signup-message');
const designerLoginForm = byId('designer-login-form');
const designerTokenInput = byId('designer-token');
const designerAuthMessage = byId('designer-auth-message');
const loginPanel = byId('designer-login-panel');
const designerWorkspace = byId('designer-workspace');
const designerProductsContainer = byId('designer-products');
const productForm = byId('product-form');
const photoInput = byId('product-photos');
const photoPreview = byId('photo-preview');
const uploadMessage = byId('upload-message');
const fabricFinderForm = byId('fabric-finder-form');
const fabricFinderPhotos = byId('fabric-finder-photos');
const fabricFinderMessage = byId('fabric-finder-message');
const fabricFinderResult = byId('fabric-finder-result');
const modalClose = byId('modal-close');
const productDialog = byId('product-dialog');
const productDetailTitle = byId('product-detail-title');
const productDetailContent = byId('product-detail-content');
const productIdInput = byId('product-id');
const listingFormTitle = byId('listing-form-title');
const cartButton = byId('cart-btn');
const cartDialog = byId('cart-dialog');
const cartItems = byId('cart-items');
const checkoutButton = byId('checkout-btn');
const adminReviewBtn = byId('admin-review-btn');
const adminReviewDialog = byId('admin-review-dialog');
const adminReviewClose = byId('admin-review-close');
const adminLoginForm = byId('admin-login-form');
const adminTokenInput = byId('admin-token');
const adminLoginPanel = byId('admin-login-panel');
const adminReviewWorkspace = byId('admin-review-workspace');
const adminReviewList = byId('admin-review-list');
const adminReviewMessage = byId('admin-review-message');
const adminSignoutBtn = byId('admin-signout-btn');
const CART_KEY = 'house-of-briar:cart';

let designerToken = localStorage.getItem('briarDesignerToken') || sessionStorage.getItem('briarDesignerToken') || '';
let adminToken = sessionStorage.getItem('briarAdminToken') || '';
let currentListingId = '';
let currentIdempotencyKey = '';
let galleryItems = [];
let activePattern = 'all';
let activeShopWindow = 'all';
let shopSearch = '';
let activeAccessory = 'all';
let selectedImages = [];
let activeFilter = 'all';
let activeDesigner = 'all';
let galleryRequest = 0;
let activeMeasurements = null;
let searchTimer;
let activeAesthetic = 'all';
const designerListImageUrls = new Set();

function getCartIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function setCartIds(ids) {
  localStorage.setItem(CART_KEY, JSON.stringify([...new Set(ids)]));
  updateCartButton();
}

function updateCartButton() {
  if (!cartButton) return;
  const count = getCartIds().length;
  const label = byId('suitcase-label');
  if (label) label.textContent = `Suitcase (${count})`;
  else cartButton.textContent = `Suitcase (${count})`;
  cartButton.setAttribute('aria-label', `Suitcase, ${count} ${count === 1 ? 'item' : 'items'}`);
}

function getFavoriteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function setFavoriteIds(ids) {
  localStorage.setItem(FAVORITE_KEY, JSON.stringify([...new Set(ids)]));
}

async function toggleFavorite(item) {
  const ids = getFavoriteIds();
  const saving = !ids.includes(item.id);
  const next = saving ? [...ids, item.id] : ids.filter((id) => id !== item.id);
  setFavoriteIds(next);
  renderGallery();
  renderVisitorFavorites();
  if (!designerToken) return;
  try {
    await apiRequest(`/api/my/favorites/${encodeURIComponent(item.id)}`, { method: saving ? 'POST' : 'DELETE' });
  } catch (error) {
    setMessage(byId('visitor-favorites-message'), 'Saved on this device. Account sync will retry when you sign in again.', '');
  }
}

async function syncAccountFavorites() {
  if (!designerToken) return;
  const localIds = getFavoriteIds();
  try {
    if (localIds.length) {
      await apiRequest('/api/my/favorites/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingIds: localIds })
      });
    }
    const data = await apiRequest('/api/my/favorites');
    setFavoriteIds([...(data.ids || []), ...localIds]);
    renderGallery();
    renderVisitorFavorites(data.items || []);
  } catch {}
}

function favoriteItemById(id, accountItems = []) {
  return accountItems.find((item) => item.id === id) || galleryItems.find((item) => item.id === id);
}

function renderVisitorFavorites(accountItems = []) {
  const host = byId('visitor-favorites-list');
  const count = byId('visitor-favorites-count');
  if (!host) return;
  const ids = getFavoriteIds();
  host.replaceChildren();
  if (count) count.textContent = `${ids.length} saved`;
  if (!ids.length) {
    host.appendChild(makeElement('p', 'empty-state', 'No favorites yet. Tap a heart in the Shop to save a piece here.'));
    return;
  }
  for (const id of ids) {
    const item = favoriteItemById(id, accountItems);
    const card = makeElement('article', 'wishlist-card');
    if (!item) {
      card.classList.add('wishlist-card-unavailable');
      card.append(makeElement('div', 'wishlist-card-copy', 'This saved piece is currently unavailable.'));
      const remove = makeElement('button', 'text-button', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => { setFavoriteIds(getFavoriteIds().filter((value) => value !== id)); renderVisitorFavorites(accountItems); renderGallery(); });
      card.append(remove); host.append(card); continue;
    }
    const images = getProductImages(item);
    if (images[0]?.url) {
      const img = document.createElement('img'); img.src = images[0].url; img.alt = item.title || 'Saved piece'; card.append(img);
    }
    const copy = makeElement('div', 'wishlist-card-copy');
    copy.append(makeElement('strong', '', item.title), makeElement('span', '', item.designerName || item.designer_name || ''), makeElement('span', 'price', `${Number(item.price || 0).toFixed(2)}`));
    const actions = makeElement('div', 'wishlist-card-actions');
    const view = makeElement('button', 'secondary-button', 'View piece'); view.type='button'; view.addEventListener('click',()=>openProductDetails(item));
    const move = makeElement('button', 'primary-button', getCartIds().includes(item.id) ? 'In Suitcase' : 'Move to Suitcase'); move.type='button'; move.disabled=getCartIds().includes(item.id); move.addEventListener('click',()=>{ addToCart(item); renderVisitorFavorites(accountItems); });
    const remove = makeElement('button', 'text-button', 'Remove'); remove.type='button'; remove.addEventListener('click',()=>toggleFavorite(item));
    actions.append(view,move,remove); copy.append(actions); card.append(copy); host.append(card);
  }
}

function getItemBadges(item = {}) {
  const badges = [];
  const normalized = Array.isArray(item.badges) ? item.badges.map((value) => String(value).toLowerCase()) : [];
  const supportFlag = item.supporterBadge || item.donationBadge || item.supporter || item.hasSupporterBadge || item.supporterBadge === true || normalized.includes('supporter') || normalized.includes('donation');
  const verifiedFlag = item.verifiedBadge || item.verified || item.isVerified || item.verifiedBuyer || normalized.includes('verified');

  if (supportFlag) badges.push({ key: 'supporter', label: 'House Supporter' });
  if (verifiedFlag) badges.push({ key: 'verified', label: 'Verified Buyer' });
  return badges;
}

function createBadgePill(label, className = 'badge') {
  const pill = makeElement('span', className, label);
  pill.title = label;
  if (className.includes('supporter-badge')) {
    pill.title = 'You helped keep the House in stitches. Thank you.';
    const artwork = makeElement('img', 'supporter-badge-art');
    artwork.src = '/heart-of-the-house-v1.webp';
    artwork.alt = '';
    artwork.setAttribute('aria-hidden', 'true');
    pill.prepend(artwork);
  }
  if (className.includes('verified-badge')) {
    pill.title = 'Excellent taste. Receipt to prove it.';
    const artwork = makeElement('img', 'supporter-badge-art');
    artwork.src = '/verified-buyer-v1.webp';
    artwork.alt = '';
    artwork.setAttribute('aria-hidden', 'true');
    pill.prepend(artwork);
  }
  return pill;
}

function renderItemBadges(target, item) {
  if (!target) return;
  target.replaceChildren();
  const badges = getItemBadges(item);
  badges.forEach(({ label }) => {
    target.appendChild(createBadgePill(label, label === 'Verified Buyer' ? 'badge verified-badge' : 'badge supporter-badge'));
  });
}

function addToCart(item) {
  const ids = getCartIds();
  if (!ids.includes(item.id)) ids.push(item.id);
  setCartIds(ids);
  if (productDialog?.open) productDialog.close();
  setMessage(shopStatus, `${item.title} added to your Suitcase. Select Suitcase to check out.`, 'success');
}

function removeFromCart(item) {
  setCartIds(getCartIds().filter((id) => id !== item.id));
  setMessage(shopStatus, `${item.title} removed from your Suitcase.`, 'success');
  renderGallery();
}

async function checkoutCart() {
  const ids = getCartIds();
  if (!ids.length) {
    setMessage(shopStatus, 'Your Suitcase is empty. Open a piece and choose Add to Suitcase.', 'error');
    document.querySelector('#shop')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (cartButton) {
    cartButton.disabled = true;
    cartButton.textContent = 'Opening checkout…';
  }
  try {
    const payload = await apiRequest('/api/checkout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: ids.map((id) => ({ id, quantity: 1 })) })
    });
    if (!payload?.url) throw new Error('Stripe checkout did not return a checkout link.');
    window.location.assign(payload.url);
  } catch (error) {
    setMessage(shopStatus, error.message || 'Checkout could not be started.', 'error');
    document.querySelector('#shop')?.scrollIntoView({ behavior: 'smooth' });
    updateCartButton();
    if (cartButton) cartButton.disabled = false;
  }
}

function openCart() {
  if (!cartDialog || !cartItems) return checkoutCart();
  const ids = getCartIds();
  cartItems.replaceChildren();
  const badgeReward = byId('cart-badge-reward');
  if (badgeReward) badgeReward.hidden = !ids.length;
  if (!ids.length) {
    cartItems.appendChild(makeElement('p', 'notice', 'Your Suitcase is empty.'));
    if (checkoutButton) checkoutButton.disabled = true;
  } else {
    if (checkoutButton) checkoutButton.disabled = false;
    ids.forEach((id) => {
      const item = galleryItems.find((entry) => entry.id === id);
      if (!item) return;
      const row = makeElement('div', 'designer-product');
      const copy = makeElement('div');
      copy.appendChild(makeElement('strong', '', item.title));
      copy.appendChild(makeElement('p', 'price', `$${Number(item.price || 0).toFixed(2)}`));
      const remove = makeElement('button', 'text-button', 'Remove from Suitcase');
      remove.type = 'button';
      remove.addEventListener('click', () => { removeFromCart(item); openCart(); });
      row.append(copy, remove);
      cartItems.appendChild(row);
    });
  }
  cartDialog.showModal();
}

updateCartButton();
renderVisitorFavorites();
cartButton?.addEventListener('click', openCart);
checkoutButton?.addEventListener('click', () => { cartDialog?.close(); checkoutCart(); });
byId('cart-dialog-close')?.addEventListener('click', () => cartDialog?.close());
byId('continue-shopping-btn')?.addEventListener('click', () => cartDialog?.close());

const MEASUREMENTS_KEY = 'house-of-briar:measurements';

function loadMeasurements() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEASUREMENTS_KEY) || '{}');
    [
      ['measure-bust', 'bust'],
      ['measure-waist', 'waist'],
      ['measure-hips', 'hips'],
      ['measure-inseam', 'inseam'],
      ['measure-height', 'height'],
      ['measure-unit', 'unit'],
      ['measure-notes', 'notes']
    ].forEach(([id, key]) => {
      const field = byId(id);
      if (field && saved[key] != null) field.value = saved[key];
    });
  } catch {}
}

byId('measurements-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const measurements = {
    bust: byId('measure-bust')?.value || '',
    waist: byId('measure-waist')?.value || '',
    hips: byId('measure-hips')?.value || '',
    inseam: byId('measure-inseam')?.value || '',
    height: byId('measure-height')?.value || '',
    unit: byId('measure-unit')?.value || 'in',
    notes: byId('measure-notes')?.value?.trim() || ''
  };
  localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(measurements));
  setMessage(byId('measurements-message'), 'Measurements saved on this device.', 'success');
});
loadMeasurements();

function setMessage(element, message = '', kind = '') {
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function categoryLabel(category) {
  return {
    apparel: 'Clothing',
    other: 'Other'
  }[category] || 'Other';
}

function makeElement(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function authorizationHeaders(extra = {}) {
  const headers = new Headers(extra);
  if (designerToken) headers.set('Authorization', `Bearer ${designerToken}`);
  return headers;
}

async function loadPrivateImagePreview(url, trackForList = false) {
  const response = await fetch(url, { headers: authorizationHeaders() });
  if (!response.ok) throw new Error(`Image preview failed (${response.status}).`);
  const objectUrl = URL.createObjectURL(await response.blob());
  if (trackForList) designerListImageUrls.add(objectUrl);
  return objectUrl;
}

function clearDesignerListImagePreviews() {
  designerListImageUrls.forEach((url) => URL.revokeObjectURL(url));
  designerListImageUrls.clear();
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: authorizationHeaders(options.headers || {})
  });

  let payload = {};
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    const message = payload?.error?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  return payload;
}

function getProductImages(product) {
  if (Array.isArray(product.images) && product.images.length) {
    return [...product.images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  if (product.imageUrl) return [{ id: `legacy-${product.id}`, url: product.imageUrl, legacy: true, position: 0 }];
  return [];
}

function renderGallery() {
  if (!productGrid) return;
  productGrid.replaceChildren();

  const items = galleryItems;
  if (shopStatus) setMessage(shopStatus, `${items.length} ${items.length === 1 ? 'piece matches' : 'pieces match'} your filters.${activeMeasurements ? ' Only pieces with matching designer-supplied body ranges are shown.' : ''}`, 'success');

  if (!items.length) {
    const empty = makeElement('p', 'empty-gallery', 'No published pieces are available in this category yet.');
    productGrid.appendChild(empty);
    return;
  }

  for (const item of items) {
    const images = getProductImages(item);
    const card = document.createElement('article');
    card.className = 'product-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View ${item.title} details`);

    const favoriteIds = getFavoriteIds();
    const isFavorited = favoriteIds.includes(item.id);

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = `favorite-button ${isFavorited ? 'is-favorite' : ''}`;
    favoriteButton.setAttribute('aria-label', isFavorited ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`);
    favoriteButton.textContent = isFavorited ? '♥' : '♡';
    favoriteButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(item);
    });

    const imageWrap = makeElement('div', 'product-image');
    if (images[0]?.url) {
      const img = document.createElement('img');
      img.src = images[0].url;
      img.alt = `${item.title} cover photo`;
      img.loading = 'lazy';
      imageWrap.appendChild(img);
      if (images.length > 1) {
        const photoBadge = makeElement('span', 'photo-count-badge', `${images.length} photos`);
        imageWrap.appendChild(photoBadge);
      }
    } else {
      imageWrap.classList.add('product-image-fallback');
      imageWrap.textContent = 'House of Briar';
    }
    imageWrap.appendChild(favoriteButton);

    const body = makeElement('div', 'product-body');
    const meta = makeElement('div', 'meta-row');
    const badgeRow = makeElement('div', 'listing-badges');
    renderItemBadges(badgeRow, item);
    meta.appendChild(makeElement('span', 'badge', item.style || categoryLabel(item.category)));
    if (item.aesthetic) meta.appendChild(makeElement('span', 'badge', item.aesthetic));
    meta.appendChild(makeElement('span', 'price', `$${Number(item.price || 0).toFixed(2)}`));
    const maker = makeElement('a', 'designer-card-link', item.designerName || 'Independent designer');
    maker.href = `/designers/${encodeURIComponent(item.designerId)}`;
    if (item.designerLogoUrl) { const logo = document.createElement('img'); logo.src = item.designerLogoUrl; logo.alt = ''; logo.loading = 'lazy'; maker.prepend(logo); }
    maker.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void openDesignerStorefront(item.designerId); });
    maker.addEventListener('keydown', event => event.stopPropagation());
    body.append(maker, meta);
    if (badgeRow.children.length) body.appendChild(badgeRow);
    body.appendChild(makeElement('span', 'card-title', item.title));
    body.appendChild(makeElement('span', 'card-description', item.description || 'A one-of-a-kind designation from an independent designer.'));

    card.addEventListener('click', (event) => {
      if (event.target.closest('.favorite-button')) return;
      openProductDetails(item);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProductDetails(item);
      }
    });

    card.append(imageWrap, body);
    productGrid.appendChild(card);
  }
}

async function loadGallery() {
  const request = ++galleryRequest;
  const params = new URLSearchParams();
  if (activeAccessory !== 'all') {
    params.set('category', 'accessories');
    if (activeAccessory !== 'accessories') params.set('style', activeAccessory);
  } else if (activeFilter !== 'all') {
    if (activeFilter === 'apparel') params.set('category', 'apparel');
    else params.set('style', activeFilter);
  }
  for (const [key, value] of [['aesthetic', activeAesthetic], ['pattern', activePattern], ['designer', activeDesigner], ['sort', activeShopWindow]]) {
    if (value !== 'all') params.set(key, value);
  }
  if (shopSearch) params.set('q', shopSearch.slice(0, 200));
  productGrid?.setAttribute('aria-busy', 'true');
  if (shopStatus) setMessage(shopStatus, 'Finding your next favorite…', '');
  try {
    const payload = activeMeasurements
      ? await apiRequest('/api/gallery/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: Object.fromEntries(params), measurements: activeMeasurements }) })
      : await apiRequest(`/api/gallery?${params}`);
    if (request !== galleryRequest) return;
    galleryItems = Array.isArray(payload.items) ? payload.items : [];
    renderGallery();
  } catch (error) {
    if (request !== galleryRequest) return;
    galleryItems = [];
    productGrid?.replaceChildren();
    if (shopStatus) setMessage(shopStatus, `Unable to load the gallery: ${error.message}`, 'error');
  } finally {
    if (request === galleryRequest) productGrid?.setAttribute('aria-busy', 'false');
  }
}

async function loadShopDesigners() {
  const select = byId('shop-designer-filter');
  if (!select) return;
  try {
    const { designers } = await apiRequest('/api/designers');
    for (const designer of designers || []) {
      const option = document.createElement('option');
      option.value = designer.id;
      option.textContent = designer.brandName || designer.displayName;
      select.append(option);
    }
  } catch (error) {
    select.disabled = true;
    if (shopStatus) setMessage(shopStatus, `Unable to load designers: ${error.message}`, 'error');
  }
}

function openPhotoLightbox(src, alt) {
  const lightbox = byId('photo-lightbox');
  const lightboxImage = byId('photo-lightbox-image');
  if (!lightbox || !lightboxImage) return;
  lightboxImage.src = src;
  lightboxImage.alt = alt || 'Full product photo';
  lightbox.showModal();
}

byId('photo-lightbox-close')?.addEventListener('click', () => byId('photo-lightbox')?.close());
byId('photo-lightbox')?.addEventListener('click', (event) => {
  if (event.target === byId('photo-lightbox')) byId('photo-lightbox')?.close();
});

const MEASUREMENT_PROFILES_KEY = 'house-of-briar:measurement-profiles';
function loadMeasurementProfiles(){try{const rows=JSON.parse(localStorage.getItem(MEASUREMENT_PROFILES_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return[];}}
function saveMeasurementProfiles(rows){localStorage.setItem(MEASUREMENT_PROFILES_KEY,JSON.stringify(rows));}
function measurementAvatar(profile = {}) {
  const number = (key, fallback) => { const raw = String(profile[key] || '').trim(); const value = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN; return value > 0 && Number.isFinite(value) ? value : fallback; };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const height = number('height', 67), scale = clamp(67 / height, .7, 1.35);
  const b = clamp(number('bust', 36) * scale, 22, 55), w = clamp(number('waist', 30) * scale, 18, 53), h = clamp(number('hips', 39) * scale, 23, 59);
  const path = `M72 48 L88 48 Q92 55 ${80+b*.85} 61 Q${80+b+4} 75 ${80+b} 87 C${80+b} 98 ${80+w} 107 ${80+w} 119 C${80+w} 132 ${80+h} 138 ${80+h} 154 Q${80+h} 176 80 180 Q${80-h} 176 ${80-h} 154 C${80-h} 138 ${80-w} 132 ${80-w} 119 C${80-w} 107 ${80-b} 98 ${80-b} 87 Q${80-b-4} 75 ${80-b*.85} 61 Q68 55 72 48 Z`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 160 250'); svg.classList.add('measurement-avatar'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Stylized measurement mannequin for ${profile.label || 'your profile'}`);
  svg.innerHTML = `<ellipse cx="80" cy="235" rx="54" ry="9" fill="#e7eee0"/><path d="M80 177v47m-24 10h48m-24-10-16 10m16-10 16 10" stroke="#b29453" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="80" cy="28" r="14" fill="#f7e7d0" stroke="#a4864d" stroke-width="2"/><path d="M75 41v7h10v-7" fill="#f7e7d0" stroke="#a4864d" stroke-width="2"/><path d="${path}" fill="#bad5c0" stroke="#a4864d" stroke-width="2"/><path d="M80 52v123" stroke="#f7f2df" stroke-width="1.5" stroke-dasharray="3 4"/><path d="M${80-w} 117Q80 125 ${80+w} 117" fill="none" stroke="#e6a099" stroke-width="8"/><path d="M${80-w} 117Q80 125 ${80+w} 117" fill="none" stroke="#a4864d" stroke-width="1" stroke-dasharray="1 7"/><path d="M76 73q4-7 8 0 8-3 5 4l-9 8-9-8q-3-7 5-4" fill="#e6a099"/>`;
  return svg;
}
function updateMeasurementAvatarPreview() {
  const host = byId('measurement-avatar-preview'); if (!host) return;
  const profile = { label: byId('measurement-profile-name')?.value || 'New profile' };
  for (const key of ['bust','waist','hips','height']) profile[key] = byId(`measurement-profile-${key}`)?.value || '';
  host.replaceChildren(measurementAvatar(profile));
}
function renderMeasurementProfiles(){const list=byId('measurement-profile-list');if(!list)return;list.replaceChildren();loadMeasurementProfiles().forEach(p=>{const row=makeElement('div','designer-product');const info=makeElement('div');info.appendChild(makeElement('strong','',p.label));if(p.bust||p.waist||p.hips||p.height){const text=[];if(p.bust)text.push(`Bust ${p.bust}`);if(p.waist)text.push(`Waist ${p.waist}`);if(p.hips)text.push(`Hips ${p.hips}`);if(p.height)text.push(`Height ${p.height}`);info.appendChild(makeElement('p','',text.join(' · ')));}const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Delete';remove.addEventListener('click',()=>{const rows=loadMeasurementProfiles().filter(item=>item.id!==p.id);saveMeasurementProfiles(rows);renderMeasurementProfiles();});row.append(measurementAvatar(p),info,remove);list.appendChild(row);});}
byId('measurement-profile-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const label = byId('measurement-profile-name')?.value.trim();
  if (!label) return;
  const rows = loadMeasurementProfiles();
  rows.push({
    id: crypto.randomUUID(),
    label,
    bust: byId('measurement-profile-bust')?.value || '',
    waist: byId('measurement-profile-waist')?.value || '',
    hips: byId('measurement-profile-hips')?.value || '',
    height: byId('measurement-profile-height')?.value || '',
    notes: byId('measurement-profile-notes')?.value || ''
  });
  saveMeasurementProfiles(rows);
  renderMeasurementProfiles();
  byId('measurement-profile-form')?.reset();
  updateMeasurementAvatarPreview();
  setMessage(byId('measurement-profile-message'), 'Measurement profile saved.', 'success');
});
renderMeasurementProfiles();

function openProductDetails(item) {
  if (!productDialog) return;
  const images = getProductImages(item);
  productDetailTitle.textContent = item.title;
  productDetailContent.replaceChildren();

  const imageGrid = makeElement('div', 'product-detail-images');
  images.forEach((image, index) => {
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = `${item.title} image ${index + 1}`;
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `View full photo ${index + 1} of ${item.title}`);
    img.addEventListener('click', () => openPhotoLightbox(image.url, img.alt));
    img.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPhotoLightbox(image.url, img.alt);
      }
    });
    imageGrid.appendChild(img);
  });

  const copy = makeElement('div', 'product-detail-copy');
  const badgeRow = makeElement('div', 'detail-badge-row');
  renderItemBadges(badgeRow, item);
  if (badgeRow.children.length) copy.appendChild(badgeRow);
  copy.appendChild(makeElement('span', 'badge', item.style || categoryLabel(item.category)));
  if (item.aesthetic) copy.appendChild(makeElement('span', 'badge', item.aesthetic));
  if (item.pattern) copy.appendChild(makeElement('span', 'badge', item.pattern));
  if (item.productionType) {
    const productionButton = makeElement('button', 'badge production-info-button', item.productionType);
    productionButton.type = 'button';
    productionButton.addEventListener('click', () => {
      const info = {
        'One of a Kind': 'This is a unique piece. Only one is available. Adding it to your Suitcase does not reserve it; it is secured when checkout begins.',
        'Upcycled': 'This piece gives existing materials or garments a new life through the designer’s creative work.',
        'Made in Multiple': 'This design can be made more than once. Individual pieces may still vary because they are independently made.'
      };
      byId('production-info-title').textContent = item.productionType;
      byId('production-info-content').replaceChildren(makeElement('p', '', info[item.productionType] || 'Ask the designer for details about this piece.'));
      byId('production-info-dialog')?.showModal();
    });
    copy.appendChild(productionButton);
  }
  if (item.alterationsAvailable) copy.appendChild(makeElement('p', 'notice', 'Alterations available — this designer can adjust this piece.'));
  if (item.takesRequests) copy.appendChild(makeElement('p', 'notice', 'Takes requests — this designer welcomes inquiries about custom or related work.'));
  copy.appendChild(makeElement('h3', '', item.title));
  copy.appendChild(makeElement('strong', 'price', `$${Number(item.price || 0).toFixed(2)}`));
  if (item.size) copy.appendChild(makeElement('p', 'product-size', `Size: ${item.size}`));
  const ranges = Object.entries(item.fitMeasurements || {}).map(([key, range]) => `${key}: ${range.min}–${range.max} in`);
  if (ranges.length) copy.appendChild(makeElement('p', 'product-fit', `Fits body measurements — ${ranges.join(' · ')}`));
  if (item.materials) copy.appendChild(makeElement('p', 'product-materials', `Materials: ${item.materials}`));
  if (item.careInstructions) copy.appendChild(makeElement('p', 'product-care', `Care: ${item.careInstructions}`));
  copy.appendChild(makeElement('p', '', item.description || 'A carefully made piece from an independent designer.'));

  const reportSection = document.createElement('details'); reportSection.className = 'listing-report';
  reportSection.append(makeElement('summary', 'text-button', 'Report listing'));
  const reportForm = document.createElement('form'); reportForm.className = 'stack-form';
  const reasonLabel = makeElement('label', '', 'Why are you reporting this piece?');
  const reason = document.createElement('select'); reason.required = true; reason.setAttribute('aria-label', 'Report reason');
  for (const [value, label] of [['', 'Choose a reason'], ['misleading', 'Misleading listing'], ['copyright', 'Copied work / copyright concern'], ['prohibited', 'Prohibited item'], ['inappropriate', 'Inappropriate content'], ['other', 'Other']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; reason.append(option); }
  reasonLabel.append(reason);
  const notesLabel = makeElement('label', '', 'Details (optional, required for Other)');
  const notes = document.createElement('textarea'); notes.rows = 3; notes.maxLength = 2000; notes.setAttribute('aria-label', 'Report details'); notesLabel.append(notes);
  const submit = makeElement('button', 'secondary-button', 'Send report'); submit.type = 'submit';
  const reportMessage = makeElement('p', 'form-message'); reportMessage.setAttribute('role', 'status');
  reportForm.append(makeElement('p', 'small-print', 'Reports are reviewed privately by House of Briar. Reporting does not automatically remove a piece.'), reasonLabel, notesLabel, submit, reportMessage);
  reportForm.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try { await apiRequest(`/api/listings/${encodeURIComponent(item.id)}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.value, notes: notes.value.trim() }) }); setMessage(reportMessage, 'Thank you. Your report is saved for the House team to review.', 'success'); }
    catch (error) { setMessage(reportMessage, error.message, 'error'); submit.disabled = false; }
  }); reportSection.append(reportForm); copy.append(reportSection);
  const sizingBox = makeElement('div', 'measurement-request');
  sizingBox.appendChild(makeElement('h4', '', 'Send measurements for this piece'));
  sizingBox.appendChild(makeElement('p', 'small-print', 'Choose a saved Visitor’s Suite profile or enter measurements here. They are attached only to this piece.'));

  const profileSelect = document.createElement('select');
  profileSelect.innerHTML = '<option value="">Choose saved profile (optional)</option>';
  loadMeasurementProfiles().forEach((p) => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label;
    profileSelect.appendChild(option);
  });

  const bust = document.createElement('input');
  const waist = document.createElement('input');
  const hips = document.createElement('input');
  const height = document.createElement('input');
  const note = document.createElement('textarea');
  bust.placeholder = 'Bust / chest';
  waist.placeholder = 'Waist';
  hips.placeholder = 'Hips';
  height.placeholder = 'Height';
  note.placeholder = 'Sizing request for this piece';
  profileSelect.addEventListener('change', () => {
    const match = loadMeasurementProfiles().find((x) => x.id === profileSelect.value);
    if (!match) return;
    bust.value = match.bust || '';
    waist.value = match.waist || '';
    hips.value = match.hips || '';
    height.value = match.height || '';
    note.value = match.notes || '';
  });
  const send = makeElement('button', 'secondary-button', 'Send measurement request');
  send.type = 'button';
  send.addEventListener('click', async () => {
    const measurements = [
      bust.value && `Bust/chest: ${bust.value}`,
      waist.value && `Waist: ${waist.value}`,
      hips.value && `Hips: ${hips.value}`,
      height.value && `Height: ${height.value}`,
      note.value && `Notes: ${note.value}`
    ].filter(Boolean);
    if (!measurements.length) {
      setMessage(shopStatus, 'Add at least one measurement before sending.', 'error');
      return;
    }
    setMessage(shopStatus, `Measurement request prepared for ${item.title}.`, 'success');
  });
  sizingBox.append(profileSelect, bust, waist, hips, height, note, send);
  copy.appendChild(sizingBox);

  const addButton = makeElement('button', 'primary-button', getCartIds().includes(item.id) ? 'In Suitcase' : 'Add to Suitcase');
  addButton.type = 'button';
  addButton.disabled = getCartIds().includes(item.id);
  addButton.addEventListener('click', () => addToCart(item));
  copy.appendChild(addButton);
  if (images.length > 1) copy.appendChild(makeElement('p', 'small-print', `${images.length} photos · first image is the cover`));

  productDetailContent.append(imageGrid, copy);
  productDialog.showModal();
}

function resetListingForm() {
  if (productForm) productForm.reset();
  currentListingId = '';
  currentIdempotencyKey = '';
  if (productIdInput) productIdInput.value = '';
  if (listingFormTitle) listingFormTitle.textContent = 'Add a design';
  selectedImages.forEach((item) => {
    if (item.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(item.objectUrl);
  });
  selectedImages = [];
  if (photoPreview) photoPreview.replaceChildren();
  setMessage(uploadMessage, '', '');
}

function validateSelectedImage(file) {
  const isAllowedMime = ALLOWED_MIME_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isAllowedMime) return 'Choose a JPEG, PNG, or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Each image must be 10 MiB or smaller.';
  return '';
}

function renderSelectedImages() {
  if (!photoPreview) return;
  photoPreview.replaceChildren();
  selectedImages.forEach((image, index) => {
    const item = makeElement('div', 'photo-preview-item');
    const img = document.createElement('img');
    img.src = image.objectUrl || image.url;
    img.alt = image.name || `Image ${index + 1}`;
    item.appendChild(img);
    item.appendChild(makeElement('span', 'photo-order-label', index === 0 ? 'Cover' : String(index + 1)));

    const info = makeElement('div', 'photo-preview-meta');
    info.appendChild(makeElement('strong', '', image.name || `Image ${index + 1}`));
    const statusText = image.status === 'uploading' ? 'Uploading…' : image.status === 'ready' ? 'Ready' : image.status === 'failed' ? (image.error || 'Failed') : 'Queued';
    info.appendChild(makeElement('span', '', `${statusText}${image.size ? ` · ${formatBytes(image.size)}` : ''}`));
    item.appendChild(info);

    const actions = makeElement('div', 'photo-preview-actions');
    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.textContent = 'Move up';
    moveUp.disabled = index === 0;
    moveUp.addEventListener('click', () => {
      if (index > 0) {
        [selectedImages[index], selectedImages[index - 1]] = [selectedImages[index - 1], selectedImages[index]];
        renderSelectedImages();
      }
    });
    actions.appendChild(moveUp);

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.textContent = 'Move down';
    moveDown.disabled = index === selectedImages.length - 1;
    moveDown.addEventListener('click', () => {
      if (index < selectedImages.length - 1) {
        [selectedImages[index], selectedImages[index + 1]] = [selectedImages[index + 1], selectedImages[index]];
        renderSelectedImages();
      }
    });
    actions.appendChild(moveDown);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        if (image.id && currentListingId) {
          await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/images/${encodeURIComponent(image.id)}`, { method: 'DELETE' });
        }
        if (image.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(image.objectUrl);
        const currentIndex = selectedImages.indexOf(image);
        if (currentIndex >= 0) selectedImages.splice(currentIndex, 1);
        renderSelectedImages();
      } catch (error) {
        remove.disabled = false;
        setMessage(uploadMessage, error.message, 'error');
      }
    });
    actions.appendChild(remove);

    item.appendChild(actions);
    photoPreview.appendChild(item);
  });
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const remainingSlots = MAX_IMAGES - selectedImages.length;
  const nextFiles = files.slice(0, Math.max(0, remainingSlots));
  const issues = [];

  nextFiles.forEach((file) => {
    const problem = validateSelectedImage(file);
    if (problem) {
      issues.push(`${file.name}: ${problem}`);
      return;
    }
    selectedImages.push({
      id: '',
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
      objectUrl: URL.createObjectURL(file),
      url: ''
    });
  });

  if (files.length > remainingSlots) {
    issues.push(`Only ${Math.max(0, remainingSlots)} more image slot(s) remain.`);
  }

  renderSelectedImages();
  setMessage(uploadMessage, issues.length ? issues.join(' ') : 'Photos selected. Save or submit to upload them.', issues.length ? 'error' : 'success');
  if (photoInput) photoInput.value = '';
}

function renderFabricFinderResult(analysis = {}, disclaimer = '') {
  if (!fabricFinderResult) return;
  fabricFinderResult.replaceChildren();
  const title = makeElement('h4', '', analysis.fabricFamily || 'Fabric estimate');
  fabricFinderResult.appendChild(title);
  const rows = [
    ['Likely fibers', Array.isArray(analysis.likelyFibers) ? analysis.likelyFibers.join(', ') : 'Not enough visual evidence'],
    ['Construction', analysis.construction], ['Texture', analysis.texture], ['Weight', analysis.weight], ['Drape', analysis.drape],
    ['Likely uses', Array.isArray(analysis.likelyUses) ? analysis.likelyUses.join(', ') : ''],
    ['Care', Array.isArray(analysis.careConsiderations) ? analysis.careConsiderations.join(' · ') : ''], ['Confidence', analysis.confidence], ['Notes', analysis.notes]
  ];
  for (const [label, value] of rows) if (value) {
    const p = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = label + ': ';
    p.append(strong, document.createTextNode(String(value))); fabricFinderResult.appendChild(p);
  }
  const use = document.createElement('button'); use.type = 'button'; use.className = 'primary-button'; use.textContent = 'Use material & care in my listing';
  use.addEventListener('click', () => {
    if (byId('product-materials') && analysis.listingMaterialSuggestion) byId('product-materials').value = analysis.listingMaterialSuggestion;
    if (byId('product-care') && Array.isArray(analysis.careConsiderations)) byId('product-care').value = analysis.careConsiderations.join('; ');
    byId('product-materials')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  fabricFinderResult.appendChild(use);
  if (disclaimer) fabricFinderResult.appendChild(makeElement('p', 'small-print', disclaimer));
  fabricFinderResult.classList.remove('hidden');
}

fabricFinderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = Array.from(fabricFinderPhotos?.files || []);
  if (!files.length || files.length > 3) { setMessage(fabricFinderMessage, 'Choose between one and three fabric photos.', 'error'); return; }
  if (files.some(file => !ALLOWED_MIME_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES)) { setMessage(fabricFinderMessage, 'Use JPEG, PNG, or WebP photos up to 10 MiB each.', 'error'); return; }
  const button = byId('fabric-finder-submit'); if (button) button.disabled = true;
  setMessage(fabricFinderMessage, 'Looking closely at the fabric…', 'success');
  fabricFinderResult?.classList.add('hidden');
  try {
    const data = new FormData(); files.forEach(file => data.append('photos', file, file.name));
    const payload = await apiRequest('/api/my/fabric-finder', { method: 'POST', body: data });
    renderFabricFinderResult(payload.analysis || {}, payload.disclaimer || 'Visual estimate only.');
    setMessage(fabricFinderMessage, 'Fabric estimate ready.', 'success');
  } catch (error) { setMessage(fabricFinderMessage, error.message, 'error'); }
  finally { if (button) button.disabled = false; }
});

function readFitRanges() {
  const ranges = {};
  for (const key of ['bust', 'waist', 'hips', 'inseam']) {
    const min = byId(`product-fit-${key}-min`)?.value || '';
    const max = byId(`product-fit-${key}-max`)?.value || '';
    if (min || max) ranges[key] = { min: min ? Number(min) : null, max: max ? Number(max) : null };
  }
  return ranges;
}

function readFormValues() {
  return {
    title: byId('product-name').value.trim(),
    description: byId('product-description').value.trim(),
    price: byId('product-price').value,
    category: 'apparel',
    style: byId('product-style')?.value || '',
    size: byId('product-size')?.value || '',
    fitMeasurements: readFitRanges(),
    aesthetic: byId('product-aesthetic')?.value || '',
    pattern: byId('product-pattern')?.value || '',
    materials: byId('product-materials')?.value.trim() || '',
    careInstructions: byId('product-care')?.value.trim() || '',
    productionType: byId('product-production-type')?.value || '',
    alterationsAvailable: Boolean(byId('product-alterations')?.checked),
    takesRequests: Boolean(byId('product-requests')?.checked)
  };
}

function validateListingValues(values) {
  if (!values.title || values.title.length > 120) return 'Add a design name (1–120 characters).';
  if (values.description.length > 2000) return 'Description must be 2,000 characters or fewer.';
  if (!values.style) return 'Choose a garment type.';
  if (!values.size) return 'Choose a size.';
  if (!values.aesthetic) return 'Choose an aesthetic style.';
  if (values.materials.length > 500) return 'Materials must be 500 characters or fewer.';
  if (values.careInstructions.length > 1000) return 'Care instructions must be 1,000 characters or fewer.';
  if (!values.productionType) return 'Choose One of a Kind, Upcycled, or Made in Multiple.';
  if (!Number.isFinite(Number(values.price)) || Number(values.price) < 0) return 'Provide a valid price.';
  if (selectedImages.length < 1) return 'At least one photo is required.';
  return '';
}

async function ensureListing(values) {
  if (currentListingId) {
    return (await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    })).item;
  }

  const existingKey = currentIdempotencyKey || (currentIdempotencyKey = crypto.randomUUID());
  const payload = await apiRequest('/api/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': existingKey },
    body: JSON.stringify(values)
  });

  currentListingId = payload.item.id;
  if (productIdInput) productIdInput.value = payload.item.id;
  return payload.item;
}

async function uploadQueuedImages() {
  for (const image of selectedImages) {
    if (!image.file || image.status === 'ready' || image.status === 'uploading') continue;
    const knownImageIds = new Set(selectedImages.filter((selected) => selected.id).map((selected) => selected.id));
    image.status = 'uploading';
    renderSelectedImages();

    const formData = new FormData();
    formData.append('image', image.file, image.name);
    const key = image.clientImageKey || (image.clientImageKey = crypto.randomUUID());

    try {
      const payload = await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/images`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: formData
      });
      const uploaded = payload.item.images.find((entry) => entry.url && !entry.legacy && !knownImageIds.has(entry.id));
      if (uploaded) {
        image.id = uploaded.id;
        image.url = uploaded.url;
        image.status = 'ready';
        image.error = '';
      } else {
        image.status = 'failed';
        image.error = 'Upload returned no image reference.';
      }
    } catch (error) {
      image.status = 'failed';
      image.error = error.message;
    }

    renderSelectedImages();
  }
}

async function handleSave(event) {
  event.preventDefault();
  if (!designerToken) {
    setMessage(uploadMessage, 'Sign in to save a listing.', 'error');
    return;
  }

  const values = readFormValues();
  const validationError = validateListingValues(values);
  if (validationError) {
    setMessage(uploadMessage, validationError, 'error');
    return;
  }

  const action = event.submitter?.value || 'draft';
  setMessage(uploadMessage, 'Saving the listing…', 'success');

  try {
    await ensureListing(values);
    await uploadQueuedImages();
    const failed = selectedImages.filter((image) => image.status === 'failed');
    if (failed.length && action === 'submit') {
      setMessage(uploadMessage, 'Fix or remove failed images before submitting.', 'error');
      return;
    }

    const order = selectedImages.filter((image) => image.status === 'ready' && image.id).map((image) => image.id);
    if (order.length) {
      await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/images/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: order })
      });
    }

    if (action === 'submit') {
      const rulesAccepted = byId('marketplace-rules-accepted')?.checked === true;
      if (!rulesAccepted) {
        setMessage(uploadMessage, 'Confirm that this listing follows House of Briar marketplace rules before submitting.', 'error');
        return;
      }
      const payload = await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceRulesAccepted: true })
      });
      if (payload.item.status === 'pending_review') {
        setMessage(uploadMessage, 'Submitted for review. It will appear in the Shop after approval.', 'success');
      } else {
        setMessage(uploadMessage, 'Published to the Shop gallery.', 'success');
      }
      await loadDesignerListings();
      await loadGallery();
      resetListingForm();
      return;
    }

    setMessage(uploadMessage, 'Draft saved successfully.', 'success');
    await loadDesignerListings();
  } catch (error) {
    setMessage(uploadMessage, error.message, 'error');
  }
}

let designerListingsLoad = 0;
async function loadDesignerListings() {
  const loadId = ++designerListingsLoad;
  if (!designerToken) return;
  try {
    const payload = await apiRequest('/api/my/listings', { cache: 'no-store' });
    if (loadId !== designerListingsLoad) return;
    clearDesignerListImagePreviews();
    if (designerProductsContainer) designerProductsContainer.replaceChildren();
    const listings = payload.items || [];
    if (!listings.length) {
      if (designerProductsContainer) designerProductsContainer.appendChild(makeElement('p', 'empty-state', 'No listings yet. Create a new design above.'));
      return;
    }

    for (const listing of listings) {
      const row = makeElement('div', 'designer-product-item');
      const images = getProductImages(listing);
      const preview = document.createElement('img');
      preview.alt = `${listing.title} preview`;
      preview.loading = 'lazy';
      if (images[0]?.url) {
        try {
          preview.src = await loadPrivateImagePreview(images[0].url, true);
        } catch {}
      }
      if (loadId !== designerListingsLoad) return;
      row.appendChild(preview);

      const info = makeElement('div', 'designer-product-info');
      info.appendChild(makeElement('h4', '', listing.title));

      const itemBadges = makeElement('div', 'listing-badges');
      renderItemBadges(itemBadges, listing);
      if (itemBadges.children.length) info.appendChild(itemBadges);

      info.appendChild(makeElement('p', '', `${images.length} photo${images.length === 1 ? '' : 's'} · ${categoryLabel(listing.category)}`));
      row.appendChild(info);

      const actions = makeElement('div', 'designer-product-actions');
      const badge = makeElement('span', 'status-badge', listing.status === 'pending_review' ? 'Pending review' : listing.status === 'published' ? 'Published' : listing.status === 'rejected' ? 'Rejected' : 'Draft');
      actions.appendChild(badge);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.className = 'text-button';
      edit.addEventListener('click', () => editListing(listing.id));
      if (['draft', 'rejected', 'published'].includes(listing.status)) actions.appendChild(edit);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.className = 'text-button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${listing.title}" permanently? This also removes its uploaded photos.`)) return;
        remove.disabled = true;
        try {
          await apiRequest(`/api/listings/${encodeURIComponent(listing.id)}`, { method: 'DELETE' });
          ++designerListingsLoad;
          row.remove();
          setMessage(byId('designer-listings-message'), 'Listing deleted.', 'success');
          if (currentListingId === listing.id) resetListingForm();
          await loadDesignerListings();
          await loadGallery();
        } catch (error) {
          setMessage(byId('designer-listings-message'), `Could not delete listing: ${error.message}`, 'error');
          remove.disabled = false;
        }
      });
      actions.appendChild(remove);
      row.appendChild(actions);
      if (designerProductsContainer) designerProductsContainer.appendChild(row);
    }
  } catch (error) {
    if (error.status === 401) signOut();
    setMessage(designerAuthMessage, `Could not load listings: ${error.message}`, 'error');
  }
}

async function editListing(listingId) {
  try {
    const payload = await apiRequest(`/api/listings/${encodeURIComponent(listingId)}`);
    const listing = payload.item;
    currentListingId = listing.id;
    if (productIdInput) productIdInput.value = listing.id;
    if (byId('product-name')) byId('product-name').value = listing.title;
    if (byId('product-description')) byId('product-description').value = listing.description;
    if (byId('product-price')) byId('product-price').value = listing.price;
    if (byId('product-category')) byId('product-category').value = 'apparel';
    if (byId('product-style')) byId('product-style').value = listing.style || '';
    if (byId('product-size')) byId('product-size').value = listing.size || '';
    for (const key of ['bust','waist','hips','inseam']) for (const bound of ['min','max']) {
      const input = byId(`product-fit-${key}-${bound}`); if (input) input.value = listing.fitMeasurements?.[key]?.[bound] ?? '';
    }
    if (byId('product-aesthetic')) byId('product-aesthetic').value = listing.aesthetic || '';
    if (byId('product-pattern')) byId('product-pattern').value = listing.pattern || '';
    if (byId('product-materials')) byId('product-materials').value = listing.materials || '';
    if (byId('product-care')) byId('product-care').value = listing.careInstructions || '';
    if (byId('product-production-type')) byId('product-production-type').value = listing.productionType || '';
    if (byId('product-alterations')) byId('product-alterations').checked = Boolean(listing.alterationsAvailable);
    if (byId('product-requests')) byId('product-requests').checked = Boolean(listing.takesRequests);
    if (listingFormTitle) listingFormTitle.textContent = 'Edit a design';

    selectedImages.forEach((image) => {
      if (image.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(image.objectUrl);
    });
    selectedImages = [];
    renderSelectedImages();

    const images = getProductImages(listing);
    for (const image of images) {
      let objectUrl = image.url;
      if (!image.legacy) {
        try {
          objectUrl = await loadPrivateImagePreview(image.url);
        } catch {}
      }
      selectedImages.push({
        id: image.id,
        file: null,
        name: image.legacy ? 'Existing image' : 'Existing image',
        size: 0,
        status: 'ready',
        url: image.url,
        objectUrl
      });
    }
    renderSelectedImages();
    setMessage(uploadMessage, listing.status === 'published' ? 'Published design loaded. Changes stay live when saved.' : 'Draft loaded. You can add new images or remove existing ones.', 'success');
  } catch (error) {
    setMessage(uploadMessage, error.message, 'error');
  }
}

async function signIn(tokenValue) {
  const token = tokenValue.trim();
  if (!token) {
    setMessage(designerAuthMessage, 'Enter your designer access token.', 'error');
    return;
  }

  designerToken = token;
  try {
    await apiRequest('/api/session', { method: 'POST' });
    localStorage.setItem('briarDesignerToken', designerToken);
    sessionStorage.removeItem('briarDesignerToken');
    if (loginPanel) loginPanel.classList.add('hidden');
    if (designerWorkspace) designerWorkspace.classList.remove('hidden');
    setMessage(designerAuthMessage, '', '');
    await loadDesignerListings();
    await loadDesignerBrand();
  } catch (error) {
    designerToken = '';
    localStorage.removeItem('briarDesignerToken');
    sessionStorage.removeItem('briarDesignerToken');
    setMessage(designerAuthMessage, error.message, 'error');
  }
}

function signOut() {
  designerToken = '';
  localStorage.removeItem('briarDesignerToken');
  sessionStorage.removeItem('briarDesignerToken');
  if (loginPanel) loginPanel.classList.remove('hidden');
  if (designerWorkspace) designerWorkspace.classList.add('hidden');
  if (designerTokenInput) designerTokenInput.value = '';
  clearDesignerListImagePreviews();
  resetListingForm();
  setMessage(designerAuthMessage, 'Signed out.', 'success');
}

function applyFilterButtons() {
  const garmentSelect = byId('shop-garment-filter');
  const aestheticSelect = byId('shop-aesthetic-filter');
  if (garmentSelect) garmentSelect.value = activeFilter;
  if (aestheticSelect) aestheticSelect.value = activeAesthetic;
}

byId('shop-garment-filter')?.addEventListener('change', (event) => {
  activeFilter = event.target.value || 'all';
  activeAccessory = 'all';
  byId('shop-accessory-filter').value = 'all';
  byId('shop-accessory-filter').dispatchEvent(new Event('shop-caption'));
  loadGallery();
});
byId('shop-aesthetic-filter')?.addEventListener('change', (event) => {
  activeAesthetic = event.target.value || 'all';
  loadGallery();
});

byId('visitor-suite-btn')?.addEventListener('click', () => {
  renderVisitorFavorites();
  byId('visitor-suite-modal')?.showModal();
  syncAccountFavorites();
});
byId('visitor-suite-close')?.addEventListener('click', () => byId('visitor-suite-modal')?.close());
byId('shop-pattern-filter')?.addEventListener('change', (event) => { activePattern = event.target.value || 'all'; loadGallery(); });
byId('shop-accessory-filter')?.addEventListener('change', (event) => { activeAccessory = event.target.value || 'all'; activeFilter = 'all'; byId('shop-garment-filter').value = 'all'; byId('shop-garment-filter').dispatchEvent(new Event('shop-caption')); loadGallery(); });
byId('shop-search-input')?.addEventListener('input', (event) => { shopSearch = event.target.value.trim(); clearTimeout(searchTimer); searchTimer = setTimeout(loadGallery, 200); });

byId('shop-designer-filter')?.addEventListener('change', event => { activeDesigner = event.target.value || 'all'; loadGallery(); });
byId('shop-clear-filters')?.addEventListener('click', () => {
  clearTimeout(searchTimer);
  activeFilter = activeAccessory = activeAesthetic = activePattern = activeShopWindow = activeDesigner = 'all';
  shopSearch = '';
  activeMeasurements = null;
  byId('shop-fit-form')?.reset();
  setMessage(byId('shop-fit-message'), '', '');
  byId('shop-search-input').value = '';
  for (const id of ['shop-garment-filter', 'shop-accessory-filter', 'shop-aesthetic-filter', 'shop-pattern-filter', 'shop-designer-filter']) {
    const select = byId(id); select.value = 'all'; select.dispatchEvent(new Event('shop-caption'));
  }
  loadGallery();
});

for (const id of ['shop-garment-filter', 'shop-aesthetic-filter', 'shop-pattern-filter', 'shop-accessory-filter', 'shop-designer-filter']) {
  const select = byId(id);
  const windowLabel = select?.closest('.shop-drop-window');
  const caption = windowLabel?.querySelector('.category-window-current');
  if (!select || !windowLabel || !caption) continue;
  const syncCaption = () => {
    const selected = select.options[select.selectedIndex];
    caption.textContent = selected?.textContent?.trim() || '';
    windowLabel.classList.toggle('has-changed-selection', select.selectedIndex !== 0);
  };
  select.addEventListener('change', syncCaption);
  select.addEventListener('shop-caption', syncCaption);
  syncCaption();
}

if (designerSignupLink) {
  designerSignupLink.addEventListener('click', (event) => {
    event.preventDefault();
    if (designerModal && typeof designerModal.showModal === 'function') designerModal.showModal();
    requestAnimationFrame(() => byId('designer-signup')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
}

if (designerSignupForm) {
  designerSignupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(designerSignupForm);
    const categories = String(form.get('categories') || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (designerSignupMessage) designerSignupMessage.textContent = 'Joining the House…';
    try {
      const response = await fetch('/api/designer-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: String(form.get('displayName') || '').trim(),
          brandName: String(form.get('brandName') || '').trim(),
          email: String(form.get('email') || '').trim(),
          categories
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Designer sign up could not be completed.');
      designerSignupForm.reset();
      if (!payload.accessToken) throw new Error('Your profile was created, but studio access could not be started.');
      if (designerSignupMessage) designerSignupMessage.textContent = 'Welcome to House of Briar. Opening your Designer’s Room…';
      await signIn(payload.accessToken);
      byId('designer-welcome')?.classList.remove('hidden');
      requestAnimationFrame(() => byId('designer-welcome')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (error) {
      if (designerSignupMessage) designerSignupMessage.textContent = error instanceof Error ? error.message : 'Designer sign up could not be completed.';
    }
  });
}

if (designerLoginBtn) {
  designerLoginBtn.addEventListener('click', () => {
    if (!designerToken) {
      if (loginPanel) loginPanel.classList.remove('hidden');
      if (designerWorkspace) designerWorkspace.classList.add('hidden');
      setMessage(designerAuthMessage, '🔒 Designer’s Room is locked. Designer access is required to enter.', '');
    } else {
      if (loginPanel) loginPanel.classList.add('hidden');
      if (designerWorkspace) designerWorkspace.classList.remove('hidden');
    }
    designerModal.showModal();
  });
}
if (modalClose) modalClose.addEventListener('click', () => designerModal.close());
if (designerLoginForm) designerLoginForm.addEventListener('submit', (event) => { event.preventDefault(); signIn(designerTokenInput.value); });
if (productForm) productForm.addEventListener('submit', handleSave);
if (photoInput) photoInput.addEventListener('change', (event) => addFiles(event.target.files));
byId('start-profile-setup')?.addEventListener('click', () => byId('designer-brand-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
byId('signout-btn')?.addEventListener('click', signOut);
byId('new-listing-btn')?.addEventListener('click', resetListingForm);
byId('product-dialog-close')?.addEventListener('click', () => productDialog.close());

byId('donation-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const amount = Number(byId('donation-amount')?.value);
  const message = byId('donation-message');
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000) {
    setMessage(message, 'Choose a donation between $1 and $1,000.', 'error');
    return;
  }
  try {
    setMessage(message, 'Opening secure checkout…', '');
    const payload = await apiRequest('/api/donations/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    if (!payload?.url) throw new Error('Donation checkout did not return a checkout link.');
    window.location.assign(payload.url);
  } catch (error) {
    setMessage(message, error.message || 'Donation checkout could not be started.', 'error');
  }
});

byId('newsletter-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = byId('email');
  if (email && email.value.trim()) {
    email.value = '';
    email.placeholder = 'Thanks for joining!';
  }
});

if (designerToken) {
  if (loginPanel) loginPanel.classList.add('hidden');
  if (designerWorkspace) designerWorkspace.classList.remove('hidden');
  signIn(designerToken);
}

applyFilterButtons();
loadShopDesigners();
loadGallery();

function adminHeaders(extra = {}) {
  const headers = new Headers(extra);
  if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`);
  return headers;
}

async function adminRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: adminHeaders(options.headers) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Request failed (${response.status}).`);
  return payload;
}

async function adminImagePreview(url) {
  const response = await fetch(url, { headers: adminHeaders() });
  if (!response.ok) throw new Error('Image preview unavailable.');
  return URL.createObjectURL(await response.blob());
}

async function renderAdminQueue() {
  if (!adminReviewList) return;
  adminReviewList.replaceChildren();
  setMessage(adminReviewMessage, 'Loading pending clothing…');
  try {
    const view = byId('admin-listing-view')?.value || 'pending_review';
    const payload = await adminRequest(view === 'pending_review' ? '/api/admin/listings/review-queue' : '/api/admin/listings');
    if (view !== 'all') payload.items = (payload.items || []).filter(item => item.status === view);
    void renderAdminOverview();
    adminLoginPanel?.classList.add('hidden');
    adminReviewWorkspace?.classList.remove('hidden');
    setMessage(adminReviewMessage, '');
    if (!payload.items?.length) {
      adminReviewList.appendChild(makeElement('p', 'empty-state', 'No listings in this view.'));
      return;
    }
    for (const item of payload.items) {
      const card = makeElement('article', 'admin-review-card');
      const media = makeElement('div', 'admin-review-media');
      const image = document.createElement('img');
      image.alt = `${item.title} submitted clothing`;
      if (item.images?.[0]?.url) {
        adminImagePreview(item.images[0].url).then((url) => {
          image.src = url;
        }).catch(() => {
          media.textContent = 'Preview unavailable';
        });
        media.appendChild(image);
      } else media.textContent = 'No image';
      const body = makeElement('div', 'admin-review-copy');
      body.append(makeElement('span', 'status-badge', item.status.replaceAll('_', ' ')));
      body.append(makeElement('h3', '', item.title));
      body.append(makeElement('p', 'admin-review-meta', `${item.designerName || item.designerId || 'Designer'} · $${Number(item.price).toFixed(2)} · ${categoryLabel(item.category)}`));
      body.append(makeElement('p', '', item.description || 'No description provided.'));
      const reason = document.createElement('textarea');
      reason.rows = 2; reason.maxLength = 1000; reason.placeholder = 'Reason required only if rejecting';
      reason.setAttribute('aria-label', `Rejection reason for ${item.title}`);
      const actions = makeElement('div', 'form-actions');
      const approve = makeElement('button', 'primary-button', 'Approve');
      approve.type = 'button';
      approve.addEventListener('click', async () => {
        approve.disabled = true;
        try {
          await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}/approve`, { method: 'POST' });
          await renderAdminQueue();
          await loadGallery();
        } catch (error) {
          setMessage(adminReviewMessage, error.message, 'error');
          approve.disabled = false;
        }
      });
      const reject = makeElement('button', 'secondary-button', 'Reject');
      reject.type = 'button';
      reject.addEventListener('click', async () => {
        const why = reason.value.trim();
        if (!why) {
          setMessage(adminReviewMessage, 'Enter a reason before rejecting a listing.', 'error');
          reason.focus();
          return;
        }
        reject.disabled = true;
        try {
          await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: why }) });
          await renderAdminQueue();
        } catch (error) {
          setMessage(adminReviewMessage, error.message, 'error');
          reject.disabled = false;
        }
      });
      const remove = makeElement('button', 'secondary-button', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${item.title}" permanently? This also removes its uploaded photos.`)) return;
        remove.disabled = true;
        try {
          await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
          await renderAdminQueue();
          await loadGallery();
        } catch (error) {
          setMessage(adminReviewMessage, error.message, 'error');
          remove.disabled = false;
        }
      });
      if (item.status === 'pending_review') { actions.append(approve, reject); body.append(reason); }
      if (item.status === 'published') {
        const hide = makeElement('button', 'secondary-button', 'Take off the floor');
        hide.type = 'button';
        hide.addEventListener('click', async () => {
          hide.disabled = true;
          try { await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}/unpublish`, { method: 'POST' }); await renderAdminQueue(); await loadGallery(); }
          catch (error) { setMessage(adminReviewMessage, error.message, 'error'); hide.disabled = false; }
        });
        actions.append(hide);
      }
      actions.append(remove);
      body.append(actions);
      card.append(media, body);
      adminReviewList.appendChild(card);
    }
  } catch (error) {
    adminReviewWorkspace?.classList.add('hidden');
    adminLoginPanel?.classList.remove('hidden');
    setMessage(adminReviewMessage, error.message, 'error');
  }
}

function openAdminReview() {
  adminReviewDialog?.showModal();
  if (adminToken) renderAdminQueue();
}

adminReviewBtn?.addEventListener('click', openAdminReview);
if (window.location.hash === '#admin-review') openAdminReview();
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#admin-review' && !adminReviewDialog?.open) openAdminReview();
});
adminReviewClose?.addEventListener('click', () => adminReviewDialog?.close());
adminLoginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminToken = adminTokenInput?.value.trim() || '';
  if (!adminToken) return;
  sessionStorage.setItem('briarAdminToken', adminToken);
  await renderAdminQueue();
});
adminSignoutBtn?.addEventListener('click', () => {
  ++adminOverviewLoad;
  byId('admin-overview')?.replaceChildren();
  adminReviewList?.replaceChildren();
  adminToken = '';
  sessionStorage.removeItem('briarAdminToken');
  if (adminTokenInput) adminTokenInput.value = '';
  adminReviewWorkspace?.classList.add('hidden');
  adminLoginPanel?.classList.remove('hidden');
  setMessage(adminReviewMessage, '');
});

byId('production-info-close')?.addEventListener('click', () => byId('production-info-dialog')?.close());

byId('admin-listing-view')?.addEventListener('change', renderAdminQueue);
byId('admin-refresh-btn')?.addEventListener('click', renderAdminQueue);
let adminOverviewLoad = 0;
async function renderAdminOverview() {
  const host = byId('admin-overview'); if (!host) return;
  const load = ++adminOverviewLoad; host.replaceChildren();
  const sections = [
    ['Operations', '/api/admin/operations'],
    ['Designer sign-ups', '/api/admin/designer-applications'],
    ['Customer service', '/api/admin/support'],
    ['Listing reports', '/api/admin/listing-reports']
  ];
  await Promise.all(sections.map(async ([title, url]) => {
    const section = makeElement('section', 'admin-summary-section');
    section.append(makeElement('h3', '', title)); host.append(section);
    try {
      const data = await adminRequest(url); if (load !== adminOverviewLoad || !adminToken) return;
      if (data.summary) {
        section.append(makeElement('p', '', 'Recent orders and payouts (up to 200 orders / 300 transfers).'));
        for (const [key, value] of Object.entries(data.summary)) section.append(makeElement('p', '', `${key.replace(/([A-Z])/g, ' $1')}: ${value}`));
        for (const order of data.orders || []) section.append(makeElement('p', '', `Order ${order.id} · ${order.status} · ${(order.subtotal_cents / 100).toFixed(2)} ${order.currency}`));
      }
      if (data.reports) {
        if (!data.reports.length) section.append(makeElement('p', '', 'No listing reports yet.'));
        for (const report of data.reports) {
          const card = makeElement('article', 'admin-support-item');
          card.append(makeElement('h4', '', `${report.title} · ${report.status}`), makeElement('p', '', `${report.reason} · ${report.created_at}`), makeElement('p', '', report.notes || 'No additional details.'));
          const view = makeElement('button', 'secondary-button', 'View listing'); view.type = 'button';
          view.addEventListener('click', async () => { try { const { items } = await adminRequest('/api/admin/listings'); const item = items.find(item => item.id === report.listing_id); if (!item) throw new Error('This listing has been deleted.'); openProductDetails(item); } catch (error) { setMessage(adminReviewMessage, error.message, 'error'); } }); card.append(view);
          if (report.status === 'open') {
            const resolve = makeElement('button', 'secondary-button', 'Mark reviewed'); resolve.type = 'button';
            resolve.addEventListener('click', async () => { resolve.disabled = true; try { await adminRequest(`/api/admin/listing-reports/${encodeURIComponent(report.id)}/resolve`, { method: 'POST' }); await renderAdminOverview(); } catch (error) { setMessage(adminReviewMessage, error.message, 'error'); resolve.disabled = false; } }); card.append(resolve);
            if (report.listing_status === 'published') {
              const hide = makeElement('button', 'secondary-button', 'Take off the floor'); hide.type = 'button';
              hide.addEventListener('click', async () => { hide.disabled = true; try { await adminRequest(`/api/admin/listings/${encodeURIComponent(report.listing_id)}/unpublish`, { method: 'POST' }); await loadGallery(); await renderAdminQueue(); } catch (error) { setMessage(adminReviewMessage, error.message, 'error'); hide.disabled = false; } }); card.append(hide);
            }
          } section.append(card);
        }
      }
      if (data.applications) {
        if (!data.applications.length) section.append(makeElement('p', '', 'No designer sign-ups yet.'));
        for (const item of data.applications) section.append(makeElement('p', '', `${item.brand_name || item.display_name} · ${item.email} · ${item.status}`));
      }
      if (data.messages) {
        if (!data.messages.length) section.append(makeElement('p', '', 'No customer-service requests yet.'));
        for (const item of data.messages) {
          const card = makeElement('article', 'admin-support-item');
          card.append(makeElement('h4', '', `${item.category} · ${item.status}`), makeElement('p', '', item.buyer_email || 'No email'), makeElement('p', '', item.message));
          if (item.response_text) card.append(makeElement('p', '', `Last response: ${item.response_text}`));
          if (item.buyer_email) {
            const form = document.createElement('form'); const response = document.createElement('textarea');
            response.required = true; response.maxLength = 4000; response.rows = 3; response.setAttribute('aria-label', `Reply to support request ${item.id}`);
            const send = makeElement('button', 'primary-button', 'Email response'); send.type = 'submit';
            const status = makeElement('p', 'form-message'); status.setAttribute('role', 'status');
            form.append(response, send, status);
            form.addEventListener('submit', async event => {
              event.preventDefault(); send.disabled = true;
              try { await adminRequest(`/api/admin/support/${encodeURIComponent(item.id)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: response.value.trim() }) }); setMessage(status, 'Response sent.', 'success'); response.value = ''; }
              catch (error) { setMessage(status, error.message, 'error'); }
              finally { send.disabled = false; }
            }); card.append(form);
          } section.append(card);
        }
      }
    } catch (error) { section.append(makeElement('p', 'form-message', `Could not load this section: ${error.message}`)); }
  }));
}

async function loadDesignerBrand() {
  try {
    const { designer } = await apiRequest('/api/my/designer-profile');
    byId('designer-brand-name').value = designer.brandName || designer.displayName || '';
    if (byId('designer-bio')) byId('designer-bio').value = designer.bio || '';
    if (byId('designer-categories')) byId('designer-categories').value = (designer.categories || []).join(', ');
    if (byId('designer-social')) byId('designer-social').value = designer.socialUrl || designer.portfolioUrl || '';
    const image = byId('designer-logo-preview'); image.classList.toggle('hidden', !designer.logoUrl);
    if (designer.logoUrl) image.src = designer.logoUrl + '?v=' + Date.now();
    byId('designer-logo-remove').classList.toggle('hidden', !designer.logoUrl);
  } catch (error) { setMessage(byId('designer-brand-message'), error.message, 'error'); }
}
byId('designer-brand-form')?.addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    await apiRequest('/api/my/designer-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      brandName: byId('designer-brand-name').value.trim(),
      bio: byId('designer-bio')?.value.trim() || '',
      categories: (byId('designer-categories')?.value || '').split(',').map(value => value.trim()).filter(Boolean),
      socialUrl: byId('designer-social')?.value.trim() || ''
    }) });
    const file = byId('designer-logo').files[0];
    if (file) { if (file.size > 8 * 1024 * 1024) throw new Error('Please choose a logo smaller than 8 MB.'); const body = new FormData(); body.append('image', file); await apiRequest('/api/my/designer-profile/logo', { method: 'POST', body }); }
    byId('designer-logo').value = ''; await loadDesignerBrand(); await loadGallery(); byId('designer-welcome')?.classList.add('hidden'); setMessage(byId('designer-brand-message'), 'Your designer profile is saved. Now list your first piece below.', 'success'); byId('product-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { setMessage(byId('designer-brand-message'), error.message, 'error'); }
  finally { button.disabled = false; }
});
byId('designer-logo-remove')?.addEventListener('click', async () => {
  try { await apiRequest('/api/my/designer-profile/logo', { method: 'DELETE' }); await loadDesignerBrand(); await loadGallery(); }
  catch (error) { setMessage(byId('designer-brand-message'), error.message, 'error'); }
});
async function openDesignerStorefront(id) {
  const dialog = byId('designer-storefront-dialog'), content = byId('storefront-content'); content.replaceChildren(); dialog.showModal();
  try {
    const { designer, items } = await apiRequest(`/api/designers/${encodeURIComponent(id)}`);
    byId('storefront-title').textContent = designer.brandName || designer.displayName;
    const identity=makeElement('div','designer-storefront-identity');
    if(designer.logoUrl){const logo=document.createElement('img');logo.src=designer.logoUrl;logo.alt=(designer.brandName||designer.displayName)+' logo';logo.loading='lazy';identity.appendChild(logo);}
    const profileCopy=makeElement('div');
    profileCopy.append(makeElement('p','',designer.bio||'Independent by design.'));
    if(designer.location)profileCopy.append(makeElement('p','',designer.location));
    profileCopy.append(makeElement('p','designer-like-total',`♥ ${Number(designer.totalLikes||0).toLocaleString()} total ${Number(designer.totalLikes||0)===1?'heart':'hearts'}`));
    identity.appendChild(profileCopy);content.appendChild(identity);
    if(Array.isArray(designer.badges)&&designer.badges.length){const badgeWrap=makeElement('div','listing-badges');designer.badges.forEach(b=>badgeWrap.appendChild(createBadgePill(b.label,b.type==='verified_buyer'?'badge verified-badge':'badge supporter-badge')));content.appendChild(badgeWrap);}
    for (const item of items || []) { const button = makeElement('button', 'secondary-button', item.title); button.type = 'button'; button.addEventListener('click', () => { dialog.close(); openProductDetails(item); }); content.append(button); }
  } catch (error) { content.append(makeElement('p', 'form-message', error.message)); }
}
byId('storefront-close')?.addEventListener('click', () => byId('designer-storefront-dialog').close());


// Decorative measuring tapes keep the native dropdowns fully usable.
function unrollDropdownTape(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  const window = select.closest('.shop-drop-window') || select.parentElement;
  if (!window) return;
  if (Date.now() - Number(window.dataset.tapePlayedAt || 0) < 250) return;
  window.dataset.tapePlayedAt = String(Date.now());
  window.classList.add('measuring-tape-window');
  let tape = window.querySelector(':scope > .dropdown-measuring-tape');
  if (!tape) {
    tape = document.createElement('span'); tape.className = 'dropdown-measuring-tape'; tape.setAttribute('aria-hidden', 'true');
    const strip = document.createElement('span'); strip.className = 'measuring-tape-strip';
    const markings = document.createElement('span'); markings.className = 'measuring-tape-numbers'; markings.textContent = '1     2     3     4     5     6     7     8';
    strip.append(markings);
    const roll = document.createElement('span'); roll.className = 'measuring-tape-roll'; tape.append(strip, roll); window.append(tape);
  }
  window.classList.remove('tape-unrolling');
  void tape.offsetWidth;
  window.classList.add('tape-unrolling');
  clearTimeout(window.dropdownTapeTimer);
  window.dropdownTapeTimer = setTimeout(() => window.classList.remove('tape-unrolling'), 1200);
}
document.addEventListener('pointerdown', event => unrollDropdownTape(event.target));
document.addEventListener('focusin', event => unrollDropdownTape(event.target));
document.addEventListener('change', event => unrollDropdownTape(event.target));
document.addEventListener('keydown', event => {
  if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) unrollDropdownTape(event.target);
});

byId('measurement-profile-form')?.addEventListener('input', updateMeasurementAvatarPreview);
updateMeasurementAvatarPreview();


function refreshShopFitProfiles() {
  const select = byId('shop-fit-profile'); if (!select) return;
  const selected = select.value;
  select.replaceChildren(new Option('Enter measurements', ''));
  for (const profile of loadMeasurementProfiles()) select.append(new Option(profile.label, profile.id));
  select.value = selected;
}
byId('shop-fit-profile')?.addEventListener('focus', refreshShopFitProfiles);
byId('shop-fit-profile')?.addEventListener('change', event => {
  const profile = loadMeasurementProfiles().find(p => p.id === event.target.value);
  if (!profile) return;
  byId('shop-fit-unit').value = 'in';
  for (const key of ['bust','waist','hips','inseam']) byId(`shop-fit-${key}`).value = /^\d+(?:\.\d+)?$/.test(String(profile[key] || '').trim()) ? profile[key] : '';
  setMessage(byId('shop-fit-message'), 'Saved measurements filled in inches. Review them, then find matches.', '');
});
byId('shop-fit-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const measurements = {};
  for (const key of ['bust','waist','hips','inseam']) {
    const raw = byId(`shop-fit-${key}`).value;
    if (!raw) continue;
    const value = Number(raw) / (byId('shop-fit-unit').value === 'cm' ? 2.54 : 1);
    if (!Number.isFinite(value) || value <= 0 || value > 150) { setMessage(byId('shop-fit-message'), 'Enter valid positive measurements (up to 150 inches / 381 cm).', 'error'); return; }
    measurements[key] = Math.round(value * 10000) / 10000;
  }
  if (!Object.keys(measurements).length) { setMessage(byId('shop-fit-message'), 'Enter at least one measurement to find matches.', 'error'); return; }
  activeMeasurements = measurements;
  setMessage(byId('shop-fit-message'), 'Measurement filter applied. Missing fit ranges are excluded; your measurements are not shared with designers.', 'success');
  loadGallery();
});
byId('shop-fit-remove')?.addEventListener('click', () => { activeMeasurements = null; setMessage(byId('shop-fit-message'), 'Measurement filter removed.', ''); loadGallery(); });
refreshShopFitProfiles();
