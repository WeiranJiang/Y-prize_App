import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FoodEntry, validFoodEntry } from '../domain/food';

// Keep this legacy storage key so rebranding doesn't erase existing food logs.
const KEY = 'enamelytics.food-log.v1';
const LIMIT = 1000;
interface FoodLog {
  entries: FoodEntry[];
  loading: boolean;
  error: string;
  save: (entry: FoodEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
}
const Context = createContext<FoodLog | null>(null);
export function FoodLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const current = useRef<FoodEntry[]>([]);
  const writing = useRef(false);
  const ready = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed) || !parsed.every(validFoodEntry)) throw new Error('invalid_storage');
        if (!cancelled) {
          current.current = parsed.slice(0, LIMIT);
          setEntries(current.current);
          ready.current = true;
        }
      } catch {
        if (!cancelled) setError('Your saved log couldn’t be opened. Refresh or reopen the app before saving new entries.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  const write = async (next: FoodEntry[]) => {
    if (!ready.current || writing.current) throw new Error('storage_busy');
    writing.current = true;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setEntries(next);
    } finally { writing.current = false; }
  };
  return <Context.Provider value={{ entries, loading, error,
    save: async entry => {
      if (!validFoodEntry(entry)) throw new Error('invalid_entry');
      const next = [entry, ...current.current.filter(item => item.id !== entry.id)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      if (next.length > LIMIT) throw new Error('log_full');
      await write(next);
    },
    remove: async id => write(current.current.filter(item => item.id !== id)),
  }}>{children}</Context.Provider>;
}
export function useFoodLog() {
  const value = useContext(Context);
  if (!value) throw new Error('useFoodLog outside provider');
  return value;
}
