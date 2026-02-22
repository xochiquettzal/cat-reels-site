/* =====================================================================
   KITTY REELS — Main JavaScript
   Handles: video feed, autoplay, sound toggle, admin panel, GitHub API
   ===================================================================== */

// ── State ──
const state = {
  videos: [],
  currentIndex: 0,
  isMuted: true,
  activePage: 'home',
  ghToken: localStorage.getItem('gh_token') || '',
  ghRepo: localStorage.getItem('gh_repo') || '',
  ghBranch: localStorage.getItem('gh_branch') || 'main',
  adminUnlocked: false,
  // Change this hash to set your own admin password.
  // Default password: "kitty123"
  // To generate your own: open browser console, run:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PASSWORD'))
  //     .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
  adminPasswordHash: '543c3bfb2e034b17c066979d697c1142ca3daef713b856c3a04fe7b46b804472',
};

// ── DOM References ──
const feed = document.getElementById('reelFeed');
const soundIndicator = document.getElementById('soundIndicator');
const muteIndicator = document.getElementById('muteIndicator');

// ── Initialize ──
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadVideos();
  renderFeed();
  setupIntersectionObserver();
  setupKeyboardNav();
  setupVisibilityHandler();
  setupBottomNav();
  setupAdminPanel();
  loadGHSettings();
}

/* =====================================================================
   VIDEO FEED
   ===================================================================== */

async function loadVideos() {
  try {
    const res = await fetch('videos.json');
    if (!res.ok) throw new Error('Failed to load videos.json');
    state.videos = await res.json();
  } catch (e) {
    console.warn('Could not load videos.json:', e);
    state.videos = [];
  }
}

function renderFeed() {
  feed.innerHTML = '';

  if (state.videos.length === 0) {
    feed.innerHTML = `
      <div class="reel-empty">
        <div class="empty-cat">😿</div>
        <h3>No Videos Yet</h3>
        <p>Add your first video using the Admin panel below!</p>
      </div>
    `;
    return;
  }

  state.videos.forEach((video, i) => {
    const slide = document.createElement('div');
    slide.className = 'reel-slide';
    slide.setAttribute('data-index', i);
    slide.innerHTML = `
      <!-- Loading Spinner -->
      <div class="reel-loader" aria-hidden="true">
        <div class="loader-paw">🐾</div>
      </div>

      <!-- Video -->
      <video
        class="reel-video"
        ${i === 0 ? 'src="' + video.src + '"' : 'data-src="' + video.src + '"'}
        ${i === 1 ? 'preload="metadata"' : ''}
        playsinline
        loop
        muted
        aria-label="${video.title}: ${video.caption}"
      ></video>

      <!-- Info Overlay -->
      <div class="reel-info">
        <div class="reel-title">${escapeHtml(video.title)}</div>
        <div class="reel-caption">${escapeHtml(video.caption)}</div>
      </div>

      <!-- Action Bar -->
      <div class="reel-actions">
        <button class="action-btn like-btn" aria-label="Like" data-id="${video.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="action-label">Like</span>
        </button>
        <button class="action-btn share-btn" aria-label="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <span class="action-label">Share</span>
        </button>
        <button class="action-btn save-btn" aria-label="Save">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="action-label">Save</span>
        </button>
      </div>
    `;

    // ── Tap / Double-tap handlers ──
    let lastTap = 0;
    const videoEl = slide.querySelector('.reel-video');

    videoEl.addEventListener('click', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double tap → like
        handleDoubleTapLike(slide, i);
        lastTap = 0;
      } else {
        // Single tap → toggle mute (delayed to check for double tap)
        lastTap = now;
        setTimeout(() => {
          if (lastTap === now) toggleMute();
        }, 300);
      }
    });

    // ── Remove loader when video can play ──
    videoEl.addEventListener('canplay', () => {
      const loader = slide.querySelector('.reel-loader');
      if (loader) loader.style.display = 'none';
    }, { once: true });

    // ── Like button ──
    slide.querySelector('.like-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLike(slide.querySelector('.like-btn'));
    });

    // ── Share button ──
    slide.querySelector('.share-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      handleShare(video);
    });

    // ── Save button ──
    slide.querySelector('.save-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSave(slide.querySelector('.save-btn'));
    });

    feed.appendChild(slide);
  });
}

