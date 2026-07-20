import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDlHTci5MLBdaUkfQmpYp57AplWzyikggU",
  authDomain: "archi-exam-prep.firebaseapp.com",
  projectId: "archi-exam-prep",
  storageBucket: "archi-exam-prep.firebasestorage.app",
  messagingSenderId: "675699006273",
  appId: "1:675699006273:web:07072e1c3c0abe645b1fc0",
  measurementId: "G-6QQHGQ75QJ"
};

let app = null;
let db = null;
let auth = null;
let isFirebaseConfigured = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY") {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    isFirebaseConfigured = true;
    console.log("🔥 Firebase Cloud Firestore & Auth connected successfully!");
  } else {
    console.log("ℹ️ Running in local history storage mode.");
  }
} catch (e) {
  console.warn("Firebase initialization warning:", e.message);
}

// Authentication Helpers
export async function loginUser(email, password) {
  if (isFirebaseConfigured && auth) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } else {
    return { email, uid: `local_user_${Date.now()}` };
  }
}

export async function signUpUser(email, password) {
  if (isFirebaseConfigured && auth) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } else {
    return { email, uid: `local_user_${Date.now()}` };
  }
}

export async function logoutUser() {
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
  }
  return true;
}

export function subscribeToAuthChanges(callback) {
  if (isFirebaseConfigured && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    callback(null);
    return () => {};
  }
}

// Local memory profile store
let localProfileStore = {
  name: 'Aspirant',
  phone: '',
  examPreparingFor: 'UPSC Civil Services',
  studyGoal: 'Master Syllabus & Score 85%+',
  dailyTarget: '2 Quizzes / Day',
  avatarEmoji: '🎓'
};

/**
 * Save User Profile Data to Firestore (or local store)
 */
export async function saveUserProfileToDatabase(uid, profileData) {
  localProfileStore = { ...localProfileStore, ...profileData };

  if (isFirebaseConfigured && db && uid) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        ...profileData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log('Saved user profile to Firestore for UID:', uid);
      return { success: true };
    } catch (error) {
      console.error('Error saving profile to Firestore:', error);
      return { success: true, local: true };
    }
  }
  return { success: true, local: true };
}

/**
 * Fetch User Profile Data from Firestore (or local store)
 */
export async function getUserProfileFromDatabase(uid) {
  if (isFirebaseConfigured && db && uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
    } catch (error) {
      console.error('Error reading profile from Firestore:', error);
    }
  }
  return localProfileStore;
}

// Fallback sample history storage
let localHistoryStore = [
  {
    id: 'sample_hist_1',
    title: 'Quiz: Indian Polity & Fundamental Rights',
    documentName: 'Government_Polity_Ref_Notes.pdf',
    scorePercentage: 80,
    correctCount: 4,
    totalQuestions: 5,
    date: new Date(Date.now() - 86400000).toLocaleDateString() + ' ' + new Date(Date.now() - 86400000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isSample: true
  }
];

/**
 * Save quiz results to Firestore Database (or local store)
 */
export async function saveQuizToDatabase(quizData, quizResults, userEmail = 'student@examprep.com') {
  const record = {
    title: quizData.title || 'PDF Practice Quiz',
    documentName: quizData.documentName || 'Document.pdf',
    scorePercentage: quizResults.scorePercentage,
    correctCount: quizResults.correctCount,
    wrongCount: quizResults.wrongCount,
    skippedCount: quizResults.skippedCount,
    totalQuestions: quizResults.totalQuestions,
    timeSpentSeconds: quizResults.timeSpentSeconds,
    userEmail: userEmail,
    date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString()
  };

  if (isFirebaseConfigured && db) {
    try {
      const docRef = await addDoc(collection(db, 'quiz_history'), record);
      console.log('Saved quiz result to Firestore with ID:', docRef.id);
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('Error writing to Firestore:', error);
      localHistoryStore.unshift({ id: `local_${Date.now()}`, ...record });
      return { success: true, local: true };
    }
  } else {
    localHistoryStore.unshift({ id: `local_${Date.now()}`, ...record });
    return { success: true, local: true };
  }
}

/**
 * Fetch Quiz History from Firestore Database (or local store)
 */
export async function getQuizHistoryFromDatabase() {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'quiz_history'), orderBy('createdAt', 'desc'), limit(20));
      const querySnapshot = await getDocs(q);
      const history = [];
      querySnapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() });
      });
      return history;
    } catch (error) {
      console.error('Error reading from Firestore:', error);
      return localHistoryStore;
    }
  } else {
    return localHistoryStore;
  }
}

export { isFirebaseConfigured, auth };
