import * as d3 from "d3";
import * as Papa from "papaparse";
import { of, fromEvent, merge } from "rxjs";
import { fromFetch } from "rxjs/fetch";
import { switchMap, catchError } from "rxjs/operators";

const leftAreaTypeRadios = document.getElementsByName("left-area-type-radios") as NodeListOf<
  HTMLInputElement
>;
const leftAreaSelect = document.getElementById("left-area-select") as HTMLSelectElement;
const rightAreaTypeRadios = document.getElementsByName("right-area-type-radios") as NodeListOf<
  HTMLInputElement
>;
const rightAreaSelect = document.getElementById("right-area-select") as HTMLSelectElement;

let csv: any = null;
let provincesAndStates: string[] = [];
let countriesAndRegions: string[] = [];
let leftAreaColumn = 0;
let rightAreaColumn = 0;

const firstDayIndex = 4;
const url =
  "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_19-covid-Deaths.csv";

const data$ = fromFetch(url).pipe(
  switchMap(r => (r.ok ? r.text() : of({ error: true, message: `Error ${r.status}` }))),
  catchError(err => {
    console.error(err);
    return of({ error: true, message: err.message });
  })
);

const leftAreaSelect$ = fromEvent(leftAreaSelect, "change");
const leftAreaTypeRadios$ = fromEvent(leftAreaTypeRadios, "change");
const rightAreaSelect$ = fromEvent(rightAreaSelect, "change");
const rightAreaTypeRadios$ = fromEvent(rightAreaTypeRadios, "change");
const ui$ = merge(leftAreaSelect$, leftAreaTypeRadios$, rightAreaSelect$, rightAreaTypeRadios$);

data$.subscribe(text => {
  csv = Papa.parse(text).data;

  provincesAndStates = csv
    .map(row => row[0])
    .slice(1)
    .filter((name: string) => name.length);

  provincesAndStates = Array.from(new Set(provincesAndStates));

  countriesAndRegions = csv
    .map(row => row[1])
    .slice(1)
    .filter((name: string) => name.length);

  countriesAndRegions = Array.from(new Set(countriesAndRegions)).sort();

  populateLeftAreaSelect();
  populateRightAreaSelect();

  const italyIndex = countriesAndRegions.indexOf("Italy");
  const usIndex = countriesAndRegions.indexOf("US");
  leftAreaSelect.selectedIndex = italyIndex;
  rightAreaSelect.selectedIndex = usIndex;

  render();
});

leftAreaTypeRadios$.subscribe(populateLeftAreaSelect);
rightAreaTypeRadios$.subscribe(populateRightAreaSelect);

ui$.subscribe(render);

function populateLeftAreaSelect() {
  const leftAreaTypes = Array.from(leftAreaTypeRadios).filter((r: HTMLInputElement) => r.checked);
  const leftAreaType = leftAreaTypes.length === 1 ? leftAreaTypes[0].value : "province-state";
  leftAreaColumn = 0;
  let list = provincesAndStates;
  if (leftAreaType === "country-region") {
    leftAreaColumn = 1;
    list = countriesAndRegions;
  }

  populateAreaSelect(leftAreaSelect, list);
}

function populateRightAreaSelect() {
  const rightAreaTypes = Array.from(rightAreaTypeRadios).filter((r: HTMLInputElement) => r.checked);
  const rightAreaType = rightAreaTypes.length === 1 ? rightAreaTypes[0].value : "province-state";
  rightAreaColumn = 0;
  let list = provincesAndStates;
  if (rightAreaType === "country-region") {
    rightAreaColumn = 1;
    list = countriesAndRegions;
  }

  populateAreaSelect(rightAreaSelect, list);
}

function populateAreaSelect(select: HTMLSelectElement, list: string[]) {
  select.innerHTML = "";
  list.forEach((thing: string) => {
    const option = document.createElement("option");
    option.value = thing;
    option.innerText = thing;
    select.appendChild(option);
  });
}

