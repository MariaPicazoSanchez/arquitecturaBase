(function(global){
  function parseError(xhr, fallback){
    let msg = fallback || "Error";
    try {
      const txt = xhr && xhr.responseText ? xhr.responseText : "";
      const resp = txt ? JSON.parse(txt) : null;
      if (resp && resp.error) msg = resp.error;
    } catch (e) {}
    return msg;
  }

  function handle401(){
    try { if (global.$ && $.removeCookie) $.removeCookie('nick'); } catch(e) {}
    try { global.location.href = '/'; } catch(e) {}
  }

  function ajax(opts){
    return $.ajax(Object.assign({
      xhrFields: { withCredentials: true }
    }, opts));
  }

  function getMe(){
    const req = ajax({ url: '/api/user/me', method: 'GET', dataType: 'json' });
    req.fail(function(xhr){
      if (xhr && xhr.status === 401) handle401();
    });
    return req;
  }

  function updateMe(data){
    const req = ajax({
      url: '/api/user/me',
      method: 'PUT',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify(data || {})
    });
    req.fail(function(xhr){
      if (xhr && xhr.status === 401) handle401();
    });
    return req;
  }

  function requestPasswordChange(){
    const req = ajax({
      url: '/api/user/password-change/request',
      method: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({})
    });
    req.fail(function(xhr){
      if (xhr && xhr.status === 401) handle401();
    });
    return req;
  }

  function confirmPasswordChange(codeOrToken, newPassword){
    const req = ajax({
      url: '/api/user/password-change/confirm',
      method: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({ codeOrToken: codeOrToken, newPassword: newPassword })
    });
    req.fail(function(xhr){
      if (xhr && xhr.status === 401) handle401();
    });
    return req;
  }

  function deleteMe(payload){
    const req = ajax({
      url: '/api/user/me',
      method: 'DELETE',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify(payload || {})
    });
    req.fail(function(xhr){
      if (xhr && xhr.status === 401) handle401();
    });
    return req;
  }

  global.userService = {
    getMe: getMe,
    updateMe: updateMe,
    requestPasswordChange: requestPasswordChange,
    confirmPasswordChange: confirmPasswordChange,
    deleteMe: deleteMe
  };
})(window);
