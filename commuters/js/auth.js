
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

    tabSignup.classList.add("text-qc-blue");
    tabSignup.classList.remove("text-gray-500");

    tabLogin.classList.remove("text-qc-blue");
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
        class="text-qc-blue font-semibold hover:underline"
      >
        Sign in
      </button>
    `;
  } else {
    indicator.style.transform = "translateX(0)";

    tabLogin.classList.add("text-qc-blue");
    tabLogin.classList.remove("text-gray-500");

    tabSignup.classList.remove("text-qc-blue");
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
        class="text-qc-blue font-semibold hover:underline"
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