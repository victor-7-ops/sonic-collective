// Gallery editor: reorder photos by dragging the handle, or with the Up/Down buttons (keyboard friendly).
// The position number inputs stay the source of truth, so the form works without this script too.
(function () {
  var fieldset = document.querySelector('.gallery-editor');
  if (!fieldset) return;

  function rows() {
    return Array.prototype.slice.call(fieldset.querySelectorAll('.gallery-editor__row:not(.gallery-editor__candidate)'));
  }
  function renumber() {
    rows().forEach(function (row, index) {
      var position = row.querySelector('input[name$=".position"]');
      if (position) position.value = String(index + 1);
    });
  }
  function changed() { fieldset.dispatchEvent(new Event('input', { bubbles: true })); }

  function move(row, delta) {
    var list = rows();
    var target = list[list.indexOf(row) + delta];
    if (!target) return false;
    target.parentNode.insertBefore(row, delta < 0 ? target : target.nextSibling);
    renumber();
    changed();
    return true;
  }

  function button(label, text) {
    var control = document.createElement('button');
    control.type = 'button';
    control.className = 'secondary';
    control.setAttribute('aria-label', label);
    control.textContent = text;
    return control;
  }

  var dragged = null;
  rows().forEach(function (row) {
    var bar = document.createElement('div');
    bar.className = 'gallery-editor__move';
    var handle = document.createElement('span');
    handle.className = 'gallery-editor__handle';
    handle.draggable = true;
    handle.setAttribute('aria-hidden', 'true');
    handle.title = 'Drag to reorder';
    handle.textContent = '☰ Drag';
    var up = button('Move this photo earlier', '↑ Earlier');
    var down = button('Move this photo later', 'Later ↓');
    up.addEventListener('click', function () { move(row, -1); up.focus(); });
    down.addEventListener('click', function () { move(row, 1); down.focus(); });
    handle.addEventListener('dragstart', function (event) {
      dragged = row;
      row.classList.add('gallery-editor__dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', '');
        if (event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(row, 20, 20);
      }
    });
    handle.addEventListener('dragend', function () {
      row.classList.remove('gallery-editor__dragging');
      dragged = null;
      renumber();
      changed();
    });
    bar.appendChild(handle);
    bar.appendChild(up);
    bar.appendChild(down);
    row.appendChild(bar);
    row.addEventListener('dragover', function (event) {
      if (!dragged || dragged === row) return;
      event.preventDefault();
      var box = row.getBoundingClientRect();
      var after = event.clientY > box.top + box.height / 2;
      row.parentNode.insertBefore(dragged, after ? row.nextSibling : row);
    });
  });
})();