/* ── Autoplay via IntersectionObserver ── */
function setupIntersectionObserver() {
  const options = {
    root: feed,
    threshold: 0.6,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.querySelector('.reel-video');
      const index = parseInt(entry.target.getAttribute('data-index'));

      if (entry.isIntersecting) {
        state.currentIndex = index;

        // Lazy load src
        if (!video.src && video.dataset.src) {
          video.src = video.dataset.src;
        }

        // Preload next video
        preloadNext(index);

        // Play
        video.muted = state.isMuted;
        const playPromise = video.play();
        if (playPromise) playPromise.catch(() => { });
      } else {
        video.pause();
      }
    });
  }, options);

  document.querySelectorAll('.reel-slide').forEach(slide => {
    observer.observe(slide);
  });
}

function preloadNext(currentIdx) {
  const nextIdx = currentIdx + 1;
  if (nextIdx >= state.videos.length) return;

  const nextSlide = feed.querySelector(`[data-index="${nextIdx}"]`);
  if (!nextSlide) return;

  const nextVideo = nextSlide.querySelector('.reel-video');
  if (!nextVideo.src && nextVideo.dataset.src) {
    nextVideo.src = nextVideo.dataset.src;
    nextVideo.preload = 'metadata';
  }
}

/* ── Mute / Unmute ── */
function toggleMute() {
  state.isMuted = !state.isMuted;

  // Update all videos
  document.querySelectorAll('.reel-video').forEach(v => {
    v.muted = state.isMuted;
  });

  // Show indicator
  showSoundIndicator(state.isMuted);
}

function showSoundIndicator(muted) {
  const indicator = muted ? muteIndicator : soundIndicator;
  const other = muted ? soundIndicator : muteIndicator;

  other.classList.remove('show');
  indicator.classList.remove('show');
  // Force reflow
  void indicator.offsetWidth;
  indicator.classList.add('show');

  setTimeout(() => indicator.classList.remove('show'), 600);
}

/* ── Like / Save / Share ── */
function toggleLike(btn) {
  btn.classList.toggle('liked');
  if (btn.classList.contains('liked')) {
    // Re-trigger animation
    btn.style.animation = 'none';
    void btn.offsetWidth;
    btn.style.animation = '';
  }
}

function toggleSave(btn) {
  btn.classList.toggle('saved');
}

function handleDoubleTapLike(slide, index) {
  // Show big heart
  const heart = document.createElement('div');
  heart.className = 'double-tap-heart';
  heart.textContent = '❤️';
  slide.appendChild(heart);
  setTimeout(() => heart.remove(), 800);

  // Also toggle like button
  const likeBtn = slide.querySelector('.like-btn');
  if (!likeBtn.classList.contains('liked')) {
    toggleLike(likeBtn);
  }
}

function handleShare(video) {
  if (navigator.share) {
    navigator.share({
      title: video.title,
      text: video.caption,
      url: window.location.href,
    }).catch(() => { });
  } else {
    // Fallback: copy URL
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert('Link copied! 🐾');
    }).catch(() => { });
  }
}

/* ── Keyboard Navigation ── */
function setupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    if (state.activePage !== 'home') return;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      scrollToSlide(state.currentIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      scrollToSlide(state.currentIndex - 1);
    } else if (e.key === 'm') {
      toggleMute();
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlayPause();
    }
  });
}

function scrollToSlide(index) {
  if (index < 0 || index >= state.videos.length) return;
  const slide = feed.querySelector(`[data-index="${index}"]`);
  if (slide) {
    slide.scrollIntoView({ behavior: 'smooth' });
  }
}

function togglePlayPause() {
  const slide = feed.querySelector(`[data-index="${state.currentIndex}"]`);
  if (!slide) return;
  const video = slide.querySelector('.reel-video');
  if (video.paused) {
    video.play().catch(() => { });
  } else {
    video.pause();
  }
}

