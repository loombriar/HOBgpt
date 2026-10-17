import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import ListingReviewStatus from './ListingReviewStatus';
it('keeps pending pieces private and shows actionable feedback',()=>{
 const pending=renderToStaticMarkup(<ListingReviewStatus status="pending_review" moderationStatus="pending"/>);
 expect(pending).toContain('Pending review');expect(pending).toContain('not public yet');
 const rejected=renderToStaticMarkup(<ListingReviewStatus status="rejected" moderationStatus="rejected" reason="Add measurements."/>);
 expect(rejected).toContain('Add measurements.');expect(rejected).toContain('save the changes');
});
it('does not call paused or unavailable approved stock live',()=>{
 expect(renderToStaticMarkup(<ListingReviewStatus status="published" moderationStatus="approved" paused/>)).toContain('Paused');
 expect(renderToStaticMarkup(<ListingReviewStatus status="published" moderationStatus="approved" studioStatus="Inactive"/>)).toContain('Unavailable');
});
