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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex flex-col items-center justify-center p-4">
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Clipboard Sync</h1>
            <p className="text-slate-600">Sign in to sync your clipboard across devices</p>
          </div>
          
          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
              {loginError}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                placeholder="Enter your username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="text-black w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 bg-white/70"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="text-black w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 bg-white/70"
              />
            </div>
            
            <button
              className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all duration-200 font-semibold shadow-lg"
              onClick={async () => {
                setLoginError(null);
                const ok = await auth.login(loginUsername, loginPassword);
                if (!ok) setLoginError("Invalid credentials");
              }}
            >
              Sign In
            </button>
          </div>
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
    setRemoteList(newRemoteList);
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
      if (
        text.startsWith("data:image/") &&
        navigator.clipboard &&
        window.ClipboardItem
      ) {
        // Convert any image to PNG before copying
        const img = new window.Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(async (blob) => {
              if (blob) {
                try {
                  await navigator.clipboard.write([
                    new window.ClipboardItem({ "image/png": blob }),
                  ]);
                  setAlert("Image copied as PNG to clipboard!");
                } catch (err) {
                  console.error("Failed to copy PNG image:", err);
                  setAlert("Failed to copy image!");
                }
              } else {
                setAlert("Failed to convert image to PNG!");
              }
              setTimeout(() => setAlert(null), 1500);
            }, "image/png");
          }
        };
        img.onerror = (err) => {
          console.error("Failed to load image for PNG conversion:", err);
          setAlert("Failed to process image!");
          setTimeout(() => setAlert(null), 1500);
        };
        img.src = text;
      } else {
        // copy as plain text
        await navigator.clipboard.writeText(text);
        setAlert("Copied to clipboard!");
        setTimeout(() => setAlert(null), 1500);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
      setAlert("Failed to copy!");
      setTimeout(() => setAlert(null), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
                  Welcome, {auth.user?.username}
                </h1>
                <p className="text-slate-600 text-sm">Manage your synced clipboard</p>
              </div>
            </div>
            <button
              onClick={auth.logout}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors duration-200 font-medium border border-slate-300"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Alert */}
        {alert && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-center font-medium shadow-sm">
            {alert}
          </div>
        )}

        {/* Input Section */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter text or paste an image..."
              className="text-black flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 bg-white/70"
              onPaste={async (e) => {
                try {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  
                  for (const item of items) {
                    if (item.type.startsWith("image/")) {
                      const file = item.getAsFile();
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const imageDataUrl = ev.target?.result as string;
                          if (imageDataUrl) {
                            setValue(imageDataUrl);
                            setAlert("Image pasted as base64!");
                            setTimeout(() => setAlert(null), 1500);
                          }
                        };
                        reader.onerror = () => {
                          setAlert("Failed to read image!");
                          setTimeout(() => setAlert(null), 1500);
                        };
                        reader.readAsDataURL(file);
                      }
                      e.preventDefault();
                      break;
                    }
                  }
                } catch (error) {
                  console.error("Error pasting image:", error);
                  setAlert("Failed to paste image!");
                  setTimeout(() => setAlert(null), 1500);
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all duration-200 font-medium shadow-lg"
              >
                Save
              </button>
              <button
                onClick={() => {
                  syncFromDO();
                  syncToDO(mergedList);
                }}
                className="px-6 py-3 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg hover:from-teal-700 hover:to-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all duration-200 font-medium shadow-lg"
              >
                <span className="hidden sm:inline">Sync with Cloud</span>
                <span className="sm:hidden">Sync</span>
              </button>
            </div>
          </div>
        </div>

        {/* Clipboard Items */}
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800">Your Clipboard</h2>
            <span className="text-sm text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              {mergedList.length} items
            </span>
          </div>
          
          {mergedList.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-500 text-lg">No clipboard items yet</p>
              <p className="text-slate-400 text-sm mt-1">Save something to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mergedList.map((item) => (
                <div
                  key={item.id}
                  className="group bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {item.value.startsWith("data:image/") ? (
                        <div className="w-full">
                          <img
                            src={item.value}
                            alt="Clipboard"
                            className="max-h-48 max-w-full h-auto rounded-lg border border-slate-200 object-contain shadow-sm"
                            onError={(e) => {
                              console.error("Image failed to load:", item.value.substring(0, 50) + "...");
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                          <p className="text-slate-800 text-sm leading-relaxed break-words">
                            {item.value}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleCopy(item.value)}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors duration-200 text-sm font-medium shadow-sm"
                        title="Copy to clipboard"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors duration-200 text-sm font-medium shadow-sm"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}