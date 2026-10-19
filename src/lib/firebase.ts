import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyDblTjuOfpPL3ReEm1z8ymaig3Pg7PnnXU',
  authDomain: 'transitph-75da4.firebaseapp.com',
  projectId: 'transitph-75da4',
  storageBucket: 'transitph-75da4.firebasestorage.app',
  messagingSenderId: '617760269760',
  appId: '1:617760269760:web:a773cbd4580d0fb3101425',
  measurementId: 'G-F3LWNTC73W',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functionsClient = getFunctions(app)