/* ── Tab Visibility ── */
function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    const slide = feed.querySelector(`[data-index="${state.currentIndex}"]`);
    if (!slide) return;
    const video = slide.querySelector('.reel-video');

    if (document.hidden) {
      video.pause();
    } else if (state.activePage === 'home') {
      video.play().catch(() => { });
    }
  });
}

/* =====================================================================
   BOTTOM NAVIGATION
   ===================================================================== */

function setupBottomNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;

      // Update active state
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');

      // Show/hide pages
      if (page === 'home') {
        closeAllPages();
        state.activePage = 'home';
        // Resume video
        const slide = feed.querySelector(`[data-index="${state.currentIndex}"]`);
        if (slide) {
          const video = slide.querySelector('.reel-video');
          if (video && video.src) video.play().catch(() => { });
        }
      } else {
        openPage(page);
      }
    });
  });
}

function openPage(page) {
  closeAllPages();
  state.activePage = page;

  // Pause current video
  const slide = feed.querySelector(`[data-index="${state.currentIndex}"]`);
  if (slide) {
    const video = slide.querySelector('.reel-video');
    if (video) video.pause();
  }

  // Admin panel requires password
  if (page === 'admin') {
    if (!state.adminUnlocked) {
      showAdminLogin();
      return;
    }
  }

  const pageEl = document.getElementById('page' + capitalize(page));
  if (pageEl) {
    pageEl.classList.remove('hidden');
  }

  // Refresh admin videos list
  if (page === 'admin') {
    renderAdminVideosList();
  }
}

function closeAllPages() {
  document.querySelectorAll('.page-overlay').forEach(p => p.classList.add('hidden'));
}

// Close buttons in pages
document.querySelectorAll('.page-close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Go back to home
    closeAllPages();
    state.activePage = 'home';

    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    document.querySelector('[data-page="home"]').classList.add('active');
    document.querySelector('[data-page="home"]').setAttribute('aria-current', 'page');

    // Resume video
    const slide = feed.querySelector(`[data-index="${state.currentIndex}"]`);
    if (slide) {
      const video = slide.querySelector('.reel-video');
      if (video && video.src) video.play().catch(() => { });
    }
  });
});

/* =====================================================================
   ADMIN PANEL — Password Protection + GitHub API Integration
   ===================================================================== */

// ── Password Protection ──
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function showAdminLogin() {
  // Create a login overlay inside the phone frame
  const existing = document.getElementById('adminLoginOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('section');
  overlay.id = 'adminLoginOverlay';
  overlay.className = 'page-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Admin login');
  overlay.innerHTML = `
    <div class="page-content" style="text-align:center; padding-top:60px;">
      <button class="page-close-btn admin-login-close" aria-label="Close">&times;</button>
      <div style="font-size:3rem; margin-bottom:16px;">🔒</div>
      <h2>Admin Access</h2>
      <p class="page-desc">Enter the admin password to continue.</p>
      <div class="admin-section" style="margin-top:20px;">
        <div class="form-group">
          <input type="password" id="adminPasswordInput" placeholder="Password" autocomplete="off" />
        </div>
        <button id="btnAdminLogin" class="btn-primary">
          <span class="btn-paw">🐾</span> Unlock
        </button>
        <div id="adminLoginStatus" class="status-msg"></div>
      </div>
    </div>
  `;

  document.querySelector('.phone-frame').appendChild(overlay);

  // Focus password input
  setTimeout(() => document.getElementById('adminPasswordInput').focus(), 100);

  // Login handler
  document.getElementById('btnAdminLogin').addEventListener('click', handleAdminLogin);
  document.getElementById('adminPasswordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Close handler
  overlay.querySelector('.admin-login-close').addEventListener('click', () => {
    overlay.remove();
    // Go back to home
    closeAllPages();
    state.activePage = 'home';
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });
    document.querySelector('[data-page="home"]').classList.add('active');
    document.querySelector('[data-page="home"]').setAttribute('aria-current', 'page');
    const slide = feed.querySelector(`[data-index="${state.currentIndex}"]`);
    if (slide) {
      const video = slide.querySelector('.reel-video');
      if (video && video.src) video.play().catch(() => { });
    }
  });
}

