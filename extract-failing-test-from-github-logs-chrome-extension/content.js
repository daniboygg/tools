(function () {
  if (document.getElementById('gfte-root')) return;

  const match = window.location.pathname.match(
    /^\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/job\/(\d+)/
  );
  if (!match) return;

  const [, owner, repo, runId, jobId] = match;

  // ── DOM: toolbar ──────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.id = 'gfte-root';
  toolbar.innerHTML = `
    <button id="gfte-copy-btn">Copy Failing Tests</button>
    <button id="gfte-view-btn">View Failing Tests</button>
    <span id="gfte-status"></span>
  `;
  document.body.appendChild(toolbar);

  // ── DOM: overlay ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'gfte-overlay';
  overlay.innerHTML = `
    <div id="gfte-panel">
      <div id="gfte-panel-header">
        <span id="gfte-panel-title">Extracted Test Paths:</span>
        <button id="gfte-close-btn" aria-label="Close">×</button>
      </div>
      <div id="gfte-panel-body">
        <div id="gfte-count"></div>
        <div id="gfte-test-list"></div>
      </div>
      <div id="gfte-panel-footer">
        <button id="gfte-panel-copy-btn">Copy to Clipboard (space-separated)</button>
        <span id="gfte-panel-copy-msg"></span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('gfte-close-btn').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });

  function closeOverlay() {
    overlay.classList.remove('gfte-visible');
  }

  // ── Log fetching ──────────────────────────────────────────────────────────
  let cachedTests = null;

  function rawLogUrl() {
    const link = document.querySelector('a.js-steps-dropdown-raw-logs');
    if (link) return link.href;
    return null;
  }

  async function getTests() {
    if (cachedTests !== null) return cachedTests;

    setStatus('Fetching logs…', '');

    const url = rawLogUrl();
    if (!url) {
      setStatus('Raw logs link not found on page', 'error');
      return null;
    }

    let res;
    try {
      res = await fetch(url, { credentials: 'same-origin' });
    } catch {
      setStatus('Network error fetching logs', 'error');
      return null;
    }

    if (!res.ok) {
      setStatus(`Failed to fetch logs (${res.status})`, 'error');
      return null;
    }

    const text = await res.text();
    cachedTests = extractTestPaths(text);
    setStatus('', '');
    return cachedTests;
  }

  // ── Button handlers ───────────────────────────────────────────────────────
  document.getElementById('gfte-copy-btn').addEventListener('click', async () => {
    const tests = await getTests();
    if (tests === null) return;
    if (tests.length === 0) {
      setStatus('No failing tests found', 'warn');
      return;
    }
    await navigator.clipboard.writeText(tests.join(' '));
    setStatus(`Copied ${tests.length} test(s)`, 'success');
    setTimeout(() => setStatus('', ''), 2500);
  });

  document.getElementById('gfte-view-btn').addEventListener('click', async () => {
    const tests = await getTests();
    if (tests === null) return;
    displayOverlay(tests);
  });

  document.getElementById('gfte-panel-copy-btn').addEventListener('click', async () => {
    if (!cachedTests) return;
    await navigator.clipboard.writeText(cachedTests.join(' '));
    closeOverlay();
    setStatus(`Copied ${cachedTests.length} test(s)`, 'success');
    setTimeout(() => setStatus('', ''), 2500);
  });

  // ── Overlay display ───────────────────────────────────────────────────────
  function displayOverlay(tests) {
    const count = document.getElementById('gfte-count');
    const list = document.getElementById('gfte-test-list');

    if (tests.length === 0) {
      count.textContent = 'No failing tests found in this job.';
      list.innerHTML = '';
      overlay.classList.add('gfte-visible');
      return;
    }

    count.textContent = `Found ${tests.length} test(s)`;
    const prefix = findCommonPrefix(tests);
    list.innerHTML = '';

    tests.forEach(test => {
      const item = document.createElement('div');
      item.className = 'gfte-test-item';
      if (prefix && test.startsWith(prefix)) {
        const common = document.createElement('span');
        common.className = 'gfte-common';
        common.textContent = prefix;
        const unique = document.createElement('span');
        unique.className = 'gfte-unique';
        unique.textContent = test.slice(prefix.length);
        item.appendChild(common);
        item.appendChild(unique);
      } else {
        item.textContent = test;
      }
      list.appendChild(item);
    });

    overlay.classList.add('gfte-visible');
  }

  // ── Extraction logic (mirrors the web tool) ───────────────────────────────
  function extractTestPaths(logText) {
    const tests = new Set();
    const errorPattern =
      /^(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+)?ERROR:\s+(\S+)\s+\(([a-zA-Z0-9_.]+)\)/;
    const failPattern =
      /^(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+)?FAIL:\s+(\S+)\s+\(([a-zA-Z0-9_.]+)\)/;
    const bareTestPattern =
      /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\.[A-Z][a-zA-Z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)$/;

    for (const raw of logText.split('\n')) {
      const line = raw.trim();

      const errorMatch = line.match(errorPattern);
      if (errorMatch) {
        const [, method, cls] = errorMatch;
        tests.add(cls.endsWith(`.${method}`) ? cls : `${cls}.${method}`);
        continue;
      }

      const failMatch = line.match(failPattern);
      if (failMatch) {
        const [, method, cls] = failMatch;
        tests.add(cls.endsWith(`.${method}`) ? cls : `${cls}.${method}`);
        continue;
      }

      if (bareTestPattern.test(line) && !line.includes(' ') && line.split('.').length >= 4) {
        tests.add(line);
      }
    }

    return Array.from(tests).sort();
  }

  function findCommonPrefix(tests) {
    if (tests.length <= 1) return '';
    let prefix = tests[0];
    for (let i = 1; i < tests.length; i++) {
      while (!tests[i].startsWith(prefix)) {
        prefix = prefix.slice(0, prefix.length - 1);
        if (!prefix) return '';
      }
    }
    const dot = prefix.lastIndexOf('.');
    return dot !== -1 ? prefix.slice(0, dot + 1) : '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function setStatus(text, type) {
    const el = document.getElementById('gfte-status');
    el.textContent = text;
    el.className = type ? `gfte-${type}` : '';
  }
})();
