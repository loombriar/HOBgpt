(() => {
  // Account choice stays explicit; an existing session never silently changes roles.
  Promise.all(['/api/my/designer-profile','/api/customer/session'].map(url=>fetch(url,{credentials:'same-origin',cache:'no-store'})))
    .then(responses=>{if(responses.some(response=>response.ok))document.getElementById('join-intro').textContent='You’re signed in to the House. Choose the workspace you want to open.';})
    .catch(()=>{});
})();