async function handleAdminLogin() {
  const input = document.getElementById('adminPasswordInput');
  const password = input.value;

  if (!password) {
    showStatus('adminLoginStatus', '❌ Enter a password', 'error');
    return;
  }

  const hash = await hashPassword(password);

  if (hash === state.adminPasswordHash) {
    state.adminUnlocked = true;
    const overlay = document.getElementById('adminLoginOverlay');
    if (overlay) overlay.remove();
    // Now open the real admin page
    openPage('admin');
  } else {
    showStatus('adminLoginStatus', '❌ Wrong password', 'error');
    input.value = '';
    input.focus();
  }
}

function setupAdminPanel() {
  document.getElementById('btnSaveGH').addEventListener('click', saveGHSettings);
  document.getElementById('btnUpload').addEventListener('click', uploadVideo);
  document.getElementById('btnBulkDelete').addEventListener('click', handleBulkDelete);

  // Show/Hide title/caption based on file count
  document.getElementById('videoFile').addEventListener('change', (e) => {
    const fields = document.getElementById('singleVideoFields');
    if (e.target.files.length > 1) {
      fields.classList.add('hidden');
    } else {
      fields.classList.remove('hidden');
    }
  });
}

function loadGHSettings() {
  document.getElementById('ghToken').value = state.ghToken;
  document.getElementById('ghRepo').value = state.ghRepo;
  document.getElementById('ghBranch').value = state.ghBranch;
}

function saveGHSettings() {
  state.ghToken = document.getElementById('ghToken').value.trim();
  state.ghRepo = document.getElementById('ghRepo').value.trim();
  state.ghBranch = document.getElementById('ghBranch').value.trim() || 'main';

  localStorage.setItem('gh_token', state.ghToken);
  localStorage.setItem('gh_repo', state.ghRepo);
  localStorage.setItem('gh_branch', state.ghBranch);

  showStatus('ghStatus', '✅ Settings saved!', 'success');
}

