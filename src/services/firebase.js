import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyAwDjWUYl-_NGLX07jkv3B9StKk0ng720M',
  authDomain: 'mhw-coop.firebaseapp.com',
  databaseURL: 'https://mhw-coop-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'mhw-coop',
  storageBucket: 'mhw-coop.firebasestorage.app',
  messagingSenderId: '453220635356',
  appId: '1:453220635356:web:09fed996d07ab3347cda19',
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
