import { createContext } from 'react';

export const StatsSeriesColorsContext = createContext<ReadonlyMap<string, string> | null>(null);
