// Shared by the gallery uploader and the Media page. Shrinks a photo in the browser so uploads stay under
// Vercel's ~4.5 MB request limit; re-encoding also removes camera and location metadata.
// window.sonicShrinkPhoto(file) resolves to a WebP (or JPEG) Blob, longest side at most 2400 px.
(function () {
  var MAX_SIDE = 2400;
  var MAX_BYTES = 3.5 * 1024 * 1024;
  window.sonicShrinkLimit = MAX_BYTES;
  window.sonicShrinkPhoto = function (file) {
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
  };
})();
