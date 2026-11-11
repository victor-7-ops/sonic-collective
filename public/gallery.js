// Click-to-enlarge viewer for photo galleries. Loaded only on pages that have a gallery.
document.querySelectorAll('[data-gallery]').forEach(function (root) {
  var viewer = root.querySelector('[data-gallery-viewer]');
  if (!viewer) return;
  var slides = Array.prototype.slice.call(viewer.querySelectorAll('[data-gallery-slide]'));
  var count = viewer.querySelector('[data-gallery-count]');
  var current = 0;
  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach(function (slide, position) { slide.hidden = position !== current; });
    if (count) count.textContent = 'Photo ' + (current + 1) + ' of ' + slides.length;
  }
  root.querySelectorAll('[data-gallery-open]').forEach(function (button) {
    button.addEventListener('click', function () {
      show(Number(button.getAttribute('data-gallery-open')));
      viewer.showModal();
    });
  });
  var close = viewer.querySelector('[data-gallery-close]');
  var prev = viewer.querySelector('[data-gallery-prev]');
  var next = viewer.querySelector('[data-gallery-next]');
  if (close) close.addEventListener('click', function () { viewer.close(); });
  if (prev) prev.addEventListener('click', function () { show(current - 1); });
  if (next) next.addEventListener('click', function () { show(current + 1); });
  viewer.addEventListener('click', function (event) { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
  });
});
