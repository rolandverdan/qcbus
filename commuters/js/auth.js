console.log("AUTH.JS LOADED");

import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  resetPassword,
} from "../../shared/js/repositories/auth.repo.js";

import {
  createUserProfile,
} from "../../shared/js/repositories/users.repo.js";

import {
  listenForAuth,
  getCurrentUserRole,
} from "../../shared/js/auth.js";

// ==================================================
// QC BUS TRACKER — AUTH UI
// ==================================================

const qs = (sel) => document.querySelector(sel);

function showToast(message, type = "info") {
  const toast = qs("#toast");

  toast.textContent = message;

  toast.className =
    `fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg text-white transition-all duration-300 z-50 show ${type}`;

  setTimeout(() => toast.classList.remove("show"), 2400);
}

// ==================================================
// FIREBASE ERROR HANDLER
// ==================================================

function getAuthErrorMessage(error) {
  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Invalid email or password";

    case "auth/email-already-in-use":
      return "Email already registered";

    case "auth/weak-password":
      return "Password must be at least 6 characters";

    case "auth/invalid-email":
      return "Invalid email address";

    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled";

    case "auth/popup-blocked":
      return "Google sign-in was blocked by the browser";

    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled";

    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase";

    default:
      console.error("Firebase Auth error:", error);
      return "Something went wrong. Please try again.";
  }
}

// ==================================================
// TAB SWITCHING
// ==================================================

let currentTab = "login";

function switchTab(tab) {
  currentTab = tab;

  const indicator = qs("#tabIndicator");
  const tabLogin = qs("#tabLogin");
  const tabSignup = qs("#tabSignup");
  const loginForm = qs("#loginForm");
  const signupForm = qs("#signupForm");
  const headline = qs("#authHeadline");
  const sub = qs("#authSubheadline");
  const switchText = qs("#switchText");

  if (tab === "signup") {
    indicator.style.transform = "translateX(100%)";

    tabSignup.classList.add("text-qc-blue-accent");
    tabSignup.classList.remove("text-gray-500");

    tabLogin.classList.remove("text-qc-blue-accent");
    tabLogin.classList.add("text-gray-500");

    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");

    headline.textContent = "Create an account";
    sub.textContent =
      "Join us and start tracking buses in real time.";

    switchText.innerHTML = `
      Already have an account?
      <button
        onclick="switchTab('login')"
        class="text-qc-blue-accent font-semibold hover:underline"
      >
        Sign in
      </button>
    `;
  } else {
    indicator.style.transform = "translateX(0)";

    tabLogin.classList.add("text-qc-blue-accent");
    tabLogin.classList.remove("text-gray-500");

    tabSignup.classList.remove("text-qc-blue-accent");
    tabSignup.classList.add("text-gray-500");

    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");

    headline.textContent = "Welcome back!";
    sub.textContent =
      "Sign in to continue tracking your ride.";

    switchText.innerHTML = `
      Don't have an account?
      <button
        onclick="switchTab('signup')"
        class="text-qc-blue-accent font-semibold hover:underline"
      >
        Sign up
      </button>
    `;
  }
}

// ==================================================
// PASSWORD VISIBILITY
// ==================================================

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-pw");

  if (!btn) return;

  const targetId = btn.dataset.togglePassword;
  const input = document.getElementById(targetId);
  const eyeOpen = btn.querySelector(".eye-open");
  const eyeClosed = btn.querySelector(".eye-closed");

  if (input.type === "password") {
    input.type = "text";
    eyeOpen.classList.add("hidden");
    eyeClosed.classList.remove("hidden");
  } else {
    input.type = "password";
    eyeOpen.classList.remove("hidden");
    eyeClosed.classList.add("hidden");
  }
});

// ==================================================
// PASSWORD STRENGTH
// ==================================================

const pwInput = qs("#signupPassword");

if (pwInput) {
  pwInput.addEventListener("input", () => {
    const value = pwInput.value;
    const bars = qs("#pwStrength").children;
    const label = qs("#pwStrengthLabel");

    let score = 0;

    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    const colors = [
      "bg-gray-200",
      "bg-red-400",
      "bg-yellow-400",
      "bg-blue-500",
      "bg-green-500",
    ];

    const labels = [
      "Password strength",
      "Weak",
      "Fair",
      "Good",
      "Strong",
    ];

    for (let i = 0; i < 4; i++) {
      bars[i].className =
        `h-1 flex-1 rounded-full transition ${
          i < score ? colors[score] : "bg-gray-200"
        }`;
    }

    label.textContent =
      value ? labels[score] : "Password strength";

    label.className =
      `text-[11px] mt-1 ${
        score <= 1
          ? "text-red-400"
          : score === 2
            ? "text-yellow-500"
            : score === 3
              ? "text-blue-500"
              : "text-green-500"
      }`;
  });
}