async function uploadVideo() {
  const fileInput = document.getElementById('videoFile');
  const singleTitle = document.getElementById('videoTitle').value.trim();
  const singleCaption = document.getElementById('videoCaption').value.trim();
  const files = Array.from(fileInput.files);

  if (!state.ghToken || !state.ghRepo) {
    showStatus('uploadStatus', '❌ Set GitHub settings first', 'error');
    return;
  }
  if (!files.length) {
    showStatus('uploadStatus', '❌ Select video file(s)', 'error');
    return;
  }
  if (files.length === 1 && !singleTitle) {
    showStatus('uploadStatus', '❌ Enter a title', 'error');
    return;
  }

  const btn = document.getElementById('btnUpload');
  const progressBar = document.getElementById('uploadProgress');
  const progressFill = progressBar.querySelector('.progress-fill');
  const progressText = progressBar.querySelector('.progress-text');

  btn.disabled = true;
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting...';
  showStatus('uploadStatus', '', '');

  try {
    const treeItems = [];
    const compress = document.getElementById('compressVideo').checked;
    
    // Step 1: Read/Compress current videos.json
    let currentVideos = [];
    try {
      const jsonData = await githubGetFile('videos.json');
      currentVideos = JSON.parse(decodeURIComponent(escape(atob(jsonData.content.replace(/\n/g, '')))));
    } catch (e) {
      currentVideos = [];
    }

    let nextId = currentVideos.length > 0 ? Math.max(...currentVideos.map(v => v.id)) + 1 : 1;

    // Step 2: Process each video file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stepBase = (i / files.length) * 80;
      const stepSize = 80 / files.length;

      progressText.textContent = `Processing ${i + 1}/${files.length}: ${file.name}`;
      progressFill.style.width = `${stepBase}%`;

      let base64Content;
      if (compress) {
        const compressedBlob = await compressVideo(file, (p) => {
          progressFill.style.width = `${stepBase + (p * stepSize * 0.7)}%`;
        });
        base64Content = await blobToBase64(compressedBlob);
      } else {
        base64Content = await fileToBase64(file);
      }

      const fileName = sanitizeFileName(file.name);
      const filePath = `videos/${fileName}`;
      
      // Create blob on GitHub
      const blobData = await githubCreateBlob(base64Content);
      
      treeItems.push({
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha
      });

      // Update metadata
      currentVideos.push({
        id: nextId++,
        title: files.length === 1 ? singleTitle : file.name.replace(/\.[^/.]+$/, ""),
        caption: files.length === 1 ? singleCaption : '',
        src: filePath
      });

      progressFill.style.width = `${stepBase + stepSize}%`;
    }

    // Step 3: Create blob for updated videos.json
    progressText.textContent = 'Updating metadata...';
    const jsonStr = JSON.stringify(currentVideos, null, 2) + '\n';
    const jsonBase64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const jsonBlob = await githubCreateBlob(jsonBase64);
    
    treeItems.push({
      path: 'videos.json',
      mode: '100644',
      type: 'blob',
      sha: jsonBlob.sha
    });

    // Step 4: Create Tree -> Commit -> Update Ref
    progressText.textContent = 'Committing changes...';
    progressFill.style.width = '90%';
    
    const baseTreeSha = await githubGetLatestCommitSha();
    const newTree = await githubCreateTree(baseTreeSha, treeItems);
    const newCommit = await githubCreateCommit(`Add ${files.length} video(s)`, newTree.sha, baseTreeSha);
    await githubUpdateRef(newCommit.sha);

    progressFill.style.width = '100%';
    progressText.textContent = 'Done!';
    showStatus('uploadStatus', `✅ ${files.length} video(s) uploaded in one commit!`, 'success');

    // Reset form
    fileInput.value = '';
    document.getElementById('videoTitle').value = '';
    document.getElementById('videoCaption').value = '';
    document.getElementById('singleVideoFields').classList.remove('hidden');

    // Refresh local state
    state.videos = currentVideos;
    renderFeed();
    renderAdminVideosList();

    setTimeout(() => {
      progressBar.classList.add('hidden');
    }, 2000);

  } catch (err) {
    console.error('Upload error:', err);
    showStatus('uploadStatus', `❌ Error: ${err.message}`, 'error');
    progressBar.classList.add('hidden');
  } finally {
    btn.disabled = false;
  }
}

/* ── GitHub Git Data API Helpers ── */

async function githubCreateBlob(contentBase64) {
  const url = `https://api.github.com/repos/${state.ghRepo}/git/blobs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: contentBase64,
      encoding: 'base64'
    })
  });
  if (!res.ok) throw new Error('Failed to create blob');
  return await res.json();
}

async function githubGetLatestCommitSha() {
  const url = `https://api.github.com/repos/${state.ghRepo}/git/refs/heads/${state.ghBranch}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `token ${state.ghToken}` }
  });
  if (!res.ok) throw new Error('Failed to get branch ref');
  const data = await res.json();
  return data.object.sha;
}

async function githubCreateTree(baseTreeSha, treeItems) {
  const url = `https://api.github.com/repos/${state.ghRepo}/git/trees`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems
    })
  });
  if (!res.ok) throw new Error('Failed to create tree');
  return await res.json();
}

async function githubCreateCommit(message, treeSha, parentSha) {
  const url = `https://api.github.com/repos/${state.ghRepo}/git/commits`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: message,
      tree: treeSha,
      parents: [parentSha]
    })
  });
  if (!res.ok) throw new Error('Failed to create commit');
  return await res.json();
}

