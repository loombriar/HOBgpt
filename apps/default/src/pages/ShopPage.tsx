  const likes = (getFieldNumber(product, '@likes', 'Likes') ?? 0) + (liked ? 1 : 0);
