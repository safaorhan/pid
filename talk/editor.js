// ---------- Edit mode: change any text in place, save it back into index.html ----------
//   E        toggle edit mode
//   ⌘S / ^S  save into index.html (Chrome asks for the talk folder once)
//   Esc      stop editing the current text
// Saving goes through a folder handle, never a save dialog: Chrome's save dialog
// empties an existing file the moment "Replace" is confirmed.
(() => {
  const dirty = new Set();
  const notesBody = document.querySelector('#notes .body');
  let editing = false;
  let dirHandle = null;
  let message = '';

  // The folder handle survives reloads in IndexedDB
  function handleStore(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('talk-editor', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('handles');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('handles', mode);
        const req = fn(tx.objectStore('handles'));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  async function talkFolder() {
    if (!dirHandle) dirHandle = await handleStore('readonly', s => s.get('talk')).catch(() => null);
    if (dirHandle && (await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') dirHandle = null;
    if (!dirHandle) {
      dirHandle = await showDirectoryPicker({ id: 'talk', mode: 'readwrite' });
      handleStore('readwrite', s => s.put(dirHandle, 'talk')).catch(() => {});
    }
    return dirHandle;
  }

  const bar = document.createElement('div');
  bar.id = 'editbar';
  bar.hidden = true;
  document.body.append(bar);

  function renderBar() {
    const changes = dirty.size ? `${dirty.size} kaydedilmemiş değişiklik` : 'değişiklik yok';
    bar.innerHTML = `<b>DÜZENLEME</b><span>${changes}</span><span>⌘S kaydet · E çık</span>` +
      (message ? `<span class="msg">${message}</span>` : '');
  }

  function status(text) { message = text; renderBar(); }

  function markDirty(el) {
    const host = el.closest('[data-eid]');
    if (!host) return;
    dirty.add(+host.dataset.eid);
    message = '';
    renderBar();
  }

  // Inline-editing is awkward for buttons and SVG labels, so they get a small input box
  const usesInput = el => el.matches('button') || el.closest('svg');

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    EDITABLES.forEach(({ el }) => {
      if (usesInput(el) || el.matches('aside')) return;
      on ? el.setAttribute('contenteditable', 'true') : el.removeAttribute('contenteditable');
    });
    on ? notesBody.setAttribute('contenteditable', 'true') : notesBody.removeAttribute('contenteditable');
    if (!on && document.activeElement) document.activeElement.blur();
    bar.hidden = !on;
    renderBar();
  }

  function inlineEdit(el) {
    const r = el.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'inline-edit';
    input.value = el.textContent.trim();
    Object.assign(input.style, {
      left: r.left + 'px', top: (r.top - 4) + 'px',
      width: Math.max(160, r.width + 60) + 'px', height: Math.max(30, r.height + 8) + 'px',
    });
    document.body.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      if (commit && input.value !== el.textContent.trim()) {
        el.textContent = input.value;
        markDirty(el);
      }
      input.remove();
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  // Code blocks are read line by line, so this works even when the slide is hidden
  function codeText(pre) {
    return [...pre.querySelectorAll('.src')].map(src => {
      const c = src.cloneNode(true);
      c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
      c.querySelectorAll('div').forEach(d => d.prepend('\n'));
      return c.textContent.replace(/ /g, ' ').replace(/\n$/, '').replace(/[ \t]+$/gm, '');
    }).join('\n');
  }

  function liveValue(item) {
    if (item.kind === 'code') return '\n' + codeText(item.el) + '\n';
    if (item.kind === 'text') return item.el.textContent;
    return item.el.innerHTML;
  }

  async function save() {
    if (!dirty.size) return status('Kaydedilecek değişiklik yok.');
    if (!window.showDirectoryPicker) return status('Bu tarayıcı dosyaya yazamıyor; Chrome kullan.');
    try {
      const dir = await talkFolder();
      let file;
      try {
        file = await dir.getFileHandle('index.html');
      } catch {
        dirHandle = null;
        return status('Bu klasörde index.html yok. "talk" klasörünü seç.');
      }
      const source = await (await file.getFile()).text();
      if (!source.trim()) return status('index.html boş görünüyor; üzerine yazmıyorum. index.backup.html\'e bak.');
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const targets = editableElements(doc);
      if (targets.length !== EDITABLES.length) throw new Error('mismatch');
      for (const i of dirty) {
        const item = EDITABLES[i], target = targets[i];
        if (editableValue(target) !== item.original) throw new Error('mismatch');
        const value = liveValue(item);
        if (item.kind === 'html') target.innerHTML = value;
        else target.textContent = value;
      }
      // Keep the previous version, then write. createWritable() swaps the file in on close().
      const backup = await (await dir.getFileHandle('index.backup.html', { create: true })).createWritable();
      await backup.write(source);
      await backup.close();
      const out = await file.createWritable();
      // No newline after </html>: the parser would move it into <body> and grow the file each save
      await out.write('<!doctype html>\n' + doc.documentElement.outerHTML);
      await out.close();
      for (const i of dirty) EDITABLES[i].original = liveValue(EDITABLES[i]);
      dirty.clear();
      status('Kaydedildi ✓');
    } catch (err) {
      if (err.name === 'AbortError') return status('Kaydetme iptal edildi.');
      if (err.message === 'mismatch') {
        return status('index.html bu sayfa açıldıktan sonra değişmiş. Sayfayı yenile, sonra tekrar dene.');
      }
      status('Kaydedilemedi: ' + err.message);
    }
  }

  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (editing || dirty.size) save();
      return;
    }
    const typing = e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
    if (e.key === 'Escape' && e.target.isContentEditable) { e.target.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'e' || e.key === 'E') setEditing(!editing);
  }, true);

  // Enter makes a line break, not a new <div>; pasted text arrives without formatting
  document.addEventListener('keydown', e => {
    if (!editing || !e.target.isContentEditable || e.key !== 'Enter') return;
    e.preventDefault();
    document.execCommand('insertLineBreak');
  });
  document.addEventListener('paste', e => {
    if (!editing || !e.target.isContentEditable) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  document.addEventListener('input', e => {
    if (!editing) return;
    if (notesBody.contains(e.target)) {
      const aside = document.querySelector('.slide.active aside.notes');
      if (!aside) return;
      aside.innerHTML = notesBody.innerHTML;
      markDirty(aside);
      return;
    }
    markDirty(e.target);
  });

  document.addEventListener('click', e => {
    if (!editing) return;
    const el = e.target.closest('button[data-eid], svg text[data-eid]');
    if (el) inlineEdit(el);
  }, true);

  addEventListener('beforeunload', e => {
    if (!dirty.size) return;
    e.preventDefault();
    e.returnValue = '';
  });
})();
