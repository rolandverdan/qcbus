// ==================================================
// QC BUS TRACKER — AUTH (FRONTEND ONLY)
// Fake auth using localStorage. No backend yet.
// ==================================================

// --- Helpers ---
const qs = (sel) => document.querySelector(sel);

function showToast(message, type = 'info') {
  const toast = qs('#toast');
  toast.textContent = message;
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg text-white transition-all duration-300 z-50 show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 2400);
}

// ==================================================
// TAB SWITCHING (Login <-> Signup)
// ==================================================
let currentTab = 'login';

function switchTab(tab) {
  currentTab = tab;

  const indicator = qs('#tabIndicator');
  const tabLogin = qs('#tabLogin');
  const tabSignup = qs('#tabSignup');
  const loginForm = qs('#loginForm');
  const signupForm = qs('#signupForm');
  const headline = qs('#authHeadline');
  const sub = qs('#authSubheadline');
  const switchText = qs('#switchText');

  if (tab === 'signup') {
    // Move indicator to the right
    indicator.style.transform = 'translateX(100%)';

    tabSignup.classList.add('text-qc-blue');
    tabSignup.classList.remove('text-gray-500');
    tabLogin.classList.remove('text-qc-blue');
    tabLogin.classList.add('text-gray-500');

    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');

    headline.textContent = 'Create an account';
    sub.textContent = 'Join us and start tracking buses in real time.';

    switchText.innerHTML = `Already have an account?
      <button onclick="switchTab('login')" class="text-qc-blue font-semibold hover:underline">Sign in</button>`;
  } else {
    indicator.style.transform = 'translateX(0)';

    tabLogin.classList.add('text-qc-blue');
    tabLogin.classList.remove('text-gray-500');
    tabSignup.classList.remove('text-qc-blue');
    tabSignup.classList.add('text-gray-500');

    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');

    headline.textContent = 'Welcome back!';
    sub.textContent = 'Sign in to continue tracking your ride.';

    switchText.innerHTML = `Don't have an account?
      <button onclick="switchTab('signup')" class="text-qc-blue font-semibold hover:underline">Sign up</button>`;
  }
}

// ==================================================
// PASSWORD VISIBILITY TOGGLE
// ==================================================
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-pw');
  if (!btn) return;

  const targetId = btn.dataset.togglePassword;
  const input = document.getElementById(targetId);
  const eyeOpen = btn.querySelector('.eye-open');
  const eyeClosed = btn.querySelector('.eye-closed');

  if (input.type === 'password') {
    input.type = 'text';
    eyeOpen.classList.add('hidden');
    eyeClosed.classList.remove('hidden');
  } else {
    input.type = 'password';
    eyeOpen.classList.remove('hidden');
    eyeClosed.classList.add('hidden');
  }
});

// ==================================================
// PASSWORD STRENGTH METER (Signup)
// ==================================================
const pwInput = qs('#signupPassword');
if (pwInput) {
  pwInput.addEventListener('input', () => {
    const value = pwInput.value;
    const bars = qs('#pwStrength').children;
    const label = qs('#pwStrengthLabel');

    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    const colors = ['bg-gray-200', 'bg-red-400', 'bg-yellow-400', 'bg-blue-500', 'bg-green-500'];
    const labels = ['Password strength', 'Weak', 'Fair', 'Good', 'Strong'];

    for (let i = 0; i < 4; i++) {
      bars[i].className = `h-1 flex-1 rounded-full transition ${i < score ? colors[score] : 'bg-gray-200'}`;
    }

    label.textContent = value ? labels[score] : 'Password strength';
    label.className = `text-[11px] mt-1 ${
      score <= 1 ? 'text-red-400' :
      score === 2 ? 'text-yellow-500' :
      score === 3 ? 'text-blue-500' : 'text-green-500'
    }`;
  });
}

// ==================================================
// CONFIRM PASSWORD MATCH (Signup)
// ==================================================
const confirmInput = qs('#signupConfirm');
if (confirmInput) {
  confirmInput.addEventListener('input', () => {
    const mismatch = qs('#pwMismatch');
    if (confirmInput.value && confirmInput.value !== pwInput.value) {
      mismatch.classList.remove('hidden');
      confirmInput.classList.add('border-red-400');
    } else {
      mismatch.classList.add('hidden');
      confirmInput.classList.remove('border-red-400');
    }
  });
}

// ==================================================
// LOGIN SUBMIT
// ==================================================
qs('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const email = data.get('email').trim().toLowerCase();
  const password = data.get('password');

  // --- Fake auth: check against localStorage users ---
  const users = JSON.parse(localStorage.getItem('qcUsers') || '[]');
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    showToast('Invalid email or password', 'error');
    return;
  }

  // Save session
  localStorage.setItem('qcCurrentUser', JSON.stringify({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: 'commuter'
  }));

  showToast('Signed in successfully!', 'success');

  setTimeout(() => {
    window.location.href = 'index.html';
  }, 700);
});

// ==================================================
// SIGNUP SUBMIT
// ==================================================
qs('#signupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const name = data.get('name').trim();
  const email = data.get('email').trim().toLowerCase();
  const phone = data.get('phone').trim();
  const password = data.get('password');
  const confirm = data.get('confirmPassword');

  if (password !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }

  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }

  // Check if email already exists
  const users = JSON.parse(localStorage.getItem('qcUsers') || '[]');
  if (users.some(u => u.email === email)) {
    showToast('Email already registered', 'error');
    return;
  }

  // Save new user
  users.push({ name, email, phone, password });
  localStorage.setItem('qcUsers', JSON.stringify(users));

  // Auto-login
  localStorage.setItem('qcCurrentUser', JSON.stringify({
    name,
    email,
    phone,
    role: 'commuter'
  }));

  showToast('Account created! Welcome 🎉', 'success');

  setTimeout(() => {
    window.location.href = 'index.html';
  }, 800);
});

// ==================================================
// SOCIAL LOGIN (stub)
// ==================================================
function socialLogin(provider) {
  showToast(`${provider} login is not connected yet`, 'info');
}

// ==================================================
// FORGOT PASSWORD (stub)
// ==================================================
function showForgotPassword() {
  showToast('Password reset coming soon', 'info');
}

// ==================================================
// EXPOSE GLOBALS
// ==================================================
window.switchTab = switchTab;
window.socialLogin = socialLogin;
window.showForgotPassword = showForgotPassword;

// ==================================================
// INIT — read ?mode=signup from URL
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'signup') {
    switchTab('signup');
  }
});