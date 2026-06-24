import { useState, useEffect } from 'react';

export const useLanguageSettings = () => {
  const [recognitionLanguage, setRecognitionLanguage] = useState('auto');
  const [selectedSttGroup, setSelectedSttGroup] = useState('Auto');
  const [availableLanguages, setAvailableLanguages] = useState<any>({});
  const [autoDetectedLanguage, setAutoDetectedLanguage] = useState<
    string | null
  >(null);

  useEffect(() => {
    const loadRecognitionLanguages = async () => {
      const langs = await window.electronAPI.getRecognitionLanguages();
      setAvailableLanguages(langs);

      const storedStt = await window.electronAPI.getSttLanguage();
      let currentLangKey = storedStt;

      if (!currentLangKey) {
        const systemLocale = navigator.language;
        const match = Object.entries(langs).find(
          ([_key, config]: [string, any]) =>
            config.bcp47 === systemLocale ||
            config.iso639 === systemLocale ||
            (config.alternates && config.alternates.includes(systemLocale))
        );

        currentLangKey = match ? match[0] : 'auto';
      }
      if (!storedStt) {
        window.electronAPI.setRecognitionLanguage(currentLangKey);
      }

      setRecognitionLanguage(currentLangKey);

      if (langs[currentLangKey]) {
        setSelectedSttGroup(langs[currentLangKey].group);
        return;
      }
      setSelectedSttGroup('English');
    };

    loadRecognitionLanguages();
  }, []);

  const handleLanguageChange = async (key: string) => {
    setRecognitionLanguage(key);
    setAutoDetectedLanguage(null);
    if (availableLanguages[key]) {
      setSelectedSttGroup(availableLanguages[key].group);
    }
    await window.electronAPI.setRecognitionLanguage(key);
  };

  const handleGroupChange = (group: string) => {
    setSelectedSttGroup(group);
    const firstVariant = Object.entries(availableLanguages).find(
      ([_key, lang]) => (lang as any).group === group
    );
    if (firstVariant) {
      handleLanguageChange(firstVariant[0]);
    }
  };

  const languageGroups = Array.from(
    new Set(Object.values(availableLanguages).map((l: any) => l.group))
  ).sort((a, b) => {
    if (a === 'Auto') return -1;
    if (b === 'Auto') return 1;
    if (a === 'English') return -1;
    if (b === 'English') return 1;
    return a.localeCompare(b);
  });

  const currentGroupVariants = Object.entries(availableLanguages)
    .filter(([_key, lang]) => (lang as any).group === selectedSttGroup)
    .map(([key, lang]) => ({
      deviceId: key,
      label: (lang as any).label,
      kind: 'audioinput' as MediaDeviceKind,
      groupId: '',
      toJSON: () => ({}),
    }));

  return {
    recognitionLanguage,
    setRecognitionLanguage,
    selectedSttGroup,
    setSelectedSttGroup,
    availableLanguages,
    setAvailableLanguages,
    autoDetectedLanguage,
    setAutoDetectedLanguage,
    handleLanguageChange,
    handleGroupChange,
    languageGroups,
    currentGroupVariants,
  };
};
