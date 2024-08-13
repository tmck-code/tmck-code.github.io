import { useState } from "react";
import { data } from "./data.ts";
import { BubblePlot } from "./BubblePlot.tsx";

const BUTTONS_HEIGHT = 60;

type BubblePlotDatasetTransitionProps = {
  width: number;
  height: number;
};

const buttonStyle = {
  border: "1px solid #9a6fb0",
  borderRadius: "3px",
  padding: "0px 8px",
  margin: "10px 2px",
  fontSize: 14,
  color: "#9a6fb0",
  opacity: 0.7,
};

export default function BubblePlotDatasetTransition(width: number, height: number) {
  const [year, setYear] = useState<number>(1997);

  const selectedData = data.filter((item) => item.year === year);

  const allYears = [...new Set(data.map((d) => d.year))];

  return (
    <div>
      <div
        style={{
          height: BUTTONS_HEIGHT,
          display: "flex",
          alignItems: "center",
        }}
      >
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={buttonStyle}
        >
          {allYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <BubblePlot
        width={width}
        height={height - BUTTONS_HEIGHT}
        data={selectedData}
      />
    </div>
  );
};
