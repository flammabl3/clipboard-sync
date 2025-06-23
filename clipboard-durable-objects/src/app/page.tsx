"use client";

import { useState, useEffect } from "react";
import { writeData, readData } from "../../lib/indexeddb";
import { useAuth } from "../../context/auth-context";

type ClipboardItem = { id: number; value: string };

export default function Sync() {
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [value, setValue] = useState("");
  const [localList, setLocalList] = useState<ClipboardItem[]>([]);
  const [remoteList, setRemoteList] = useState<ClipboardItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const [alert, setAlert] = useState<string | null>(null);
  const auth = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load local and remote lists on mount/auth change
  useEffect(() => {
    if (!mounted || !auth.isAuthenticated || !auth.user?.username) return;

    // Load local
    readData(auth.user.username).then((data) => {
      if (Array.isArray(data)) setLocalList(data);
      else if (data) setLocalList([data]);
      else setLocalList([]);
    });

    // Load remote
    fetch(
      `https://clipboard-worker.emergingtrends.workers.dev/?customer_id=${auth.user.username}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          const items: ClipboardItem[] = data.map((item) => ({
            id: item.id,
            value: item.clipboard_data,
          }));
          setRemoteList(items);
        } else {
          setRemoteList([]);
        }
      });
  }, [mounted, auth.isAuthenticated, auth.user?.username]);

  if (!mounted) {
    // Prevent SSR/client mismatch
    return null;
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="p-8 rounded shadow-md w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-4 text-center">Login</h1>
          {loginError && (
            <div className="mb-2 text-red-600 text-center">{loginError}</div>
          )}
          <input
            type="text"
            placeholder="Username"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            className="w-full mb-3 px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className="w-full mb-4 px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-400"
          />
          <button
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            onClick={async () => {
              setLoginError(null);
              const ok = await auth.login(loginUsername, loginPassword);
              if (!ok) setLoginError("Invalid credentials");
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  // Merge: remote wins if duplicate id
  const mergedList = [
    ...remoteList,
    ...localList.filter(
      (localItem) =>
        !remoteList.some((remoteItem) => remoteItem.id === localItem.id)
    ),
  ];

  // Save new item locally and sync to DO
  const save = async () => {
    if (!auth.user?.username || !value.trim()) return;
    const newItem: ClipboardItem = { id: Date.now(), value };
    const newLocalList = [...localList, newItem];
    await writeData(auth.user.username, newLocalList);
    setLocalList(newLocalList);
    setValue("");
    await syncToDO([newItem]);
  };

  // Sync a list of items to DO (remote)
  const syncToDO = async (list: ClipboardItem[]) => {
    if (!auth.user?.username) return;
    for (const item of list) {
      const res = await fetch(
        `https://clipboard-worker.emergingtrends.workers.dev/?customer_id=${auth.user.username}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            clipboard_data: item.value,
          }),
        }
      );
      if (res.ok) {
        console.log(`Synced item ${item.id} successfully`);
      } else {
        console.error(
          `Failed to sync item ${item.id}:`,
          res.status,
          await res.text()
        );
      }
    }
  };

  // Sync from DO and update both local and remote lists
  const syncFromDO = async () => {
    if (!auth.user?.username) return;
    const res = await fetch(
      `https://clipboard-worker.emergingtrends.workers.dev/?customer_id=${auth.user.username}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );
    if (res.ok) {
      const data: { id: number; clipboard_data: string }[] = await res.json();
      const remoteItems: ClipboardItem[] = data.map((item) => ({
        id: item.id,
        value: item.clipboard_data,
      }));
      setRemoteList(remoteItems);
      // Merge: remote wins if duplicate id
      const merged = [
        ...remoteItems,
        ...localList.filter(
          (localItem) =>
            !remoteItems.some((remoteItem) => remoteItem.id === localItem.id)
        ),
      ];
      await writeData(auth.user.username, merged);
      setLocalList(merged);
      console.log("Merged remote into local and saved to IndexedDB:", merged);
    } else {
      console.error("Failed to sync from DO:", res.status, await res.text());
    }
  };

  // Delete item locally and from DO
  const deleteItem = async (id: number) => {
    if (!auth.user?.username) return;
    const newLocalList = localList.filter((item) => item.id !== id);
    const newRemoteList = remoteList.filter((item) => item.id !== id);
    await writeData(auth.user.username, newLocalList);
    setLocalList(newLocalList);
    setRemoteList(newRemoteList); // <-- update remoteList in state
    await deleteFromDO(id);
  };

  // Delete from DO by id
  const deleteFromDO = async (id: number) => {
    if (!auth.user?.username) return;
    await fetch(
      `https://clipboard-worker.emergingtrends.workers.dev/?customer_id=${auth.user.username}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }
    );
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setAlert("Copied to clipboard!");
      setTimeout(() => setAlert(null), 1500);
    } catch {
      setAlert("Failed to copy!");
      setTimeout(() => setAlert(null), 1500);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-center">
          Hello, {auth.user && auth.user.username}
        </h1>
        <button
          onClick={auth.logout}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition font-semibold ml-4"
        >
          Logout
        </button>
      </div>
      {alert && (
        <div className="mb-4 px-4 py-2 rounded bg-blue-100 text-blue-800 text-center font-medium">
          {alert}
        </div>
      )}
      <div className="flex gap-2 mb-6">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter something"
          className="flex-1 px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring focus:border-blue-400"
        />
        <button
          onClick={save}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Save
        </button>
        <button
          onClick={() => {
            syncFromDO();
            syncToDO(mergedList);
          }}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          Sync with Cloud
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-2">Your clipboard</h2>
      <ul className="space-y-2">
        {mergedList.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between bg-gray-100 rounded px-3 py-2"
          >
            <span className="break-all text-black">{item.value}</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(item.value)}
                className="px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
                title="Copy to clipboard"
              >
                Copy
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                title="Delete"
              >
                X
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