// ==================================================
// CONFIRM PASSWORD
// ==================================================

const confirmInput = qs("#signupConfirm");

if (confirmInput) {
  confirmInput.addEventListener("input", () => {
    const mismatch = qs("#pwMismatch");

    if (
      confirmInput.value &&
      confirmInput.value !== pwInput.value
    ) {
      mismatch.classList.remove("hidden");
      confirmInput.classList.add("border-red-400");
    } else {
      mismatch.classList.add("hidden");
      confirmInput.classList.remove("border-red-400");
    }
  });
}

// ==================================================
// LOGIN
// ==================================================

qs("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = new FormData(e.target);

  const email = data.get("email").trim().toLowerCase();
  const password = data.get("password");

  try {
    await signInWithEmail(email, password);

    showToast(
      "Signed in successfully!",
      "success"
    );

    setTimeout(async () => {
      const role = await getCurrentUserRole();

      if (role === "commuter") {
        window.location.href = "index.html";
      } else if (role === "conductor") {
        window.location.href = "../conductors/index.html";
      } else if (role === "admin") {
        window.location.href = "../admin/index.html";
      } else {
        showToast(
          "Your account has no valid role",
          "error"
        );
      }
    }, 500);

  } catch (error) {
    showToast(
      getAuthErrorMessage(error),
      "error"
    );
  }
});

// ==================================================
// SIGN UP
// ==================================================

qs("#signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = new FormData(e.target);

  const name = data.get("name").trim();
  const email = data.get("email").trim().toLowerCase();
  const phone = data.get("phone").trim();
  const password = data.get("password");
  const confirm = data.get("confirmPassword");

  if (password !== confirm) {
    showToast(
      "Passwords do not match",
      "error"
    );
    return;
  }

  if (password.length < 8) {
    showToast(
      "Password must be at least 8 characters",
      "error"
    );
    return;
  }

  try {
    const user = await signUpWithEmail(
      name,
      email,
      password
    );

    await createUserProfile(user, {
      name,
      email,
      phone,
      provider: "password",
    });

    showToast(
      "Account created! Welcome 🎉",
      "success"
    );

    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);

  } catch (error) {
    showToast(
      getAuthErrorMessage(error),
      "error"
    );
  }
});

// ==================================================
// GOOGLE LOGIN / SIGNUP
// ==================================================

async function socialLogin(provider) {
  if (provider !== "Google") return;

  try {
    const user = await signInWithGoogle();

    await createUserProfile(user, {
      name: user.displayName || "",
      email: user.email || "",
      phone: user.phoneNumber || "",
      provider: "google",
    });

    showToast(
      "Google sign-in successful!",
      "success"
    );

    setTimeout(() => {
      window.location.href = "index.html";
    }, 700);

  } catch (error) {
    showToast(
      getAuthErrorMessage(error),
      "error"
    );
  }
}

// ==================================================
// FORGOT PASSWORD
// ==================================================

async function showForgotPassword() {
  const emailInput =
    qs('#loginForm input[name="email"]');

  const email =
    emailInput?.value.trim().toLowerCase();

  if (!email) {
    showToast(
      "Enter your email address first",
      "info"
    );

    emailInput?.focus();
    return;
  }

  try {
    await resetPassword(email);

    showToast(
      "Password reset email sent!",
      "success"
    );

  } catch (error) {
    showToast(
      getAuthErrorMessage(error),
      "error"
    );
  }
}

// ==================================================
// AUTH STATE
// ==================================================

listenForAuth((user) => {
  if (user) {
    console.log(
      "Firebase session active:",
      user.email
    );
  }
});

// ==================================================
// LEGAL MODAL — TERMS OF SERVICE / PRIVACY POLICY
// ==================================================

