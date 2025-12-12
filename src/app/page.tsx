"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { fetchWeather, fetchGeminiResponse } from '@/lib/api';
import { WeatherData } from '@/lib/constants';
import { useVoiceInput } from '@/hooks/voiceInput';
import MessageTime from "@/components/Msg";
import { HiChevronDown } from 'react-icons/hi';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  weatherData?: WeatherData;
  sources?: { uri: string; title: string }[];
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const linkify = (s: string): string =>
  s.replace(/\b(https?:\/\/[^\s<]+)\b/gi, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);

const applyInlineEmphasis = (s: string): string => {
  const keywords = [
    'today', 'tonight', 'this morning', 'this afternoon', 'this evening',
    'rain', 'snow', 'thunderstorm', 'storm', 'clear', 'sunny', 'cloudy', 'overcast', 'drizzle', 'humid', 'dry', 'windy',
    'hot', 'very hot', 'warm', 'cool', 'cold', 'chilly',
    'uv index', 'air quality', 'visibility',
    'warning', 'alert', 'advisory'
  ];
  let out = s;
  out = out.replace(/(-?\d+(?:\.\d+)?)\s?°\s?[CF]/gi, '<strong>$&</strong>');
  out = out.replace(/(\b\d{1,3})%/g, '<strong>$1%</strong>');
  out = out.replace(/(\b\d+(?:\.\d+)?)\s?(?:m\/s|km\/?h|kph|mph)\b/gi, '<strong>$&</strong>');
  out = out.replace(/\b(\d{1,2})(?:[:.]\d{2})?\s?(?:am|pm)\b/gi, '<strong>$&</strong>');

  const highlight = ['umbrella', 'raincoat', 'jacket', 'coat', 'sunscreen', 'water', 'mask', 'hydrated', 'layers'];
  highlight.forEach(w => {
    const re = new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, '<span className="hl">$&</span>');
  });

  keywords.forEach(w => {
    const re = new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, '<strong>$&</strong>');
  });
  return out;
};

