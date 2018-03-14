import { InputOptions } from '../rollup';

type StartTime = [number, number] | number;
type Timer = { time: number; start: StartTime };
type Timers = { [label: string]: Timer };
export type SerializedTimings = { [label: string]: number };

const NOOP = () => {};

let getStartTime: () => StartTime = () => 0;
let getElapsedTime: (previous: StartTime) => number = () => 0;

let timers: Timers = {};

const normalizeHrTime = (time: [number, number]) => time[0] * 1e3 + time[1] / 1e6;

function setTimeHelpers() {
	if (typeof process !== 'undefined' && typeof process.hrtime === 'function') {
		getStartTime = process.hrtime.bind(process);
		getElapsedTime = (previous: [number, number]) => normalizeHrTime(process.hrtime(previous));
	} else if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
		getStartTime = performance.now.bind(performance);
		getElapsedTime = (previous: number) => performance.now() - previous;
	}
}

function timeStartImpl(label: string) {
	if (!timers.hasOwnProperty(label)) {
		timers[label] = {
			start: undefined,
			time: 0
		};
	}
	timers[label].start = getStartTime();
}

function timeEndImpl(label: string) {
	if (timers.hasOwnProperty(label)) {
		timers[label].time += getElapsedTime(timers[label].start);
	}
}

export function getTimings(): SerializedTimings {
	const newTimings: SerializedTimings = {};
	Object.keys(timers).forEach(label => {
		newTimings[label] = timers[label].time;
	});
	return newTimings;
}

export let timeStart: (label: string) => void = NOOP,
	timeEnd: (label: string) => void = NOOP;

const TIMED_PLUGIN_HOOKS: { [hook: string]: boolean } = {
	transform: true,
	transformBundle: true,
	load: true,
	resolveId: true,
	ongenerate: true,
	onwrite: true,
	resolveDynamicImport: true
};

function getPluginWithTimers(plugin: any, index: number): Plugin {
	const timedPlugin: { [hook: string]: any } = {};

	for (const hook of Object.keys(plugin)) {
		if (TIMED_PLUGIN_HOOKS[hook] === true) {
			let timerLabel = `- plugin ${index}`;
			if (plugin.name) {
				timerLabel += ` (${plugin.name})`;
			}
			timerLabel += ` - ${hook}`;
			timedPlugin[hook] = function() {
				timeStart(timerLabel);
				const result = plugin[hook].apply(this === timedPlugin ? plugin : this, arguments);
				timeEnd(timerLabel);
				if (result && typeof result.then === 'function') {
					timeStart(`${timerLabel} (async)`);
					result.then(() => timeEnd(`${timerLabel} (async)`));
				}
				return result;
			};
		} else {
			timedPlugin[hook] = plugin[hook];
		}
	}
	return <Plugin>timedPlugin;
}

export function initialiseTimers(inputOptions: InputOptions) {
	if (inputOptions.perf) {
		timers = {};
		setTimeHelpers();
		timeStart = timeStartImpl;
		timeEnd = timeEndImpl;
		inputOptions.plugins = inputOptions.plugins.map(getPluginWithTimers);
	} else {
		timeStart = NOOP;
		timeEnd = NOOP;
	}
}