async function githubUpdateRef(commitSha) {
  const url = `https://api.github.com/repos/${state.ghRepo}/git/refs/heads/${state.ghBranch}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sha: commitSha })
  });
  if (!res.ok) throw new Error('Failed to update branch reference');
  return await res.json();
}

/* ── GitHub API Helpers ── */

async function githubCreateOrUpdate(path, contentBase64, message) {
  const apiUrl = `https://api.github.com/repos/${state.ghRepo}/contents/${path}`;

  // Check if file exists (to get SHA for update)
  let sha = null;
  try {
    const existing = await githubGetFile(path);
    sha = existing.sha;
  } catch (e) {
    // File doesn't exist yet, that's fine
  }

  const body = {
    message: message,
    content: contentBase64,
    branch: state.ghBranch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `GitHub API error: ${res.status}`);
  }

  return await res.json();
}

async function githubGetFile(path) {
  const apiUrl = `https://api.github.com/repos/${state.ghRepo}/contents/${path}?ref=${state.ghBranch}`;

  const res = await fetch(apiUrl, {
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) throw new Error(`File not found: ${path}`);
  return await res.json();
}

async function githubDeleteFile(path, message) {
  const existing = await githubGetFile(path);
  const apiUrl = `https://api.github.com/repos/${state.ghRepo}/contents/${path}`;

  const res = await fetch(apiUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${state.ghToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      message: message,
      sha: existing.sha,
      branch: state.ghBranch,
    }),
  });

  if (!res.ok) throw new Error('Failed to delete file');
  return await res.json();
}

/* ── Admin Videos List ── */

function renderAdminVideosList() {
  const list = document.getElementById('videosList');
  if (!list) return;

  if (state.videos.length === 0) {
    list.innerHTML = '<p style="color: #999; font-size: 0.85rem; text-align: center;">No videos added yet.</p>';
    document.getElementById('btnBulkDelete').classList.add('hidden');
    return;
  }

  list.innerHTML = state.videos.map((v, i) => `
    <div class="video-list-item">
      <input type="checkbox" class="video-list-select" data-id="${v.id}" />
      <div class="video-list-num">${i + 1}</div>
      <div class="video-list-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
      <button class="video-list-delete" data-id="${v.id}" aria-label="Delete ${v.title}" title="Delete">🗑️</button>
    </div>
  `).join('');

  // Bulk delete button visibility
  const updateBulkDeleteVisibility = () => {
    const checked = list.querySelectorAll('.video-list-select:checked').length;
    const btn = document.getElementById('btnBulkDelete');
    if (checked > 0) {
      btn.classList.remove('hidden');
      btn.textContent = `🗑️ Delete Selected (${checked})`;
    } else {
      btn.classList.add('hidden');
    }
  };

  list.querySelectorAll('.video-list-select').forEach(cb => {
    cb.addEventListener('change', updateBulkDeleteVisibility);
  });

  // Single delete handlers
  list.querySelectorAll('.video-list-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const video = state.videos.find(v => v.id === id);
      if (!video) return;

      if (!confirm(`Delete "${video.title}"?`)) return;

      if (!state.ghToken || !state.ghRepo) {
        showStatus('uploadStatus', '❌ Set GitHub settings to delete remotely', 'error');
        return;
      }

      try {
        showStatus('uploadStatus', '⏳ Deleting...', 'info');
        
        // Single delete using same atomic logic for consistency
        await performAtomicDelete([id]);
        
        showStatus('uploadStatus', '✅ Video deleted!', 'success');
      } catch (err) {
        showStatus('uploadStatus', `❌ ${err.message}`, 'error');
      }
    });
  });
}

async function handleBulkDelete() {
  const selectedCbs = document.querySelectorAll('.video-list-select:checked');
  const ids = Array.from(selectedCbs).map(cb => parseInt(cb.dataset.id));
  
  if (ids.length === 0) return;
  if (!confirm(`Are you sure you want to delete ${ids.length} videos?`)) return;

  try {
    showStatus('uploadStatus', '⏳ Processing bulk delete...', 'info');
    await performAtomicDelete(ids);
    showStatus('uploadStatus', `✅ ${ids.length} video(s) deleted!`, 'success');
  } catch (err) {
    showStatus('uploadStatus', `❌ ${err.message}`, 'error');
  }
}

