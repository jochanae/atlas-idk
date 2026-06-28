export const plants = [
  {
    id: 1,
    name: 'Basil',
    species: 'Ocimum basilicum',
    location: 'Kitchen windowsill',
    wateringFrequencyDays: 2,
    lastWatered: '2024-06-10',
    notes: 'Loves direct sunlight. Pinch flowers to keep bushy.',
    wateringSchedules: [
      { id: 101, plantId: 1, scheduledDate: '2024-06-12', completed: false, amountMl: 150 },
      { id: 102, plantId: 1, scheduledDate: '2024-06-10', completed: true, amountMl: 150 },
      { id: 103, plantId: 1, scheduledDate: '2024-06-08', completed: true, amountMl: 150 }
    ]
  },
  {
    id: 2,
    name: 'Monstera',
    species: 'Monstera deliciosa',
    location: 'Living room',
    wateringFrequencyDays: 7,
    lastWatered: '2024-06-05',
    notes: 'Indirect light only. Let soil dry between waterings.',
    wateringSchedules: [
      { id: 201, plantId: 2, scheduledDate: '2024-06-12', completed: false, amountMl: 400 },
      { id: 202, plantId: 2, scheduledDate: '2024-06-05', completed: true, amountMl: 400 }
    ]
  },
  {
    id: 3,
    name: 'Cherry Tomatoes',
    species: 'Solanum lycopersicum',
    location: 'Back porch',
    wateringFrequencyDays: 1,
    lastWatered: '2024-06-11',
    notes: 'Water daily in summer. Stakes added on June 3rd.',
    wateringSchedules: [
      { id: 301, plantId: 3, scheduledDate: '2024-06-12', completed: false, amountMl: 500 },
      { id: 302, plantId: 3, scheduledDate: '2024-06-11', completed: true, amountMl: 500 },
      { id: 303, plantId: 3, scheduledDate: '2024-06-10', completed: true, amountMl: 500 }
    ]
  },
  {
    id: 4,
    name: 'Lavender',
    species: 'Lavandula angustifolia',
    location: 'Front garden bed',
    wateringFrequencyDays: 10,
    lastWatered: '2024-06-02',
    notes: 'Drought tolerant. Full sun. Do not overwater.',
    wateringSchedules: [
      { id: 401, plantId: 4, scheduledDate: '2024-06-12', completed: false, amountMl: 200 },
      { id: 402, plantId: 4, scheduledDate: '2024-06-02', completed: true, amountMl: 200 }
    ]
  }
]

export const settings = {
  gardenName: 'My SmartGarden',
  ownerName: 'Garden Owner',
  timezone: 'America/New_York',
  reminderTime: '08:00',
  notificationsEnabled: true,
  wateringUnit: 'ml'
}