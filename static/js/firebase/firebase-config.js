import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA0q_6yo9YRkpNeNaawH1AFPZx1IMgj-dY',
  authDomain: 'freepasserp3.firebaseapp.com',
  databaseURL: 'https://freepasserp3-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'freepasserp3',
  storageBucket: 'freepasserp3.firebasestorage.app',
  messagingSenderId: '172664197996',
  appId: '1:172664197996:web:91b7219f22eb68b5005949',
  measurementId: 'G-GY06DRBR15'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

export { app, auth, db, storage };