const formatAssistantHtml = (text: string): { __html: string } => {
  const lines = text.split(/\r?\n/);
  let html = '';
  let inList = false;
  const bulletRe = /^\s*[-•]\s+(.*)$/;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(bulletRe);
    if (bullet) {
      if (!inList) { html += '<ul className="assistant-list">'; inList = true; }
      const item = applyInlineEmphasis(linkify(escapeHtml(bullet[1])));
      html += `<li>${item}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim() === '') { html += '<br />'; }
      else {
        const content = applyInlineEmphasis(linkify(escapeHtml(line)));
        html += `<p>${content}</p>`;
      }
    }
  }
  if (inList) html += '</ul>';
  return { __html: html };
};

const LoadingSpinner = ({ darkMode }: { darkMode: boolean }) => (
  <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
    <span className={`loader ${darkMode ? 'loader-night' : 'loader-day'}`} />
    <span className={darkMode ? 'text-slate-100' : 'text-slate-800'}>
      {darkMode ? '生成中...' : 'Generating...'}
    </span>
  </div>
);

const AuroraBackdrop = ({ darkMode }: { darkMode: boolean }) => {
  const palette = darkMode
    ? ['#7c3aed', '#22d3ee', '#0ea5e9']
    : ['#f59e0b', '#10b981', '#6366f1'];
  return (
    <div className="aurora">
      {palette.map((color, idx) => (
        <span key={color} className={`blob blob-${idx}`} style={{ background: color }} />
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [userInput, setUserInput] = useState<string>('');
  const [location, setLocation] = useState<string>('Tokyo');
  const [voiceLanguage, setVoiceLanguage] = useState<string>('ja-JP');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  // Initialize messages as empty to avoid hydration mismatch - will be populated in useEffect
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState<boolean>(false);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  const [compactHeader, setCompactHeader] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  const compactRef = useRef<boolean>(false);
  const tickingRef = useRef<boolean>(false);
  const lastToggleRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    
    // Initialize welcome message after mount to avoid hydration mismatch
    if (!initialized) {
      setMessages([{
        id: '1',
        type: 'system',
        content: 'CloudWhisper is live. Ask anything about the weather and your day.',
        timestamp: new Date()
      }]);
      setInitialized(true);
    }
    
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved ? saved === 'dark' : prefersDark;
      setDarkMode(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ENTER_COMPACT_AT = 120;
    const EXIT_COMPACT_AT = 48;
    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        try {
          const doc = document.documentElement;
          const y = window.scrollY || doc.scrollTop || 0;
          const nearBottom = window.innerHeight + y >= (doc.scrollHeight - 120);
          setShowScrollButton(!nearBottom);

          let nextCompact = compactRef.current;
          if (!nextCompact && y > ENTER_COMPACT_AT) nextCompact = true;
          else if (nextCompact && y < EXIT_COMPACT_AT) nextCompact = false;

          if (nextCompact !== compactRef.current) {
            const now = Date.now();
            if (now - lastToggleRef.current > 250) {
              lastToggleRef.current = now;
              compactRef.current = nextCompact;
              setCompactHeader(nextCompact);
            }
          }
        } finally {
          tickingRef.current = false;
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  }, []);

  const detectCity = useCallback((text: string) => {
    try {
      const lowerText = text.toLowerCase();
      const cityMap: { [key: string]: string } = {
        '東京': 'Tokyo', 'とうきょう': 'Tokyo', '東京都': 'Tokyo',
        '大阪': 'Osaka', 'おおさか': 'Osaka', '大阪市': 'Osaka',
        '横浜': 'Yokohama', 'よこはま': 'Yokohama',
        '名古屋': 'Nagoya', 'なごや': 'Nagoya',
        '札幌': 'Sapporo', 'さっぽろ': 'Sapporo',
        '福岡': 'Fukuoka', 'ふくおか': 'Fukuoka',
        '神戸': 'Kobe', 'こうべ': 'Kobe',
        '京都': 'Kyoto', 'きょうと': 'Kyoto',
        '川崎': 'Kawasaki', 'かわさき': 'Kawasaki',
        'さいたま': 'Saitama', 'さいたまし': 'Saitama',
        '広島': 'Hiroshima', 'ひろしま': 'Hiroshima',
        '仙台': 'Sendai', 'せんだい': 'Sendai',
        '北九州': 'Kitakyushu', 'きたきゅうしゅう': 'Kitakyushu',
        '千葉': 'Chiba', 'ちば': 'Chiba',
        '堺': 'Sakai', 'さかい': 'Sakai',
        '新潟': 'Niigata', 'にいがた': 'Niigata',
        '浜松': 'Hamamatsu', 'はままつ': 'Hamamatsu',
        '熊本': 'Kumamoto', 'くまもと': 'Kumamoto',
        '相模原': 'Sagamihara', 'さがみはら': 'Sagamihara',
        '静岡': 'Shizuoka', 'しずおか': 'Shizuoka',
        '岡山': 'Okayama', 'おかやま': 'Okayama',
        '鹿児島': 'Kagoshima', 'かごしま': 'Kagoshima',
        '八王子': 'Hachioji', 'はちおうじ': 'Hachioji',
        '姫路': 'Himeji', 'ひめじ': 'Himeji',
        '宇都宮': 'Utsunomiya', 'うつのみや': 'Utsunomiya',
        '松山': 'Matsuyama', 'まつやま': 'Matsuyama',
        '東大阪': 'Higashiosaka', 'ひがしおおさか': 'Higashiosaka',
        '西宮': 'Nishinomiya', 'にしのみや': 'Nishinomiya',
        '尼崎': 'Amagasaki', 'あまがさき': 'Amagasaki',
        '船橋': 'Funabashi', 'ふなばし': 'Funabashi',
        '金沢': 'Kanazawa', 'かなざわ': 'Kanazawa',
        '豊田': 'Toyota', 'とよた': 'Toyota',
        '高松': 'Takamatsu', 'たかまつ': 'Takamatsu',
        '富山': 'Toyama', 'とやま': 'Toyama',
        '長崎': 'Nagasaki', 'ながさき': 'Nagasaki',
        '岐阜': 'Gifu', 'ぎふ': 'Gifu',
        '宮崎': 'Miyazaki', 'みやざき': 'Miyazaki',
        '長野': 'Nagano', 'ながの': 'Nagano',
        '和歌山': 'Wakayama', 'わかやま': 'Wakayama',
        '奈良': 'Nara', 'なら': 'Nara',
        '大分': 'Oita', 'おおいた': 'Oita',
        '旭川': 'Asahikawa', 'あさひかわ': 'Asahikawa',
        'いわき': 'Iwaki', '高知': 'Kochi', 'こうち': 'Kochi',
        '高崎': 'Takasaki', 'たかさき': 'Takasaki',
        '郡山': 'Koriyama', 'こおりやま': 'Koriyama',
        '那覇': 'Naha', 'なは': 'Naha',
        '川越': 'Kawagoe', 'かわごえ': 'Kawagoe',
        '秋田': 'Akita', 'あきた': 'Akita',
        '大津': 'Otsu', 'おおつ': 'Otsu',
        '越谷': 'Koshigaya', 'こしがや': 'Koshigaya',
        '前橋': 'Maebashi', 'まえばし': 'Maebashi',
        '四日市': 'Yokkaichi', 'よっかいち': 'Yokkaichi',
        '盛岡': 'Morioka', 'もりおか': 'Morioka',
        '久留米': 'Kurume', 'くるめ': 'Kurume',
        '春日井': 'Kasugai', 'かすがい': 'Kasugai',
        '青森': 'Aomori', 'あおもり': 'Aomori',
        '明石': 'Akashi', 'あかし': 'Akashi',
        '函館': 'Hakodate', 'はこだて': 'Hakodate',
        '福島': 'Fukushima', 'ふくしま': 'Fukushima',
        '水戸': 'Mito', 'みと': 'Mito',
        '福井': 'Fukui', 'ふくい': 'Fukui',
        '甲府': 'Kofu', 'こうふ': 'Kofu',
        '津': 'Tsu', 'つ': 'Tsu',
        '徳島': 'Tokushima', 'とくしま': 'Tokushima',
        '松江': 'Matsue', 'まつえ': 'Matsue',
        '鳥取': 'Tottori', 'とっとり': 'Tottori',
        '山口': 'Yamaguchi', 'やまぐち': 'Yamaguchi',
        '佐賀': 'Saga', 'さが': 'Saga',
        'ソウル': 'Seoul', '北京': 'Beijing', '上海': 'Shanghai',
        'バンコク': 'Bangkok', 'シンガポール': 'Singapore', '台北': 'Taipei',
        '香港': 'Hong Kong', 'マニラ': 'Manila', 'ジャカルタ': 'Jakarta',
        'クアラルンプール': 'Kuala Lumpur', 'ハノイ': 'Hanoi', 'ホーチミン': 'Ho Chi Minh City',
        'ニューデリー': 'New Delhi', 'デリー': 'Delhi', 'ムンバイ': 'Mumbai',
        'ドバイ': 'Dubai', 'イスタンブール': 'Istanbul',
        'ニューヨーク': 'New York', 'ロサンゼルス': 'Los Angeles', 'ロス': 'Los Angeles',
        'シカゴ': 'Chicago', 'ヒューストン': 'Houston', 'フェニックス': 'Phoenix',
        'フィラデルフィア': 'Philadelphia', 'サンアントニオ': 'San Antonio',
        'サンディエゴ': 'San Diego', 'ダラス': 'Dallas', 'サンノゼ': 'San Jose',
        'サンフランシスコ': 'San Francisco', 'シアトル': 'Seattle',
        'ワシントン': 'Washington', 'ボストン': 'Boston', 'ラスベガス': 'Las Vegas',
        'マイアミ': 'Miami', 'アトランタ': 'Atlanta', 'ホノルル': 'Honolulu',
        'バンクーバー': 'Vancouver', 'トロント': 'Toronto', 'モントリオール': 'Montreal',
        'メキシコシティ': 'Mexico City',
        'ロンドン': 'London', 'パリ': 'Paris', 'ベルリン': 'Berlin',
        'マドリード': 'Madrid', 'ローマ': 'Rome', 'アムステルダム': 'Amsterdam',
        'ウィーン': 'Vienna', 'ダブリン': 'Dublin', 'ブリュッセル': 'Brussels',
        'リスボン': 'Lisbon', 'チューリッヒ': 'Zurich', 'ジュネーブ': 'Geneva',
        'プラハ': 'Prague', 'ブダペスト': 'Budapest', 'ワルシャワ': 'Warsaw',
        'アテネ': 'Athens', 'ストックホルム': 'Stockholm', 'オスロ': 'Oslo',
        'コペンハーゲン': 'Copenhagen', 'ヘルシンキ': 'Helsinki', 'モスクワ': 'Moscow',
        'バルセロナ': 'Barcelona', 'ミラノ': 'Milan', 'ミュンヘン': 'Munich',
        'シドニー': 'Sydney', 'メルボルン': 'Melbourne', 'ブリスベン': 'Brisbane',
        'パース': 'Perth', 'オークランド': 'Auckland', 'ウェリントン': 'Wellington',
        'サンパウロ': 'Sao Paulo', 'リオデジャネイロ': 'Rio de Janeiro',
        'ブエノスアイレス': 'Buenos Aires', 'リマ': 'Lima', 'サンティアゴ': 'Santiago',
        'カイロ': 'Cairo', 'ヨハネスブルグ': 'Johannesburg', 'ケープタウン': 'Cape Town',
        'ナイロビ': 'Nairobi', 'ラゴス': 'Lagos'
      };

      const commonCities = [
        'tokyo', 'osaka', 'kyoto', 'yokohama', 'kobe', 'nagoya', 'fukuoka', 'sapporo', 'sendai', 'hiroshima',
        'nara', 'okinawa', 'naha', 'kanazawa', 'nagasaki', 'kagoshima', 'shizuoka', 'kumamoto', 'okayama',
        'niigata', 'hamamatsu', 'sagamihara', 'chiba', 'saitama', 'kawasaki', 'kitakyushu', 'sakai',
        'new york', 'nyc', 'los angeles', 'la', 'chicago', 'houston', 'phoenix', 'philadelphia',
        'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville', 'fort worth',
        'columbus', 'san francisco', 'charlotte', 'indianapolis', 'seattle', 'denver', 'washington',
        'boston', 'el paso', 'nashville', 'detroit', 'oklahoma city', 'portland', 'las vegas', 'memphis',
        'louisville', 'baltimore', 'milwaukee', 'albuquerque', 'tucson', 'fresno', 'sacramento',
        'atlanta', 'kansas city', 'miami', 'raleigh', 'omaha', 'long beach', 'virginia beach',
        'oakland', 'minneapolis', 'tulsa', 'arlington', 'tampa', 'new orleans', 'wichita', 'cleveland',
        'bakersfield', 'honolulu', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary',
        'london', 'paris', 'berlin', 'madrid', 'rome', 'kyiv', 'bucharest', 'vienna', 'hamburg',
        'warsaw', 'budapest', 'barcelona', 'munich', 'milan', 'prague', 'sofia', 'brussels',
        'birmingham', 'cologne', 'naples', 'stockholm', 'turin', 'marseille', 'amsterdam',
        'zagreb', 'valencia', 'krakow', 'frankfurt', 'seville', 'zaragoza', 'athens', 'riga',
        'helsinki', 'rotterdam', 'stuttgart', 'dusseldorf', 'glasgow', 'copenhagen', 'dublin',
        'lisbon', 'manchester', 'geneva', 'zurich', 'oslo', 'edinburgh', 'reykjavik',
        'beijing', 'shanghai', 'seoul', 'bangkok', 'singapore', 'jakarta', 'delhi', 'mumbai',
        'manila', 'taipei', 'hanoi', 'ho chi minh city', 'kuala lumpur', 'hong kong', 'dubai',
        'istanbul', 'dhaka', 'karachi', 'riyadh', 'tel aviv', 'doha', 'abu dhabi',
        'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'auckland', 'wellington', 'christchurch',
        'sao paulo', 'buenos aires', 'rio de janeiro', 'bogota', 'lima', 'santiago', 'caracas',
        'cairo', 'lagos', 'kinshasa', 'johannesburg', 'cape town', 'casablanca', 'nairobi', 'addis ababa'
      ];

      for (const city of commonCities) {
         if (lowerText.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
      }
      for (const [key, val] of Object.entries(cityMap)) {
         if (lowerText.includes(key)) return val;
      }
      return null;
    } catch (error) {
      console.error('Error in location detection:', error);
      return null;
    }
  }, []);

  const handleTranscript = useCallback((transcript: string) => {
    try {
      const detectedLocation = detectCity(transcript);
      if (detectedLocation && detectedLocation !== location) {
        setLocation(detectedLocation);
      }
      setUserInput(transcript);
      setShouldAutoSubmit(true);
    } catch (error) {
      console.error('Error processing transcript:', error);
      setUserInput(transcript);
      setShouldAutoSubmit(true);
    }
  }, [location, detectCity]);

  const { isListening, voiceError, isSupported, startListening } = useVoiceInput(handleTranscript, voiceLanguage);

  const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!userInput.trim()) {
      setError('Please enter a message.');
      return;
    }

    const typedDetectedCity = detectCity(userInput);
    if (typedDetectedCity && typedDetectedCity !== location) {
      setLocation(typedDetectedCity);
    }

    const cityForFetch = (typedDetectedCity || location || '').trim();

    if (!typedDetectedCity && cityForFetch.length < 2) {
      setError('Please provide a valid city.');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: userInput.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setLoading(true);

    try {
      let weather: WeatherData;
      try {
        weather = await fetchWeather(cityForFetch);
      } catch {
        weather = await fetchWeather(location);
      }

      const recentMessages = messages.slice(-5);
      const conversationContext = recentMessages
        .filter(msg => msg.type !== 'system')
        .map(msg => `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      let instruction = "";
      if (voiceLanguage === 'ja-JP') {
        instruction = "\n\nIMPORTANT: Please provide the response in two parts. First, write the complete response in Japanese. Then, immediately follow it with the full English translation enclosed in parentheses. \nFormat:\n[Japanese Text]\n([English Translation])";
      }

      const enhancedQuery = conversationContext
        ? `Previous conversation:\n${conversationContext}\n\nCurrent question: ${userInput}${instruction}`
        : `${userInput}${instruction}`;

      const response = await fetchGeminiResponse(enhancedQuery, weather, voiceLanguage);

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.text,
        timestamp: new Date(),
        weatherData: weather,
        sources: response.sources
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err: unknown) {
      console.error('Chat Error:', err);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        type: 'system',
        content: `❌ Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [userInput, location, messages, voiceLanguage, detectCity]);

  useEffect(() => {
    if (shouldAutoSubmit && userInput && !loading) {
      setShouldAutoSubmit(false);
      handleSendMessage();
    }
  }, [shouldAutoSubmit, userInput, loading, handleSendMessage]);

  const getWeatherIcon = (condition: string) => {
    const conditionLower = condition.toLowerCase();
    if (conditionLower.includes('clear')) return '☀️';
    if (conditionLower.includes('cloud')) return '☁️';
    if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) return '🌧️';
    if (conditionLower.includes('thunder')) return '⛈️';
    if (conditionLower.includes('snow')) return '🌨️';
    return '🌀';
  };

  const clearChat = () => {
    setMessages([{ id: Date.now().toString(), type: 'system', content: 'CloudWhisper is live. Ask anything about the weather and your day.', timestamp: new Date() }]);
    setError(null);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const latestAssistantWeather = [...messages].reverse().find(m => m.type === 'assistant' && m.weatherData)?.weatherData;

  return (
    <div className="page-shell relative min-h-screen overflow-hidden">
      <AuroraBackdrop darkMode={darkMode} />

      <header className={`shell-header ${compactHeader ? 'shell-header--compact' : ''}`}>
        <div className="shell-header__brand">
          <div className="brand-icon">{darkMode ? '🛰️' : '🌤️'}</div>
          <div>
            {/* Render title and subtitle on one line for a cleaner header */}
            {!compactHeader ? (
              <div className="brand-one-line" title="CloudWhisper — Weather That Speaks">
                <h1 className="brand-title">CloudWhisper</h1>
                <span className="brand-subtitle">— Weather That Speaks</span>
              </div>
            ) : (
              <h1 className="brand-title">CloudWhisper</h1>
            )}
          </div>
        </div>
        <div className="shell-header__controls">
          <label className="control">
            <span>City</span>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="control-input"
              placeholder="Search a city"
              disabled={loading}
            />
          </label>

          <label className="control">
            <span>Language</span>
            <select
              id="voiceLanguage"
              value={voiceLanguage}
              onChange={(e) => setVoiceLanguage(e.target.value)}
              className="control-input"
              disabled={loading}
            >
              <option value="en-US">English</option>
              <option value="ja-JP">日本語</option>
            </select>
          </label>

          <button type="button" onClick={toggleDarkMode} className="pill-btn" title="Toggle theme">
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
          <button onClick={clearChat} className="pill-btn ghost">Reset</button>
        </div>
      </header>

      <main className="layout-grid">
        <aside className="info-panel">
          <div className="info-panel__header">
            <div>
              <p className="eyebrow">Live location</p>
              <h2 className="info-title">{location || 'Unknown'}</h2>
            </div>
            <div className="tag">{voiceLanguage === 'ja-JP' ? '日本語' : 'English'}</div>
          </div>

          <div className="info-panel__body">
            <div className="metric">
              <p className="metric-label">Status</p>
              <p className="metric-value">{isSupported ? (isListening ? 'Listening...' : 'Ready') : 'Voice unavailable'}</p>
            </div>
            <div className="metric">
              <p className="metric-label">Conversation</p>
              <p className="metric-value">{messages.length} messages</p>
            </div>
            <div className="metric">
              <p className="metric-label">Theme</p>
              <p className="metric-value">{darkMode ? 'Night' : 'Day'}</p>
            </div>
          </div>

          {latestAssistantWeather && (
            <div className="weather-preview">
              <div className="weather-preview__header">
                <span className="weather-icon">{getWeatherIcon(latestAssistantWeather.condition)}</span>
                <div>
                  <p className="eyebrow">Latest fetch</p>
                  <p className="info-title small">{latestAssistantWeather.city}</p>
                </div>
                <div className="temp-chip">{Math.round(latestAssistantWeather.temp)}°C</div>
              </div>
              <div className="weather-preview__grid">
                <div>
                  <p className="metric-label">Feels like</p>
                  <p className="metric-value">{Math.round(latestAssistantWeather.feelsLike)}°C</p>
                </div>
                <div>
                  <p className="metric-label">Humidity</p>
                  <p className="metric-value">{latestAssistantWeather.humidity}%</p>
                </div>
                <div>
                  <p className="metric-label">Wind</p>
                  <p className="metric-value">{latestAssistantWeather.windSpeed} m/s</p>
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="chat-panel" ref={chatContainerRef}>
          <div className="chat-scroll">
            {messages.map((message) => {
              const isSystem = message.type === 'system';
              const isUser = message.type === 'user';
              const bubbleClass = isSystem ? 'bubble-system' : isUser ? 'bubble-user' : 'bubble-assistant';
              return (
                <article key={message.id} className={`bubble ${bubbleClass}`}>
                  <div className="bubble-meta">
                    <span className="badge">{isSystem ? 'System' : isUser ? 'You' : 'Assistant'}</span>
                    <MessageTime date={message.timestamp} />
                  </div>

                  {message.type === 'assistant' && message.weatherData && (
                    <div className="inline-weather">
                      <div className="inline-weather__main">
                        <span className="weather-icon">{getWeatherIcon(message.weatherData.condition)}</span>
                        <div>
                          <p className="metric-label">Weather insight</p>
                          <p className="metric-value">{message.weatherData.city}</p>
                        </div>
                        <span className="temp-chip">{Math.round(message.weatherData.temp)}°C</span>
                      </div>
                      <div className="inline-weather__stats">
                        <span>Humidity {message.weatherData.humidity}%</span>
                        <span>Wind {message.weatherData.windSpeed} m/s</span>
                        <span>Feels {Math.round(message.weatherData.feelsLike)}°</span>
                      </div>
                    </div>
                  )}

                  <div className="bubble-content">
                    {message.type === 'assistant'
                      ? <div className="assistant-content" dangerouslySetInnerHTML={formatAssistantHtml(message.content)} />
                      : <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                    }
                  </div>

                  {message.sources?.length ? (
                    <div className="source-list">
                      {message.sources.map((src) => (
                        <a key={src.uri} href={src.uri} target="_blank" rel="noreferrer" className="source-link">
                          {src.title || src.uri}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {loading && (
              <div className="bubble bubble-assistant">
                <LoadingSpinner darkMode={darkMode} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>
      </main>

      {(voiceError || error) && (
        <div className="alert">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{voiceError || error}</p>
        </div>
      )}

      <div className="input-dock">
        <form onSubmit={handleSendMessage} className="input-dock__inner">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={
              isListening
                ? (voiceLanguage === 'ja-JP' ? '聞き取っています...' : 'Listening...')
                : (voiceLanguage === 'ja-JP' ? '気になる天気や予定をどうぞ' : 'Ask about weather, plans, clothes...')
            }
            className={`dock-input ${isListening ? 'dock-input--recording' : ''}`}
            disabled={loading}
          />

          {isSupported && mounted && (
            <button
              type="button"
              onClick={startListening}
              disabled={loading}
              className={`dock-btn ${isListening ? 'dock-btn--recording' : ''}`}
            >
              {isListening ? 'Stop' : 'Speak'}
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !userInput.trim()}
            className="dock-btn primary"
          >
            {loading ? '...' : 'Send'}
          </button>
        </form>
        <p className="dock-caption">Gemini + OpenWeatherMap • Anurag Thakur</p>
      </div>

      {showScrollButton && (
        <button onClick={scrollToBottom} className="scroll-btn" aria-label="Jump to latest message">
          <HiChevronDown size={20} />
        </button>
      )}
    </div>
  );
};

export default App;