const LEGAL_CONTENT = {

  terms: {
    title: "Terms of Service",

    body: `
      <p class="text-xs text-gray-500">
        Last updated: <span class="font-medium">January 2026</span>
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">1. Acceptance of Terms</h4>
      <p>
        By creating an account and using QCommute ("the App"), you agree to
        these Terms of Service. If you do not agree, please do not use the App.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">2. About the Service</h4>
      <p>
        QCommute is a commuter companion application for tracking Quezon City
        buses in real time. The App is provided as-is and may be updated,
        suspended, or modified at any time.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">3. User Responsibilities</h4>
      <p>You agree to:</p>
      <ul class="list-disc pl-5 space-y-1">
        <li>Provide accurate account information.</li>
        <li>Keep your login credentials secure.</li>
        <li>Use the App only for lawful, personal purposes.</li>
        <li>Report issues truthfully — false reports may lead to account suspension.</li>
      </ul>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">4. Prohibited Use</h4>
      <p>
        You must not misuse the App, attempt to access other users' accounts,
        or interfere with the service's operation. Any abuse may result in
        permanent removal from the platform.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">5. Location Data</h4>
      <p>
        The App may request access to your device's location to display your
        position on the map. This data is used only within the App and is not
        shared with third parties without your consent.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">6. Disclaimers</h4>
      <p>
        Bus arrival times and live locations are provided for convenience only
        and may be inaccurate due to traffic, network conditions, or other
        factors. QCommute is not liable for missed buses or delays.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">7. Changes to Terms</h4>
      <p>
        We may update these terms from time to time. Continued use of the App
        after changes are posted means you accept the new terms.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">8. Contact</h4>
      <p>
        For questions about these Terms, contact the Quezon City Government
        through the official QC E-Services portal.
      </p>
    `,
  },

  privacy: {
    title: "Privacy Policy",

    body: `
      <p class="text-xs text-gray-500">
        Last updated: <span class="font-medium">January 2026</span>
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">1. Information We Collect</h4>
      <p>When you create a QCommute account, we collect:</p>
      <ul class="list-disc pl-5 space-y-1">
        <li>Your name and email address.</li>
        <li>Your mobile number (optional for account recovery).</li>
        <li>Your approximate location (only while using the map).</li>
      </ul>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">2. How We Use Your Information</h4>
      <p>Your information is used to:</p>
      <ul class="list-disc pl-5 space-y-1">
        <li>Authenticate you and keep your session secure.</li>
        <li>Show your position on the live map.</li>
        <li>Deliver notifications about bus arrivals and routes.</li>
        <li>Process reports you submit about drivers or conductors.</li>
      </ul>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">3. Data Storage</h4>
      <p>
        Account data is stored securely using Firebase (Google Cloud).
        Passwords are encrypted. We do not sell or share your personal data
        with third parties for advertising purposes.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">4. Location Data</h4>
      <p>
        Location access is optional and only requested while viewing the live
        map. Location data is not stored permanently and is not shared with
        other users.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">5. Reports You Submit</h4>
      <p>
        Reports you submit about drivers, conductors, or passengers are stored
        and reviewed by QC Bus administrators. You may choose to submit reports
        anonymously, in which case your name and email are not recorded with
        the report.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">6. Your Rights</h4>
      <p>
        You may request to view, correct, or delete your account data at any
        time by contacting the Quezon City Government through QC E-Services.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">7. Cookies &amp; Storage</h4>
      <p>
        The App uses local storage on your device to remember your preferences
        (such as dark mode and notification settings). No tracking cookies are
        used.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">8. Changes to This Policy</h4>
      <p>
        We may update this Privacy Policy periodically. Any significant changes
        will be reflected with an updated "Last updated" date at the top.
      </p>

      <h4 class="font-semibold text-gray-800 mt-4 mb-1">9. Contact</h4>
      <p>
        For privacy concerns, please reach out through the official
        <a href="https://qceservices.quezoncity.gov.ph" target="_blank"
           class="text-qc-blue-accent font-medium hover:underline">
          QC E-Services portal
        </a>.
      </p>
    `,
  },
};

function openLegalModal(type) {
  const modal = qs("#legalModal");
  const title = qs("#legalTitle");
  const body  = qs("#legalBody");

  if (!modal || !title || !body) return;

  const content = LEGAL_CONTENT[type];
  if (!content) return;

  title.textContent = content.title;
  body.innerHTML = content.body;

  modal.classList.remove("hidden");
  body.scrollTop = 0;
  document.body.style.overflow = "hidden";
}

function closeLegalModal() {
  const modal = qs("#legalModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

// Close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLegalModal();
});

// ==================================================
// INIT
// ==================================================

document.addEventListener("DOMContentLoaded", () => {
  const params =
    new URLSearchParams(window.location.search);

  if (params.get("mode") === "signup") {
    switchTab("signup");
  }
});

// ==================================================
// GLOBALS FOR HTML onclick
// ==================================================

window.switchTab = switchTab;
window.socialLogin = socialLogin;
window.showForgotPassword = showForgotPassword;
window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;