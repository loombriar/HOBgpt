const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const byId = (id) => document.getElementById(id);
const year = byId('year');
if (year) year.textContent = new Date().getFullYear();

const productGrid = byId('product-grid');
const shopStatus = byId('shop-status');
const designerModal = byId('designer-modal');
const designerLoginBtn = byId('designer-login-btn');
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
let activeShopWindow = 'all';
let selectedImages = [];
let activeFilter = 'apparel';
let activeAesthetic = 'all';
const designerListImageUrls = new Set();

function getCartIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch { return []; }
}

function setCartIds(ids) {
  localStorage.setItem(CART_KEY, JSON.stringify([...new Set(ids)]));
  updateCartButton();
}

function updateCartButton() {
  if (!cartButton) return;
  const count = getCartIds().length;
  cartButton.textContent = `Suitcase (${count})`;
  cartButton.setAttribute('aria-label', `Suitcase, ${count} ${count === 1 ? 'item' : 'items'}`);
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
  if (cartButton) { cartButton.disabled = true; cartButton.textContent = 'Opening checkout…'; }
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
      copy.appendChild(makeElement('p', 'price', `${Number(item.price || 0).toFixed(2)}`));
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
cartButton?.addEventListener('click', openCart);
checkoutButton?.addEventListener('click', () => { cartDialog?.close(); checkoutCart(); });
byId('cart-dialog-close')?.addEventListener('click', () => cartDialog?.close());
byId('continue-shopping-btn')?.addEventListener('click', () => cartDialog?.close());

const MEASUREMENTS_KEY = 'house-of-briar:measurements';

function loadMeasurements() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEASUREMENTS_KEY) || '{}');
    [['measure-bust','bust'],['measure-waist','waist'],['measure-hips','hips'],['measure-inseam','inseam'],['measure-height','height'],['measure-unit','unit'],['measure-notes','notes']].forEach(([id,key]) => {
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

  let items = galleryItems.filter((item) => {
    if (activeFilter === 'all' || activeFilter === 'apparel') return item.category === 'apparel';
    return item.category === 'apparel' && item.style === activeFilter;
  }).filter((item) => activeAesthetic === 'all' || item.aesthetic === activeAesthetic);
  if(activeShopWindow==='one') items=items.filter(item=>item.productionType==='One of a Kind');
  if(activeShopWindow==='multiple') items=items.filter(item=>item.productionType==='Made in Multiple');
  if(activeShopWindow==='low') items=[...items].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  if(activeShopWindow==='high') items=[...items].sort((a,b)=>Number(b.price||0)-Number(a.price||0));
  if(activeShopWindow==='new') items=[...items].sort((a,b)=>String(b.createdAt||b.created_at||'').localeCompare(String(a.createdAt||a.created_at||'')));
  if (!items.length) {
    const empty = makeElement('p', 'empty-gallery', 'No published pieces are available in this category yet.');
    productGrid.appendChild(empty);
    return;
  }

  for (const item of items) {
    const images = getProductImages(item);
    const card = makeElement('button', 'product-card');
    card.type = 'button';
    card.setAttribute('aria-label', `View ${item.title} details`);
    card.addEventListener('click', () => openProductDetails(item));

    const imageWrap = makeElement('span', 'product-image');
    if (images[0]?.url) {
      const img = document.createElement('img');
      img.src = images[0].url;
      img.alt = `${item.title} cover photo`;
      img.loading = 'lazy';
      imageWrap.appendChild(img);
      if (images.length > 1) {
        const badge = makeElement('span', 'photo-count-badge', `${images.length} photos`);
        imageWrap.appendChild(badge);
      }
    } else {
      imageWrap.classList.add('product-image-fallback');
      imageWrap.textContent = 'House of Briar';
    }

    const body = makeElement('span', 'product-body');
    const meta = makeElement('span', 'meta-row');
    meta.appendChild(makeElement('span', 'badge', item.style || categoryLabel(item.category)));
    if (item.aesthetic) meta.appendChild(makeElement('span', 'badge', item.aesthetic));
    meta.appendChild(makeElement('span', 'price', `$${Number(item.price || 0).toFixed(2)}`));
    body.appendChild(meta);
    body.appendChild(makeElement('span', 'card-title', item.title));
    body.appendChild(makeElement('span', 'card-description', item.description || 'A one-of-a-kind designation from an independent designer.'));
    card.append(imageWrap, body);
    productGrid.appendChild(card);
  }
}

async function loadGallery() {
  try {
    const payload = await apiRequest('/api/gallery');
    galleryItems = Array.isArray(payload.items) ? payload.items : [];
    renderGallery();
    if (shopStatus) {
      setMessage(shopStatus, `${galleryItems.length} published ${galleryItems.length === 1 ? 'piece' : 'pieces'} in the gallery.`, 'success');
    }
  } catch (error) {
    if (shopStatus) setMessage(shopStatus, `Unable to load the gallery: ${error.message}`, 'error');
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
function renderMeasurementProfiles(){const list=byId('measurement-profile-list');if(!list)return;list.replaceChildren();loadMeasurementProfiles().forEach(p=>{const row=makeElement('div','designer-product-item');const info=makeElement('div','designer-product-info');info.append(makeElement('strong','',p.label),makeElement('p','small-print',`Bust ${p.bust||'—'} · Waist ${p.waist||'—'} · Hips ${p.hips||'—'} · Height ${p.height||'—'}`));const remove=makeElement('button','text-button','Remove');remove.type='button';remove.addEventListener('click',()=>{saveMeasurementProfiles(loadMeasurementProfiles().filter(x=>x.id!==p.id));renderMeasurementProfiles();});row.append(info,remove);list.append(row);});}
byId('measurement-profile-form')?.addEventListener('submit',event=>{event.preventDefault();const p={id:crypto.randomUUID(),label:byId('measurement-profile-name').value.trim(),bust:byId('measurement-profile-bust').value.trim(),waist:byId('measurement-profile-waist').value.trim(),hips:byId('measurement-profile-hips').value.trim(),height:byId('measurement-profile-height').value.trim(),notes:byId('measurement-profile-notes').value.trim()};if(!p.label)return;saveMeasurementProfiles([...loadMeasurementProfiles(),p]);event.currentTarget.reset();setMessage(byId('measurement-profile-message'),'Measurement profile saved.','success');renderMeasurementProfiles();});
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
  copy.appendChild(makeElement('span', 'badge', item.style || categoryLabel(item.category)));
  if (item.aesthetic) copy.appendChild(makeElement('span', 'badge', item.aesthetic));
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
  copy.appendChild(makeElement('strong', 'price', `${Number(item.price || 0).toFixed(2)}`));
  if (item.size) copy.appendChild(makeElement('p', 'product-size', `Size: ${item.size}`));
  copy.appendChild(makeElement('p', '', item.description || 'A carefully made piece from an independent designer.'));
  const sizingBox=makeElement('div','measurement-request');
  sizingBox.appendChild(makeElement('h4','','Send measurements for this piece'));
  sizingBox.appendChild(makeElement('p','small-print','Choose a saved Visitor’s Suite profile or enter measurements here. They are attached only to this piece.'));
  const profileSelect=document.createElement('select');profileSelect.innerHTML='<option value="">Choose saved profile (optional)</option>';
  loadMeasurementProfiles().forEach(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.label;profileSelect.appendChild(option);});
  const bust=document.createElement('input'),waist=document.createElement('input'),hips=document.createElement('input'),height=document.createElement('input'),note=document.createElement('textarea');
  bust.placeholder='Bust / chest';waist.placeholder='Waist';hips.placeholder='Hips';height.placeholder='Height';note.placeholder='Sizing request for this piece';
  profileSelect.addEventListener('change',()=>{const p=loadMeasurementProfiles().find(x=>x.id===profileSelect.value);if(!p)return;bust.value=p.bust||'';waist.value=p.waist||'';hips.value=p.hips||'';height.value=p.height||'';note.value=p.notes||'';});
  const send=makeElement('button','secondary-button','Send measurement request');send.type='button';
  send.addEventListener('click',async()=>{const measurements=[bust.value&&`Bust/chest: ${bust.value}`,waist.value&&`Waist: ${waist.value}`,hips.value&&`Hips: ${hips.value}`,height.value&&`Height: ${height.value}`,note.value&&`Notes: ${note.value}`].filter(Boolean).join('\n');if(!measurements){alert('Add measurements or choose a saved profile first.');return;}try{await apiRequest(`/api/listings/${encodeURIComponent(item.id)}/inquiries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:measurements})});send.textContent='Measurement request sent';send.disabled=true;}catch(error){alert(error.message||'Measurement request could not be sent.');}});
  sizingBox.append(profileSelect,bust,waist,hips,height,note,send);copy.appendChild(sizingBox);
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
    moveUp.addEventListener('click', () => { if (index > 0) { [selectedImages[index], selectedImages[index - 1]] = [selectedImages[index - 1], selectedImages[index]]; renderSelectedImages(); } });
    actions.appendChild(moveUp);

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.textContent = 'Move down';
    moveDown.disabled = index === selectedImages.length - 1;
    moveDown.addEventListener('click', () => { if (index < selectedImages.length - 1) { [selectedImages[index], selectedImages[index + 1]] = [selectedImages[index + 1], selectedImages[index]]; renderSelectedImages(); } });
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

function readFormValues() {
  return {
    title: byId('product-name').value.trim(),
    description: byId('product-description').value.trim(),
    price: byId('product-price').value,
    category: 'apparel',
    style: byId('product-style')?.value || '',
    size: byId('product-size')?.value || '',
    aesthetic: byId('product-aesthetic')?.value || '',
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

async function loadDesignerListings() {
  if (!designerToken) return;
  try {
    const payload = await apiRequest('/api/my/listings');
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
      row.appendChild(preview);

      const info = makeElement('div', 'designer-product-info');
      info.appendChild(makeElement('h4', '', listing.title));
      info.appendChild(makeElement('p', '', `${images.length} photo${images.length === 1 ? '' : 's'} · ${categoryLabel(listing.category)}`));
      row.appendChild(info);

      const actions = makeElement('div', 'designer-product-actions');
      const badge = makeElement('span', 'status-badge', listing.status === 'pending_review' ? 'Pending review' : listing.status === 'published' ? 'Published' : listing.status === 'rejected' ? 'Rejected' : listing.status === 'draft' ? 'Draft' : 'Archived');
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
          if (currentListingId === listing.id) resetListingForm();
          await loadDesignerListings();
          await loadGallery();
        } catch (error) {
          setMessage(designerAuthMessage, error.message, 'error');
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
    if (byId('product-aesthetic')) byId('product-aesthetic').value = listing.aesthetic || '';
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
    localStorage.removeItem('briarDesignerToken');
  sessionStorage.removeItem('briarDesignerToken');
    if (loginPanel) loginPanel.classList.add('hidden');
    if (designerWorkspace) designerWorkspace.classList.remove('hidden');
    setMessage(designerAuthMessage, '', '');
    await loadDesignerListings();
  } catch (error) {
    designerToken = '';
    sessionStorage.removeItem('briarDesignerToken');
    setMessage(designerAuthMessage, error.message, 'error');
  }
}

function signOut() {
  designerToken = '';
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
  activeFilter = event.target.value || 'apparel';
  renderGallery();
});
byId('shop-aesthetic-filter')?.addEventListener('change', (event) => {
  activeAesthetic = event.target.value || 'all';
  renderGallery();
});

byId('visitor-suite-btn')?.addEventListener('click',()=>byId('visitor-suite-modal')?.showModal());
byId('visitor-suite-close')?.addEventListener('click',()=>byId('visitor-suite-modal')?.close());
document.querySelectorAll('[data-shop-window]').forEach(button=>button.addEventListener('click',()=>{activeShopWindow=button.dataset.shopWindow||'all';document.querySelectorAll('[data-shop-window]').forEach(item=>item.classList.toggle('is-active',item===button));renderGallery();document.querySelector('#shop')?.scrollIntoView({behavior:'smooth'});}));
document.querySelector('[data-shop-window="all"]')?.classList.add('is-active');

if (designerLoginBtn) designerLoginBtn.addEventListener('click', () => {
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
if (modalClose) modalClose.addEventListener('click', () => designerModal.close());
if (designerLoginForm) designerLoginForm.addEventListener('submit', (event) => { event.preventDefault(); signIn(designerTokenInput.value); });
if (productForm) productForm.addEventListener('submit', handleSave);
if (photoInput) photoInput.addEventListener('change', (event) => addFiles(event.target.files));
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
    const payload = await adminRequest('/api/admin/listings/review-queue');
    adminLoginPanel?.classList.add('hidden');
    adminReviewWorkspace?.classList.remove('hidden');
    setMessage(adminReviewMessage, '');
    if (!payload.items?.length) {
      adminReviewList.appendChild(makeElement('p', 'empty-state', 'No clothing is waiting for approval.'));
      return;
    }
    for (const item of payload.items) {
      const card = makeElement('article', 'admin-review-card');
      const media = makeElement('div', 'admin-review-media');
      const image = document.createElement('img');
      image.alt = `${item.title} submitted clothing`;
      if (item.images?.[0]?.url) {
        adminImagePreview(item.images[0].url).then(url => { image.src = url; }).catch(() => { media.textContent = 'Preview unavailable'; });
        media.appendChild(image);
      } else media.textContent = 'No image';
      const body = makeElement('div', 'admin-review-copy');
      body.append(makeElement('span', 'status-badge', 'Pending review'));
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
        try { await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}/approve`, { method:'POST' }); await renderAdminQueue(); await loadGallery(); }
        catch (error) { setMessage(adminReviewMessage, error.message, 'error'); approve.disabled = false; }
      });
      const reject = makeElement('button', 'secondary-button', 'Reject');
      reject.type = 'button';
      reject.addEventListener('click', async () => {
        const why = reason.value.trim();
        if (!why) { setMessage(adminReviewMessage, 'Enter a reason before rejecting a listing.', 'error'); reason.focus(); return; }
        reject.disabled = true;
        try {
          await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}/reject`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({reason:why}) });
          await renderAdminQueue();
        } catch (error) { setMessage(adminReviewMessage, error.message, 'error'); reject.disabled = false; }
      });
      const remove = makeElement('button', 'secondary-button', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${item.title}" permanently? This also removes its uploaded photos.`)) return;
        remove.disabled = true;
        try {
          await adminRequest(`/api/admin/listings/${encodeURIComponent(item.id)}`, { method:'DELETE' });
          await renderAdminQueue();
          await loadGallery();
        } catch (error) { setMessage(adminReviewMessage, error.message, 'error'); remove.disabled = false; }
      });
      actions.append(approve, reject, remove);
      body.append(reason, actions);
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
  adminToken = '';
  sessionStorage.removeItem('briarAdminToken');
  if (adminTokenInput) adminTokenInput.value = '';
  adminReviewWorkspace?.classList.add('hidden');
  adminLoginPanel?.classList.remove('hidden');
  setMessage(adminReviewMessage, '');
});


byId('production-info-close')?.addEventListener('click', () => byId('production-info-dialog')?.close());