function render() {
  const numDays = csv[0].length - firstDayIndex;
  const emptyDays = Array(numDays).fill(0);
  const dates = csv[0].slice(4);
  let left: Array<[number, string]> = [];
  let right: Array<[number, string]> = [];

  let leftArea = leftAreaSelect.value;
  let rightArea = rightAreaSelect.value;

  const leftData = zip(
    csv
      .filter(row => row[leftAreaColumn] === leftArea)
      .map(row => justDays(row))
      .reduce(addItUp, [...emptyDays]),
    dates
  );

  const rightData = zip(
    csv
      .filter(row => row[rightAreaColumn] === rightArea)
      .map(row => justDays(row))
      .reduce(addItUp, [...emptyDays]),
    dates
  );

  const leftDaysBeforeDeath = getDaysBeforeFirstDeath(leftData);
  const rightDaysBeforeDeath = getDaysBeforeFirstDeath(rightData);

  left = copy2dArray(leftData);
  right = copy2dArray(rightData);

  left.splice(0, leftDaysBeforeDeath);
  right.splice(0, rightDaysBeforeDeath);

  let mostRecentDate = right[right.length - 1][1];
  for (let i = right.length; i < left.length; i++) {
    const date = new Date(mostRecentDate);
    date.setDate(date.getDate() + 1);
    const year = getTwoDigitYear(date);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const formattedDate = `${month}/${day}/${year}`;
    right[i] = [-1, formattedDate];
  }

  // Recreate wrapper
  const chartWrapper = d3.select("#chart-wrapper");
  chartWrapper.html("");

  // Create left chart + bind data
  const leftChart = chartWrapper.append("div").attr("class", "chart");
  const leftBar = leftChart.selectAll("div").data(left);

  // Scale to biggest left bar
  const scale = d3
    .scaleLinear()
    .domain([0, d3.max(left.map(entry => entry[0]))])
    .range(["0%", "100%"]);

  // Add left bars
  leftBar
    .enter()
    .append("div")
    .attr("class", "bar-left bar")
    .style("background", d => barBackground(scale(d[0]), "#7fa2e3", true))
    .append(d => createBarText(d, true));

  // Create right right + bind data + add bars
  const rightChart = chartWrapper.append("div").attr("class", "chart");
  const rightBar = rightChart.selectAll("div").data(right);
  rightBar
    .enter()
    .append("div")
    .attr("class", "bar-right bar")
    .style("background", d => barBackground(scale(d[0]), "#c4b96e", false))
    .append(d => createBarText(d, false));
}

function createBarText(data: [number, string], isLeft = true) {
  const div = document.createElement("div");
  div.classList.add("bar-text");
  const date = document.createElement("div");
  date.classList.add("bar-date");
  const deaths = document.createElement("div");
  date.classList.add("bar-deaths");
  date.innerText = data[1];
  deaths.innerText = data[0].toString();

  if (isLeft) {
    div.append(deaths);
    div.append(date);
  } else {
    div.append(date);
    div.append(deaths);
  }
  return div;
}

function copy2dArray(outer: [][]) {
  return outer.map(inner => [...inner]);
}

function getDaysBeforeFirstDeath(zippedArray: Array<[number, string]>) {
  return zippedArray.indexOf(zippedArray.find(([deaths, _]) => deaths > 0)) - 1;
}

function barBackground(scaledLength: number, color: string, isLeft = true) {
  const dir = isLeft ? "-90deg" : "90deg";
  return `linear-gradient(${dir}, ${color} ${scaledLength}, rgba(0,0,0,0) ${scaledLength})`;
}

function justDays(stateRow: []) {
  return stateRow.slice(firstDayIndex);
}

function addItUp(acc: [], curr: []) {
  return acc.map((_, i) => parseInt(acc[i]) + parseInt(curr[i]));
}

function zip(arr1: [], arr2: []) {
  return arr1.map((k, i) => [k, arr2[i]]);
}

function getTwoDigitYear(date: Date) {
  return date
    .getFullYear()
    .toString()
    .substr(-2);
}
