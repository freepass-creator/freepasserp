import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { auth } from './firebase-config.js';

export const MASTER_ADMIN_EMAIL = 'dudguq@gmail.com';

export function isMasterAdminEmail(email = '') {
  return String(email).trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

export async function signupWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutCurrentUser() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function deleteCurrentUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인된 사용자가 없습니다.');
  return deleteUser(user);
}
