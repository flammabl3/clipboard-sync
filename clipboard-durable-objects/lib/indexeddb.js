// lib/db.js
let db = null;

// Initialize database
export async function initDB() {
  if (typeof window === 'undefined') return null;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SimpleDB', 1);
    
    request.onupgradeneeded = () => {
      db = request.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data', { keyPath: 'key' });
      }
    };
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Write data
export async function writeData(key, value) {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['data'], 'readwrite');
    const store = tx.objectStore('data');
    const request = store.put({ key, value });
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Read data
export async function readData(key) {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['data'], 'readonly');
    const store = tx.objectStore('data');
    const request = store.get(key);
    
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}