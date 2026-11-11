// Multi-photo uploader for the gallery editor. Each photo is shrunk in the browser first: Vercel rejects request
// bodies over about 4.5 MB, and re-encoding also removes camera and location metadata. The server still validates
// and converts every upload. Photos are sent one at a time, each with its own description.
(function () {
  var root = document.querySelector('[data-gallery-upload]');
  if (!root) return;
  var input = root.querySelector('input[type=file]');
  var list = root.querySelector('[data-upload-list]');
  var start = root.querySelector('[data-upload-start]');
  var status = root.querySelector('[data-upload-status]');
  var MAX_SIDE = 2400;
  var MAX_BYTES = 3.5 * 1024 * 1024;
  var files = [];

  function say(text, isError) {
    status.textContent = text;
    status.setAttribute('role', isError ? 'alert' : 'status');
  }

  function stem(name) { return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(); }

  input.addEventListener('change', function () {
    files = Array.prototype.slice.call(input.files || []);
    list.textContent = '';
    files.forEach(function (file, index) {
      var row = document.createElement('div');
      row.className = 'gallery-upload__row';
      var label = document.createElement('label');
      label.appendChild(document.createTextNode(file.name + ' — description (required)'));
      var field = document.createElement('input');
      field.type = 'text';
      field.maxLength = 300;
      field.value = stem(file.name);
      field.setAttribute('data-upload-alt', String(index));
      label.appendChild(field);
      var state = document.createElement('span');
      state.setAttribute('data-upload-state', String(index));
      row.appendChild(label);
      row.appendChild(state);
      list.appendChild(row);
    });
    start.hidden = files.length === 0;
    say(files.length ? files.length + ' photo' + (files.length === 1 ? '' : 's') + ' selected. Check each description, then upload.' : '', false);
  });

  function shrink(file) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bitmap) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      var width = Math.max(1, Math.round(bitmap.width * scale));
      var height = Math.max(1, Math.round(bitmap.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
      if (bitmap.close) bitmap.close();
      function encode(type, quality) {
        return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
      }
      function attempt(quality) {
        return encode('image/webp', quality).then(function (blob) {
          if (!blob || blob.type !== 'image/webp') return encode('image/jpeg', quality);
          return blob;
        }).then(function (blob) {
          if (blob && blob.size > MAX_BYTES && quality > 0.5) return attempt(quality - 0.1);
          return blob;
        });
      }
      return attempt(0.88);
    });
  }

  function upload(file, alt) {
    return shrink(file).then(function (blob) {
      if (!blob) throw new Error('could not be prepared');
      if (blob.size > MAX_BYTES) throw new Error('is still too large after shrinking');
      var body = new FormData();
      body.append('file', blob, stem(file.name).replace(/\s+/g, '-') + (blob.type === 'image/webp' ? '.webp' : '.jpg'));
      body.set('altText', alt);
      body.set('focalX', '0.5');
      body.set('focalY', '0.5');
      return fetch('/api/editorial/media/upload/', { method: 'POST', headers: { accept: 'application/json' }, body: body, credentials: 'same-origin' });
    }).then(function (response) {
      if (response.status !== 201) {
        return response.text().then(function (text) { throw new Error(text || ('upload failed (' + response.status + ')')); });
      }
      return response.json();
    }).then(function (result) { return result.id; });
  }

  start.addEventListener('click', function () {
    var alts = files.map(function (_file, index) {
      return root.querySelector('[data-upload-alt="' + index + '"]').value.trim();
    });
    var missing = alts.findIndex(function (alt) { return !alt; });
    if (missing >= 0) { say('Describe "' + files[missing].name + '" before uploading.', true); return; }
    start.disabled = true;
    input.disabled = true;
    var done = [];
    var chain = Promise.resolve();
    files.forEach(function (file, index) {
      chain = chain.then(function () {
        var state = root.querySelector('[data-upload-state="' + index + '"]');
        state.textContent = ' Uploading…';
        say('Uploading photo ' + (index + 1) + ' of ' + files.length + '…', false);
        return upload(file, alts[index]).then(function (id) {
          done.push(id);
          state.textContent = ' Uploaded';
        }, function (error) {
          state.textContent = ' Failed';
          var reason = error && error.message ? error.message : 'could not be uploaded';
          throw new Error('"' + file.name + '" ' + reason);
        });
      });
    });
    chain.then(function () {
      say('All photos uploaded. Reloading so you can add them to the gallery…', false);
      window.location.href = window.location.pathname + '?uploaded=' + encodeURIComponent(done.join(',')) + '#gallery-library';
    }, function (error) {
      start.disabled = false;
      input.disabled = false;
      var note = done.length ? ' ' + done.length + ' earlier photo' + (done.length === 1 ? ' was' : 's were') + ' uploaded to your library and can be added after reloading.' : '';
      say(error.message + '.' + note, true);
    });
  });
})();
