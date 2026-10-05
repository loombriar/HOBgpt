function galleryItemToGenesis(item: GalleryItem): GenesisNode {
  const images = Array.isArray(item.images) ? item.images.map((image) => image.url).filter(Boolean) : [];
  const likesCount = Number(item.likesCount ?? 0);
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
      '/attributes/@statx': item.sold ? 'Sold' : (item.status === 'published' || !item.status ? 'Available' : item.status),
      '/attributes/@image': images[0] || '',
      '/attributes/@gally': images.join('\n'),
      '/attributes/@likes': String(likesCount),
    },
  };
}
