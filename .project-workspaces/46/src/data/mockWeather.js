export const currentWeather = {
  city: 'New York',
  country: 'US',
  temp: 72,
  feelsLike: 69,
  condition: 'Partly Cloudy',
  icon: '⛅',
  humidity: 58,
  wind: 12,
  visibility: 10,
  uvIndex: 4,
  high: 76,
  low: 63,
  sunrise: '6:24 AM',
  sunset: '7:51 PM'
}

export const hourlyForecast = [
  { time: 'Now',   temp: 72, icon: '⛅' },
  { time: '1 PM',  temp: 74, icon: '🌤️' },
  { time: '2 PM',  temp: 76, icon: '☀️' },
  { time: '3 PM',  temp: 75, icon: '☀️' },
  { time: '4 PM',  temp: 73, icon: '🌤️' },
  { time: '5 PM',  temp: 71, icon: '⛅' },
  { time: '6 PM',  temp: 68, icon: '🌥️' },
  { time: '7 PM',  temp: 65, icon: '🌧️' },
]

export const weeklyForecast = [
  { day: 'Today',     high: 76, low: 63, condition: 'Partly Cloudy', icon: '⛅', rain: 20 },
  { day: 'Tuesday',   high: 80, low: 66, condition: 'Sunny',         icon: '☀️', rain: 0  },
  { day: 'Wednesday', high: 83, low: 68, condition: 'Sunny',         icon: '☀️', rain: 5  },
  { day: 'Thursday',  high: 78, low: 65, condition: 'Cloudy',        icon: '🌥️', rain: 40 },
  { day: 'Friday',    high: 70, low: 60, condition: 'Rainy',         icon: '🌧️', rain: 80 },
  { day: 'Saturday',  high: 65, low: 57, condition: 'Stormy',        icon: '⛈️', rain: 90 },
  { day: 'Sunday',    high: 72, low: 61, condition: 'Partly Cloudy', icon: '⛅', rain: 25 },
]

export const savedCities = [
  { id: 1, city: 'New York',     country: 'US',  temp: 72, condition: 'Partly Cloudy', icon: '⛅', high: 76, low: 63 },
  { id: 2, city: 'Los Angeles',  country: 'US',  temp: 85, condition: 'Sunny',         icon: '☀️', high: 88, low: 70 },
  { id: 3, city: 'London',       country: 'UK',  temp: 58, condition: 'Overcast',      icon: '🌥️', high: 61, low: 52 },
  { id: 4, city: 'Tokyo',        country: 'JP',  temp: 77, condition: 'Humid',         icon: '🌤️', high: 79, low: 68 },
  { id: 5, city: 'Sydney',       country: 'AU',  temp: 64, condition: 'Windy',         icon: '💨', high: 67, low: 55 },
]