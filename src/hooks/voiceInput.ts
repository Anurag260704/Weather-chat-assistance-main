import { useState, useCallback, useEffect } from 'react';

// Define types for Speech Recognition API
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionErrorLike {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

// Custom hook for voice input
export const useVoiceInput = (
  onTranscript: (transcript: string) => void,
  language: string = 'ja-JP'
) => {
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ctor =
      (window as WindowWithSpeechRecognition).SpeechRecognition ||
      (window as WindowWithSpeechRecognition).webkitSpeechRecognition;

    if (!ctor) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const rec = new ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = language;

    rec.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      try {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          onTranscript(transcript);
        } else {
          console.warn('No valid transcript found');
        }
      } catch (err) {
        console.error('Error processing transcript:', err);
        setVoiceError('Error processing voice input.');
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorLike) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        setVoiceError(`Voice error: ${event.error}`);
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    setRecognition(rec);

    return () => {
      rec.stop?.();
    };
  }, [onTranscript, language]);

  const startListening = useCallback(() => {
    if (!recognition) {
      setVoiceError('Voice recognition not initialized or supported.');
      return;
    }

    if (isListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'InvalidStateError') {
        setVoiceError(`Voice start error: ${e.message}`);
      }
    }
  }, [recognition, isListening]);

  return {
    isListening,
    voiceError,
    isSupported,
    startListening,
  };
};
