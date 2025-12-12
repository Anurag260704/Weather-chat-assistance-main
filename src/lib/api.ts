
import { WeatherData, AssistantResponse, SYSTEM_PROMPT, OPENWEATHER_BASE_URL } from './constants';

const OPENWEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
// fetch weather data from OpenWeatherMap API
export async function fetchWeather(city: string): Promise<WeatherData> {
    if (!OPENWEATHER_API_KEY) throw new Error('OpenWeatherMap API key is not set.');

    const q = encodeURIComponent(city.trim());
    const url = `${OPENWEATHER_BASE_URL}?q=${q}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Weather API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
        city: data.name,
        temp: data.main.temp,
        feelsLike: data.main.feels_like,
        condition: data.weather[0].main,
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
        visibilityKm: typeof data.visibility === 'number' ? Math.round((data.visibility / 1000) * 10) / 10 : undefined,
    };
}

// build prompt for Gemini API including weather context
function buildGeminiPrompt(query: string, weather: WeatherData): string {
    
    return `
Weather Context:
City: ${weather.city}
Temperature: ${weather.temp}°C (Feels like ${weather.feelsLike}°C)
Conditions: ${weather.condition} (${weather.description})
Humidity: ${weather.humidity}%
Wind Speed: ${weather.windSpeed} m/s

User Question:
${query}
    `;
}

// fetch response from local Gemini API route
export async function fetchGeminiResponse(query: string, weather: WeatherData, language?: string): Promise<AssistantResponse> {
    const promptText = buildGeminiPrompt(query, weather);


    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            promptText: promptText, 
            systemInstruction: SYSTEM_PROMPT,
            language
        }),
    });

    if (!response.ok) {
        
        const errData = await response.json();
       
        throw new Error(errData.error || 'Local API Error');
    }

    
    const data: { text: string; sources: { uri: string; title: string }[] } = await response.json();
    
    return { 
        text: data.text, 
        sources: data.sources || [] 
    }; 
}
