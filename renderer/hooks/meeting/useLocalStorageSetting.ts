import { useState, useEffect } from 'react';

export function useLocalStorageSetting(
  key: string,
  parse: (value: string | null) => boolean
): boolean {
  const [value, setValue] = useState(() => parse(localStorage.getItem(key)));

  useEffect(() => {
    const handleStorage = () => setValue(parse(localStorage.getItem(key)));
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, parse]);

  return value;
}
