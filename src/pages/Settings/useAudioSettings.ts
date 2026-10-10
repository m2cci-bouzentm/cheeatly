import { useState, useEffect } from 'react';

export const useAudioSettings = (
  isOpen: boolean,
  activeTab: string,
  generalSetters: any
) => {
  const { setIsUndetectable, setOpenOnLogin } = generalSetters;
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  // Main reports fallback when a saved device cannot be opened.
  const [deviceFallbackNotice, setDeviceFallbackNotice] = useState<{
    kind: 'input' | 'output';
    requested: string | null;
    actual: string | null;
    reason?: string;
  } | null>(null);

  const [sttProvider, setSttProvider] = useState<'none' | 'local-parakeet'>(
    'none'
  );

  useEffect(() => {
    const loadSttSettings = async () => {
      try {
        const creds = await window.desktopAPI.getStoredCredentials();
        if (creds) {
          const savedProvider = (creds as any).sttProvider;
          setSttProvider(
            savedProvider === 'local-parakeet' ? 'local-parakeet' : 'none'
          );
        }
      } catch (e) {
        console.error('Failed to load STT settings:', e);
      }
    };
    if (isOpen) loadSttSettings();
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = window.desktopAPI.onCredentialsChanged(() => {
      if (isOpen) {
        window.desktopAPI
          .getStoredCredentials()
          .then((creds: any) => {
            if (!creds) return;
            const savedProvider = (creds as any).sttProvider;
            setSttProvider(
              savedProvider === 'local-parakeet' ? 'local-parakeet' : 'none'
            );
          })
          .catch(() => {
            /* silently ignore */
          });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSttProviderChange = async (
    provider: 'none' | 'local-parakeet'
  ) => {
    setSttProvider(provider);
    try {
      await window.desktopAPI.setSttProvider(provider);
    } catch (e) {
      console.error('Failed to set STT provider:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    window.desktopAPI.getUndetectable().then(setIsUndetectable);
    window.desktopAPI.getOpenAtLogin().then(setOpenOnLogin);
    const loadDevices = async () => {
      try {
        const [inputs, outputs] = await Promise.all([
          window.desktopAPI.getInputDevices() || Promise.resolve([]),
          window.desktopAPI.getOutputDevices() || Promise.resolve([]),
        ]);

        const formatDevices = (devs: any[]) =>
          devs.map((d) => ({
            deviceId: d.id,
            label: d.name,
            kind: 'audioinput' as MediaDeviceKind,
            groupId: '',
            toJSON: () => d,
          }));

        setInputDevices(formatDevices(inputs));
        setOutputDevices(formatDevices(outputs));

        const savedInput = localStorage.getItem('preferredInputDeviceId');
        const savedOutput = localStorage.getItem('preferredOutputDeviceId');
        const hasSavedInput =
          !!savedInput && inputs.some((d: any) => d.id === savedInput);
        const hasSavedOutput =
          !!savedOutput && outputs.some((d: any) => d.id === savedOutput);
        const shouldUseFirstInput =
          !hasSavedInput && inputs.length > 0 && !selectedInput;
        const shouldUseFirstOutput =
          !hasSavedOutput && outputs.length > 0 && !selectedOutput;

        if (hasSavedInput) {
          setSelectedInput(savedInput);
        }
        if (shouldUseFirstInput) {
          setSelectedInput(inputs[0].id);
        }

        if (hasSavedOutput) {
          setSelectedOutput(savedOutput);
        }
        if (shouldUseFirstOutput) {
          setSelectedOutput(outputs[0].id);
        }
      } catch (e) {
        console.error('Error loading native devices:', e);
      }
    };
    loadDevices();
  }, [isOpen, selectedInput, selectedOutput]);

  useEffect(() => {
    const unsubscribe = window.desktopAPI.onDeviceSelectionApplied(
      (payload) => {
        if (payload.fellBack) {
          setDeviceFallbackNotice({
            kind: payload.kind,
            requested: payload.requested,
            actual: payload.actual,
            reason: payload.reason,
          });
          return;
        }
        setDeviceFallbackNotice((prev) =>
          prev && prev.kind === payload.kind ? null : prev
        );
      }
    );
    return unsubscribe;
  }, []);

  // Use the native mic test path so Settings and meeting runtime share device IDs.
  useEffect(() => {
    if (isOpen && activeTab === 'audio' && selectedInput) {
      const unsubscribe = window.desktopAPI.onAudioTestLevel((level) => {
        setMicLevel(Math.max(0, Math.min(100, level * 100)));
      });

      window.desktopAPI.startAudioTest(selectedInput).catch((error) => {
        console.error('Error starting native microphone test:', error);
        setMicLevel(0);
      });

      return () => {
        unsubscribe?.();
        window.desktopAPI.stopAudioTest().catch((error) => {
          console.error('Error stopping native microphone test:', error);
        });
        setMicLevel(0);
      };
    }
    // Cleanup above owns stopAudioTest; avoid redundant stops on inactive renders.
    setMicLevel(0);
  }, [isOpen, activeTab, selectedInput]);

  return {
    inputDevices,
    setInputDevices,
    outputDevices,
    setOutputDevices,
    selectedInput,
    setSelectedInput,
    selectedOutput,
    setSelectedOutput,
    micLevel,
    setMicLevel,
    deviceFallbackNotice,
    setDeviceFallbackNotice,
    sttProvider,
    setSttProvider,
    handleSttProviderChange,
  };
};
