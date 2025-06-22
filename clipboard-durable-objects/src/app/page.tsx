// pages/index.js or components/Example.js
"use client";

import { useState, useEffect } from 'react';
import { writeData, readData } from '../../lib/indexeddb';

export default function Home() {
  const [value, setValue] = useState('');
  const [stored, setStored] = useState('');

  // Load stored data on mount
  useEffect(() => {
    readData('myKey').then(data => {
      if (data) setStored(data);
    });
  }, []);

  const save = async () => {
    await writeData('myKey', value);
    setStored(value);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Simple IndexedDB</h1>
      
      <input 
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter something"
      />
      <button onClick={save}>Save</button>
      
      <p>Stored: {stored}</p>
    </div>
  );
}