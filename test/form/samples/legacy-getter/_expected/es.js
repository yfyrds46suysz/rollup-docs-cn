var browserSpecificThing;

if ('ActiveXObject' in window) {
	browserSpecificThing = "InternetExplorerThing";
} else {
	browserSpecificThing = "DecentBrowserThing";
}

function foo() {}

var browserStuff = /*#__PURE__*/(Object.freeze || Object)({
	browserSpecificThing: browserSpecificThing,
	foo: foo
});

console.log(browserSpecificThing);

export { browserStuff as B };
