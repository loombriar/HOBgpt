  async function authBuyer(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Sign in to view your orders.');
    try {
      const profile = await resolveDesignerIdentity(req, token);
      if (!profile || typeof profile.sub !== 'string' || !profile.sub.trim()) return fail(res, 401, 'unauthorized', 'Your account session is no longer valid.');
      req.buyerSubject = profile.sub.trim();
      req.buyerEmail = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
      reconcileBuyerBadges(req.buyerSubject);
      return next();
    } catch { return fail(res, 401, 'unauthorized', 'Your account session is no longer valid.'); }
  }
