// Media page: shrink the chosen photo in the browser, then upload it. Without this, photos over Vercel's ~4.5 MB
// request limit are rejected. If the browser cannot shrink photos, the plain form post is used unchanged.
(function () {
  var form = document.querySelector('form[data-media-upload]');
  if (!form || !window.sonicShrinkPhoto) return;
  var status = form.querySelector('[data-media-status]');
  var button = form.querySelector('button');
  var limit = window.sonicShrinkLimit || 3.5 * 1024 * 1024;

  function say(text, isError) {
    status.textContent = text;
    status.setAttribute('role', isError ? 'alert' : 'status');
  }

  form.addEventListener('submit', function (event) {
    var file = form.elements.file && form.elements.file.files[0];
    if (!file) return;
    event.preventDefault();
    button.disabled = true;
    say('Preparing the photo…', false);
    window.sonicShrinkPhoto(file).then(function (blob) {
      if (!blob) throw new Error('The photo could not be prepared.');
      if (blob.size > limit) throw new Error('The photo is still too large after shrinking.');
      var body = new FormData();
      body.append('file', blob, 'photo' + (blob.type === 'image/webp' ? '.webp' : '.jpg'));
      body.set('altText', form.elements.altText.value);
      body.set('focalX', form.elements.focalX.value);
      body.set('focalY', form.elements.focalY.value);
      say('Uploading…', false);
      return fetch('/api/editorial/media/upload/', { method: 'POST', headers: { accept: 'application/json' }, body: body, credentials: 'same-origin' });
    }).then(function (response) {
      if (response.status !== 201) {
        return response.text().then(function (text) { throw new Error(text || 'The upload failed (' + response.status + ').'); });
      }
      return response.json();
    }).then(function (result) {
      window.location.href = '/admin/media/?uploaded=' + encodeURIComponent(result.id);
    }).catch(function (error) {
      button.disabled = false;
      say((error && error.message ? error.message : 'The upload failed.') + ' Nothing was added.', true);
    });
  });
})();
