const {test,expect}=require('@playwright/test');
test('postage remains deducted until carrier confirmation, then credits the earnings once',async({page})=>{
 expect((await page.request.post('/api/session',{headers:{Authorization:'Bearer e2e-designer-token'}})).ok()).toBeTruthy();
 let refunded=false,posts=0;
 let label={status:'ready',costCents:610,test:true,carrier:'USPS',trackingNumber:'TEST123',labelUrl:'https://deliver.goshippo.com/sample.pdf'};
 const earnings=()=>({salesCents:10000,houseFeeCents:900,designerShareCents:9100,postageChargedCents:610,postageRefundCents:refunded?610:0,postageCents:refunded?0:610,netEarningsCents:refunded?9100:8490,payoutAmountCents:refunded?9100:8490,postageHold:label.cancelStatus==='pending',insufficientEarnings:false,customerRefunded:false,customerRefundHold:false,unrecoveredPostageCents:0,postPayoutCreditCents:0,testMode:true});
 await page.route('**/api/my/orders',route=>route.fulfill({json:{orders:[{id:'earnings-order',orderStatus:'paid',fulfillmentStatus:'awaiting_shipment',payoutStatus:'pending',earningsCents:9100,earnings:earnings(),items:[{title:'Sample piece',quantity:1,earningsCents:9100}]}]}}));
 await page.route('**/api/orders/earnings-order/postage',route=>route.fulfill({json:{enabled:true,test:true,label}}));
 await page.route('**/api/orders/earnings-order/postage/cancel',route=>{expect(route.request().postDataJSON().confirmCancellation).toBe(true);posts++;label={...label,cancelStatus:'pending'};return route.fulfill({json:{label}});});
 await page.route('**/api/orders/earnings-order/postage/cancel/status',route=>{refunded=true;label={...label,status:'cancelled',cancelStatus:'refunded',labelUrl:null};return route.fulfill({json:{label}});});
 await page.goto('/account#orders');const breakdown=page.getByRole('region',{name:'Sample earnings breakdown',exact:true});await expect(breakdown).toContainText('$84.90');
 await page.getByText('Postage & print label · test mode',{exact:true}).click();const cancel=page.getByRole('button',{name:'Cancel unused sample label',exact:true});await expect(cancel).toBeDisabled();
 await page.getByRole('checkbox',{name:'This sample label is unused. Request cancellation and credit the postage only after the carrier confirms the refund.',exact:true}).check();await cancel.click();
 await expect(page.getByRole('link',{name:'Open sample label PDF to print ↗',exact:true})).toHaveCount(0);await expect(breakdown).toContainText('$84.90');await expect(breakdown).toContainText('Payout remains held');
 await page.getByRole('button',{name:'Check cancellation status',exact:true}).click();await expect(breakdown).toContainText('Confirmed postage refund');await expect(breakdown).toContainText('$91.00');await expect(page.getByText('Carrier refund confirmed. This label is cancelled and cannot be used.',{exact:true})).toBeVisible();expect(posts).toBe(1);
});
