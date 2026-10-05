  function awardBadge(subject,badgeType,sourceType,sourceId){if(!subject||!sourceId)return;db.prepare('INSERT OR IGNORE INTO user_badges (buyer_subject,badge_type,source_type,source_id,awarded_at) VALUES (?,?,?,?,?)').run(subject,badgeType,sourceType,sourceId,new Date().toISOString());}

  function reconcileBuyerBadges(subject) {
    if (!subject || typeof subject !== 'string') return { supporter: false, verifiedBuyer: false };
    const trimmed = subject.trim();
    if (!trimmed) return { supporter: false, verifiedBuyer: false };

    let supporter = false;
    const donated = db.prepare("SELECT id, amount_cents FROM donations WHERE buyer_subject = ? AND status = 'paid'").all(trimmed);
    for (const donation of donated) {
      if (Number(donation.amount_cents) >= 500) {
        awardBadge(trimmed, 'supporter', 'donation', donation.id);
        supporter = true;
      }
    }

    let verifiedBuyer = false;
    const purchased = db.prepare("SELECT id FROM orders WHERE buyer_subject = ? AND status = 'paid'").all(trimmed);
    for (const order of purchased) {
      awardBadge(trimmed, 'verified_buyer', 'order', order.id);
      verifiedBuyer = true;
    }

    return { supporter, verifiedBuyer };
  }
