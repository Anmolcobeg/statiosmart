// ===== auth.js — Firebase Authentication =====
// IMPORTANT: Replace with your own Firebase config from Firebase Console

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// 🔴 REPLACE THIS WITH YOUR FIREBASE CONFIG
// Go to Firebase Console → Project Settings → Your Apps → SDK Setup
// ============================================================
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDPcUiDQP2Tg9u-QZ7iZCfPPjmwpPYrfq4",
  authDomain: "stationery-stats.firebaseapp.com",
  projectId: "stationery-stats",
  storageBucket: "stationery-stats.firebasestorage.app",
  messagingSenderId: "3658223192",
  appId: "1:3658223192:web:f5d3d6424cae6660e4442d",
  measurementId: "G-V66X07MRJ7"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Export for use in app.js
window.__firebaseApp = app;
window.__firebaseAuth = auth;
window.__firebaseDb = db;

// ============================================================
// Auth State Observer — redirect if needed
// ============================================================
onAuthStateChanged(auth, async (user) => {
  const page = window.location.pathname.split('/').pop();
  const isAuthPage = page === 'index.html' || page === '';

  if (user) {
    if (isAuthPage) {
      window.location.href = 'dashboard.html';
    } else {
      // Load user data into sidebar
      const userData = await getUserData(user.uid);
      updateSidebarUser(user, userData);
    }
  } else {
    if (!isAuthPage) {
      window.location.href = 'index.html';
    }
  }
});

// ============================================================
// Get / Create User Document
// ============================================================
async function getUserData(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function createUserDoc(uid, data) {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: serverTimestamp()
  });
}

function updateSidebarUser(user, userData) {
  const nameEl = document.getElementById('user-name');
  const shopEl = document.getElementById('user-shop');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = userData?.name || user.displayName || user.email;
  if (shopEl) shopEl.textContent = userData?.shopName || 'My Shop';
  if (avatarEl) avatarEl.textContent = (userData?.name || user.displayName || user.email || 'U')[0].toUpperCase();
}

// ============================================================
// Login Handler
// ============================================================
window.handleLogin = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  btn.disabled = true;
  err.classList.remove('show');

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will redirect
  } catch (error) {
    err.textContent = getFriendlyError(error.code);
    err.classList.add('show');
    btn.innerHTML = '<span>Sign In</span><i class="fas fa-arrow-right"></i>';
    btn.disabled = false;
  }
};

// ============================================================
// Signup Handler
// ============================================================
window.handleSignup = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('signup-btn');
  const err = document.getElementById('signup-error');
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const name = document.getElementById('signup-name').value;
  const shopName = document.getElementById('signup-shop').value;

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
  btn.disabled = true;
  err.classList.remove('show');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await createUserDoc(cred.user.uid, { name, shopName, email });
    // onAuthStateChanged will redirect
  } catch (error) {
    err.textContent = getFriendlyError(error.code);
    err.classList.add('show');
    btn.innerHTML = '<span>Create Account</span><i class="fas fa-arrow-right"></i>';
    btn.disabled = false;
  }
};

// ============================================================
// Google Login
// ============================================================
window.handleGoogleLogin = async function() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const exists = await getUserData(user.uid);
    if (!exists) {
      await createUserDoc(user.uid, {
        name: user.displayName || '',
        shopName: 'My Shop',
        email: user.email
      });
    }
    // onAuthStateChanged will redirect
  } catch (error) {
    console.error('Google sign-in error:', error);
    const err = document.getElementById('login-error') || document.getElementById('signup-error');
    if (err) {
      err.textContent = getFriendlyError(error.code);
      err.classList.add('show');
    }
  }
};

// ============================================================
// Logout
// ============================================================
window.logoutUser = async function() {
  await signOut(auth);
  window.location.href = 'index.html';
};

// ============================================================
// Friendly Error Messages
// ============================================================
function getFriendlyError(code) {
  const messages = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return messages[code] || 'Something went wrong. Please try again.';
}

export { auth, db, getUserData };