async function performAtomicDelete(idsToDelete) {
  const treeItems = [];
  const videosToRemove = state.videos.filter(v => idsToDelete.includes(v.id));
  const updatedVideos = state.videos.filter(v => !idsToDelete.includes(v.id));

  // 1. Mark files for deletion in the tree
  // In Git Trees, to delete a file you simply don't include it in the new tree if it's based on an old tree,
  // OR you can explicitly set SHA to null if using the Tree API without a base_tree.
  // BUT the easiest way with base_tree is to NOT include the path.
  // HOWEVER, githubCreateTree with base_tree ADDS/REPLACES. It doesn't remove unless we manually reconstruct.
  
  // So we'll use a different approach: 
  // We'll get the FULL current tree, remove the items, and create a NEW tree without a base_tree.
  // Actually, for simplicity and safety, we will just update videos.json and leave the files in the repo if they are many,
  // OR we use the "delete" method for each file then update JSON.
  // For "atomic" delete of both file & metadata, we NEED the Tree API.
  
  const baseSha = await githubGetLatestCommitSha();
  
  // Get full tree to know what to REMOVE
  const treeUrl = `https://api.github.com/repos/${state.ghRepo}/git/trees/${baseSha}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers: { 'Authorization': `token ${state.ghToken}` } });
  const fullTree = await treeRes.json();
  
  const pathsToDelete = videosToRemove.map(v => v.src);
  
  // Filter out the deleted files and the old videos.json
  const newTreeItems = fullTree.tree
    .filter(item => item.type === 'blob' && !pathsToDelete.includes(item.path) && item.path !== 'videos.json')
    .map(item => ({
      path: item.path,
      mode: item.mode,
      type: item.type,
      sha: item.sha
    }));

  // Add the updated videos.json
  const jsonStr = JSON.stringify(updatedVideos, null, 2) + '\n';
  const jsonBase64 = btoa(unescape(encodeURIComponent(jsonStr)));
  const jsonBlob = await githubCreateBlob(jsonBase64);
  
  newTreeItems.push({
    path: 'videos.json',
    mode: '100644',
    type: 'blob',
    sha: jsonBlob.sha
  });

  const newTree = await githubCreateTree(null, newTreeItems); // No base_tree, we provided full content
  const newCommit = await githubCreateCommit(`Delete ${idsToDelete.length} video(s)`, newTree.sha, baseSha);
  await githubUpdateRef(newCommit.sha);

  // Update local state
  state.videos = updatedVideos;
  renderFeed();
  renderAdminVideosList();
}

/* =====================================================================
   VIDEO COMPRESSION (Canvas + MediaRecorder)
   ===================================================================== */

/**
 * Compresses a video file by re-encoding it at lower quality/resolution
 * using a hidden <video> + <canvas> + MediaRecorder pipeline.
 * Works entirely in-browser, no external libraries needed.
 */
function compressVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      // Target: max 720px height, maintain aspect ratio
      const maxHeight = 720;
      const scale = video.videoHeight > maxHeight ? maxHeight / video.videoHeight : 1;
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const stream = canvas.captureStream(30); // 30fps

      // Try to use MediaRecorder with webm/vp8 (widely supported)
      let mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback: just upload original if compression not supported
        URL.revokeObjectURL(url);
        resolve(file);
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1500000, // 1.5 Mbps — good quality, much smaller
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        URL.revokeObjectURL(url);
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      recorder.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('Compression failed'));
      };

      // Start recording
      recorder.start();
      video.currentTime = 0;
      video.play();

      const duration = video.duration;

      function drawFrame() {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        if (onProgress && duration) {
          onProgress(Math.min(video.currentTime / duration, 1));
        }
        requestAnimationFrame(drawFrame);
      }
      drawFrame();

      // Stop when video ends
      video.onended = () => {
        setTimeout(() => recorder.stop(), 100);
      };
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load video for compression'));
    };
  });
}

/* =====================================================================
   UTILITIES
   ===================================================================== */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove data URL prefix to get pure base64
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `status-msg ${type}`;
}
