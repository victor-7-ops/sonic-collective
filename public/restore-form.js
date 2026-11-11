// After a refused save the server re-renders the editor from the saved draft and also embeds what was submitted
// (#submitted-values). This puts those values back into the form so nothing the editor typed is lost.
(function () {
  var raw = document.getElementById('submitted-values');
  var form = document.querySelector('[data-editorial-form]');
  if (!raw || !form) return;
  var pairs;
  try { pairs = JSON.parse(raw.textContent || '[]'); } catch (error) { return; }
  var byName = {};
  pairs.forEach(function (pair) { (byName[pair[0]] = byName[pair[0]] || []).push(pair[1]); });
  var used = {};
  Array.prototype.forEach.call(form.elements, function (el) {
    var name = el.name;
    if (!name || el.type === 'hidden' || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
    var values = byName[name] || [];
    if (el.type === 'checkbox' || el.type === 'radio') { el.checked = values.indexOf(el.value) >= 0; return; }
    if (el.tagName === 'SELECT' && el.multiple) {
      Array.prototype.forEach.call(el.options, function (option) { option.selected = values.indexOf(option.value) >= 0; });
      return;
    }
    if (!values.length) return;
    var index = used[name] || 0;
    if (index < values.length) { el.value = values[index]; used[name] = index + 1; }
  });
  // Count the restored values as unsaved edits, so leaving the page still warns.
  form.dispatchEvent(new Event('input', { bubbles: true }));
})();
