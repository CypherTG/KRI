import { Country, State, City } from 'country-state-city';

export interface CountryOption {
  label: string;
  code: string;
  phoneCode: string;
}

export interface StateOption {
  label: string;
  code: string;
  countryCode: string;
}

export interface CityOption {
  label: string;
  code: string;
  countryCode: string;
  stateCode: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = Country.getAllCountries()
  .map((country) => ({
    label: country.name,
    code: country.isoCode,
    phoneCode: country.phonecode ? `+${String(country.phonecode).replace(/^\+/, '')}` : '',
  }))
  .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

const STATE_CACHE = new Map<string, StateOption[]>();
const CITY_STATE_CACHE = new Map<string, CityOption[]>();
const CITY_COUNTRY_CACHE = new Map<string, CityOption[]>();

export function getStatesForCountry(countryCode: string): StateOption[] {
  const key = String(countryCode || '').trim().toUpperCase();
  if (!key) return [];
  const cached = STATE_CACHE.get(key);
  if (cached) return cached;
  const states = State.getStatesOfCountry(key)
    .map((state) => ({
      label: state.name,
      code: state.isoCode,
      countryCode: state.countryCode,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  STATE_CACHE.set(key, states);
  return states;
}

export function getCitiesForState(countryCode: string, stateCode: string): CityOption[] {
  const country = String(countryCode || '').trim().toUpperCase();
  const state = String(stateCode || '').trim().toUpperCase();
  if (!country || !state) return [];
  const cacheKey = `${country}:${state}`;
  const cached = CITY_STATE_CACHE.get(cacheKey);
  if (cached) return cached;
  const cities = City.getCitiesOfState(country, state)
    .map((city) => ({
      label: city.name,
      code: city.name,
      countryCode: city.countryCode,
      stateCode: city.stateCode,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  CITY_STATE_CACHE.set(cacheKey, cities);
  return cities;
}

export function getCitiesForCountry(countryCode: string): CityOption[] {
  const country = String(countryCode || '').trim().toUpperCase();
  if (!country) return [];
  const cached = CITY_COUNTRY_CACHE.get(country);
  if (cached) return cached;
  const cities = (City.getCitiesOfCountry(country) || [])
    .map((city) => ({
      label: city.name,
      code: city.name,
      countryCode: city.countryCode,
      stateCode: city.stateCode,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  CITY_COUNTRY_CACHE.set(country, cities);
  return cities;
}

export const LANGUAGE_OPTIONS = [
  'Arabic',
  'Chinese',
  'English',
  'French',
  'German',
  'Hausa',
  'Hindi',
  'Igbo',
  'Japanese',
  'Korean',
  'Portuguese',
  'Spanish',
  'Swahili',
  'Yoruba',
].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

export const ETHNICITY_OPTIONS = [
  'African',
  'Arab',
  'Asian',
  'Black',
  'Caucasian',
  'Chinese',
  'European',
  'Fulani',
  'Hausa',
  'Hispanic',
  'Igbo',
  'Indian',
  'Japanese',
  'Kanuri',
  'Latin American',
  'Middle Eastern',
  'Mixed',
  'Nigerian',
  'Other',
  'Tiv',
  'Yoruba',
].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

export const RELIGION_OPTIONS = [
  'Buddhism',
  'Christianity',
  'Hinduism',
  'Islam',
  'Judaism',
  'Traditional',
  'Other',
  'Prefer not to say',
].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

