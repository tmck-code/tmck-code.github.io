// @ts-nocheck

import React from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  Legend,
  plugins,
} from 'chart.js';
import { Bubble } from 'react-chartjs-2';

import d from './all_tiers.json';
import moment, { min } from 'moment';
import { Card, Box } from '@mui/material';

ChartJS.register(LinearScale, LogarithmicScale, PointElement, Tooltip, Legend);

export const options = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      // type: 'logarithmic',
      min: 0,
      beginAtZero: true,
    },
    x: {
      min: 0,
      max: 8,
      // max: 4000,
    }
  },
  plugins: {
    tooltip: {
      enabled: true,
      events: ['click'],
    }
  },
};

// function createMapDataPoint(mapEntry: any) {
//   let map = {
//     label: mapEntry.info.name,
//     x: moment().diff(moment(mapEntry.info.added), 'days'),
//     y: mapEntry.info.completions,
//     r: 10,
//   };
//   console.log(map);
//   return map
// }
function createMapDataPoint(mapEntry: any) {
  let ageInDays = moment().diff(moment(mapEntry.info.added, 'YYYY-MM-DD'), 'days');
  let difficulty = ageInDays / mapEntry.info.completions;
  let map = {
    label: mapEntry.info.name,
    x: mapEntry.info.tier,
    y: difficulty,
    r: 10,
  };
  console.log(map, ageInDays, mapEntry.info.added);
  return map
}

const tierColours = new Map<number, string>([
  [1, 'rgba(255,  99, 132, 0.5)'],
  [2, 'rgba(255, 255, 128, 0.5)'],
  [3, 'rgba(255, 223, 128, 0.5)'],
  [4, 'rgba(255, 192, 128, 0.5)'],
  [5, 'rgba(255, 160, 128, 0.5)'],
  [6, 'rgba(219, 123,  43, 0.5)'],
  [7, 'rgba(204,  50,  50, 0.5)'],
]);

export const data = {
  datasets: Array.from(Array(7).keys()).map(function(tier: number) {
    tier = tier+1;
    console.log(tier);
    return {
      label: 'Tier ' + tier,
      data: d.filter( map => map.info.tier == tier).map( mapEntry => createMapDataPoint(mapEntry) ),
      backgroundColor: tierColours.get(tier),
    }
  })
};

export default function App() {
  return (
    <Box sx={{ width: "100%", height: "1200px"}}>
      <Bubble options={options} data={data} />;
    </Box>
  );
}