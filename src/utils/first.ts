// Return the first non-falsy result from an array of
// maybe-sync, maybe-promise-returning functions
export default function first<FnType> (candidates: FnType[]) {
	return function (...args: any[]) {
		return candidates.reduce((promise, candidate) => {
			return promise.then(
				result =>
					result != null ? result : Promise.resolve(candidate(...args))
			);
		}, Promise.resolve());
	};
}
